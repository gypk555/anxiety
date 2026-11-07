// Zero-setup development server: real Postgres (embedded), real least-privilege role, real migrations,
// the `file:` mail transport, port 8787. State survives restarts in apps/api/.pgdata-dev*.
//
//   DEV_FRESH=1      wipe the database and keys first
//   DEV_USE_BUILD=1  run dist/server.js instead of watching src (build first)
//   DEV_PG_DIR, DEV_PG_PORT, PORT, MAIL_TRANSPORT, PUBLIC_ORIGIN, DEV_ORIGINS  override defaults
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { createSql, runtimeRoleSql } from '../src/db.ts';
import { migrate, MigrationError } from '../src/migrate.ts';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(apiRoot, '../..');
const pgDir = resolve(process.env.DEV_PG_DIR ?? join(apiRoot, '.pgdata-dev'));
const secretsFile = `${pgDir}.keys.json`;
const pgPort = Number(process.env.DEV_PG_PORT ?? 54329);
const databaseName = 'anxiocare';

interface DevSecrets {
  superPassword: string;
  runtimePassword: string;
  ENCRYPTION_KEYS: string;
  EMAIL_INDEX_KEY: string;
  OTP_PEPPER: string;
  AUDIT_KEY: string;
  PASSWORD_PEPPER: string;
}

function loadSecrets(): DevSecrets {
  const key = () => randomBytes(32).toString('base64');
  if (existsSync(secretsFile)) {
    const saved = JSON.parse(readFileSync(secretsFile, 'utf8')) as DevSecrets;
    // A keys file from before password sign-in existed. Everything already in it stays as it is.
    if (saved.PASSWORD_PEPPER) return saved;
    const extended = { ...saved, PASSWORD_PEPPER: key() };
    writeFileSync(secretsFile, JSON.stringify(extended, null, 2), { mode: 0o600 });
    return extended;
  }
  const secrets: DevSecrets = {
    superPassword: randomBytes(16).toString('hex'),
    runtimePassword: randomBytes(16).toString('hex'),
    ENCRYPTION_KEYS: `v1:${key()}`,
    EMAIL_INDEX_KEY: key(),
    OTP_PEPPER: key(),
    AUDIT_KEY: key(),
    PASSWORD_PEPPER: key(),
  };
  writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}

/** A previous run killed outright leaves its postmaster behind, holding the data directory. */
async function stopLeftoverPostgres() {
  const pidFile = join(pgDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').split('\n', 1)[0]);
  if (!Number.isInteger(pid) || pid <= 0) return;
  let command = '';
  try {
    command = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
  } catch {
    return; // Not running: Postgres clears a stale pid file itself.
  }
  if (!command.includes('postgres')) return;
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 50 && existsSync(pidFile); i += 1) await new Promise((r) => setTimeout(r, 100));
}

// Before wiping: the pid file that identifies a leftover server is inside the data directory.
await stopLeftoverPostgres();
if (process.env.DEV_FRESH === '1') {
  rmSync(pgDir, { recursive: true, force: true });
  rmSync(secretsFile, { force: true });
}
const secrets = loadSecrets();

const pg = new EmbeddedPostgres({
  databaseDir: pgDir,
  user: 'postgres',
  password: secrets.superPassword,
  port: pgPort,
  persistent: true,
  onLog: () => {},
  onError: (message) => console.error('[postgres]', message),
});
const url = (user: string, pass: string, database: string) => `postgres://${user}:${pass}@127.0.0.1:${pgPort}/${database}`;

/** Prints what to do, and stops the Postgres this script started, because nothing else would. */
async function failStartup(err: unknown): Promise<never> {
  if (err instanceof MigrationError) {
    console.error(`[dev] Migration failed: ${err.message}`);
    console.error('[dev] The local database was migrated from a different version of the files in migrations/.');
    console.error('[dev] DEV_FRESH=1 npm run dev:api wipes the local data and keys and starts again. Without it, nothing is wiped.');
  } else {
    console.error(`[dev] Startup failed: ${err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error'}`);
  }
  await pg.stop().catch(() => {});
  process.exit(1);
}

try {
  if (!existsSync(join(pgDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();

  const server = postgres(url('postgres', secrets.superPassword, 'postgres'), { max: 1, onnotice: () => {} });
  try {
    const [existing] = await server`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;
    if (!existing) await server.unsafe(`CREATE DATABASE ${databaseName}`);
    await server.unsafe(runtimeRoleSql(secrets.runtimePassword));
  } finally {
    await server.end({ timeout: 1 });
  }

  const migrator = createSql(url('postgres', secrets.superPassword, databaseName), { caCert: null, max: 1 });
  try {
    await migrate(migrator);
  } finally {
    await migrator.end({ timeout: 1 });
  }
} catch (err) {
  await failStartup(err);
}

const port = process.env.PORT ?? '8787';
const defaultOrigin = `http://localhost:${port}`;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: port,
  HOST: process.env.HOST ?? '127.0.0.1',
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS ?? '0',
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? defaultOrigin,
  // Vite's dev and preview servers proxy /api, and the browser still sends their Origin.
  DEV_ORIGINS:
    process.env.DEV_ORIGINS ??
    [`http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'].join(','),
  DATABASE_URL: url('anxiocare_runtime', secrets.runtimePassword, databaseName),
  ENCRYPTION_KEYS: secrets.ENCRYPTION_KEYS,
  ENCRYPTION_ACTIVE_KEY: 'v1',
  EMAIL_INDEX_KEY: secrets.EMAIL_INDEX_KEY,
  OTP_PEPPER: secrets.OTP_PEPPER,
  AUDIT_KEY: secrets.AUDIT_KEY,
  PASSWORD_PEPPER: secrets.PASSWORD_PEPPER,
  MAIL_TRANSPORT: process.env.MAIL_TRANSPORT ?? `file:${join(repoRoot, '.e2e-outbox', 'mail.jsonl')}`,
  MAIL_FROM: process.env.MAIL_FROM ?? 'Accounts <no-reply@localhost.example>',
  OPERATOR_NAME: process.env.OPERATOR_NAME ?? 'AnxioCare (development)',
  GRIEVANCE_EMAIL: process.env.GRIEVANCE_EMAIL ?? 'grievance@example.com',
};
delete env.DATABASE_MIGRATION_URL;

const args = process.env.DEV_USE_BUILD === '1' ? ['dist/server.js'] : ['--watch', '--watch-preserve-output', 'src/server.ts'];
const child = spawn(process.execPath, args, { cwd: apiRoot, env, stdio: 'inherit' });

let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
  await pg.stop().catch(() => {});
  process.exit(code);
}
child.on('exit', (code) => void stop(code ?? 0));
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));

console.log(`[dev] API on ${env.PUBLIC_ORIGIN}, Postgres on 127.0.0.1:${pgPort}, outbox ${env.MAIL_TRANSPORT}`);
