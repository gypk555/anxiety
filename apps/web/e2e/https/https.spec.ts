import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OTP_LENGTH } from '@anxiocare/shared';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

// The production build in production mode, behind TLS. See apps/api/scripts/https-stack.ts.
const OUTBOX = (name: string) => fileURLToPath(new URL(`../../../../.e2e-outbox/${name}`, import.meta.url));

interface Mail { to: string; raw: string }
const mails = (to: string): Mail[] =>
  readFileSync(OUTBOX('https-mail.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Mail).filter((m) => m.to === to);
const codeIn = (raw: string) => new RegExp(`(\\d{${OTP_LENGTH / 2}}) (\\d{${OTP_LENGTH / 2}})`).exec(raw.replace(/=\r\n/g, ''));

test('over real TLS: sign-in works, __Host-session is Secure and comes back, HSTS is present', async ({ page, context, baseURL }) => {
  const email = `tls-${randomBytes(6).toString('hex')}@example.com`;

  const landing = await page.goto('/sign-in');
  expect(landing!.url()).toMatch(/^https:/);
  expect(landing!.headers()['strict-transport-security']).toMatch(/^max-age=31536000; includeSubDomains/);

  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();

  await expect.poll(() => mails(email).length, { message: 'mail through verified STARTTLS' }).toBe(1);
  const { raw } = mails(email)[0]!;
  expect(raw).toMatch(/^From: Account Team <no-reply@mail\.example\.com>/m);
  expect(raw).toMatch(/^Subject: Your sign-in code/m);
  expect(raw).not.toMatch(/anxi|health/i);
  const printed = codeIn(raw);
  expect(printed, 'the code is grouped in the mail').not.toBeNull();

  const verified = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/otp/verify'));
  await page.getByLabel(`${OTP_LENGTH}-digit code`).fill(`${printed![1]}${printed![2]}`);
  const response = await verified;
  expect(response.status()).toBe(200);
  const setCookie = (await response.headerValue('set-cookie')) ?? '';
  expect(setCookie).toMatch(/^__Host-session=/);
  expect(setCookie).toMatch(/; Secure/);
  expect(setCookie).toMatch(/; HttpOnly/);
  expect(setCookie).toMatch(/; SameSite=Strict/);
  expect(setCookie).toMatch(/; Path=\//);
  expect(setCookie).not.toMatch(/Domain=/i);
  expect(response.headers()['strict-transport-security']).toMatch(/max-age=31536000/);

  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name)).toEqual(['__Host-session']);
  expect(cookies[0]).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/' });
  expect(await page.evaluate(() => document.cookie)).toBe('');

  // The browser really sends it back: the server knows who this is after a full page load.
  const seen = page.waitForRequest((r) => r.url().endsWith('/api/v1/me'));
  await page.reload();
  const sent = await (await seen).allHeaders();
  expect(sent.cookie ?? '').toMatch(/^__Host-session=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  const me = await page.evaluate(async () => {
    const r = await fetch('/api/v1/me');
    return { status: r.status, body: (await r.json()) as { email: string } };
  });
  expect(me).toMatchObject({ status: 200, body: { email } });

  expect(baseURL).toMatch(/^https:/);
});

test('the self-check line appears, and no client address reaches the log', async ({ request }) => {
  await request.get('/api/v1/meta');
  await expect.poll(() => readFileSync(OUTBOX('https-server.log'), 'utf8')).toContain('client ip resolved: public IPv4 via header');
  const log = readFileSync(OUTBOX('https-server.log'), 'utf8');
  expect(log).not.toContain('198.51.100.77');
  expect(log).not.toContain('172.71.195.88');
});
