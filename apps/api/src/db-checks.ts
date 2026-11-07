import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sql } from './db.ts';
import { RUNTIME_ROLE } from './db.ts';
import { MIGRATIONS_DIR } from './migrate.ts';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

const MIN_POSTGRES = 150_000;
/** What the runtime role may do, table by table. Anything more is a finding, whoever granted it. */
const RUNTIME_GRANTS: Record<string, readonly string[]> = {
  users: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  sessions: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  otp_codes: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  otp_failures: ['DELETE', 'INSERT', 'SELECT'],
  journal_entries: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  assessments: ['DELETE', 'INSERT', 'SELECT'],
  consents: ['INSERT', 'SELECT'],
  audit_log: ['DELETE', 'INSERT'],
  user_identities: ['DELETE', 'INSERT', 'SELECT'],
  login_failures: ['DELETE', 'INSERT', 'SELECT'],
  oauth_state_uses: ['DELETE', 'INSERT', 'SELECT'],
  device_tokens: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
};
const OUTSIDE_ROLES = ['anon', 'authenticated'];

const pass = (name: string, detail: string): Check => ({ name, ok: true, detail });
const fail = (name: string, detail: string, fix: string): Check => ({ name, ok: false, detail, fix });

/**
 * Read-only: runs in a READ ONLY transaction, so it can be pointed at a live database at any time. The connection
 * itself has already proved TLS: `createSql` with a pinned CA refuses anything that does not verify.
 */
export async function verifyDatabase(sql: Sql): Promise<Check[]> {
  return sql.begin('read only', async (tx) => {
    const checks: Check[] = [pass('TLS verified', 'connected with the pinned CA, certificate and hostname checked')];

    const [version] = await tx<{ num: string; text: string }[]>`SELECT current_setting('server_version_num') AS num, split_part(current_setting('server_version'), ' ', 1) AS text`;
    checks.push(
      Number(version!.num) >= MIN_POSTGRES
        ? pass('Postgres version', version!.text)
        : fail('Postgres version', `${version!.text} is older than 15`, 'Upgrade the database to Postgres 15 or later.'),
    );

    const [schema] = await tx`SELECT 1 FROM pg_namespace WHERE nspname = 'app'`;
    checks.push(schema ? pass('Schema app', 'exists') : fail('Schema app', 'does not exist', 'Run npm run db:setup.'));

    const inPublic = await tx<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
      ORDER BY 1
    `;
    checks.push(
      inPublic.length === 0
        ? pass('Nothing of ours in public', 'no tables or views')
        : fail('Nothing of ours in public', `found ${inPublic.map((r) => r.relname).join(', ')}`, "Supabase's REST API can reach public. Move these to app or drop them."),
    );

    const tables = await tx<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') ORDER BY 1
    `;
    const noRls = tables.filter((t) => !t.relrowsecurity).map((t) => t.relname);
    checks.push(
      schema && noRls.length === 0
        ? pass('RLS on all tables', `${tables.length} tables`)
        : fail('RLS on all tables', noRls.length ? `off on ${noRls.join(', ')}` : 'no schema to check', 'ALTER TABLE app.<table> ENABLE ROW LEVEL SECURITY, as a migration.'),
    );

    const policies = await tx<{ relname: string; polname: string; roles: string[] }[]>`
      SELECT c.relname, p.polname, ARRAY(SELECT CASE WHEN o = 0 THEN 'PUBLIC' ELSE (SELECT rolname FROM pg_roles WHERE oid = o) END FROM unnest(p.polroles) AS o) AS roles
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
    `;
    const wrongRole = policies.filter((p) => p.roles.length !== 1 || p.roles[0] !== RUNTIME_ROLE).map((p) => `${p.relname}.${p.polname} (${p.roles.join(', ')})`);
    const missing = tables.filter((t) => t.relname !== 'schema_migrations' && !policies.some((p) => p.relname === t.relname)).map((t) => t.relname);
    const onLedger = policies.filter((p) => p.relname === 'schema_migrations').map((p) => p.polname);
    const problems = [
      ...(wrongRole.length ? [`for other roles: ${wrongRole.join(', ')}`] : []),
      ...(missing.length ? [`none on ${missing.join(', ')}`] : []),
      ...(onLedger.length ? ['on schema_migrations, which should have none'] : []),
    ];
    checks.push(
      schema && problems.length === 0
        ? pass('Policies limited to the runtime role', `${policies.length} policies`)
        : fail('Policies limited to the runtime role', problems.join('; ') || 'no schema to check', `Every app table has one policy, to ${RUNTIME_ROLE} only. Fix it with a migration.`),
    );

    const [role] = await tx<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolreplication: boolean; rolbypassrls: boolean; rolcanlogin: boolean; owned: number; memberships: number }[]>`
      SELECT r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls, r.rolcanlogin,
             (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relowner = r.oid) AS owned,
             (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS memberships
      FROM pg_roles r WHERE r.rolname = ${RUNTIME_ROLE}
    `;
    if (!role) {
      checks.push(fail('Runtime role attributes', `${RUNTIME_ROLE} does not exist`, 'Run npm run db:setup.'));
    } else {
      const bad = [
        role.rolsuper && 'SUPERUSER', role.rolcreaterole && 'CREATEROLE', role.rolcreatedb && 'CREATEDB', role.rolreplication && 'REPLICATION', role.rolbypassrls && 'BYPASSRLS',
        !role.rolcanlogin && 'NOLOGIN', role.owned > 0 && 'owns tables', role.memberships > 0 && 'is a member of another role',
      ].filter(Boolean);
      checks.push(
        bad.length === 0
          ? pass('Runtime role attributes', 'least privilege')
          : fail('Runtime role attributes', `has ${bad.join(', ')}`, `As a superuser: ALTER ROLE ${RUNTIME_ROLE} NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS, and revoke any membership.`),
      );
    }

    if (role) {
      const grants = await tx<{ table_name: string; privilege_type: string }[]>`
        SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = ${RUNTIME_ROLE} AND table_schema = 'app'
      `;
      const extra = grants.filter((g) => !RUNTIME_GRANTS[g.table_name]?.includes(g.privilege_type)).map((g) => `${g.privilege_type} on ${g.table_name}`);
      const [onSchema] = schema ? await tx<{ create: boolean }[]>`SELECT has_schema_privilege(${RUNTIME_ROLE}, 'app', 'CREATE') AS create` : [{ create: false }];
      if (onSchema?.create) extra.push('CREATE on schema app');
      checks.push(
        extra.length === 0
          ? pass('Runtime grants', 'only what the app needs')
          : fail('Runtime grants', `also has ${extra.join(', ')}`, 'Revoke these. The app needs no more than the migrations grant.'),
      );
    }

    const onDisk = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
    const sums = new Map(await Promise.all(onDisk.map(async (name) => [name, createHash('sha256').update(await readFile(join(MIGRATIONS_DIR, name), 'utf8')).digest('hex')] as const)));
    const [ledger] = await tx`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'schema_migrations'`;
    if (!ledger) {
      checks.push(fail('Migrations applied', 'nothing has been migrated', 'Run npm run db:setup.'));
    } else {
      const applied = await tx<{ name: string; checksum: string }[]>`SELECT name, checksum FROM app.schema_migrations`;
      const byName = new Map(applied.map((row) => [row.name, row.checksum]));
      const pending = onDisk.filter((name) => !byName.has(name));
      const changed = onDisk.filter((name) => byName.has(name) && byName.get(name) !== sums.get(name));
      const unknown = applied.map((row) => row.name).filter((name) => !sums.has(name));
      const issues = [
        ...(pending.length ? [`pending ${pending.join(', ')}`] : []),
        ...(changed.length ? [`changed since applied: ${changed.join(', ')}`] : []),
        ...(unknown.length ? [`applied but not on disk: ${unknown.join(', ')}`] : []),
      ];
      checks.push(
        issues.length === 0
          ? pass('Migrations applied with checksums', `${applied.length} of ${onDisk.length}`)
          : fail('Migrations applied with checksums', issues.join('; '), 'Run npm run db:setup for pending ones. A changed file means this checkout differs from what was applied: never edit an applied migration.'),
      );
    }

    const outside: string[] = [];
    const present: string[] = [];
    for (const name of OUTSIDE_ROLES) {
      const [found] = await tx`SELECT 1 FROM pg_roles WHERE rolname = ${name}`;
      if (!found) continue;
      present.push(name);
      if (schema) {
        const [usage] = await tx<{ usage: boolean }[]>`SELECT has_schema_privilege(${name}, 'app', 'USAGE') AS usage`;
        if (usage?.usage) outside.push(`${name} can use schema app`);
        const held = await tx<{ table_name: string }[]>`SELECT DISTINCT table_name FROM information_schema.role_table_grants WHERE grantee = ${name} AND table_schema = 'app'`;
        if (held.length) outside.push(`${name} holds ${held.map((t) => t.table_name).join(', ')}`);
      }
    }
    if (schema) {
      const [open] = await tx<{ public_usage: boolean; public_tables: number }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a WHERE n.nspname = 'app' AND a.grantee = 0 AND a.privilege_type = 'USAGE') AS public_usage,
               (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) a WHERE n.nspname = 'app' AND a.grantee = 0) AS public_tables
      `;
      if (open?.public_usage) outside.push('PUBLIC can use schema app');
      if (open?.public_tables) outside.push('PUBLIC holds app tables');
    }
    checks.push(
      outside.length === 0
        ? pass('anon and authenticated denied', present.length ? `checked ${present.join(', ')} and PUBLIC` : 'neither role exists here; PUBLIC checked')
        : fail('anon and authenticated denied', outside.join('; '), 'REVOKE these. Nothing outside the runtime role may reach schema app.'),
    );
    return checks;
  });
}

export function printChecks(checks: readonly Check[], print: (line: string) => void = console.log): boolean {
  for (const check of checks) {
    print(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}: ${check.detail}`);
    if (check.fix) print(`      Fix: ${check.fix}`);
  }
  return checks.every((check) => check.ok);
}
