// Test only: the production build in production mode, the way Render runs it, on this machine.
//
//   browser -TLS-> terminator (https://localhost:8443) -HTTP-> dist/server.js -TLS verify-full-> Postgres
//                                                                    \-STARTTLS-> SMTP stub
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
import { createServer as createTcpServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TLSSocket, createSecureContext } from 'node:tls';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { createSql, runtimeRoleSql } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const root = process.env.STACK_ROOT ?? repo;
const outbox = join(repo, '.e2e-outbox');
export const TLS_PORT = 8443;
const API_PORT = 54390;
const PG_PORT = 54388;
const SMTP_PORT = 54389;
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
writeFileSync(mailFile, '', { mode: 0o600 });
writeFileSync(logFile, '', { mode: 0o600 });

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
await server.unsafe(runtimeRoleSql(runtimePassword));
await server.end();
const migrator = createSql(dbUrl('postgres', superPassword, 'anxiocare'), { caCert: cert.toString(), max: 1 });
await migrate(migrator);
await migrator.end();

// ── SMTP stub: enough of the protocol for nodemailer's required STARTTLS ───
const tlsContext = createSecureContext({ key, cert });
function speakSmtp(start: Socket | TLSSocket) {
  let buffer = '';
  let inData = false;
  let to = '';
  const say = (line: string) => start.write(`${line}\r\n`);
  start.on('error', () => {});
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('latin1');
    if (inData) {
      const end = buffer.indexOf('\r\n.\r\n');
      if (end < 0) return;
      appendFileSync(mailFile, `${JSON.stringify({ to, raw: buffer.slice(0, end) })}\n`);
      buffer = buffer.slice(end + 5);
      inData = false;
      say('250 stored');
    }
    let at: number;
    while ((at = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const verb = line.split(/[ :]/, 1)[0]!.toUpperCase();
      if (verb === 'EHLO') {
        const secure = start instanceof TLSSocket;
        start.write(`250-localhost\r\n${secure ? '250 AUTH PLAIN\r\n' : '250 STARTTLS\r\n'}`);
      } else if (verb === 'STARTTLS') {
        say('220 go');
        start.off('data', onData);
        const secure = new TLSSocket(start, { isServer: true, secureContext: tlsContext });
        speakSmtp(secure);
        return;
      } else if (verb === 'AUTH') say('235 ok');
      else if (verb === 'MAIL') say('250 ok');
      else if (verb === 'RCPT') {
        to = /<(.*)>/.exec(line)?.[1] ?? '';
        say('250 ok');
      } else if (verb === 'DATA') {
        inData = true;
        say('354 go');
        return onData(Buffer.alloc(0));
      } else if (verb === 'QUIT') {
        say('221 bye');
        start.end();
      } else say('250 ok');
    }
  };
  start.on('data', onData);
}
const smtp = createTcpServer((socket) => {
  socket.write('220 localhost ready\r\n');
  speakSmtp(socket);
});
await new Promise<void>((resolve) => smtp.listen(SMTP_PORT, '127.0.0.1', resolve));

// ── The real server, production mode ──────────────────────────────────
const secret = () => randomBytes(32).toString('base64');
const log = createWriteStream(logFile, { flags: 'a' });
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
    ENCRYPTION_KEYS: `v1:${secret()}`,
    ENCRYPTION_ACTIVE_KEY: 'v1',
    EMAIL_INDEX_KEY: secret(),
    OTP_PEPPER: secret(),
    AUDIT_KEY: secret(),
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

// ── TLS terminator ────────────────────────────────────────────────────
const terminator = createHttpsServer({ key, cert }, (incoming, outgoing) => {
  const headers = { ...incoming.headers, 'x-forwarded-for': `${CLIENT_ADDRESS}, 172.71.195.88`, 'x-forwarded-proto': 'https', 'cf-connecting-ip': CLIENT_ADDRESS };
  const upstream = httpRequest({ host: '127.0.0.1', port: API_PORT, method: incoming.method, path: incoming.url, headers }, (answer) => {
    outgoing.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
    answer.pipe(outgoing);
  });
  upstream.on('error', () => {
    outgoing.writeHead(502);
    outgoing.end();
  });
  incoming.pipe(upstream);
});
await new Promise<void>((resolve) => terminator.listen(TLS_PORT, '127.0.0.1', resolve));

let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  terminator.close();
  smtp.close();
  api.kill('SIGTERM');
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  process.exit(code);
}
api.on('exit', (code) => void stop(code ?? 1));
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));
console.log(`[https-stack] https://localhost:${TLS_PORT} running ${root}`);
