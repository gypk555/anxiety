import { mkdtempSync, writeFileSync } from 'node:fs';
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

describe('schema placement', () => {
  it('public holds none of our tables; app holds all of them', async () => {
    const pub = await h.admin`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    expect(pub).toEqual([]);
    const app = await h.admin`SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY 1`;
    expect(app.map((t) => t.tablename)).toEqual([
      'assessments', 'audit_log', 'consents', 'journal_entries', 'otp_codes', 'otp_failures', 'schema_migrations', 'sessions', 'users',
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
