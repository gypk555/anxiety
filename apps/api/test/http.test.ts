import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSRF_HEADER, CSRF_HEADER_VALUE, problemResponse } from '@anxiocare/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, Client, createHarness, ORIGIN, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

let h: Harness;
const webDist = mkdtempSync(join(tmpdir(), 'anxiocare-web-'));
beforeAll(async () => {
  mkdirSync(join(webDist, 'assets'));
  writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>shell</title>');
  writeFileSync(join(webDist, 'sw.js'), 'self.x=1');
  writeFileSync(join(webDist, 'manifest.webmanifest'), '{}');
  writeFileSync(join(webDist, 'icon.png'), 'png');
  writeFileSync(join(webDist, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(webDist, '.secret'), 'nope');
  // As apps/web/scripts/precompress.mjs leaves them. The bytes differ from the raw file so the test can tell which was sent.
  writeFileSync(join(webDist, 'assets', 'app-abc123.js.br'), 'BROTLI-BYTES');
  writeFileSync(join(webDist, 'assets', 'app-abc123.js.gz'), 'GZIP-BYTES');
  writeFileSync(join(webDist, 'index.html.br'), 'BROTLI-SHELL');
  writeFileSync(join(webDist, 'index.html.gz'), 'GZIP-SHELL');
  h = await createHarness({ WEB_DIST: webDist });
});
afterAll(async () => {
  await h.close();
  rmSync(webDist, { recursive: true, force: true });
});

const expectSecurityHeaders = (headers: Record<string, unknown>) => {
  const csp = String(headers['content-security-policy']);
  for (const directive of [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ]) {
    expect(csp).toContain(directive);
  }
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('upgrade-insecure-requests');
  expect(headers['strict-transport-security']).toMatch(/max-age=31536000/);
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-resource-policy']).toBe('same-origin');
  expect(headers['access-control-allow-origin']).toBeUndefined();
};

describe('CSRF', () => {
  const url = `${API}/auth/otp/request`;
  const payload = { email: 'someone@example.com' };
  const send = (headers: Record<string, string>) =>
    h.app.inject({ method: 'POST', url, payload, headers, remoteAddress: '10.99.0.1' });

  it('rejects a missing Origin', async () => {
    const r = await send({ [CSRF_HEADER]: CSRF_HEADER_VALUE });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('csrf_failed');
  });

  it.each(['https://evil.test', `${ORIGIN}.evil.test`, `${ORIGIN}/`, 'http://app.test', 'null', 'HTTPS://APP.TEST'])(
    'rejects Origin %s',
    async (origin) => {
      const r = await send({ origin, [CSRF_HEADER]: CSRF_HEADER_VALUE });
      expect(r.statusCode).toBe(403);
      expect(r.json().code).toBe('csrf_failed');
    },
  );

  it('rejects a missing or wrong custom header', async () => {
    expect((await send({ origin: ORIGIN })).statusCode).toBe(403);
    expect((await send({ origin: ORIGIN, [CSRF_HEADER]: 'nope' })).statusCode).toBe(403);
  });

  it('accepts the exact origin with the header', async () => {
    expect((await send({ origin: ORIGIN, [CSRF_HEADER]: CSRF_HEADER_VALUE })).statusCode).toBe(202);
    await h.app.drainBackground();
  });

  it.each([
    ['PATCH', `${API}/me`],
    ['DELETE', `${API}/journal/00000000-0000-4000-8000-000000000000`],
    ['POST', `${API}/auth/logout`],
  ])('also covers %s %s, before auth', async (method, target) => {
    const r = await h.app.inject({ method: method as 'POST', url: target, remoteAddress: '10.99.0.2' });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('csrf_failed');
  });
});

describe('headers', () => {
  it.each(['/api/v1/meta', '/healthz', '/readyz'])('API-side route %s has the security set and no-store', async (url) => {
    const r = await h.app.inject({ method: 'GET', url });
    expect(r.statusCode).toBe(200);
    expectSecurityHeaders(r.headers);
    expect(r.headers['cache-control']).toBe(url.startsWith('/api') ? 'no-store, no-transform' : 'no-store');
  });

  it('errors carry them too, as RFC 9457 documents', async () => {
    const r = await new Client(h).get(`${API}/me`);
    expect(r.statusCode).toBe(401);
    expectSecurityHeaders(r.headers);
    expect(r.headers['cache-control']).toBe('no-store, no-transform');
    expect(r.headers['content-type']).toContain('application/problem+json');
    const body = problemResponse.strict().parse(r.json());
    expect(body.requestId).toBeTruthy();
    expect(r.body).not.toMatch(/stack|node_modules|postgres|select/i);
  });

  it('an authenticated API response is no-store', async () => {
    const { client } = await signIn(h);
    const r = await client.get(`${API}/me`);
    expect(r.headers['cache-control']).toBe('no-store, no-transform');
  });

  it('answers a CORS preflight without allowing anything', async () => {
    const r = await h.app.inject({
      method: 'OPTIONS',
      url: `${API}/me`,
      headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' },
    });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('static files', () => {
  it('serves hashed assets as immutable with the security headers', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(r.headers['content-type']).toContain('javascript');
    expectSecurityHeaders(r.headers);
  });

  it.each([
    ['/', 'text/html'],
    ['/index.html', 'text/html'],
    ['/sw.js', 'javascript'],
    ['/manifest.webmanifest', 'manifest'],
    ['/icon.png', 'image/png'],
  ])('serves %s as no-cache', async (url, type) => {
    const r = await h.app.inject({ method: 'GET', url });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.headers['content-type']).toContain(type);
    expectSecurityHeaders(r.headers);
  });

  it('falls back to the shell for page navigations only', async () => {
    const nav = await h.app.inject({ method: 'GET', url: '/trends/deep?x=1', headers: { accept: 'text/html,application/xhtml+xml' } });
    expect(nav.statusCode).toBe(200);
    expect(nav.body).toContain('shell');
    expect(nav.headers['cache-control']).toBe('no-cache');
    expectSecurityHeaders(nav.headers);

    const fetched = await h.app.inject({ method: 'GET', url: '/trends/deep', headers: { accept: '*/*' } });
    expect(fetched.statusCode).toBe(404);
    expect(fetched.headers['content-type']).toContain('problem+json');
    expect((await h.app.inject({ method: 'POST', url: '/trends/deep', headers: { accept: 'text/html', origin: ORIGIN, [CSRF_HEADER]: '1' } })).statusCode).toBe(404);
  });

  it('never falls back for /api or a missing hashed asset', async () => {
    for (const url of ['/api', '/api/', '/api/v1/nope', '/api/v9/x', '/assets/missing.js']) {
      const r = await h.app.inject({ method: 'GET', url, headers: { accept: 'text/html' } });
      expect(r.statusCode).toBe(404);
      expect(r.headers['content-type']).toContain('problem+json');
      expect(r.body).not.toContain('shell');
    }
  });

  it('does not serve dotfiles or walk out of the root', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/.secret' })).body).not.toContain('nope');
    for (const url of ['/../package.json', '/..%2f..%2fpackage.json', '/assets/../../package.json']) {
      const r = await h.app.inject({ method: 'GET', url });
      expect(r.body).not.toContain('"name"');
    }
  });

  it('copes when the web build does not exist', async () => {
    const bare = await createHarness();
    try {
      const r = await bare.app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } });
      expect(r.statusCode).toBe(404);
      expect((await bare.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
      expect((await bare.app.inject({ method: 'GET', url: '/api/v1/meta' })).statusCode).toBe(200);
    } finally {
      await bare.close();
    }
  });
});

describe('precompressed static files', () => {
  const get = (url: string, encoding?: string, extra: Record<string, string> = {}) =>
    h.app.inject({ method: 'GET', url, headers: { ...(encoding ? { 'accept-encoding': encoding } : {}), ...extra } });
  const JS = '/assets/app-abc123.js';

  it('prefers brotli, then gzip, with the original type and the same caching and security headers', async () => {
    const br = await get(JS, 'gzip, deflate, br');
    expect(br.body).toBe('BROTLI-BYTES');
    expect(br.headers['content-encoding']).toBe('br');
    const gz = await get(JS, 'gzip');
    expect(gz.body).toBe('GZIP-BYTES');
    expect(gz.headers['content-encoding']).toBe('gzip');
    for (const r of [br, gz]) {
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('javascript');
      expect(r.headers.vary).toMatch(/accept-encoding/i);
      expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expectSecurityHeaders(r.headers);
    }
  });

  it('sends the raw file to a client that accepts neither, and still says it varies', async () => {
    const r = await get(JS, 'identity');
    expect(r.body).toBe('console.log(1)');
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.headers.vary).toMatch(/accept-encoding/i);
    const none = await get(JS);
    expect(none.body).toBe('console.log(1)');
    expect(none.headers['content-encoding']).toBeUndefined();
  });

  it('sends a file with no compressed copy as it is', async () => {
    const r = await get('/icon.png', 'gzip, br');
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('png');
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.headers['content-type']).toContain('image/png');
  });

  it('compresses the app shell, at the root and for a deep link, and it still revalidates', async () => {
    for (const r of [await get('/', 'br'), await get('/trends/deep', 'br', { accept: 'text/html' })]) {
      expect(r.statusCode).toBe(200);
      expect(r.body).toBe('BROTLI-SHELL');
      expect(r.headers['content-encoding']).toBe('br');
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.headers['cache-control']).toBe('no-cache');
      expect(r.headers.vary).toMatch(/accept-encoding/i);
      expectSecurityHeaders(r.headers);
    }
  });

  it('never compresses an API response, and asks the edge not to', async () => {
    const { client } = await signInConsented(h);
    for (const url of [`${API}/me`, `${API}/me/export`, `${API}/journal`, `${API}/meta`]) {
      const r = await client.get(url, { 'accept-encoding': 'gzip, br' });
      expect(r.statusCode, url).toBe(200);
      expect(r.headers['content-encoding'], url).toBeUndefined();
      expect(r.headers['cache-control'], url).toBe('no-store, no-transform');
    }
    const denied = await new Client(h).get(`${API}/me`, { 'accept-encoding': 'gzip, br' });
    expect(denied.headers['content-encoding']).toBeUndefined();
  });
});

describe('health', () => {
  it('liveness and readiness reveal nothing', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ status: 'ok' });
    expect((await h.app.inject({ method: 'GET', url: '/readyz' })).json()).toEqual({ status: 'ok' });
  });

  it('readiness is 503 without details when the database is gone, while liveness stays up', async () => {
    const bare = await createHarness();
    await bare.runtime.end({ timeout: 1 });
    const r = await bare.app.inject({ method: 'GET', url: '/readyz' });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ status: 'unavailable' });
    expect((await bare.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    await bare.app.close();
    await bare.admin.end({ timeout: 1 });
  });
});

describe('meta', () => {
  it('returns the public config, no secrets', async () => {
    const r = await h.app.inject({ method: 'GET', url: `${API}/meta` });
    expect(r.json()).toEqual({
      operatorName: 'Test Operator',
      grievanceEmail: 'grievance@example.com',
      consentVersion: expect.any(String),
      backupRetentionDays: 7,
      dataLocation: 'Mumbai, India',
      serverLocation: 'Singapore',
      mailProvider: 'our email provider',
      googleEnabled: false,
    });
  });
});

describe('body handling', () => {
  it('rejects bodies over 64 KB', async () => {
    const { client } = await signInConsented(h);
    const r = await client.post(`${API}/journal`, { situation: 'x'.repeat(70 * 1024) });
    expect(r.statusCode).toBe(413);
    expect(r.headers['content-type']).toContain('problem+json');
  });

  it('rejects malformed JSON and prototype poisoning as a problem document', async () => {
    const client = new Client(h);
    const bad = await client.request({
      method: 'POST',
      url: `${API}/auth/otp/request`,
      payload: '{"email":',
      headers: { 'content-type': 'application/json' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('validation_failed');
    const poisoned = await client.request({
      method: 'POST',
      url: `${API}/auth/otp/request`,
      payload: '{"__proto__":{"admin":true},"email":"a@example.com"}',
      headers: { 'content-type': 'application/json' },
    });
    expect(poisoned.statusCode).toBe(400);
  });

  it('refuses form and text bodies', async () => {
    const client = new Client(h);
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const r = await client.request({
        method: 'POST',
        url: `${API}/auth/otp/request`,
        payload: 'email=a@example.com',
        headers: { 'content-type': type },
      });
      expect(r.statusCode).toBe(415);
    }
  });

  it('survives a malformed URL', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/%E0%A4%A' });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.statusCode).toBeLessThan(500);
  });

  it.each([
    ['otp request', 'POST', '/auth/otp/request', { email: 'a@example.com', admin: true }],
    ['otp verify', 'POST', '/auth/otp/verify', { email: 'a@example.com', code: '123456', userId: 'x' }],
    ['profile', 'PATCH', '/me', { displayName: 'A', email: 'b@example.com' }],
    ['consent', 'POST', '/me/consent', { version: 'x', adultConfirmed: true, healthDataConsent: true, extra: 1 }],
    ['email request', 'POST', '/me/email/request', { newEmail: 'b@example.com', id: 'x' }],
    ['email verify', 'POST', '/me/email/verify', { newEmail: 'b@example.com', currentCode: '123456', code: '123456', x: 1 }],
    ['delete request', 'POST', '/me/delete/request', { x: 1 }],
    ['delete confirm', 'POST', '/me/delete/confirm', { code: '123456', x: 1 }],
    ['assessment', 'POST', '/assessments', { clientRequestId: '00000000-0000-4000-8000-000000000000', answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null, score: 0 }],
    ['journal', 'POST', '/journal', { situation: 's', thought: 't', feelings: [], intensityBefore: 1, evidenceFor: '', evidenceAgainst: '', balancedThought: '', intensityAfter: null, userId: 'x' }],
  ])('%s: unknown body keys are rejected', async (_name, method, path, body) => {
    const { client } = await signInConsented(h);
    const r = await client.request({ method: method as 'POST', url: `${API}${path}`, payload: body });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('validation_failed');
  });

  it('rejects unknown query keys on list routes, and does not echo them', async () => {
    const { client } = await signInConsented(h);
    const r = await client.get(`${API}/journal?secretparam=1`);
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toContain('secretparam');
  });
});

describe('per-IP budgets', () => {
  it('files and the API are counted apart, and files have the larger budget', async () => {
    const get = (url: string) => h.app.inject({ method: 'GET', url, remoteAddress: '10.98.0.2', headers: { accept: 'text/html' } });
    const limit = (r: { headers: Record<string, unknown> }) => Number(r.headers['x-ratelimit-limit']);
    const remaining = (r: { headers: Record<string, unknown> }) => Number(r.headers['x-ratelimit-remaining']);
    const api = await get(`${API}/meta`);
    const file = await get('/some-page');
    await get('/some-page');
    const apiAgain = await get(`${API}/meta`);
    expect(limit(file)).toBeGreaterThan(limit(api));
    expect(remaining(apiAgain)).toBe(remaining(api) - 1);
  });
});

describe('client IP', () => {
  it('trusts exactly TRUST_PROXY_HOPS hops: a spoofed left-hand address does not change the rate-limit key', async () => {
    const send = (forwarded: string) =>
      h.app.inject({
        method: 'POST',
        url: `${API}/auth/otp/verify`,
        remoteAddress: '10.98.0.1',
        payload: { email: uniqueEmail('hop'), code: '000000' },
        headers: { origin: ORIGIN, [CSRF_HEADER]: '1', 'x-forwarded-for': forwarded },
      });
    const first = await send('1.1.1.1, 198.51.100.50');
    const second = await send('2.2.2.2, 198.51.100.50');
    const other = await send('1.1.1.1, 198.51.100.51');
    const remaining = (r: { headers: Record<string, unknown> }) => Number(r.headers['x-ratelimit-remaining']);
    expect(remaining(second)).toBe(remaining(first) - 1);
    expect(remaining(other)).toBe(remaining(first));
  });
});
