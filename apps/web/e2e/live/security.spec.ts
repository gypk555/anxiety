import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CSRF_HEADER } from '@anxiocare/shared';
import { enterCode, expect, ORIGIN, requestCode, acceptConsent, signUp, test, uniqueEmail } from './support';

const CSP = {
  'default-src': "'none'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self'",
  'font-src': "'self'",
  'connect-src': "'self'",
  'manifest-src': "'self'",
  'worker-src': "'self'",
  'frame-ancestors': "'none'",
  'base-uri': "'none'",
  'form-action': "'self'",
};

function expectSecurityHeaders(headers: Record<string, string>, label: string) {
  const csp = Object.fromEntries((headers['content-security-policy'] ?? '').split(';').map((d) => {
    const [name, ...rest] = d.trim().split(/\s+/);
    return [name, rest.join(' ')];
  }));
  expect(csp, `${label} CSP`).toEqual(CSP);
  expect(headers['strict-transport-security'], `${label} HSTS`).toMatch(/max-age=31536000/);
  expect(headers['referrer-policy'], label).toBe('no-referrer');
  expect(headers['x-content-type-options'], label).toBe('nosniff');
  expect(headers['cross-origin-opener-policy'], label).toBe('same-origin');
  expect(headers['cross-origin-resource-policy'], label).toBe('same-origin');
  expect(headers['x-frame-options'], label).toBe('DENY');
  expect(headers['permissions-policy'], label).toContain('camera=()');
  expect(headers['access-control-allow-origin'], `${label} has no CORS`).toBeUndefined();
}

const html = { accept: 'text/html' };

test('security headers and caching on HTML, assets and the API', async ({ request }) => {
  for (const path of ['/', '/help', '/trends', '/result/some-id']) {
    const response = await request.get(ORIGIN + path, { headers: html });
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain('text/html');
    expectSecurityHeaders(response.headers(), path);
    expect(response.headers()['cache-control'], path).toBe('no-cache');
  }

  const index = await (await request.get(ORIGIN + '/', { headers: html })).text();
  const assets = [...index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]!);
  expect(assets.length).toBeGreaterThan(1);
  for (const path of assets) {
    const response = await request.get(ORIGIN + path);
    expect(response.status(), path).toBe(200);
    expectSecurityHeaders(response.headers(), path);
    expect(response.headers()['cache-control'], path).toBe('public, max-age=31536000, immutable');
  }

  for (const path of ['/sw.js', '/manifest.webmanifest']) {
    const response = await request.get(ORIGIN + path);
    expect(response.status(), path).toBe(200);
    expectSecurityHeaders(response.headers(), path);
    expect(response.headers()['cache-control'], path).toBe('no-cache');
  }

  for (const [path, status] of [['/api/v1/meta', 200], ['/api/v1/me', 401], ['/api/v1/assessments', 401], ['/api/v1/nope', 404]] as const) {
    const response = await request.get(ORIGIN + path);
    expect(response.status(), path).toBe(status);
    expectSecurityHeaders(response.headers(), path);
    expect(response.headers()['cache-control'], path).toBe('no-store, no-transform');
  }

  // A missing asset stays a 404: not the app shell.
  const missing = await request.get(ORIGIN + '/assets/nope.js');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/problem+json');
});

test('authenticated API responses are no-store too', async ({ page, context }) => {
  await signUp(page, 'nostore');
  for (const path of ['/me', '/assessments', '/journal', '/auth/sessions', '/me/export']) {
    const response = await context.request.get(`${ORIGIN}/api/v1${path}`);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['cache-control'], path).toBe('no-store, no-transform');
    expectSecurityHeaders(response.headers(), path);
  }
});

test('the session cookie is HttpOnly and SameSite=Strict, and scripts cannot see it', async ({ page, context }) => {
  const email = uniqueEmail('cookie');
  const code = await requestCode(page, email);
  const verified = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/otp/verify'));
  await enterCode(page, code);
  expect((await verified).status()).toBe(200);
  await acceptConsent(page);

  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual(['device', 'session']);
  const cookie = cookies.find((c) => c.name === 'session');
  // Development is plain http on localhost; production uses __Host-session and __Host-device with Secure.
  const device = cookies.find((c) => c.name === 'device')!;
  expect(device).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
  expect(device.expires * 1000 - Date.now()).toBeGreaterThan(300 * 24 * 3600 * 1000);
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe('Strict');
  expect(cookie!.path).toBe('/');
  expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await page.evaluate(() => document.cookie)).toBe('');

  // Nothing sensitive is held anywhere a script could reach it later.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'anxiocare-theme'))).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test('state changes need the exact origin and the CSRF header', async ({ page, context }) => {
  await signUp(page, 'csrf');
  const post = (headers: Record<string, string>) => context.request.post(`${ORIGIN}/api/v1/auth/logout`, { headers });
  expect((await post({ origin: 'https://evil.example', [CSRF_HEADER]: '1' })).status()).toBe(403);
  expect((await post({ origin: ORIGIN })).status()).toBe(403);
  expect((await post({ [CSRF_HEADER]: '1' })).status()).toBe(403);
  expect((await context.request.get(`${ORIGIN}/api/v1/me`)).status()).toBe(200);
});

test('the CSP blocks inline script in the real page, and the watcher sees it', async ({ page, guard }) => {
  guard.expectCspViolation();
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const seen = page.waitForEvent('console', (m) => m.text().includes('CSP-VIOLATION') && m.text().includes('script-src'));
  const ran = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__inline = true';
    document.head.append(script);
    return (window as unknown as { __inline?: boolean }).__inline === true;
  });
  expect(ran).toBe(false);
  await seen;
});

test('nothing in the built client names another host to load from', async () => {
  const index = readFileSync(fileURLToPath(new URL('../../dist/index.html', import.meta.url)), 'utf8');
  expect([...index.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1])).toEqual([]);
});
