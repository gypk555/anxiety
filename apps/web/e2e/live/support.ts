import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { CONSENT_VERSION, CSRF_HEADER, CSRF_HEADER_VALUE, DIFFICULTY_OPTIONS, DIFFICULTY_STEM, GAD7_ITEMS, GAD7_OPTIONS, OTP_LENGTH } from '@anxiocare/shared';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

export { expect };
export const ORIGIN = 'http://localhost:8787';
const url = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const OUTBOX = url('../../../../.e2e-outbox/mail.jsonl');
const PG_KEYS = url('../../../api/.pgdata-e2e.keys.json');
const PG_PORT = 54387;
/** The fake OpenID provider. On another site, as Google is: localhost and 127.0.0.1 are different hosts. */
export const FAKE_OIDC = 'http://127.0.0.1:54393';
/** The same build and a database of its own, with Google off. */
export const GOOGLE_OFF_ORIGIN = 'http://localhost:8788';
const OTHER_HOSTS_ALLOWED = new Set([ORIGIN, FAKE_OIDC, GOOGLE_OFF_ORIGIN]);

// ── What every test must never do ─────────────────────────────────────

export interface Guard {
  /** Watches another browser context with the same rules. Done for you by `newContext`. */
  watch(context: BrowserContext): Promise<void>;
  /** This test provokes this HTTP failure on purpose, so the browser's line about it is expected. */
  expectHttpError(path: RegExp, status: number): void;
  /** This test goes offline on purpose, so the browser's lines about failed loads are expected. */
  expectOfflineErrors(): void;
  /** While on, a CSP violation is expected: to prove the watcher works, or for a browser's own JSON viewer. */
  expectCspViolation(on?: boolean): void;
  readonly problems: readonly string[];
}

const CSP_MARK = 'CSP-VIOLATION';

function makeGuard(): Guard {
  const problems: string[] = [];
  // Every signed-out page load asks who is signed in, and "nobody" is a 401: the browser always logs that.
  const expected: { path: RegExp; status: number }[] = [{ path: /^\/api\/v1\/me$/, status: 401 }];
  let offline = false;
  let cspExpected = false;

  const networkLineIsExpected = (text: string, where: string) => {
    if (offline) return true;
    const status = Number(/status of (\d+)/.exec(text)?.[1]);
    let path = '';
    try {
      path = new URL(where).pathname;
    } catch {
      return false;
    }
    return expected.some((e) => e.status === status && e.path.test(path));
  };

  return {
    problems,
    expectHttpError: (path, status) => void expected.push({ path, status }),
    expectOfflineErrors: () => {
      offline = true;
    },
    expectCspViolation: (on = true) => {
      cspExpected = on;
    },
    async watch(context) {
      await context.addInitScript((mark) => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`${mark} ${e.violatedDirective} ${e.blockedURI}`);
        });
      }, CSP_MARK);

      context.on('request', (request) => {
        const target = request.url();
        if (target.startsWith('blob:') || target.startsWith('data:')) return;
        if (!OTHER_HOSTS_ALLOWED.has(new URL(target).origin)) problems.push(`request to another host: ${target}`);
      });
      context.on('response', (response) => {
        if (new URL(response.url()).pathname.startsWith('/api') && response.fromServiceWorker()) {
          problems.push(`service worker served ${response.url()}`);
        }
      });
      context.on('console', (message) => {
        const text = message.text();
        if (text.includes(CSP_MARK) || /content security policy/i.test(text)) {
          if (!cspExpected) problems.push(`CSP: ${text}`);
          return;
        }
        if (message.type() !== 'error') return;
        const where = message.location().url;
        if (/failed to load resource/i.test(text) && networkLineIsExpected(text, where)) return;
        problems.push(`console error: ${text} (${where})`);
      });
      context.on('weberror', (error) => {
        problems.push(`uncaught: ${String(error.error())}`);
      });
    },
  };
}

interface Fixtures {
  guard: Guard;
  newContext: () => Promise<BrowserContext>;
}

export const test = base.extend<Fixtures>({
  // Each test is its own client, so per-IP limits apply per test, as for separate people.
  extraHTTPHeaders: async ({}, run) => {
    const b = randomBytes(3);
    await run({ 'x-forwarded-for': `10.${b[0]}.${b[1]}.${b[2]}` });
  },
  guard: [
    async ({ context }, run) => {
      const guard = makeGuard();
      await guard.watch(context);
      await run(guard);
      expect(guard.problems, 'console errors, CSP violations, other hosts, service worker on /api').toEqual([]);
    },
    { auto: true },
  ],
  newContext: async ({ browser, guard, extraHTTPHeaders, baseURL }, run) => {
    const opened: BrowserContext[] = [];
    await run(async () => {
      const context = await browser.newContext({ baseURL, extraHTTPHeaders });
      opened.push(context);
      await guard.watch(context);
      return context;
    });
    await Promise.all(opened.map((c) => c.close()));
  },
});

// ── Mail ──────────────────────────────────────────────────────────────

export type MailPurpose =
  | 'login' | 'register' | 'password_reset' | 'password_set' | 'email_change' | 'email_change_current' | 'account_delete' | 'reauth'
  | 'email_changed_notice' | 'new_signin_notice' | 'account_exists_notice' | 'password_changed_notice' | 'google_linked_notice' | 'google_unlinked_notice';
interface Mail {
  to: string;
  purpose: MailPurpose;
  subject: string;
  text: string;
  from: string;
  code: string | null;
}

function mailFor(to: string, purpose: MailPurpose): Mail[] {
  let raw = '';
  try {
    raw = readFileSync(OUTBOX, 'utf8');
  } catch {
    return [];
  }
  const found: Mail[] = [];
  for (const line of raw.split('\n')) {
    if (!line.includes(to)) continue;
    try {
      const mail = JSON.parse(line) as Mail;
      if (mail.to === to && mail.purpose === purpose) found.push(mail);
    } catch {
      /* A line still being written. */
    }
  }
  return found;
}

export const lastMail = (to: string, purpose: MailPurpose) => mailFor(to, purpose).at(-1);
export const mailCount = (to: string, purpose: MailPurpose) => mailFor(to, purpose).length;

/** The latest code, once more than `after` mails to this address exist. Delivery follows the 202. */
export async function waitForCode(to: string, purpose: MailPurpose, after = 0): Promise<string> {
  await expect.poll(() => mailCount(to, purpose), { message: `${purpose} mail to ${to}`, intervals: [50, 100, 200] }).toBeGreaterThan(after);
  return mailFor(to, purpose).at(-1)!.code!;
}

export const uniqueEmail = (tag = 'user') => `${tag}-${randomBytes(6).toString('hex')}@example.com`;
/** Google starts a new account only for an address it hosts itself, so a new person through the fake provider uses one. */
export const uniqueGmail = (tag = 'user') => `${tag}${randomBytes(6).toString('hex')}@gmail.com`;
export const CODE_LABEL = `${OTP_LENGTH}-digit code`;
export const differentCode = (code: string) => (code === '0'.repeat(OTP_LENGTH) ? '1'.repeat(OTP_LENGTH) : '0'.repeat(OTP_LENGTH));

// ── Account helpers, all through the real UI ──────────────────────────

export async function requestCode(page: Page, email: string, path = '/sign-in') {
  const after = mailCount(email, 'login');
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
  return waitForCode(email, 'login', after);
}

export async function enterCode(page: Page, code: string) {
  await page.getByLabel(CODE_LABEL).fill(code);
}

export async function acceptConsent(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Before we save anything' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I am 18 or older.' }).check();
  await page.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
}

/** Signing in from the page already open. A page load would lose what is held in memory across a sign-out. */
export async function signInHere(page: Page, email: string) {
  const after = mailCount(email, 'login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code instead' }).click();
  await enterCode(page, await waitForCode(email, 'login', after));
}

/** A new account, consent accepted, on Home. */
export async function signUp(page: Page, tag = 'user', email = uniqueEmail(tag)) {
  const code = await requestCode(page, email);
  await enterCode(page, code);
  await acceptConsent(page);
  await expectAccountHome(page);
  return email;
}

/** An account that already accepted consent, signing in again. */
export async function signIn(page: Page, email: string) {
  await enterCode(page, await requestCode(page, email));
  await expectAccountHome(page);
}

export const PASSWORD = 'river stone quiet morning';
export const NEW_PASSWORD = 'mango season on the terrace';

/** Fills in Create account and sends it, stopping at the code screen. `path` lets a test start with a `next`. */
export async function startCreateAccount(page: Page, email: string, password = PASSWORD, path = '/create-account') {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
}

/** A new account with a password, consent accepted, on Home. */
export async function createAccount(page: Page, tag = 'pw', password = PASSWORD) {
  const email = uniqueEmail(tag);
  await startCreateAccount(page, email, password);
  await enterCode(page, await waitForCode(email, 'register'));
  await acceptConsent(page);
  await expectAccountHome(page);
  return email;
}

export async function signInWithPassword(page: Page, email: string, password = PASSWORD, path = '/sign-in') {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Continues at the fake provider, as a person would at Google. */
export async function continueAtProvider(page: Page, email: string) {
  await expect(page).toHaveURL(new RegExp(`^${FAKE_OIDC}/authorize`));
  await page.getByLabel('Fake account email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Watches every URL the page visits, for the rule that no password ever appears in one. */
export function watchUrls(page: Page) {
  const seen: string[] = [];
  page.on('framenavigated', (frame) => seen.push(frame.url()));
  page.on('request', (request) => seen.push(request.url()));
  return seen;
}

/** Everything the browser could keep: both storages, history state, cookies a script can read, and the address bar. */
export async function expectNoPasswordKept(page: Page, seenUrls: readonly string[], ...passwords: string[]) {
  const held = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state, cookie: document.cookie, url: location.href }));
  for (const password of passwords) {
    for (const form of [password, encodeURIComponent(password), password.replaceAll(' ', '+')]) {
      expect(held, 'browser storage or history').not.toContain(form);
      for (const url of seenUrls) expect(url, 'a visited URL').not.toContain(form);
    }
  }
}

export const expectAccountHome = (page: Page) => expect(page.getByRole('heading', { level: 2, name: 'For right now' })).toBeVisible();
export const expectGuestHome = (page: Page) => expect(page.getByRole('heading', { level: 1, name: 'How have the last two weeks been?' })).toBeVisible();

export async function signOut(page: Page) {
  await page.goto('/settings');
  await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expectGuestHome(page);
}

// ── Check-in ──────────────────────────────────────────────────────────

export async function answerItems(page: Page, answers: readonly number[], from = 0) {
  for (let i = from; i < answers.length; i += 1) {
    await expect(page.getByRole('heading', { level: 1, name: GAD7_ITEMS[i]! })).toBeVisible();
    await page.getByRole('button', { name: GAD7_OPTIONS[answers[i]!]!.label, exact: true }).click();
  }
}

export async function answerDifficulty(page: Page, difficulty: number) {
  await expect(page.getByRole('heading', { level: 1, name: DIFFICULTY_STEM })).toBeVisible();
  await page.getByRole('button', { name: DIFFICULTY_OPTIONS[difficulty]!.label, exact: true }).click();
}

/** A whole check-in from the intro. The difficulty item appears only when a symptom was reported. */
export async function takeCheckin(page: Page, answers: readonly number[], difficulty: number | null) {
  await page.goto('/check-in');
  await page.getByRole('button', { name: /^(Begin|Start again)$/ }).click();
  await answerItems(page, answers);
  if (difficulty !== null) await answerDifficulty(page, difficulty);
}

export const resultHeading = (page: Page) => page.getByRole('heading', { level: 1 });
export const readGuestResult = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem('anxiocare.result.v1') ?? 'null') as { clientRequestId: string; answers: number[]; difficulty: number | null; takenAt: string } | null);

// ── Direct API access with the context's own cookie ───────────────────

export const apiHeaders = { origin: ORIGIN, [CSRF_HEADER]: CSRF_HEADER_VALUE };

export function api(context: BrowserContext) {
  const send = (method: string, path: string, body?: unknown) =>
    context.request.fetch(`${ORIGIN}/api/v1${path}`, {
      method,
      headers: { ...apiHeaders, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    });
  return {
    get: (path: string) => context.request.get(`${ORIGIN}/api/v1${path}`),
    send,
    async items<T = Record<string, unknown>>(path: '/assessments' | '/journal') {
      const response = await context.request.get(`${ORIGIN}/api/v1${path}`);
      expect(response.status()).toBe(200);
      return ((await response.json()) as { items: T[] }).items;
    },
    async userId() {
      const response = await context.request.get(`${ORIGIN}/api/v1/me`);
      expect(response.status()).toBe(200);
      return ((await response.json()) as { id: string }).id;
    },
  };
}

export interface SavedAssessment {
  id: string;
  takenAt: string;
  answers: number[];
  difficulty: number | null;
  score: number;
  severity: string;
}

export async function seedAssessment(context: BrowserContext, answers: number[], difficulty: number | null, takenAt?: string) {
  const response = await api(context).send('POST', '/assessments', { clientRequestId: randomUUID(), answers, difficulty, ...(takenAt ? { takenAt } : {}) });
  expect(response.status()).toBe(201);
  return (await response.json()) as SavedAssessment;
}

export const JOURNAL_SEED = {
  situation: 'The train was late again.',
  thought: 'I will be in trouble for this.',
  feelings: ['Worried'],
  intensityBefore: 6,
  evidenceFor: '',
  evidenceAgainst: '',
  balancedThought: '',
  intensityAfter: null,
};

export async function seedJournal(context: BrowserContext, over: Partial<typeof JOURNAL_SEED> = {}) {
  const response = await api(context).send('POST', '/journal', { ...JOURNAL_SEED, ...over });
  expect(response.status()).toBe(201);
  return (await response.json()) as typeof JOURNAL_SEED & { id: string; createdAt: string };
}

// ── Real faults: the real API, and a database that really misbehaves for one user ─────

function superuser() {
  const keys = JSON.parse(readFileSync(PG_KEYS, 'utf8')) as { superPassword: string };
  return postgres({ host: '127.0.0.1', port: PG_PORT, database: 'anxiocare', user: 'postgres', password: keys.superPassword, max: 1, onnotice: () => {} });
}

/** A trigger scoped to one user, so other tests running in parallel are not affected. */
export async function injectFault(userId: string, table: 'journal_entries' | 'assessments', kind: 'fail' | 'slow') {
  const name = `e2e_${randomBytes(6).toString('hex')}`;
  const body = kind === 'fail' ? `RAISE EXCEPTION 'injected by e2e';` : `PERFORM pg_sleep(1.5); RETURN NEW;`;
  const sql = superuser();
  await sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} ${kind === 'fail' ? 'RETURN NEW;' : ''} END $$`);
  await sql.unsafe(
    `CREATE TRIGGER ${name} BEFORE INSERT OR UPDATE ON app.${table} FOR EACH ROW WHEN (NEW.user_id = '${userId}'::uuid) EXECUTE FUNCTION public.${name}()`,
  );
  return async () => {
    await sql.unsafe(`DROP TRIGGER ${name} ON app.${table}`);
    await sql.unsafe(`DROP FUNCTION public.${name}()`);
    await sql.end();
  };
}

/** Damages one row so that decrypting it fails, as real corruption would. Returns the repair. */
export async function corruptJournal(userId: string) {
  const sql = superuser();
  const [row] = await sql<{ id: string; payload_ct: Buffer }[]>`SELECT id, payload_ct FROM app.journal_entries WHERE user_id = ${userId}::uuid LIMIT 1`;
  const damaged = Buffer.from(row!.payload_ct);
  damaged[damaged.length - 1]! ^= 0xff;
  await sql`UPDATE app.journal_entries SET payload_ct = ${damaged} WHERE id = ${row!.id}::uuid`;
  return async () => {
    await sql`UPDATE app.journal_entries SET payload_ct = ${row!.payload_ct} WHERE id = ${row!.id}::uuid`;
    await sql.end();
  };
}

// ── Service worker, axe, overflow ─────────────────────────────────────

/** Resolves when the service worker has installed its precache and is active. New navigations go through it. */
export async function serviceWorkerActive(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active!;
    if (worker.state !== 'activated') await new Promise((resolve) => worker.addEventListener('statechange', resolve));
  });
}

export async function expectAccessible(page: Page, label: string) {
  // A sheet fading in is not its final contrast.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(serious, `axe on ${label}`).toEqual([]);
}

/** The shell clips sideways overflow, so also look for anything actually cut off by the screen edge. */
export async function expectNoOverflowAt320(page: Page, label: string) {
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const cut: string[] = [];
          if (document.documentElement.scrollWidth > width) cut.push(`page ${document.documentElement.scrollWidth}`);
          for (const el of document.querySelectorAll('main *, header *, nav *')) {
            if (el.closest('[aria-hidden="true"], .sr-only, .overflow-x-auto, dialog:not([open])')) continue;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > width + 1) cut.push(`${el.tagName} ${el.className} ${Math.round(r.right)}`);
          }
          return cut;
        }),
      { message: `overflow at 320px on ${label}` },
    )
    .toEqual([]);
  await page.setViewportSize(size);
}

export { CONSENT_VERSION };

// ── Consent version, per user: the same effect as bumping CONSENT_VERSION, without touching anyone else ──

/** Makes this one account's accepted consent out of date, as a new version of the notice would. */
/**
 * Spends an address's whole daily allowance of failed passwords, as 100 wrong tries from 100 networks would. Keyed the
 * way the server keys it (see loginQuotaKey in apps/api/src/otp.ts), with this test database's own key.
 */
export async function fillLoginFailures(email: string, n = 100) {
  const keys = JSON.parse(readFileSync(PG_KEYS, 'utf8')) as { EMAIL_INDEX_KEY: string };
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  const canonical = `${lower.slice(0, at).split('+', 1)[0]}@${lower.slice(at + 1)}`;
  const quota = createHmac('sha256', Buffer.from(keys.EMAIL_INDEX_KEY, 'base64')).update(`login-quota:${canonical}`, 'utf8').digest();
  const sql = superuser();
  try {
    await sql`INSERT INTO app.login_failures (quota_hash, source_hash) SELECT ${quota}, sha256(gen_random_uuid()::text::bytea) FROM generate_series(1, ${n}::int)`;
  } finally {
    await sql.end();
  }
}

export async function makeConsentStale(userId: string, acceptedVersion = '2000-01-01') {
  const sql = superuser();
  try {
    await sql`UPDATE app.users SET consent_version = ${acceptedVersion} WHERE id = ${userId}::uuid`;
  } finally {
    await sql.end();
  }
}

export async function rowCount(table: 'users' | 'assessments' | 'journal_entries', where: { column: string; id: string }) {
  const sql = superuser();
  try {
    const [row] = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM app.${table} WHERE ${where.column} = $1::uuid`, [where.id]);
    return row!.n;
  } finally {
    await sql.end();
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────

/** WebKit on macOS skips links and buttons on a plain Tab unless Option is held. A person there sets this in System Settings. */
export const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
export const shiftTabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');

/** Presses Tab until `target` has focus, as a keyboard user would, and fails if it can't be reached. */
export async function tabTo(page: Page, browserName: string, target: ReturnType<Page['locator']>, max = 40) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press(tabKey(browserName));
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab did not reach ${String(target)} in ${max} presses`);
}

export const expectFocusedHeading = async (page: Page, name: string | RegExp) => {
  const heading = page.getByRole('heading', { level: 1, name });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
};
