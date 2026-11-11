import { readFileSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { expect, ORIGIN, signUp, seedJournal, test } from './support';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const BUDGET_BYTES = 170_000;

/** Node's own client: unlike a browser or Playwright's, it shows the bytes on the wire, undecoded. */
function get(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const req = httpRequest(new URL(path, ORIGIN), { headers: { 'x-forwarded-for': '203.0.113.9', ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const shell = async () => gunzipSync((await get('/', { 'accept-encoding': 'gzip', accept: 'text/html' })).body).toString();
const initialScripts = (html: string) => [...html.matchAll(/(?:src|href)="(\/[^"]+\.js)"/g)].map((m) => m[1]!);

test('initial JS on the wire, gzipped through real HTTP, is under 170 KB, and brotli is smaller', async () => {
  const scripts = initialScripts(await shell());
  expect(scripts.length).toBeGreaterThan(0);
  let gzipTotal = 0;
  let brotliTotal = 0;
  for (const path of [...new Set(scripts)]) {
    const gz = await get(path, { 'accept-encoding': 'gzip' });
    expect(gz.status, path).toBe(200);
    expect(gz.headers['content-encoding'], path).toBe('gzip');
    const br = await get(path, { 'accept-encoding': 'br' });
    expect(br.headers['content-encoding'], path).toBe('br');
    const raw = await get(path, { 'accept-encoding': 'identity' });
    expect(raw.headers['content-encoding'], path).toBeUndefined();
    expect(gunzipSync(gz.body).equals(raw.body), `${path} gzip`).toBe(true);
    expect(brotliDecompressSync(br.body).equals(raw.body), `${path} br`).toBe(true);
    gzipTotal += gz.body.length;
    brotliTotal += br.body.length;
  }
  expect(gzipTotal).toBeLessThan(BUDGET_BYTES);
  expect(brotliTotal).toBeLessThan(gzipTotal);
});

test('compressed responses keep their type, caching and security headers, and vary on encoding', async () => {
  const asset = initialScripts(await shell()).find((p) => p.startsWith('/assets/'))!;
  for (const [path, type, cache] of [
    [asset, 'javascript', 'public, max-age=31536000, immutable'],
    ['/sw.js', 'javascript', 'no-cache'],
    ['/manifest.webmanifest', 'manifest', 'no-cache'],
  ] as const) {
    for (const encoding of ['br', 'gzip', 'identity']) {
      const r = await get(path, { 'accept-encoding': encoding });
      expect(r.status, path).toBe(200);
      expect(String(r.headers['content-type']), path).toContain(type);
      expect(r.headers['cache-control'], path).toBe(cache);
      expect(String(r.headers.vary), `${path} ${encoding}`).toMatch(/accept-encoding/i);
      expect(String(r.headers['content-security-policy']), path).toContain("default-src 'none'");
    }
  }
  const page = await get('/trends', { 'accept-encoding': 'br', accept: 'text/html' });
  expect(page.headers['content-encoding']).toBe('br');
  expect(page.headers['cache-control']).toBe('no-cache');
  expect(brotliDecompressSync(page.body).toString()).toContain('<div id="root"');
});

test('fonts and images are served as they are', async () => {
  const files = readdirSync(`${DIST}assets`);
  expect(files.filter((f) => /\.(woff2|png)\.(br|gz)$/.test(f))).toEqual([]);
  const font = files.find((f) => f.endsWith('.woff2'))!;
  const r = await get(`/assets/${font}`, { 'accept-encoding': 'gzip, br' });
  expect(r.status).toBe(200);
  expect(r.headers['content-encoding']).toBeUndefined();
});

test('the service worker precaches the real files, never the compressed copies', async () => {
  const sw = readFileSync(`${DIST}sw.js`, 'utf8');
  expect(sw).not.toMatch(/\.(br|gz)"/);
  expect(sw).toMatch(/index\.html/);
});

test('API answers holding personal data are never compressed, signed in or not', async ({ page, context }) => {
  await signUp(page, 'nobreach');
  await seedJournal(context, { thought: 'something private' });
  const cookies = await context.cookies();
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  for (const path of ['/api/v1/me', '/api/v1/journal', '/api/v1/assessments', '/api/v1/me/export', '/api/v1/auth/sessions', '/api/v1/meta']) {
    const r = await get(path, { 'accept-encoding': 'gzip, br', cookie });
    expect(r.status, path).toBe(200);
    expect(r.headers['content-encoding'], path).toBeUndefined();
    expect(r.headers['cache-control'], path).toBe('no-store, no-transform');
  }
  const signedOut = await get('/api/v1/me', { 'accept-encoding': 'gzip, br' });
  expect(signedOut.status).toBe(401);
  expect(signedOut.headers['content-encoding']).toBeUndefined();
});

test('the common-password list stays out of the first bundle, and is there on the screens that use it', async ({ request, page }) => {
  const html = await (await request.get('/')).text();
  const scripts = [...html.matchAll(/(?:src|href)="(\/[^"]+\.js)"/g)].map((m) => m[1]!);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(await (await request.get(script)).text(), script).not.toContain('iloveindia');

  const loaded: Promise<string>[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.js')) loaded.push(r.text());
  });
  await page.goto('/create-account');
  await page.getByLabel('Email address').waitFor();
  expect((await Promise.all(loaded)).some((text) => text.includes('iloveindia'))).toBe(true);
});

test('the question bank stays out of the first bundle, and is there once a reflection starts', async ({ request, page }) => {
  const marker = 'replay a conversation in your head';
  const html = await (await request.get('/')).text();
  const scripts = [...html.matchAll(/(?:src|href)="(\/[^"]+\.js)"/g)].map((m) => m[1]!);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(await (await request.get(script)).text(), script).not.toContain(marker);

  const loaded: Promise<string>[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.js')) loaded.push(r.text());
  });
  await page.goto('/check-in');
  await page.getByRole('heading', { level: 1, name: 'What would you like to do?' }).waitFor();
  expect((await Promise.all(loaded)).some((text) => text.includes(marker))).toBe(true);
});
