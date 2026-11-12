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
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
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
  const setCookie = (await response.headerValues('set-cookie')).find((c) => c.startsWith('__Host-session=')) ?? '';
  expect(setCookie).toMatch(/^__Host-session=/);
  expect(setCookie).toMatch(/; Secure/);
  expect(setCookie).toMatch(/; HttpOnly/);
  expect(setCookie).toMatch(/; SameSite=Strict/);
  expect(setCookie).toMatch(/; Path=\//);
  expect(setCookie).not.toMatch(/Domain=/i);
  expect(response.headers()['strict-transport-security']).toMatch(/max-age=31536000/);

  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual(['__Host-device', '__Host-session']);
  for (const cookie of cookies) expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/' });
  expect(await page.evaluate(() => document.cookie)).toBe('');

  // The browser really sends it back: the server knows who this is after a full page load.
  const seen = page.waitForRequest((r) => r.url().endsWith('/api/v1/me'));
  await page.reload();
  const sent = await (await seen).allHeaders();
  expect(sent.cookie ?? '').toMatch(/(^|; )__Host-session=/);
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

// ── Accounts, on the production server ────────────────────────────────

const PASSWORD = 'river stone quiet morning';
const bodyCode = (raw: string) => {
  const m = new RegExp(`(\\d{${OTP_LENGTH / 2}}) (\\d{${OTP_LENGTH / 2}})`).exec(raw.replace(/=\r\n/g, ''));
  return `${m![1]}${m![2]}`;
};

test('production: create an account with a password, sign out, and sign in with it, under __Host- cookies', async ({ page, context }) => {
  const email = `pw-${randomBytes(6).toString('hex')}@example.com`;
  await page.goto('/create-account');
  await page.getByLabel('Your name or a nickname').fill('Asha');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
  await expect.poll(() => mails(email).length, { message: 'register mail through verified STARTTLS' }).toBe(1);
  const { raw } = mails(email)[0]!;
  expect(raw).not.toMatch(/anxi|health/i);
  await page.getByLabel(`${OTP_LENGTH}-digit code`).fill(bodyCode(raw));
  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  expect((await context.cookies()).map((c) => c.name).sort()).toEqual(['__Host-device', '__Host-session']);

  const out = await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'x-anxiocare-csrf': '1' } }).then((r) => r.status));
  expect(out).toBe(204);
  await context.clearCookies();
  await page.goto('/sign-in?next=%2Fsettings');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  const signedIn = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const response = await signedIn;
  expect(response.status()).toBe(200);
  const set = await response.headerValues('set-cookie');
  expect(set.find((c) => c.startsWith('__Host-session=')) ?? '').toMatch(/^__Host-session=.*; Secure.*; SameSite=Strict/);
  expect(set.find((c) => c.startsWith('__Host-device=')) ?? '').toMatch(/^__Host-device=.*; Secure.*; SameSite=Strict/);
  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
});

test('production: with Google configured, it boots, offers the button, and sends people to Google itself under a Lax __Host- cookie', async ({ page, request, baseURL }) => {
  await page.goto('/sign-in');
  const link = page.getByRole('link', { name: 'Continue with Google' });
  await expect(link).toBeVisible();

  // Stops at the redirect: nothing here ever calls Google.
  const start = await request.get(`${baseURL}/api/v1/auth/google/start?next=%2Fjournal`, { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  const location = new URL(start.headers().location!);
  expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(location.searchParams.get('redirect_uri')).toBe(`${baseURL}/api/v1/auth/google/callback`);
  expect(location.searchParams.get('scope')).toBe('openid email');
  const cookie = start.headers()['set-cookie']!;
  expect(cookie).toMatch(/^__Host-google-oauth=/);
  expect(cookie).toMatch(/; Max-Age=600/);
  expect(cookie).toMatch(/; Path=\//);
  expect(cookie).toMatch(/; HttpOnly/);
  expect(cookie).toMatch(/; Secure/);
  expect(cookie).toMatch(/; SameSite=Lax/);
  expect(cookie).not.toMatch(/Domain=/i);
});

test('production refuses a fake provider: the log shows this server has none', async ({ request, baseURL }) => {
  const meta = (await (await request.get(`${baseURL}/api/v1/meta`)).json()) as { googleEnabled: boolean };
  expect(meta.googleEnabled).toBe(true);
  const start = await request.get(`${baseURL}/api/v1/auth/google/start`, { maxRedirects: 0 });
  expect(start.headers().location).not.toContain('127.0.0.1');
});

// ── Google's round trip over TLS, on the twin that may use a fake provider. See https-stack.ts ──

const GOOGLE_TWIN = 'https://localhost:8444';
const GUEST_RESULT = { clientRequestId: '55555555-5555-4555-8555-555555555555', answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 1 };

test.describe('Google over real TLS', () => {
  test('the Lax state cookie survives the cross-site return, and the strict session then works', async ({ page, context, browserName }) => {
    test.fixme(browserName === 'webkit' && process.platform === 'linux', 'Known issue: on Linux WebKit (GNOME Web), the redirect back from the provider never completes in CI. Passes on Chromium and on macOS WebKit, the engine iPhone Safari uses. See docs/testing/TEST-REPORT.md, "Known issues".');
    // Google starts a new account here only for an address it hosts.
    const email = `google${randomBytes(6).toString('hex')}@gmail.com`;
    const csp: string[] = [];
    page.on('console', (m) => {
      if (/content security policy/i.test(m.text())) csp.push(m.text());
    });
    await page.goto(`${GOOGLE_TWIN}/help`);
    await page.evaluate((r) => sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({ ...r, takenAt: new Date().toISOString() })), GUEST_RESULT);
    await page.goto(`${GOOGLE_TWIN}/sign-in?next=%2Fresult`);

    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:54392\/authorize/);
    const stateCookie = (await context.cookies(GOOGLE_TWIN)).find((c) => c.name === '__Host-google-oauth');
    expect(stateCookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });

    const sentOnReturn = page.waitForRequest((r) => r.url().includes('/api/v1/auth/google/callback'));
    await page.getByLabel('Fake account email').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    const callback = await sentOnReturn;
    // As in continueAtProvider: the callback's token exchange is slow on CI machines, so wait for the page to leave
    // the provider before looking for anything of ours.
    await page.waitForURL((url) => !url.href.startsWith('http://127.0.0.1:54392'), { timeout: 20_000 });
    // The whole point of Lax: the browser sent this on a navigation that started on another site. Playwright only
    // shows request cookies on Chromium, but on both, the sign-in below succeeds only if the server received it.
    if (browserName === 'chromium') expect((await callback.allHeaders()).cookie ?? '').toContain('__Host-google-oauth=');

    await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
    const cookies = await context.cookies(GOOGLE_TWIN);
    expect(cookies.map((c) => c.name).sort()).toEqual(['__Host-device', '__Host-session']);
    for (const cookie of cookies) expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/' });
    await expect.poll(() => page.evaluate(() => fetch('/api/v1/me').then((r) => r.status))).toBe(200);
    const me = await page.evaluate(() => fetch('/api/v1/me').then((r) => r.json() as Promise<{ email: string }>));
    expect(me.email).toBe(email);

    // Consent, then back to the guest result, still there and still offered.
    await page.getByRole('checkbox', { name: 'I am 18 or older.' }).check();
    await page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }).check();
    await page.getByRole('button', { name: 'Agree and continue' }).click();
    // Google is never asked for a name, so it is asked here, once.
    await expect(page.getByRole('heading', { level: 1, name: 'What should we call you?' })).toBeVisible();
    await page.getByLabel('Your name or a nickname').fill('Asha');
    await page.getByRole('button', { name: 'Continue' }).click();
    // Then About you, offered once and skipped.
    await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Save this result to your account?' })).toBeVisible();
    expect(csp).toEqual([]);
  });

  test('without the cookie, as a forged callback would be, it is refused with no detail', async ({ page }) => {
    await page.goto(`${GOOGLE_TWIN}/api/v1/auth/google/callback?state=forged&code=forged`);
    await expect(page).toHaveURL(`${GOOGLE_TWIN}/sign-in?error=google`);
    await expect(page.getByRole('alert')).toContainText("We couldn't sign you in with Google");
  });
});
