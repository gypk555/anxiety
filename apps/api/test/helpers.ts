import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { CONSENT_VERSION, CSRF_HEADER, CSRF_HEADER_VALUE } from '@anxiocare/shared';
import type { FastifyInstance, InjectOptions } from 'fastify';
import postgres from 'postgres';
import { inject } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createSql, type Sql } from '../src/db.ts';
import type { MailMessage, Mailer } from '../src/mail.ts';
import { migrate } from '../src/migrate.ts';
import { MIGRATOR_PASSWORD, RUNTIME_PASSWORD, SUPER_PASSWORD } from './global-setup.ts';

export const ORIGIN = 'https://app.test';

export const key = () => randomBytes(32).toString('base64');

export function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: ORIGIN,
    DATABASE_URL: 'postgres://anxiocare_runtime:x@127.0.0.1:5432/x',
    ENCRYPTION_KEYS: `v1:${key()}`,
    ENCRYPTION_ACTIVE_KEY: 'v1',
    EMAIL_INDEX_KEY: key(),
    OTP_PEPPER: key(),
    AUDIT_KEY: key(),
    MAIL_TRANSPORT: 'file:/dev/null',
    MAIL_FROM: 'Accounts <no-reply@example.com>',
    OPERATOR_NAME: 'Test Operator',
    GRIEVANCE_EMAIL: 'grievance@example.com',
    WEB_DIST: '/nonexistent/web-dist',
    ...overrides,
  };
}

export class CapturingMailer implements Mailer {
  sent: MailMessage[] = [];
  /** Replace to simulate a slow or failing provider. */
  hook: (message: MailMessage) => Promise<void> = async () => {};

  async send(message: MailMessage) {
    await this.hook(message);
    this.sent.push(message);
  }

  codeFor(to: string, purpose: MailMessage['purpose'] = 'login'): string {
    const found = this.sent.filter((m) => m.to === to && m.purpose === purpose).at(-1);
    if (!found?.code) throw new Error(`no ${purpose} code for ${to}`);
    return found.code;
  }
}

export interface Harness {
  app: FastifyInstance;
  config: Config;
  /** Superuser: for raw inspection and test setup, as an attacker with a DB dump would see things. */
  admin: Sql;
  /** Least-privilege runtime role, the one the app uses. */
  runtime: Sql;
  mailer: CapturingMailer;
  logs: string[];
  databaseName: string;
  dbUrl: (role: 'runtime' | 'migrator' | 'super') => string;
  close: () => Promise<void>;
}

let dbCounter = 0;

export async function createDatabase() {
  const port = inject('pgPort');
  const name = `t_${process.pid}_${++dbCounter}_${randomBytes(3).toString('hex')}`;
  const server = postgres({ host: '127.0.0.1', port, user: 'postgres', pass: SUPER_PASSWORD, database: 'postgres', max: 1, onnotice: () => {} });
  await server.unsafe(`CREATE DATABASE ${name} OWNER anxiocare_migrator`);
  await server.end();
  const dbUrl = (role: 'runtime' | 'migrator' | 'super') => {
    const [user, pass] =
      role === 'runtime'
        ? ['anxiocare_runtime', RUNTIME_PASSWORD]
        : role === 'migrator'
          ? ['anxiocare_migrator', MIGRATOR_PASSWORD]
          : ['postgres', SUPER_PASSWORD];
    return `postgres://${user}:${pass}@127.0.0.1:${port}/${name}`;
  };
  return { name, dbUrl };
}

export async function createHarness(overrides: Record<string, string | undefined> = {}): Promise<Harness> {
  const { name, dbUrl } = await createDatabase();
  const migrator = createSql(dbUrl('migrator'), { caCert: null, max: 1 });
  await migrate(migrator);
  await migrator.end();

  const config = loadConfig(baseEnv({ DATABASE_URL: dbUrl('runtime'), ...overrides }));
  const runtime = createSql(dbUrl('runtime'), { caCert: null, max: 8 });
  const admin = createSql(dbUrl('super'), { caCert: null, max: 3 });
  const mailer = new CapturingMailer();
  const logs: string[] = [];
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    },
  });
  const app = await buildApp({ config, sql: runtime, mailer, logStream });
  await app.ready();
  return {
    app,
    config,
    admin,
    runtime,
    mailer,
    logs,
    databaseName: name,
    dbUrl,
    close: async () => {
      await app.close();
      await runtime.end({ timeout: 5 });
      await admin.end({ timeout: 5 });
    },
  };
}

let ipCounter = 0;
/** Each test client gets its own address so route rate limits only trigger where a test wants them to. */
const nextIp = () => {
  ipCounter += 1;
  return `10.${process.pid % 250}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

export interface ClientOptions {
  ip?: string;
  userAgent?: string;
}

export class Client {
  readonly h: Harness;
  cookie: string | null = null;
  readonly ip: string;
  readonly userAgent: string;

  constructor(h: Harness, options: ClientOptions = {}) {
    this.h = h;
    this.ip = options.ip ?? nextIp();
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  }

  async request(options: InjectOptions & { raw?: boolean }) {
    const name = this.h.config.cookie.name;
    const headers: Record<string, string> = {
      'user-agent': this.userAgent,
      ...(this.cookie ? { cookie: `${name}=${this.cookie}` } : {}),
    };
    if (options.method && !['GET', 'HEAD'].includes(String(options.method))) {
      headers.origin = ORIGIN;
      headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
    }
    const response = await this.h.app.inject({
      remoteAddress: this.ip,
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
    for (const c of response.cookies as { name: string; value: string; maxAge?: number; expires?: Date }[]) {
      if (c.name !== name) continue;
      const cleared = c.value === '' || (c.expires && c.expires.getTime() < Date.now());
      this.cookie = cleared ? null : c.value;
    }
    return response;
  }

  get(url: string, headers?: Record<string, string>) {
    return this.request({ method: 'GET', url, headers });
  }

  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request({ method: 'POST', url, ...(body !== undefined ? { payload: body as object } : {}), headers });
  }

  patch(url: string, body: unknown) {
    return this.request({ method: 'PATCH', url, payload: body as object });
  }

  delete(url: string) {
    return this.request({ method: 'DELETE', url });
  }
}

const API = '/api/v1';
export { API };

let emailCounter = 0;
export const uniqueEmail = (prefix = 'person') => `${prefix}-${process.pid}-${++emailCounter}@example.com`;

export async function requestCode(h: Harness, client: Client, email: string): Promise<string> {
  const response = await client.post(`${API}/auth/otp/request`, { email });
  if (response.statusCode !== 202) throw new Error(`otp request failed: ${response.statusCode}`);
  await h.app.drainBackground();
  return h.mailer.codeFor(email);
}

export async function signIn(h: Harness, email: string = uniqueEmail(), options: ClientOptions = {}): Promise<{ client: Client; email: string; id: string }> {
  const client = new Client(h, options);
  const code = await requestCode(h, client, email);
  const response = await client.post(`${API}/auth/otp/verify`, { email, code });
  if (response.statusCode !== 200) throw new Error(`verify failed: ${response.statusCode} ${response.body}`);
  return { client, email, id: response.json().id as string };
}

export const consentPayload = { version: CONSENT_VERSION, adultConfirmed: true, healthDataConsent: true };

export async function signInConsented(h: Harness, email: string = uniqueEmail(), options: ClientOptions = {}) {
  const session = await signIn(h, email, options);
  const response = await session.client.post(`${API}/me/consent`, consentPayload);
  if (response.statusCode !== 200) throw new Error(`consent failed: ${response.statusCode} ${response.body}`);
  return session;
}

export const journalPayload = (overrides: Record<string, unknown> = {}) => ({
  situation: 'SECRET-SITUATION at the office',
  thought: 'SECRET-THOUGHT that it will go wrong',
  feelings: ['worried'],
  intensityBefore: 7,
  evidenceFor: 'some',
  evidenceAgainst: 'more',
  balancedThought: 'it has gone fine before',
  intensityAfter: 4,
  ...overrides,
});

export const assessmentPayload = (overrides: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  answers: [3, 3, 2, 2, 1, 1, 0],
  difficulty: 2,
  ...overrides,
});

/** Issues a fresh code for a purpose through the real route, with mail captured. */
export const rows = (sql: Sql, table: string) => sql.unsafe(`SELECT * FROM app.${table}`);
