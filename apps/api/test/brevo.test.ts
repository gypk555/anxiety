import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.ts';
import { brevoCheck, createMailer, otpMail } from '../src/mail.ts';
import { baseEnv } from './helpers.ts';

// Made up, and deliberately not in Brevo's key format, so secret scanners do not mistake it for a real key.
const KEY = 'test-brevo-api-key-not-real-0000000000000000000000000000000000000000';
const SENDER = 'accounts.notify.test@gmail.com';

interface Seen {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

/** A stand-in for api.brevo.com: records every request and answers as `reply` says. */
let server: Server;
let base: string;
let seen: Seen[] = [];
let reply: (path: string) => { status: number; body?: unknown; delayMs?: number } = () => ({ status: 201, body: { messageId: '<x@brevo>' } });

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += String(c)));
    req.on('end', () => {
      seen.push({ method: req.method!, path: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      const r = reply(req.url!);
      setTimeout(() => {
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(r.body === undefined ? '' : JSON.stringify(r.body));
      }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  seen = [];
  reply = () => ({ status: 201, body: { messageId: '<x@brevo>' } });
});

const brevoEnv = (overrides: Record<string, string | undefined> = {}) =>
  baseEnv({ MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY, BREVO_API_BASE_URL: base, MAIL_FROM: `Accounts <${SENDER}>`, ...overrides });

const problems = (env: Record<string, string | undefined>) => {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as ConfigError).problems.join('\n');
  }
  throw new Error('expected the configuration to be refused');
};

const prod = (overrides: Record<string, string | undefined> = {}) =>
  baseEnv({
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://app.example.com',
    DATABASE_URL: 'postgres://anxiocare_runtime.proj:pw@db.example.com:5432/postgres',
    DATABASE_CA_CERT: Buffer.from('not checked here').toString('base64'),
    MAIL_TRANSPORT: 'brevo',
    BREVO_API_KEY: KEY,
    MAIL_FROM: `Accounts <${SENDER}>`,
    ...overrides,
  });

describe('Brevo config', () => {
  it('accepts brevo with a key, and needs no SMTP settings', () => {
    const config = loadConfig(brevoEnv());
    expect(config.mail).toMatchObject({ kind: 'brevo', fromAddress: SENDER, fromName: 'Accounts', baseUrl: base });
  });

  it('requires BREVO_API_KEY for the brevo transport, naming it but never echoing a value', () => {
    expect(problems(brevoEnv({ BREVO_API_KEY: undefined }))).toContain('BREVO_API_KEY');
    const weak = 'short';
    const p = problems(brevoEnv({ BREVO_API_KEY: weak }));
    expect(p).toContain('BREVO_API_KEY');
    expect(p).not.toContain(weak);
  });

  it('in production: brevo needs no SMTP credentials, refuses the test-only base URL, and still checks the sender is neutral', () => {
    expect(problems(prod())).not.toMatch(/SMTP_USER|MAIL_TRANSPORT|BREVO_API_KEY/);
    expect(problems(prod({ BREVO_API_BASE_URL: 'http://127.0.0.1:1' }))).toContain('BREVO_API_BASE_URL');
    expect(problems(prod({ MAIL_FROM: 'Anxiety Care <no-reply@example.com>' }))).toContain('MAIL_FROM');
  });
});

describe('Brevo mailer', () => {
  it('sends one HTTPS API call with the key in a header, and the code only in the text', async () => {
    await createMailer(loadConfig(brevoEnv())).send(otpMail('person@example.com', 'login', '123456'));
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req).toMatchObject({ method: 'POST', path: '/v3/smtp/email' });
    expect(req!.headers['api-key']).toBe(KEY);
    expect(req!.headers['content-type']).toContain('application/json');
    expect(req!.body).toEqual({
      sender: { name: 'Accounts', email: SENDER },
      to: [{ email: 'person@example.com' }],
      subject: 'Your sign-in code',
      textContent: expect.stringContaining('123 456'),
    });
    // Neutral subject: the code is never in it, so a lock screen preview does not show it.
    expect(JSON.stringify((req!.body as { subject: string }).subject)).not.toMatch(/\d{3}/);
  });

  it('a refusal becomes an error that names the status, never the key, the address or the reply', async () => {
    reply = () => ({ status: 401, body: { code: 'unauthorized', message: `Key not found for person@example.com ${KEY}` } });
    const error = await createMailer(loadConfig(brevoEnv()))
      .send(otpMail('person@example.com', 'login', '123456'))
      .then(() => null, (e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain('401');
    expect(error!.message).toContain('unauthorized');
    for (const leak of [KEY, 'person@example.com', '123456', 'Key not found']) expect(error!.message).not.toContain(leak);
  });

  it('gives up after its timeout rather than holding a background task forever', async () => {
    reply = () => ({ status: 201, delayMs: 3_000 });
    const config = loadConfig(brevoEnv({ BREVO_TIMEOUT_MS: '200' }));
    const started = Date.now();
    await expect(createMailer(config).send(otpMail('person@example.com', 'login', '123456'))).rejects.toThrow(/timed out/i);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('doctor: Brevo check', () => {
  it('passes with a working key and a verified, active sender, and sends nothing', async () => {
    reply = (path) =>
      path === '/v3/account'
        ? { status: 200, body: { email: 'owner@example.com' } }
        : { status: 200, body: { senders: [{ email: SENDER, active: true }] } };
    const check = await brevoCheck(loadConfig(brevoEnv()));
    expect(check.ok).toBe(true);
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual(['GET /v3/account', 'GET /v3/senders']);
  });

  it('fails on a rejected key, saying how to fix it, without the key', async () => {
    reply = () => ({ status: 401, body: { code: 'unauthorized' } });
    const check = await brevoCheck(loadConfig(brevoEnv()));
    expect(check.ok).toBe(false);
    expect(check.fix).toMatch(/BREVO_API_KEY/);
    expect(JSON.stringify(check)).not.toContain(KEY);
  });

  it('fails when MAIL_FROM is not a verified, active sender at Brevo', async () => {
    reply = (path) =>
      path === '/v3/account'
        ? { status: 200, body: {} }
        : { status: 200, body: { senders: [{ email: SENDER, active: false }, { email: 'other@example.com', active: true }] } };
    const check = await brevoCheck(loadConfig(brevoEnv()));
    expect(check.ok).toBe(false);
    expect(check.fix).toMatch(/verify/i);
  });
});
