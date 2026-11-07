// Test only: the production build in production mode, the way Render runs it, on this machine.
//
//   browser -TLS-> terminator (https://localhost:8443) -HTTP-> dist/server.js -TLS verify-full-> Postgres
//                                                                    \-STARTTLS-> SMTP stub
//
// Production refuses a fake Google, as it must, so Google's whole round trip runs on a twin at https://localhost:8444:
// the same build, __Host- cookies and TLS, with NODE_ENV=test, a fake provider on a different site and file mail.
// Google is also on in the production server, which proves it boots that way and sends people to Google itself.
//
// Nothing about production mode is relaxed: production config validation, the __Host- cookie, verified TLS to
// the database and to SMTP. The certificate is self-signed for localhost and is trusted by Node through
// NODE_EXTRA_CA_CERTS. The terminator overwrites X-Forwarded-For and CF-Connecting-IP, as Render's edge does.
//
//   STACK_ROOT   repository whose build to run (default: this one)
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { createSql, runtimeRoleSql } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { FakeOidc, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET } from './fake-oidc.ts';
import { startSmtpStub } from './smtp-stub.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const root = process.env.STACK_ROOT ?? repo;
const outbox = join(repo, '.e2e-outbox');
export const TLS_PORT = 8443;
const API_PORT = 54390;
const PG_PORT = 54388;
const SMTP_PORT = 54389;
export const GOOGLE_TLS_PORT = 8444;
const GOOGLE_API_PORT = 54391;
const FAKE_OIDC_PORT = 54392;
const CLIENT_ADDRESS = '198.51.100.77';

const dir = mkdtempSync(join(tmpdir(), 'anxiocare-https-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2',
  '-keyout', 'tls.key', '-out', 'tls.crt', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { cwd: dir, stdio: 'pipe' });
chmodSync(join(dir, 'tls.key'), 0o600);
const key = readFileSync(join(dir, 'tls.key'));
const cert = readFileSync(join(dir, 'tls.crt'));

mkdirSync(outbox, { recursive: true });
const mailFile = join(outbox, 'https-mail.jsonl');
const logFile = join(outbox, 'https-server.log');
const googleMailFile = join(outbox, 'https-google-mail.jsonl');
writeFileSync(mailFile, '', { mode: 0o600 });
writeFileSync(logFile, '', { mode: 0o600 });
writeFileSync(googleMailFile, '', { mode: 0o600 });

// ── Postgres, with TLS ────────────────────────────────────────────────
const superPassword = randomBytes(16).toString('hex');
const runtimePassword = randomBytes(16).toString('hex');
const pg = new EmbeddedPostgres({
  databaseDir: join(dir, 'pg'),
  user: 'postgres',
  password: superPassword,
  port: PG_PORT,
  persistent: false,
  postgresFlags: ['-c', 'ssl=on', '-c', `ssl_cert_file=${join(dir, 'tls.crt')}`, '-c', `ssl_key_file=${join(dir, 'tls.key')}`],
  onLog: () => {},
  onError: () => {},
});
await pg.initialise();
await pg.start();
const dbUrl = (user: string, password: string, database: string) => `postgres://${user}:${password}@localhost:${PG_PORT}/${database}`;
const server = postgres(dbUrl('postgres', superPassword, 'postgres'), { max: 1, ssl: { ca: cert.toString(), rejectUnauthorized: true }, onnotice: () => {} });
await server.unsafe('CREATE DATABASE anxiocare');
await server.unsafe('CREATE DATABASE anxiocare_google');
await server.unsafe(runtimeRoleSql(runtimePassword));
await server.end();
const migrator = createSql(dbUrl('postgres', superPassword, 'anxiocare'), { caCert: cert.toString(), max: 1 });
await migrate(migrator);
await migrator.end();
const googleMigrator = createSql(dbUrl('postgres', superPassword, 'anxiocare_google'), { caCert: cert.toString(), max: 1 });
await migrate(googleMigrator);
await googleMigrator.end();

// ── SMTP stub ─────────────────────────────────────────────────────────
const smtp = await startSmtpStub({ key, cert, port: SMTP_PORT, onMail: (mail) => appendFileSync(mailFile, `${JSON.stringify(mail)}\n`) });

// ── The real server, production mode ──────────────────────────────────
const secret = () => randomBytes(32).toString('base64');
const log = createWriteStream(logFile, { flags: 'a' });
const provider = await new FakeOidc().start(FAKE_OIDC_PORT);
const appSecrets = () => ({
  ENCRYPTION_KEYS: `v1:${secret()}`,
  ENCRYPTION_ACTIVE_KEY: 'v1',
  EMAIL_INDEX_KEY: secret(),
  OTP_PEPPER: secret(),
  AUDIT_KEY: secret(),
  PASSWORD_PEPPER: secret(),
});
const api = spawn(process.execPath, [join(root, 'apps/api/dist/server.js')], {
  cwd: join(root, 'apps/api'),
  env: {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    NODE_EXTRA_CA_CERTS: join(dir, 'tls.crt'),
    HOST: '127.0.0.1',
    PORT: String(API_PORT),
    PUBLIC_ORIGIN: `https://localhost:${TLS_PORT}`,
    TRUST_PROXY_HOPS: '1',
    CLIENT_IP_HEADER: 'cf-connecting-ip',
    LOG_LEVEL: 'info',
    DATABASE_URL: dbUrl('anxiocare_runtime', runtimePassword, 'anxiocare'),
    DATABASE_CA_CERT: cert.toString(),
    ...appSecrets(),
    GOOGLE_CLIENT_ID: '12345-fake.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'not-a-real-secret',
    MAIL_TRANSPORT: 'smtp',
    MAIL_FROM: 'no-reply@mail.example.com',
    SMTP_HOST: 'localhost',
    SMTP_PORT: String(SMTP_PORT),
    SMTP_USER: 'stub',
    SMTP_PASS: 'stub',
    OPERATOR_NAME: 'Test Operator',
    GRIEVANCE_EMAIL: 'grievance@example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
api.stdout.pipe(log);
api.stderr.pipe(log);

const googleApi = spawn(process.execPath, [join(root, 'apps/api/dist/server.js')], {
  cwd: join(root, 'apps/api'),
  env: {
    PATH: process.env.PATH,
    NODE_ENV: 'test',
    NODE_EXTRA_CA_CERTS: join(dir, 'tls.crt'),
    HOST: '127.0.0.1',
    PORT: String(GOOGLE_API_PORT),
    PUBLIC_ORIGIN: `https://localhost:${GOOGLE_TLS_PORT}`,
    TRUST_PROXY_HOPS: '1',
    CLIENT_IP_HEADER: 'cf-connecting-ip',
    LOG_LEVEL: 'warn',
    DATABASE_URL: dbUrl('anxiocare_runtime', runtimePassword, 'anxiocare_google'),
    DATABASE_CA_CERT: cert.toString(),
    ...appSecrets(),
    GOOGLE_CLIENT_ID: FAKE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET,
    GOOGLE_OIDC_BASE_URL: provider.base,
    MAIL_TRANSPORT: `file:${googleMailFile}`,
    MAIL_FROM: 'no-reply@mail.example.com',
    OPERATOR_NAME: 'Test Operator',
    GRIEVANCE_EMAIL: 'grievance@example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
googleApi.stdout.pipe(log);
googleApi.stderr.pipe(log);

// ── TLS terminator ────────────────────────────────────────────────────
const terminate = (apiPort: number) => createHttpsServer({ key, cert }, (incoming, outgoing) => {
  const headers = { ...incoming.headers, 'x-forwarded-for': `${CLIENT_ADDRESS}, 172.71.195.88`, 'x-forwarded-proto': 'https', 'cf-connecting-ip': CLIENT_ADDRESS };
  const upstream = httpRequest({ host: '127.0.0.1', port: apiPort, method: incoming.method, path: incoming.url, headers }, (answer) => {
    outgoing.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
    answer.pipe(outgoing);
  });
  upstream.on('error', () => {
    outgoing.writeHead(502);
    outgoing.end();
  });
  incoming.pipe(upstream);
});
const terminator = terminate(API_PORT);
const googleTerminator = terminate(GOOGLE_API_PORT);
await new Promise<void>((resolve) => googleTerminator.listen(GOOGLE_TLS_PORT, '127.0.0.1', resolve));
// Last, because Playwright waits for this one: when it answers, the twin is listening too.
for (let i = 0; i < 300; i += 1) {
  const up = await fetch(`http://127.0.0.1:${GOOGLE_API_PORT}/healthz`).then((r) => r.ok, () => false);
  if (up) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await new Promise<void>((resolve) => terminator.listen(TLS_PORT, '127.0.0.1', resolve));

let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  terminator.close();
  googleTerminator.close();
  void smtp.close();
  void provider.stop();
  api.kill('SIGTERM');
  googleApi.kill('SIGTERM');
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}
api.on('exit', (code) => void stop(code ?? 1));
googleApi.on('exit', (code) => void stop(code ?? 1));
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));
console.log(`[https-stack] https://localhost:${TLS_PORT} running ${root}`);
