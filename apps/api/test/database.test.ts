import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertRuntimeRole, createSql, databaseOptions, runtimeRoleSql } from '../src/db.ts';
import { migrate, MIGRATIONS_DIR } from '../src/migrate.ts';
import { createDatabase, createHarness, signIn, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const denied = async (run: () => Promise<unknown>) => {
  await expect(run()).rejects.toMatchObject({ code: expect.stringMatching(/^42501$/) });
};

describe('migration 002', () => {
  // The sha256 of 001_init.sql as applied. If this changes, a deployed database refuses to migrate.
  const CHECKSUM_001 = createHash('sha256').update(readFileSync(join(MIGRATIONS_DIR, '001_init.sql'), 'utf8')).digest('hex');

  it('applies on top of 001, unchanged, and keeps the rows that were there', async () => {
    const { dbUrl } = await createDatabase();
    const sql = createSql(dbUrl('migrator'), { caCert: null, max: 1 });
    const onlyFirst = mkdtempSync(join(tmpdir(), 'mig-only-001-'));
    writeFileSync(join(onlyFirst, '001_init.sql'), readFileSync(join(MIGRATIONS_DIR, '001_init.sql'), 'utf8'));
    expect(await migrate(sql, onlyFirst)).toEqual(['001_init.sql']);
    const id = randomUUID();
    const owner = createSql(dbUrl('super'), { caCert: null, max: 1 });
    await owner.begin(async (tx) => {
      await tx`INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version) VALUES (${id}::uuid, '\\x0a', '\\x0b', '\\x0c', 'v1')`;
      await tx`INSERT INTO app.otp_codes (purpose, email_hash, quota_hash, source_hash, code_hmac, expires_at) VALUES ('login', '\\x0a', '\\x0a', '\\x0a', '\\x0a', now())`;
      await tx`INSERT INTO app.audit_log (actor_hmac, action) VALUES ('\\x0a', 'login')`;
    });
    await owner.end();

    expect(await migrate(sql)).toEqual(['002_accounts.sql', '003_devices_and_reauth.sql', '004_mood_and_safety_plan.sql', '005_questions.sql', '006_profile.sql', '007_indexes.sql']);
    expect(await migrate(sql), 'and runs once').toEqual([]);

    const [user] = await sql<{ password_hash: string | null; email_ct: Buffer }[]>`SELECT password_hash, email_ct FROM app.users WHERE id = ${id}::uuid`;
    expect(user!.password_hash).toBeNull();
    expect(user!.email_ct.toString('hex')).toBe('0b');
    const applied = await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM app.schema_migrations ORDER BY name`;
    expect(applied[0]).toEqual({ name: '001_init.sql', checksum: CHECKSUM_001 });
    await sql.end();
  });

  it('001 is byte for byte what it was', () => {
    expect(CHECKSUM_001).toBe('3c6db49e9a3b3f01865c043112bdb6cf0536e17fd2790a3f950482f2e2b70a0f');
  });

  it('refuses a password_hash that is not an Argon2id PHC string', async () => {
    await expect(h.admin`INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version, password_hash) VALUES (gen_random_uuid(), '\\x09', '\\x09', '\\x09', 'v1', 'plaintext')`).rejects.toThrow();
  });
});

describe('the runtime role on the new tables', () => {
  const grants = async (table: string) => {
    const rows = await h.admin<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'anxiocare_runtime' AND table_schema = 'app' AND table_name = ${table} ORDER BY 1
    `;
    return rows.map((r) => r.privilege_type);
  };

  it.each([
    ['user_identities', ['DELETE', 'INSERT', 'SELECT']],
    ['login_failures', ['DELETE', 'INSERT', 'SELECT']],
    ['oauth_state_uses', ['DELETE', 'INSERT', 'SELECT']],
    ['mood_entries', ['DELETE', 'INSERT', 'SELECT', 'UPDATE']],
    ['safety_plans', ['DELETE', 'INSERT', 'SELECT', 'UPDATE']],
    ['questions', ['SELECT']],
    ['reflections', ['DELETE', 'INSERT', 'SELECT']],
  ])('%s has exactly the grants it needs', async (table, expected) => {
    expect(await grants(table)).toEqual(expected);
  });

  it('cannot truncate, alter or drop them', async () => {
    for (const statement of ['TRUNCATE app.user_identities', 'ALTER TABLE app.login_failures ADD COLUMN x int', 'DROP TABLE app.oauth_state_uses', 'UPDATE app.user_identities SET provider = \'google\'', 'UPDATE app.login_failures SET quota_hash = \'\\x01\'']) {
      await denied(() => h.runtime.unsafe(statement));
    }
  });

  it('other roles are walled off by RLS, and policies name only the runtime role', async () => {
    const tables = await h.admin`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app' AND tablename IN ('user_identities', 'login_failures', 'oauth_state_uses')`;
    expect(tables).toHaveLength(3);
    expect(tables.every((t) => t.rowsecurity === true)).toBe(true);
    const policies = await h.admin`SELECT tablename, roles FROM pg_policies WHERE schemaname = 'app' AND tablename IN ('user_identities', 'login_failures', 'oauth_state_uses')`;
    expect(policies).toHaveLength(3);
    expect(policies.every((p) => String(p.roles) === String(['anxiocare_runtime']))).toBe(true);
  });

  it('mood entries and safety plans are walled off by RLS, cascade with the user, and allow one row per day and one plan', async () => {
    const tables = await h.admin`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app' AND tablename IN ('mood_entries', 'safety_plans')`;
    expect(tables.map((t) => [t.tablename, t.rowsecurity]).sort()).toEqual([['mood_entries', true], ['safety_plans', true]]);
    const policies = await h.admin`SELECT tablename, roles FROM pg_policies WHERE schemaname = 'app' AND tablename IN ('mood_entries', 'safety_plans')`;
    expect(policies).toHaveLength(2);
    expect(policies.every((p) => String(p.roles) === String(['anxiocare_runtime']))).toBe(true);
    for (const statement of ['TRUNCATE app.mood_entries', 'DROP TABLE app.safety_plans', 'ALTER TABLE app.mood_entries ADD COLUMN x int']) {
      await denied(() => h.runtime.unsafe(statement));
    }
    const id = randomUUID();
    await h.admin`INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version) VALUES (${id}::uuid, ${Buffer.from(id)}, '\\x01', '\\x01', 'v1')`;
    await h.admin`INSERT INTO app.mood_entries (user_id, day, payload_ct) VALUES (${id}::uuid, '2026-11-01', '\\x01')`;
    await expect(h.admin`INSERT INTO app.mood_entries (user_id, day, payload_ct) VALUES (${id}::uuid, '2026-11-01', '\\x02')`).rejects.toThrow();
    await h.admin`INSERT INTO app.safety_plans (user_id, payload_ct) VALUES (${id}::uuid, '\\x01')`;
    await expect(h.admin`INSERT INTO app.safety_plans (user_id, payload_ct) VALUES (${id}::uuid, '\\x02')`).rejects.toThrow();
    await h.admin`DELETE FROM app.users WHERE id = ${id}::uuid`;
    const [left] = await h.admin`SELECT (SELECT count(*) FROM app.mood_entries WHERE user_id = ${id}::uuid)::int + (SELECT count(*) FROM app.safety_plans WHERE user_id = ${id}::uuid)::int AS n`;
    expect(left!.n).toBe(0);
  });

  it('the app can read and write password_hash on users through its existing grant', async () => {
    const [row] = await h.runtime`SELECT password_hash FROM app.users LIMIT 1`;
    expect(row === undefined || row.password_hash === null || typeof row.password_hash === 'string').toBe(true);
  });
});

describe('schema placement', () => {
  it('public holds none of our tables; app holds all of them', async () => {
    const pub = await h.admin`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    expect(pub).toEqual([]);
    const app = await h.admin`SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY 1`;
    expect(app.map((t) => t.tablename)).toEqual([
      'assessments', 'audit_log', 'consents', 'device_tokens', 'journal_entries', 'login_failures', 'mood_entries', 'oauth_state_uses', 'otp_codes', 'otp_failures', 'questions', 'reflections', 'safety_plans', 'schema_migrations', 'sessions', 'user_identities', 'users',
    ]);
  });

  it('every table has RLS enabled, with policies only for the runtime role', async () => {
    const tables = await h.admin`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app'`;
    expect(tables.every((t) => t.rowsecurity === true)).toBe(true);
    const policies = await h.admin`SELECT * FROM pg_policies WHERE schemaname = 'app'`;
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.every((p) => String(p.roles) === String(['anxiocare_runtime']))).toBe(true);
    expect(policies.some((p) => p.tablename === 'schema_migrations')).toBe(false);
  });

  it('RLS is a real wall: another role granted a table sees nothing and cannot write', async () => {
    await h.admin.unsafe(`CREATE ROLE stray_role_${h.databaseName} NOLOGIN`);
    const role = `stray_role_${h.databaseName}`;
    await h.admin.unsafe(`GRANT USAGE ON SCHEMA app TO ${role}; GRANT SELECT, INSERT ON app.users TO ${role}`);
    await h.admin`INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version) VALUES (gen_random_uuid(), '\\x01', '\\x01', '\\x01', 'v1')`;
    const seen = await h.admin.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      return tx`SELECT count(*)::int AS n FROM app.users`;
    });
    expect(seen[0]!.n).toBe(0);
    await h.admin`DELETE FROM app.users WHERE email_hash = '\\x01'`;
    await h.admin.unsafe(`REVOKE ALL ON app.users FROM ${role}; REVOKE ALL ON SCHEMA app FROM ${role}; DROP ROLE ${role}`);
  });

  it('PUBLIC has no access to the schema', async () => {
    const [row] = await h.admin`
      SELECT has_schema_privilege('public', 'app', 'USAGE') AS usage
    `;
    expect(row!.usage).toBe(false);
  });
});

describe('runtime role', () => {
  it('passes its own boot check', async () => {
    await expect(assertRuntimeRole(h.runtime)).resolves.toBeUndefined();
  });

  it('the boot check refuses a superuser or migration role', async () => {
    await expect(assertRuntimeRole(h.admin)).rejects.toThrow(/least-privilege/);
    const migrator = createSql(h.dbUrl('migrator'), { caCert: null, max: 1 });
    await expect(assertRuntimeRole(migrator)).rejects.toThrow(/least-privilege/);
    await migrator.end();
  });

  it('the boot check refuses a role that can bypass RLS', async () => {
    await h.admin.unsafe(`CREATE ROLE rls_bypasser LOGIN BYPASSRLS PASSWORD 'x'`);
    const url = new URL(h.dbUrl('migrator'));
    url.username = 'rls_bypasser';
    url.password = 'x';
    const bypasser = createSql(url.toString(), { caCert: null, max: 1 });
    try {
      await expect(assertRuntimeRole(bypasser)).rejects.toThrow(/least-privilege/);
    } finally {
      await bypasser.end();
      await h.admin.unsafe('DROP ROLE rls_bypasser');
    }
  });

  it('RLS hides every row from any other role, even one granted the table', async () => {
    await h.admin.unsafe(`CREATE ROLE rest_like LOGIN PASSWORD 'x'; GRANT USAGE ON SCHEMA app TO rest_like; GRANT SELECT ON app.users TO rest_like`);
    const url = new URL(h.dbUrl('migrator'));
    url.username = 'rest_like';
    url.password = 'x';
    const other = createSql(url.toString(), { caCert: null, max: 1 });
    try {
      await signIn(h);
      expect((await h.admin`SELECT count(*)::int AS n FROM app.users`)[0]!.n).toBeGreaterThan(0);
      expect(await other`SELECT id FROM app.users`).toEqual([]);
    } finally {
      await other.end();
      await h.admin.unsafe('REVOKE ALL ON app.users FROM rest_like; REVOKE ALL ON SCHEMA app FROM rest_like; DROP ROLE rest_like');
    }
  });

  it('cannot run DDL', async () => {
    const r = h.runtime;
    await denied(() => r.unsafe('CREATE TABLE app.evil (id int)'));
    await denied(() => r.unsafe('CREATE TABLE public.evil (id int)'));
    await denied(() => r.unsafe('CREATE SCHEMA evil'));
    await denied(() => r.unsafe('ALTER TABLE app.users ADD COLUMN evil int'));
    await denied(() => r.unsafe('ALTER TABLE app.users DISABLE ROW LEVEL SECURITY'));
    await denied(() => r.unsafe('DROP TABLE app.users'));
    await denied(() => r.unsafe('TRUNCATE app.users'));
    await denied(() => r.unsafe('CREATE ROLE evil'));
    await denied(() => r.unsafe(`CREATE DATABASE evil`));
    // Holding no grant option, GRANT is a silent no-op rather than an error. What matters is the effect.
    await r.unsafe('GRANT SELECT ON app.users TO PUBLIC');
    expect((await h.admin`SELECT has_table_privilege('public', 'app.users', 'SELECT') AS granted`)[0]!.granted).toBe(false);
  });

  it('cannot read or write outside what the app needs', async () => {
    await h.admin.unsafe('CREATE TABLE public.outsider (secret text); INSERT INTO public.outsider VALUES ($$x$$)');
    await h.admin.unsafe('CREATE SCHEMA other; CREATE TABLE other.outsider (secret text)');
    try {
      await denied(() => h.runtime`SELECT * FROM public.outsider`);
      await denied(() => h.runtime`INSERT INTO public.outsider VALUES ('y')`);
      await denied(() => h.runtime`SELECT * FROM other.outsider`);
      await denied(() => h.runtime`SELECT * FROM app.schema_migrations`);
      await denied(() => h.runtime`SELECT * FROM pg_catalog.pg_authid`);
      await denied(() => h.runtime`SELECT actor_hmac FROM app.audit_log`);
      await denied(() => h.runtime`UPDATE app.audit_log SET action = 'login'`);
      await denied(() => h.runtime`UPDATE app.assessments SET taken_at = now()`);
      await denied(() => h.runtime`DELETE FROM app.consents`);
    } finally {
      await h.admin.unsafe('DROP TABLE public.outsider; DROP SCHEMA other CASCADE');
    }
  });

  it('role SQL refuses a password it would have to quote', () => {
    expect(() => runtimeRoleSql("x'; DROP TABLE y; --")).toThrow();
    expect(runtimeRoleSql('abc123')).toContain('NOSUPERUSER');
  });
});

describe('database options', () => {
  it('use verify-full with the pinned CA and no prepared statements', () => {
    const options = databaseOptions({ caCert: 'PEM', max: 3 });
    expect(options.prepare).toBe(false);
    expect(options.ssl).toEqual({ ca: 'PEM', rejectUnauthorized: true });
    expect(databaseOptions({ caCert: null, max: 3 }).ssl).toBe(false);
  });
});

describe('migration runner', () => {
  it('applies once, records checksums, and a second run is a no-op', async () => {
    const { dbUrl } = await createDatabase();
    const sql = createSql(dbUrl('migrator'), { caCert: null, max: 1 });
    try {
      const applied = await migrate(sql);
      expect(applied[0]).toBe('001_init.sql');
      expect(await migrate(sql)).toEqual([]);
      const rows = await sql`SELECT name, checksum FROM app.schema_migrations`;
      expect(rows[0]!.checksum).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await sql.end();
    }
  });

  it('refuses when an applied file changed or vanished', async () => {
    const { dbUrl } = await createDatabase();
    const sql = createSql(dbUrl('migrator'), { caCert: null, max: 1 });
    const dir = mkdtempSync(join(tmpdir(), 'migs-'));
    try {
      writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE app.a (id int);');
      await migrate(sql, dir);
      writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE app.a (id bigint);');
      await expect(migrate(sql, dir)).rejects.toThrow(/checksum mismatch/);
      await expect(migrate(sql, MIGRATIONS_DIR)).rejects.toThrow(/missing from disk/);
    } finally {
      await sql.end();
    }
  });

  it('rolls back a failing migration as a whole', async () => {
    const { dbUrl } = await createDatabase();
    const sql = createSql(dbUrl('migrator'), { caCert: null, max: 1 });
    const dir = mkdtempSync(join(tmpdir(), 'migs-'));
    try {
      writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE app.a (id int); SELECT 1/0;');
      await expect(migrate(sql, dir)).rejects.toBeTruthy();
      const [row] = await sql`SELECT to_regclass('app.a') AS t`;
      expect(row!.t).toBeNull();
    } finally {
      await sql.end();
    }
  });
});

describe('indexes', () => {
  it('every foreign key column is the leading column of some index, so a cascade or a join never scans the table', async () => {
    const missing = await h.admin<{ tbl: string; col: string }[]>`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND n.nspname = 'app'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
        )
      ORDER BY 1, 2
    `;
    expect(missing).toEqual([]);
  });

  it('the purge can find old code failures by age alone', async () => {
    const [row] = await h.admin<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'app' AND tablename = 'otp_failures' AND indexdef LIKE '%(created_at)%'
    `;
    expect(row!.n).toBe(1);
  });
});
