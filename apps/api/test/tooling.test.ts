import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { parseEnv } from 'node:util';
import { assertRuntimeRole, createSql } from '../src/db.ts';
import { startSmtpStub, type StubMail } from '../scripts/smtp-stub.ts';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(API_ROOT, '../..');
const SUPER = 'tooling-super-password';
/** As Supabase's `postgres`: can create roles and databases, can bypass RLS, is not a superuser. */
const ADMIN_USER = 'supa_admin';
const ADMIN_PASSWORD = 'ADMINSECRETPASSWORD123';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

let dir: string;
let port: number;
let pg: EmbeddedPostgres;
let su: postgres.Sql;
let caPath: string;
let key: Buffer;
let cert: Buffer;
let dbCounter = 0;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'anxiocare-tooling-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2',
    '-keyout', 'tls.key', '-out', 'tls.crt', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { cwd: dir, stdio: 'pipe' });
  chmodSync(join(dir, 'tls.key'), 0o600);
  caPath = join(dir, 'tls.crt');
  key = readFileSync(join(dir, 'tls.key'));
  cert = readFileSync(caPath);
  port = await freePort();
  pg = new EmbeddedPostgres({
    databaseDir: join(dir, 'pg'),
    user: 'postgres',
    password: SUPER,
    port,
    persistent: false,
    postgresFlags: ['-c', 'ssl=on', '-c', `ssl_cert_file=${caPath}`, '-c', `ssl_key_file=${join(dir, 'tls.key')}`, '-c', 'fsync=off'],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  su = postgres({ host: 'localhost', port, user: 'postgres', pass: SUPER, database: 'postgres', max: 1, ssl: { ca: cert.toString(), rejectUnauthorized: true }, onnotice: () => {} });
  await su.unsafe(`CREATE ROLE ${ADMIN_USER} LOGIN CREATEROLE CREATEDB BYPASSRLS NOSUPERUSER PASSWORD '${ADMIN_PASSWORD}'`);
  await su.unsafe('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
}, 120_000);

afterAll(async () => {
  await su.end({ timeout: 1 });
  await pg.stop();
  rmSync(dir, { recursive: true, force: true });
});

interface Result {
  code: number | null;
  output: string;
}

function run(script: string, args: string[], env: Record<string, string>): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join('scripts', script), ...args], {
      cwd: API_ROOT,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => (output += String(d)));
    child.stderr.on('data', (d) => (output += String(d)));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${script} did not exit: ${output}`));
    }, 90_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

/** One database, one working directory holding `.env.setup`, as the owner's machine would. */
async function project(over: Partial<{ adminUrl: string; caPath: string }> = {}) {
  const name = `tool_${process.pid}_${++dbCounter}`;
  await su.unsafe(`CREATE DATABASE ${name} OWNER ${ADMIN_USER}`);
  const workdir = mkdtempSync(join(dir, 'work-'));
  const setupFile = join(workdir, '.env.setup');
  const secretsFile = join(workdir, '.env.secrets');
  const adminUrl = over.adminUrl ?? `postgres://${ADMIN_USER}:${ADMIN_PASSWORD}@localhost:${port}/${name}`;
  writeFileSync(setupFile, `# Test\nADMIN_DATABASE_URL=${adminUrl}\nDATABASE_CA_PATH=${over.caPath ?? caPath}\nSECRETS_FILE=${secretsFile}\n`);
  const env = { ANXIOCARE_SETUP_FILE: setupFile };
  const database = () => postgres({ host: 'localhost', port, user: 'postgres', pass: SUPER, database: name, max: 1, ssl: { ca: cert.toString(), rejectUnauthorized: true }, onnotice: () => {} });
  return { name, workdir, setupFile, secretsFile, env, adminUrl, database };
}

const setup = (p: { env: Record<string, string> }) => run('db-setup.ts', [], p.env);
const verify = (p: { env: Record<string, string> }) => run('db-verify.ts', [], p.env);

describe('npm run db:setup', () => {
  it('creates the role, runs the migrations, verifies, and says what to copy, printing no secret', async () => {
    const p = await project();
    const r = await setup(p);
    expect(r.code, r.output).toBe(0);
    expect(r.output).toMatch(/Applied: .*001_init\.sql.*002_accounts\.sql/);
    expect(r.output).toMatch(/PASS.*RLS/);
    expect(r.output).not.toMatch(/FAIL/);
    expect(r.output).toContain('PASSWORD_PEPPER');
    expect(r.output).toContain(p.secretsFile);

    const secrets = parseEnv(readFileSync(p.secretsFile, 'utf8'));
    expect(r.output).not.toContain(ADMIN_PASSWORD);
    for (const name of ['ENCRYPTION_KEYS', 'EMAIL_INDEX_KEY', 'OTP_PEPPER', 'AUDIT_KEY', 'PASSWORD_PEPPER', 'DATABASE_URL']) {
      expect(secrets[name], name).toBeTruthy();
      expect(r.output, `${name} is not printed`).not.toContain(secrets[name]!);
    }
    expect(statSync(p.secretsFile).mode & 0o777).toBe(0o600);
    expect(secrets.DATABASE_URL).toMatch(/^postgres:\/\/anxiocare_runtime:/);
    expect(secrets.ENCRYPTION_ACTIVE_KEY).toBe('v1');

    // The role really works with what was generated, and is really least-privilege.
    const runtime = createSql(secrets.DATABASE_URL!, { caCert: cert.toString(), max: 1 });
    await assertRuntimeRole(runtime);
    expect(await runtime`SELECT count(*)::int AS n FROM app.users`).toEqual([{ n: 0 }]);
    await runtime.end();
  });

  it('prints the secret values only when asked to', async () => {
    const p = await project();
    await setup(p);
    const secrets = parseEnv(readFileSync(p.secretsFile, 'utf8'));
    const shown = await run('db-setup.ts', ['--show-secrets'], p.env);
    expect(shown.code, shown.output).toBe(0);
    expect(shown.output).toContain(secrets.PASSWORD_PEPPER!);
    expect(shown.output, 'the admin password is never printed').not.toContain(ADMIN_PASSWORD);
  });

  it('run twice is idempotent: nothing changes the second time, on a non-superuser admin role as on Supabase', async () => {
    const p = await project();
    const first = await setup(p);
    expect(first.code, first.output).toBe(0);
    const before = readFileSync(p.secretsFile);
    const verifier = async () => (await su`SELECT rolpassword FROM pg_authid WHERE rolname = 'anxiocare_runtime'`)[0]!.rolpassword as string;
    const verifierBefore = await verifier();
    const db = p.database();
    await db`INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version) VALUES (gen_random_uuid(), '\\x01', '\\x01', '\\x01', 'v1')`;

    const second = await setup(p);
    expect(second.code, second.output).toBe(0);
    expect(second.output).toContain('No pending migrations');
    // A password that already works is not set again. Re-setting it gives a new SCRAM salt, and Supabase's pooler
    // keeps the old verifier cached, so the running app is refused (28P01) until the pooler refreshes.
    expect(second.output).toContain('Runtime role: unchanged');
    expect(await verifier(), 'the stored verifier is untouched').toBe(verifierBefore);
    expect(readFileSync(p.secretsFile).equals(before), 'the secrets file is byte for byte the same').toBe(true);
    expect(await db`SELECT count(*)::int AS n FROM app.users`).toEqual([{ n: 1 }]);
    const applied = await db`SELECT count(*)::int AS n FROM app.schema_migrations`;
    expect(applied[0]!.n).toBe(5);
    await db.end();
  });

  it('sets the runtime password again when the one in the secrets file no longer works', async () => {
    const p = await project();
    expect((await setup(p)).code).toBe(0);
    await su.unsafe(`ALTER ROLE anxiocare_runtime PASSWORD 'something-else-entirely'`);
    const r = await setup(p);
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('Runtime role: updated');
    const secrets = parseEnv(readFileSync(p.secretsFile, 'utf8'));
    const runtime = createSql(secrets.DATABASE_URL!, { caCert: cert.toString(), max: 1 });
    await assertRuntimeRole(runtime);
    await runtime.end();
  });

  it('never overwrites a secret, even one that was edited, and adds only what is missing', async () => {
    const p = await project();
    expect((await setup(p)).code).toBe(0);
    const secrets = parseEnv(readFileSync(p.secretsFile, 'utf8'));
    const edited = readFileSync(p.secretsFile, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('PASSWORD_PEPPER='))
      .join('\n');
    writeFileSync(p.secretsFile, edited, { mode: 0o600 });
    const r = await setup(p);
    expect(r.code, r.output).toBe(0);
    const after = parseEnv(readFileSync(p.secretsFile, 'utf8'));
    expect(after.AUDIT_KEY).toBe(secrets.AUDIT_KEY);
    expect(after.ENCRYPTION_KEYS).toBe(secrets.ENCRYPTION_KEYS);
    expect(after.PASSWORD_PEPPER).toBeTruthy();
    expect(after.PASSWORD_PEPPER).not.toBe(secrets.PASSWORD_PEPPER);
    expect(readFileSync(p.secretsFile, 'utf8').startsWith(edited.trimEnd())).toBe(true);
  });

  it('refuses a malformed secrets file rather than replacing it', async () => {
    const p = await project();
    writeFileSync(p.secretsFile, 'ENCRYPTION_KEYS=not-a-key\n', { mode: 0o600 });
    const r = await setup(p);
    expect(r.code).toBe(1);
    expect(r.output).toContain('ENCRYPTION_KEYS');
    expect(r.output).not.toContain('not-a-key');
    expect(readFileSync(p.secretsFile, 'utf8')).toBe('ENCRYPTION_KEYS=not-a-key\n');
  });

  it('with no .env.setup, says how to make one', async () => {
    const r = await run('db-setup.ts', [], { ANXIOCARE_SETUP_FILE: join(dir, 'missing.env') });
    expect(r.code).toBe(1);
    expect(r.output).toContain('.env.setup.example');
  });

  it('refuses a wrong password or wrong CA, without printing the connection string', async () => {
    const name = `tool_${process.pid}_wrong`;
    const wrong = await project({ adminUrl: `postgres://${ADMIN_USER}:WRONGSECRETPASSWORD@localhost:${port}/postgres` });
    const r = await setup(wrong);
    expect(r.code).toBe(1);
    expect(r.output).not.toContain('WRONGSECRETPASSWORD');
    expect(r.output).toMatch(/connect/i);
    expect(existsSync(wrong.secretsFile), 'no secrets generated for a database never reached').toBe(false);

    const otherCaDir = mkdtempSync(join(dir, 'other-ca-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2',
      '-keyout', 'k.key', '-out', 'c.crt', '-subj', '/CN=localhost'], { cwd: otherCaDir, stdio: 'pipe' });
    const badCa = await project({ caPath: join(otherCaDir, 'c.crt') });
    const refused = await setup(badCa);
    expect(refused.code).toBe(1);
    expect(refused.output).not.toContain(ADMIN_PASSWORD);
    expect(refused.output).toMatch(/certificate|TLS/i);
    expect(name).toBeTruthy();
  });

  it('refuses a database that does not offer TLS', async () => {
    const plainPort = inject('pgPort');
    const p = await project({ adminUrl: `postgres://postgres:test-super@localhost:${plainPort}/postgres` });
    const r = await setup(p);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/TLS/);
    expect(r.output).not.toContain('test-super');
  });

  it('derives the pooler user from the admin user, as Supabase names them', async () => {
    const { runtimeUrlFrom } = await import('../src/setup.ts');
    expect(runtimeUrlFrom('postgres://postgres.abcd:secret@pooler.example.com:5432/postgres', 'r3s7')).toBe('postgres://anxiocare_runtime.abcd:r3s7@pooler.example.com:5432/postgres');
    expect(runtimeUrlFrom('postgres://postgres:secret@db.example.com:5432/postgres', 'r3s7')).toBe('postgres://anxiocare_runtime:r3s7@db.example.com:5432/postgres');
  });

  it('.env.setup and the secrets file are ignored by git, and the example is not', () => {
    const ignored = (path: string) => {
      try {
        execFileSync('git', ['check-ignore', '-q', path], { cwd: REPO, stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    };
    expect(ignored('.env.setup')).toBe(true);
    expect(ignored('.env.secrets')).toBe(true);
    expect(ignored('.env.setup.example')).toBe(false);
    const example = readFileSync(join(REPO, '.env.setup.example'), 'utf8');
    expect(example).toContain('ADMIN_DATABASE_URL');
    expect(example).toContain('DATABASE_CA_PATH');
  });
});

describe('npm run db:verify', () => {
  let good: Awaited<ReturnType<typeof project>>;
  beforeEach(async () => {
    good = await project();
    const r = await setup(good);
    expect(r.code, r.output).toBe(0);
    await su.unsafe('ALTER ROLE anxiocare_runtime NOBYPASSRLS NOCREATEDB');
  });

  it('passes a good database, and reports each check', async () => {
    const r = await verify(good);
    expect(r.code, r.output).toBe(0);
    for (const check of ['TLS', 'Postgres version', 'Schema app', 'public', 'RLS', 'Policies', 'Runtime role', 'Migrations', 'Question catalogue', 'anon']) {
      expect(r.output).toMatch(new RegExp(`PASS.*${check}`));
    }
    expect(r.output).not.toContain(ADMIN_PASSWORD);
  });

  it('is read-only: the database is the same afterwards', async () => {
    const db = good.database();
    const snapshot = () => db`SELECT (SELECT count(*) FROM pg_class) AS relations, (SELECT count(*) FROM app.schema_migrations) AS applied, (SELECT count(*) FROM pg_policy) AS policies`;
    const before = await snapshot();
    expect((await verify(good)).code).toBe(0);
    expect(await snapshot()).toEqual(before);
    await db.end();
  });

  const broken = (name: string, expected: RegExp, breakIt: (db: postgres.Sql) => Promise<unknown>, repair?: (db: postgres.Sql) => Promise<unknown>) =>
    it(`fails on ${name}`, async () => {
      const db = good.database();
      await breakIt(db);
      const r = await verify(good);
      if (repair) await repair(db);
      await db.end();
      expect(r.code, r.output).toBe(1);
      expect(r.output).toMatch(expected);
    });

  broken('a table in public', /FAIL.*public/, (db) => db`CREATE TABLE public.oops (id int)`);
  broken('a view in public', /FAIL.*public/, (db) => db`CREATE VIEW public.oops_view AS SELECT 1 AS x`);
  broken('RLS turned off on a table', /FAIL.*RLS.*sessions/, (db) => db`ALTER TABLE app.sessions DISABLE ROW LEVEL SECURITY`);
  broken('RLS off on a new table', /FAIL.*RLS.*late_table/, (db) => db`CREATE TABLE app.late_table (id int)`);
  broken('a runtime role with BYPASSRLS', /FAIL.*Runtime role.*BYPASSRLS/, (db) => db`ALTER ROLE anxiocare_runtime BYPASSRLS`, (db) => db`ALTER ROLE anxiocare_runtime NOBYPASSRLS`);
  broken('a runtime role that can create databases', /FAIL.*Runtime role.*CREATEDB/, (db) => db`ALTER ROLE anxiocare_runtime CREATEDB`, (db) => db`ALTER ROLE anxiocare_runtime NOCREATEDB`);
  broken('a policy for another role', /FAIL.*Policies/, async (db) => {
    await db`CREATE POLICY wide ON app.users TO anon USING (true)`;
  });
  broken('a runtime policy removed from a table', /FAIL.*Policies.*journal_entries/, (db) => db`DROP POLICY runtime_all ON app.journal_entries`);
  broken('a changed migration checksum', /FAIL.*Migrations.*001_init/, (db) => db`UPDATE app.schema_migrations SET checksum = 'tampered' WHERE name = '001_init.sql'`);
  broken('a question added by hand', /FAIL.*Question catalogue.*REF-999/, (db) => db`INSERT INTO app.questions (id, type, theme, text, answer_set) VALUES ('REF-999', 'reflection', 'worry', 'An extra question today?', 'reflection_amount')`);
  broken('a question reworded with the guard switched off', /FAIL.*Question catalogue.*REF-010/, async (db) => {
    await db`ALTER TABLE app.questions DISABLE TRIGGER USER`;
    await db`UPDATE app.questions SET text = 'Reworded' WHERE id = 'REF-010'`;
    await db`ALTER TABLE app.questions ENABLE TRIGGER USER`;
  });
  broken('a pending migration', /FAIL.*Migrations.*002_accounts/, (db) => db`DELETE FROM app.schema_migrations WHERE name = '002_accounts.sql'`);
  broken('anon granted the schema', /FAIL.*anon/, (db) => db`GRANT USAGE ON SCHEMA app TO anon`);
  broken('authenticated granted a table', /FAIL.*authenticated/, (db) => db`GRANT SELECT ON app.users TO authenticated`);
  broken('PUBLIC granted the schema', /FAIL.*PUBLIC/, (db) => db`GRANT USAGE ON SCHEMA app TO PUBLIC`);
  broken('the runtime role holding more than it needs', /FAIL.*Runtime role.*TRUNCATE|FAIL.*Runtime grants/, (db) => db`GRANT TRUNCATE ON app.users TO anxiocare_runtime`);
  broken('the runtime role able to create in the schema', /FAIL.*Runtime.*CREATE/, (db) => db`GRANT CREATE ON SCHEMA app TO anxiocare_runtime`);

  it('fails on a schema that was never created', async () => {
    const db = good.database();
    await db`DROP SCHEMA app CASCADE`;
    await db.end();
    const r = await verify(good);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/FAIL.*Schema app/);
  });

  it('says how to fix what it reports', async () => {
    const db = good.database();
    await db`CREATE TABLE public.oops (id int)`;
    await db.end();
    const r = await verify(good);
    expect(r.output).toMatch(/Fix:/);
    expect(r.output).toContain('oops');
  });
});

describe('npm run doctor', () => {
  let good: Awaited<ReturnType<typeof project>>;
  let smtpPort: number;
  let closeSmtp: () => Promise<void>;
  let mails: StubMail[];
  let baseEnv: Record<string, string>;

  beforeAll(async () => {
    good = await project();
    const r = await setup(good);
    expect(r.code, r.output).toBe(0);
    mails = [];
    const smtp = await startSmtpStub({ key, cert, onMail: (m) => mails.push(m) });
    smtpPort = smtp.port;
    closeSmtp = smtp.close;
    const secrets = parseEnv(readFileSync(good.secretsFile, 'utf8')) as Record<string, string>;
    baseEnv = {
      ...secrets,
      NODE_EXTRA_CA_CERTS: caPath,
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://service.onrender-test.dev',
      DATABASE_CA_CERT: cert.toString(),
      MAIL_TRANSPORT: 'smtp',
      MAIL_FROM: 'no-reply@mail.acme-accounts.dev',
      SMTP_HOST: 'localhost',
      SMTP_PORT: String(smtpPort),
      SMTP_USER: 'stub-user',
      SMTP_PASS: 'SMTPSECRETVALUE',
      OPERATOR_NAME: 'Test Operator',
      GRIEVANCE_EMAIL: 'grievance@acme-accounts.dev',
    };
  }, 120_000);
  afterAll(async () => {
    await closeSmtp();
  });

  const doctor = (over: Record<string, string> = {}, args: string[] = []) => {
    const env = { ...baseEnv, ...over };
    for (const [k, v] of Object.entries(over)) if (v === '<unset>') delete env[k];
    return run('doctor.ts', args, env);
  };

  it('passes a full production environment, and sends nothing', async () => {
    const r = await doctor();
    expect(r.code, r.output).toBe(0);
    for (const check of ['Config', 'Database', 'SMTP', 'Google', 'Public origin']) expect(r.output).toMatch(new RegExp(`PASS.*${check}`));
    expect(mails).toEqual([]);
  });

  it('reads an env file too', async () => {
    const file = join(good.workdir, 'render.env');
    const { NODE_EXTRA_CA_CERTS: _ca, ...rest } = baseEnv;
    writeFileSync(file, Object.entries(rest).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'));
    const r = await run('doctor.ts', [`--file=${file}`], { NODE_EXTRA_CA_CERTS: caPath });
    expect(r.code, r.output).toBe(0);
  });

  it('reads a relative env file from where npm was run (INIT_CWD), not from apps/api', async () => {
    const file = join(good.workdir, 'relative.env');
    const { NODE_EXTRA_CA_CERTS: _ca, ...rest } = baseEnv;
    writeFileSync(file, Object.entries(rest).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'));
    const r = await run('doctor.ts', ['--file=relative.env'], { NODE_EXTRA_CA_CERTS: caPath, INIT_CWD: good.workdir });
    expect(r.code, r.output).toBe(0);
  });

  const SECRET_VALUES = () => [baseEnv.PASSWORD_PEPPER!, baseEnv.OTP_PEPPER!, baseEnv.AUDIT_KEY!, baseEnv.EMAIL_INDEX_KEY!, baseEnv.ENCRYPTION_KEYS!, 'SMTPSECRETVALUE', ADMIN_PASSWORD, new URL(baseEnv.DATABASE_URL!).password];
  const expectNoSecrets = (output: string, extra: string[] = []) => {
    for (const value of [...SECRET_VALUES(), ...extra]) expect(output, 'a secret value was printed').not.toContain(value);
  };

  it('reports a bad config by name, with how to fix it, without printing values', async () => {
    const weak = Buffer.alloc(32, 'a').toString('base64');
    const r = await doctor({ PASSWORD_PEPPER: weak, PUBLIC_ORIGIN: 'http://service.onrender-test.dev', GOOGLE_CLIENT_SECRET: 'HALFSETSECRET', DEV_ORIGINS: 'http://x' });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/FAIL.*Config/);
    expect(r.output).toContain('PASSWORD_PEPPER');
    expect(r.output).toContain('GOOGLE_CLIENT_ID');
    expect(r.output).toContain('PUBLIC_ORIGIN');
    expect(r.output).toMatch(/Fix:/);
    expectNoSecrets(r.output.replace(baseEnv.PASSWORD_PEPPER!, ''), [weak, 'HALFSETSECRET']);
  });

  it('refuses a fake provider override, in plain words', async () => {
    const r = await doctor({ GOOGLE_CLIENT_ID: 'a.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_OIDC_BASE_URL: 'https://fake.example' });
    expect(r.code).toBe(1);
    expect(r.output).toContain('GOOGLE_OIDC_BASE_URL');
  });

  it('reports a wrong database password', async () => {
    const url = new URL(baseEnv.DATABASE_URL!);
    url.password = 'WRONGDBPASSWORD';
    const r = await doctor({ DATABASE_URL: url.toString() });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/FAIL.*Database/);
    expect(r.output).toMatch(/Fix:/);
    expectNoSecrets(r.output, ['WRONGDBPASSWORD']);
  });

  it('reports a database role that is too privileged', async () => {
    const r = await doctor({ DATABASE_URL: good.adminUrl });
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/FAIL.*Database/);
    expect(r.output).not.toContain(ADMIN_PASSWORD);
  });

  it('reports an unreachable or refusing SMTP server, without its secrets or its reply', async () => {
    const refusing = await startSmtpStub({ key, cert, rejectAuth: true });
    const r = await doctor({ SMTP_PORT: String(refusing.port) });
    await refusing.close();
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/FAIL.*SMTP/);
    expect(r.output).toMatch(/Fix:/);
    expectNoSecrets(r.output);

    const gone = await doctor({ SMTP_PORT: String(await freePort()) });
    expect(gone.code).toBe(1);
    expect(gone.output).toMatch(/FAIL.*SMTP/);
  });

  it('checks Google config shape, and prints the redirect URI to register', async () => {
    const bad = await doctor({ GOOGLE_CLIENT_ID: 'looks-wrong', GOOGLE_CLIENT_SECRET: 'GOOGLESECRETVALUE' });
    expect(bad.code).toBe(1);
    expect(bad.output).toMatch(/FAIL.*Google/);
    expectNoSecrets(bad.output, ['GOOGLESECRETVALUE']);

    const ok = await doctor({ GOOGLE_CLIENT_ID: '12345-abc.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOOGLESECRETVALUE' });
    expect(ok.code, ok.output).toBe(0);
    expect(ok.output).toContain('https://service.onrender-test.dev/api/v1/auth/google/callback');
    expect(ok.output).not.toContain('GOOGLESECRETVALUE');

    const off = await doctor();
    expect(off.output).toMatch(/PASS.*Google.*off/i);
  });

  it('refuses a placeholder public origin', async () => {
    for (const origin of ['https://example.onrender.com', 'https://localhost:8443']) {
      const r = await doctor({ PUBLIC_ORIGIN: origin });
      expect(r.code, origin).toBe(1);
      expect(r.output).toMatch(/FAIL.*Public origin/);
    }
  });

  it('checks production rules whatever NODE_ENV says', async () => {
    const r = await doctor({ NODE_ENV: 'development', MAIL_TRANSPORT: 'file:/tmp/x' });
    expect(r.code).toBe(1);
    expect(r.output).toContain('MAIL_TRANSPORT');
  });

  it('does not start a server', async () => {
    const r = await doctor();
    expect(r.output).not.toMatch(/listening/i);
    expect(randomBytes(1)).toBeTruthy();
  });
});
