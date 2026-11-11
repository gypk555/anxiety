#!/usr/bin/env node
/**
 * Writes docs/testing/TEST-CASES.md from what the test runners themselves report, so loops and
 * `it.each` expand exactly as they do when run. It lists tests without running them: no browser or database.
 *
 *   node scripts/generate-test-catalogue.mjs           write the file
 *   node scripts/generate-test-catalogue.mjs --check   exit 1 if the file is out of date
 *
 * It also fails if a requirement in REQUIREMENTS points at a test that no longer exists, or at a manual
 * case that is not in docs/testing/MANUAL-TEST-CASES.md, so the traceability matrix cannot quietly rot.
 *
 * Test IDs are a hash of file and name, so adding a test does not renumber the rest. Renaming a test changes its ID.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'docs/testing/TEST-CASES.md');
const MANUAL = join(ROOT, 'docs/testing/MANUAL-TEST-CASES.md');
const SPEC = 'docs/superpowers/specs/2026-11-06-production-rebuild-design.md';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// ── Reading the runners ───────────────────────────────────────────────

function vitestTests(workspace) {
  const dir = mkdtempSync(join(tmpdir(), 'catalogue-'));
  const out = join(dir, 'list.json');
  try {
    execFileSync(NPX, ['vitest', 'list', `--json=${out}`], { cwd: join(ROOT, workspace), stdio: ['ignore', 'ignore', 'pipe'] });
    return JSON.parse(readFileSync(out, 'utf8')).map((t) => ({
      file: relative(ROOT, t.file),
      name: t.name,
      projects: [],
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function playwrightTests() {
  const raw = execFileSync(NPX, ['playwright', 'test', '--list', '--reporter=json'], {
    cwd: join(ROOT, 'apps/web'),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: '' },
  }).toString();
  const report = JSON.parse(raw);
  const found = new Map();
  const walk = (suite, prefix) => {
    for (const spec of suite.specs ?? []) {
      const file = `apps/web/e2e/${spec.file}`;
      const name = `${prefix}${spec.title}`;
      const key = `${file}\0${name}`;
      const entry = found.get(key) ?? { file, name, projects: [] };
      for (const t of spec.tests) entry.projects.push(t.projectName);
      found.set(key, entry);
    }
    for (const child of suite.suites ?? []) walk(child, child.file ? prefix : `${prefix}${child.title} > `);
  };
  for (const suite of report.suites) walk(suite, '');
  return [...found.values()];
}

// ── Classifying ───────────────────────────────────────────────────────

function level(file) {
  if (file.startsWith('packages/shared/')) return 'Unit';
  if (file === 'apps/api/test/config.test.ts') return 'API unit';
  if (file.startsWith('apps/api/')) return 'API integration';
  if (file.startsWith('apps/web/src/')) return 'Web unit and component';
  if (file.includes('/e2e/https/')) return 'E2E HTTPS';
  if (file.includes('/e2e/live/')) return 'E2E live';
  return 'E2E mocked';
}

const DESCRIBE_AREAS = [
  [/^reflections\.test.*at rest/, 'Security: encryption'],
  [/^reflections\.test.*access/, 'Security: authorisation'],
  [/^(questions|released-questions|reflections|reflection-store|Reflection)\.test|^reflection\.spec/, 'Product: reflections'],
  [/^user-rate-limit\.test/, 'Security: per-user caps'],
  [/^brevo\.test/, 'Security: mail'],
  [/^tracking\.test.*safety plan/, 'Product: safety plan'],
  [/^tracking\.test.*(at rest)/, 'Security: encryption'],
  [/^tracking\.test.*access/, 'Security: authorisation'],
  [/^tracking\.test/, 'Product: mood log'],
  [/^(vault|session-vault)\.test/, 'Security: client storage'],
  [/^quick-exit\.(test|spec)/, 'Clinical safety: quick exit'],
  [/^SafetyPlan\.test|^safety-plan\.spec/, 'Product: safety plan'],
  [/^(MoodCard|MoodChart|MoodLog|Trends)\.test|^mood\.spec/, 'Product: mood log'],
  [/^Report\.test|^report\.spec/, 'Product: doctor report'],
  [/^notify\.test/, 'Operations: breach notification'],
  [/^dev-script\.test/, 'Operations: dev server'],
  [/^(sound|Sounds|Breathe)\.test/, 'Product: tools'],
  [/^Settings\.test/, 'Privacy: rights'],
  [/^(Consent|Home)\.test/, 'Privacy: consent'],
  [/^Legal\.test/, 'Privacy: notice and claims'],
  [/^SignIn\.test/, 'Security: auth'],
  [/^SignInSecurity\.test/, 'Security: auth'],
  [/^passwords\.test.*safeNext/, 'Security: open redirect'],
  [/^passwords\.test/, 'Security: auth'],
  [/^accounts\.test/, 'Security: auth'],
  [/^google\.test/, 'Security: auth'],
  [/^security-regressions\.test.*minor items/, 'Security: database'],
  [/^security-regressions\.test/, 'Security: auth'],
  [/^accounts\.spec.*(fits 320px|passes axe|keyboard)/, 'UX: axe, overflow and CSP'],
  [/^accounts\.spec/, 'Security: auth'],
  [/^tooling\.test/, 'Operations: database and environment tooling'],
  [/^consent\.spec/, 'Privacy: consent'],
  [/^keyboard\.spec/, 'UX: keyboard and focus'],
  [/^landscape\.spec/, 'UX: axe, overflow and CSP'],
  [/^compression\.spec/, 'UX: compression and JS budget'],
  [/^gad7\.test.*consent changes/, 'Privacy: consent'],
  [/^http\.test.*CSRF/, 'Security: CSRF'],
  [/^http\.test.*(per-IP budgets|client IP)/, 'Security: rate limits and client address'],
  [/^http\.test/, 'Security: HTTP'],
  [/^data\.test.*consent gate/, 'Privacy: consent'],
  [/^data\.test.*profile/, 'Privacy: rights'],
  [/^data\.test.*assessments/, 'Clinical safety and check-in data'],
  [/^data\.test.*journal/, 'Product: journal'],
  [/^data\.test.*cross-user/, 'Security: authorisation'],
  [/^data\.test.*pagination/, 'Product: lists'],
  [/^otp\.test.*Email change/, 'Privacy: rights'],
  [/^otp\.test.*Mail content/, 'Security: mail'],
  [/^otp\.test/, 'Security: auth'],
  [/^hardening\.test.*1\. email change/, 'Security: auth'],
  [/^hardening\.test.*2 and 3/, 'Security: auth'],
  [/^hardening\.test.*4\. ciphertext/, 'Security: encryption'],
  [/^hardening\.test.*(5\. rate limit|client address|7\. limiter)/, 'Security: rate limits and client address'],
  [/^hardening\.test.*6\. erasure/, 'Privacy: erasure and audit'],
  [/^hardening\.test.*8\. per-user/, 'Security: per-user caps'],
  [/^hardening\.test.*9\. nothing names/, 'Security: mail'],
  [/^hardening\.test.*10\. cursors/, 'Security: HTTP'],
  [/^hardening\.test.*deploy config/, 'Security: supply chain and deploy'],
  [/^(tls|database)\.test/, 'Security: database'],
  [/^erasure\.test.*audit/, 'Privacy: erasure and audit'],
  [/^erasure\.test/, 'Privacy: rights'],
  [/^logging\.test/, 'Security: logging'],
  [/^encryption\.test/, 'Security: encryption'],
  [/^sessions\.test/, 'Security: sessions'],
  [/^config\.test/, 'Security: config'],
  [/^purge\.test.*file mail/, 'Security: mail'],
  [/^purge\.test/, 'Privacy: retention and purge'],
  [/^gad7\.test.*helplines/, 'Clinical safety: helplines'],
  [/^gad7\.test/, 'Clinical safety: GAD-7'],
  [/^held\.test/, 'UX: failure recovery'],
  [/^api\.test/, 'UX: errors and client contract'],
  [/^TrendChart\.test/, 'Product: trends'],
  [/^CheckIn\.test.*severity/, 'Clinical safety: result'],
  [/^CheckIn\.test/, 'Product: check-in'],
  [/^guest\.test/, 'Security: client storage'],
  [/^guards\.test.*routing guards/, 'Security: authorisation'],
  [/^guards\.test/, 'Security: sessions'],
  [/^Shell\.test/, 'Clinical safety: Get help'],
  [/^JournalForm\.test/, 'Product: journal'],
  [/^OtpInput\.test/, 'UX: sign-in input'],
  [/^misc\.test.*safeNext/, 'Security: open redirect'],
  [/^misc\.test.*breathing/, 'Product: tools'],
  [/^misc\.test/, 'Product: home'],
  [/^audit\.spec.*print view/, 'Product: print view'],
  [/^audit\.spec.*touch target/, 'UX: touch targets'],
  [/^audit\.spec/, 'UX: axe, overflow and CSP'],
  [/^resilience\.spec.*(offline|Offline)/, 'Clinical safety: offline help'],
  [/^resilience\.spec.*chunk/, 'UX: failure recovery'],
  [/^resilience\.spec.*(signing out|localStorage)/, 'Security: client storage'],
  [/^resilience\.spec.*reduced motion/, 'UX: reduced motion'],
  [/^resilience\.spec.*first paint/, 'Clinical safety: offline help'],
  [/^a11y\.spec/, 'UX: axe, overflow and CSP'],
  [/^auth\.spec/, 'Security: auth'],
  [/^authorisation\.spec/, 'Security: authorisation'],
  [/^failures\.spec/, 'UX: failure recovery'],
  [/^guest\.spec/, 'Product: check-in'],
  [/^journal\.spec/, 'Product: journal'],
  [/^navigation\.spec/, 'UX: navigation'],
  [/^results\.spec/, 'Product: saving and trends'],
  [/^safety\.spec.*service worker/, 'Security: client storage'],
  [/^safety\.spec.*offline/, 'Clinical safety: offline help'],
  [/^safety\.spec/, 'Clinical safety: Get help'],
  [/^security\.spec/, 'Security: HTTP'],
  [/^settings\.spec/, 'Privacy: rights'],
  [/^https\.spec/, 'Security: production mode over TLS'],
];

function area(file, name) {
  const key = `${file.split('/').pop()} ${name}`;
  const hit = DESCRIBE_AREAS.find(([pattern]) => pattern.test(key));
  if (!hit) throw new Error(`No requirement area for: ${key}`);
  return hit[1];
}

const slug = (file) => {
  const base = file.split('/').pop().replace(/\.(test|spec)\.tsx?$/, '');
  if (file.startsWith('packages/shared/')) return `SHR-${base}`;
  if (file.startsWith('apps/api/')) return `API-${base}`;
  if (file.startsWith('apps/web/src/')) return `WEB-${base}`;
  if (file.includes('/e2e/https/')) return 'E2E-https';
  if (file.includes('/e2e/live/')) return `E2E-live-${base}`;
  return `E2E-${base}`;
};

function collect() {
  const raw = [...vitestTests('packages/shared'), ...vitestTests('apps/api'), ...vitestTests('apps/web'), ...playwrightTests()];
  const seen = new Map();
  const ids = new Set();
  return raw.map((t) => {
    const key = `${t.file}\0${t.name}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const hash = createHash('sha1').update(`${key}\0${n}`).digest('hex').slice(0, 4);
    const id = `${slug(t.file)}-${hash}`;
    if (ids.has(id)) throw new Error(`ID collision on ${id}. Lengthen the hash.`);
    ids.add(id);
    return { ...t, id, level: level(t.file), area: area(t.file, t.name) };
  });
}

// ── The spec, one requirement per row ─────────────────────────────────

const T = (file, pattern) => ({ file, pattern });
const R = (id, text, status, tests, note = '', manual = []) => ({ id, text, status, tests, note, manual });

const REQUIREMENTS = [
  { section: 'Security: authentication', rows: [
    R('SEC-AUTH-01', 'Email OTP sign-in, kept as a fallback (superseded as the only method by the accounts spec)', 'Covered', [T('live/auth.spec', /^sign-up: email, code/), T('https.spec', /over real TLS/), T('database.test', /public holds none/)], '', ['MT-AUTH-01']),
    R('SEC-AUTH-02', '6 digits from a CSPRNG (was 8; accounts spec)', 'Partial', [T('otp.test', /stores only an HMAC/), T('hardening.test', /uses six digits/)], 'Length is tested. That `randomInt` is a CSPRNG is by reading `crypto.ts`, not by test.'),
    R('SEC-AUTH-03', 'Stored as HMAC with a server pepper', 'Covered', [T('otp.test', /stores only an HMAC/), T('encryption.test', /raw SELECT/)]),
    R('SEC-AUTH-04', '10 minute expiry', 'Covered', [T('otp.test', /stores only an HMAC/), T('otp.test', /rejects an expired code/)], '', ['MT-MAIL-10']),
    R('SEC-AUTH-05', 'Single use', 'Covered', [T('otp.test', /is single use/), T('otp.test', /lets only one of many/), T('otp.test', /invalidates the earlier code/)]),
    R('SEC-AUTH-06', '5 attempts per code', 'Covered', [T('otp.test', /blocks even the right code/), T('otp.test', /never counts past five/), T('otp.test', /parallel guess at the fifth/)]),
    R('SEC-AUTH-07', 'Constant-time compare', 'None', [], 'By reading `constantTimeEqual` in `crypto.ts`. No timing test: one would be noise on shared CI.'),
    R('SEC-AUTH-08', 'Request answers 202 identically', 'Covered', [T('otp.test', /answers identically/), T('otp.test', /rejects a malformed address/)], '', ['MT-SEC-09']),
    R('SEC-AUTH-09', 'Mail out of band: neither response nor timing reveals an account', 'Covered', [T('otp.test', /responds before any delivery work/), T('otp.test', /does not create an account/), T('otp.test', /fails the same way/)], 'Proved in process. Real network timing is manual.', ['MT-SEC-09']),
    R('SEC-AUTH-10', 'DB limit: 5 sends an hour per canonical address and client, per purpose', 'Covered', [T('hardening.test', /allows five sends/), T('hardening.test', /a whole \/64 shares/), T('hardening.test', /keeps quotas per purpose/)], '', ['MT-MAIL-12']),
    R('SEC-AUTH-11', 'DB limit: 20 sends an hour per canonical address', 'Covered', [T('hardening.test', /allows twenty sends/), T('otp.test', /limits each address to twenty/), T('hardening.test', /canonicalises for quota/), T('hardening.test', /computes the quota key/)]),
    R('SEC-AUTH-12', 'DB limit: 20 failed guesses a rolling day (was 50; accounts spec)', 'Covered', [T('hardening.test', /caps failed guesses/), T('hardening.test', /counts real wrong guesses/), T('hardening.test', /no live code is not a failed guess/), T('hardening.test', /sign-in guessing cannot block/)], 'Residual: an attacker who triggers four mails can block code sign-in and reset for that address for up to 24 hours.', ['MT-AUTH-09']),
    R('SEC-AUTH-13', 'Per-client route limits', 'Covered', [T('otp.test', /applies a per-IP route limit/), T('hardening.test', /rotating inside one IPv6/), T('hardening.test', /a route limit applies before authentication/), T('hardening.test', /anonymous flood/), T('hardening.test', /fake-cookie flood/), T('hardening.test', /reads the configured header/), T('hardening.test', /forging X-Forwarded-For/)], 'Client-address handling is proved against a local terminator, not Cloudflare.', ['MT-DEP-07', 'MT-DEP-08', 'MT-SEC-11']),
    R('SEC-AUTH-14', 'Phone OTP deferred', 'None', [], 'Nothing to test: not built.'),
  ]},
  { section: 'Accounts: passwords, Google and tooling', rows: [
    R('ACC-01', 'Create account: always 202; existing address gets a notice, not a code, under the send quota', 'Covered', [T('accounts.test', /identical response and a notice/), T('accounts.test', /mail-bomb/), T('live/accounts.spec', /an existing address shows the same next screen/)], '', ['MT-AUTH-12']),
    R('ACC-02', 'Nothing about an account is stored before its code is verified', 'Covered', [T('accounts.test', /stores nothing about the account/), T('accounts.test', /pre-hijack/), T('google.test', /pre-hijack/)]),
    R('ACC-03', 'Password login: unknown, no password and wrong password identical in body, status and work', 'Covered', [T('accounts.test', /identical in status, headers and body/), T('accounts.test', /runs a real hash/), T('accounts.test', /^sign in with a password > timing/)], 'Timing proved in process, not across a network.', ['MT-AUTH-14']),
    R('ACC-04', 'Failed passwords: 10 a day per address and network, 100 a day per address, then same response, unevaluated, under a burst', 'Covered', [T('accounts.test', /after 10 failures from one client/), T('accounts.test', /after 100 failures a day/), T('accounts.test', /holds the overall cap under a parallel burst/), T('accounts.test', /caps an unknown address/), T('security-regressions.test', /one source is capped at 10/)], '', ['MT-AUTH-14']),
    R('ACC-05', 'Argon2id via node:crypto with pepper, PHC, rehash when raised, OWASP floor', 'Covered', [T('accounts.test', /stores an Argon2id PHC string/), T('accounts.test', /upgrades the stored hash/), T('accounts.test', /below the OWASP minimum/), T('accounts.test', /cannot be checked without the pepper/), T('config.test', /needs PASSWORD_PEPPER/)]),
    R('ACC-06', 'Hashing semaphore holds under a burst', 'Covered', [T('accounts.test', /the semaphore never runs more/), T('accounts.test', /shed for load/)]),
    R('ACC-07', 'Policy: 10 to 128, no composition rules, blocklist, local part; client mirrors it', 'Covered', [T('passwords.test', /asks for 10 to 128/), T('passwords.test', /no composition rules/), T('passwords.test', /rejects the common password/), T('SignIn.test', /checks the password first/)], 'The blocklist is hand-picked.'),
    R('ACC-08', 'Password never in logs, error bodies, storage, URL or mutation cache', 'Covered', [T('accounts.test', /across every endpoint and failure/), T('SignIn.test', /keeps the password out of browser storage/), T('live/accounts.spec', /start to finish/), T('live/accounts.spec', /a reload on the code screen/)]),
    R('ACC-09', 'Forgot password: 202 always; reset revokes all sessions and mails a notice', 'Covered', [T('accounts.test', /only an existing account gets a code/), T('accounts.test', /reset sets the hash/), T('live/accounts.spec', /a code and a new password/)], '', ['MT-AUTH-16']),
    R('ACC-10', 'Change and set password revoke other sessions, notify and audit', 'Covered', [T('accounts.test', /needs the current one/), T('accounts.test', /a code-only account proves its inbox/), T('live/accounts.spec', /change a password/), T('live/accounts.spec', /set a password on an email-code/)], '', ['MT-AUTH-17']),
    R('ACC-11', 'Code purposes are not interchangeable', 'Covered', [T('accounts.test', /^code purposes are not interchangeable/)]),
    R('ACC-12', 'Guess cap 20 a day per address and purpose; sign-in, reset and register share one budget', 'Covered', [T('accounts.test', /stops every purpose at 20/), T('accounts.test', /draw on one budget/), T('accounts.test', /signed-in purposes keep a budget each/)], 'Deliberately stricter than the spec wording. See decision 012.'),
    R('ACC-13', 'Google: state, nonce, PKCE, aud, iss, exp, signature, email_verified all checked', 'Covered', [T('google.test', /^state and code/), T('google.test', /^the ID token/), T('https.spec', /the Lax state cookie survives/)], 'Fake provider only. Never met real Google.', ['MT-AUTH-18']),
    R('ACC-14', 'Google: open redirect through next rejected', 'Covered', [T('google.test', /^open redirect through next/), T('passwords.test', /refuses/), T('live/accounts.spec', /open redirect/)]),
    R('ACC-15', 'Google: never links by address at sign-in; links only from Settings after re-authentication, bound to that session; recycled address refused', 'Covered', [T('google.test', /^linking/), T('security-regressions.test', /^finding 1/), T('live/accounts.spec', /refused at Google sign-in/), T('live/accounts.spec', /connect from Settings/), T('SignInSecurity.test', /connects Google after confirming/)], '', ['MT-AUTH-19']),
    R('ACC-16', 'Google: button hidden when off; disconnect needs a recent re-authentication, not a password', 'Covered', [T('live/accounts.spec', /the button and its line are not there/), T('google.test', /needs a recent re-authentication, not a password/), T('SignInSecurity.test', /disconnecting Google is still offered/), T('live/accounts.spec', /disconnect needs no password/)], '', ['MT-AUTH-20']),
    R('ACC-17', 'Production boot refuses endpoint overrides and half-set Google config', 'Covered', [T('config.test', /production refuses an endpoint override/), T('config.test', /production refuses half-set/)]),
    R('ACC-18', 'Erasure removes identities and login failures; export states methods, not subjects', 'Covered', [T('google.test', /erasure removes the identity/), T('erasure.test', /removes login failures/), T('google.test', /the export states the method/)]),
    R('ACC-19', 'Migration 002 applies on top of 001 unchanged; runtime role has only the needed grants', 'Covered', [T('database.test', /applies on top of 001/), T('database.test', /001 is byte for byte/), T('database.test', /has exactly the grants/)]),
    R('ACC-20', 'db:setup idempotent, never overwrites secrets; db:verify fails on a broken database; doctor prints no secrets', 'Covered', [T('tooling.test', /run twice is idempotent/), T('tooling.test', /never overwrites a secret/), T('tooling.test', /fails on a table in public/), T('tooling.test', /fails on RLS turned off/), T('tooling.test', /fails on a runtime role with BYPASSRLS/), T('tooling.test', /reports a bad config by name/)], 'Embedded Postgres only. Never met real Supabase.', ['MT-AUTH-22']),
    R('ACC-21', 'Guest result still offered for saving after every route in', 'Covered', [T('live/accounts.spec', /^(create account|password sign-in|email code|forgot password|Google: the tab keeps it)/)]),
    R('ACC-23', 'Google creates a new account only for gmail.com, googlemail.com or an hd claim', 'Covered', [T('security-regressions.test', /a new account comes from Google only/), T('security-regressions.test', /pre-hijack/), T('SignIn.test', /refused as/)]),
    R('ACC-24', 'A password reset removes linked identities, revokes devices and mails a notice', 'Covered', [T('security-regressions.test', /a password reset removes every linked identity/), T('security-regressions.test', /a reset revokes every device/), T('live/accounts.spec', /a password reset disconnects Google/)]),
    R('ACC-25', 'Change, set and reset are serialised on the user row; a change racing a reset never keeps the password', 'Covered', [T('security-regressions.test', /^finding 2/)], 'In process, against one Postgres.'),
    R('ACC-26', 'Device cookies: known devices are exempt from address caps, with their own; new devices keep the address caps', 'Covered', [T('security-regressions.test', /^finding 3/), T('live/accounts.spec', /a device that has signed in before/), T('live/security.spec', /session cookie is HttpOnly/)], 'A new device can still be locked out by an attacker on several networks.'),
    R('ACC-27', 'Hashing: per-/64 limit and bucket before hashing, a slot kept for known devices, memory capped at 64 MiB, uniform timing', 'Covered', [T('security-regressions.test', /^finding 4/)], 'In memory per instance. Timing in process, not across a network.'),
    R('ACC-28', 'login_failures and otp_codes use different address HMACs; secrets file is 0600', 'Covered', [T('security-regressions.test', /^minor items/)]),
    R('ACC-22', 'Password managers: autocomplete attributes; paste; show and hide', 'Partial', [T('live/accounts.spec', /find what they look for|paste works/), T('SignIn.test', /has the attributes/)], 'Attributes only. No real password manager has run.', ['MT-AUTH-11', 'MT-AUTH-13', 'MT-AUTH-15']),
  ] },
  { section: 'Security: sessions', rows: [
    R('SEC-SES-01', 'Opaque 256-bit token in `__Host-session`: HttpOnly, Secure, SameSite=Strict, Path=/', 'Covered', [T('sessions.test', /is __Host-session/), T('https.spec', /over real TLS/), T('live/security.spec', /session cookie is HttpOnly/)], 'Token length by reading `crypto.ts`.', ['MT-SEC-05']),
    R('SEC-SES-02', 'Plain `session` name only in development', 'Covered', [T('config.test', /plain cookie name only in development/)]),
    R('SEC-SES-03', 'Only the SHA-256 hash stored', 'Covered', [T('sessions.test', /stores only the SHA-256/)]),
    R('SEC-SES-04', '30-day sliding idle', 'Covered', [T('sessions.test', /past the idle limit/), T('sessions.test', /slides the idle window/)]),
    R('SEC-SES-05', '90-day absolute', 'Covered', [T('sessions.test', /past the absolute limit/), T('sessions.test', /does not extend the absolute/)]),
    R('SEC-SES-06', 'New token at each login', 'Covered', [T('sessions.test', /issues a new token/)]),
    R('SEC-SES-07', 'List and revoke sessions, log out everywhere', 'Covered', [T('sessions.test', /lists own sessions/), T('sessions.test', /revokes a session/), T('sessions.test', /logout-all ends/), T('live/settings.spec', /sessions: a second device/), T('live/settings.spec', /sign out on all devices/)], '', ['MT-SET-06', 'MT-SET-08']),
  ]},
  { section: 'Security: CSRF and authorisation', rows: [
    R('SEC-CSRF-01', 'SameSite=Strict, exact Origin check, required custom header on non-GET', 'Covered', [T('http.test', /^CSRF > /), T('live/security.spec', /state changes need/), T('api.test', /sends the CSRF header/)], '', ['MT-SEC-03']),
    R('SEC-AUTHZ-01', 'Every data query scoped by user; cross-user is 404', 'Covered', [T('data.test', /^cross-user access > /), T('sessions.test', /404 for another user/), T('erasure.test', /exports only your own/), T('live/authorisation.spec', /another user's result/)], '', ['MT-NAV-04', 'MT-SEC-12']),
    R('SEC-AUTHZ-02', 'Data routes return 403 `consent_required` until the current version is accepted', 'Covered', [T('data.test', /blocks assessments, journal and profile/), T('data.test', /authentication is checked before consent/), T('guards.test', /consent_required on a data route/)]),
  ]},
  { section: 'Security: encryption at rest', rows: [
    R('SEC-ENC-01', 'Per-user 256-bit data key', 'Covered', [T('encryption.test', /each user their own data key/)]),
    R('SEC-ENC-02', 'Wrapped by a versioned master key from env', 'Covered', [T('config.test', /parses a rotation ring/), T('config.test', /active key that is not in the ring/), T('encryption.test', /swapping wrapped keys/)]),
    R('SEC-ENC-03', 'AES-256-GCM with a fresh random nonce', 'Covered', [T('encryption.test', /fresh nonce/)]),
    R('SEC-ENC-04', 'AAD binds `table:rowId:userId`, so rows cannot be swapped', 'Covered', [T('encryption.test', /^AAD binds/)]),
    R('SEC-ENC-05', 'Padded to fixed sizes or steps, so length reveals nothing', 'Covered', [T('hardening.test', /^4\. ciphertext length > /)], '', ['MT-DEP-10']),
    R('SEC-ENC-06', 'Email, name, device label, assessment and journal encrypted; plaintext limited to ids, timestamps, hashes', 'Covered', [T('encryption.test', /raw SELECT/), T('encryption.test', /plaintext columns are limited/), T('sessions.test', /does not store the User-Agent/)], '', ['MT-DEP-10']),
    R('SEC-ENC-07', 'Email lookup by HMAC blind index with a separate key', 'Covered', [T('otp.test', /moves the blind index/), T('config.test', /same key used twice/)]),
    R('SEC-ENC-08', 'Deleting a user destroys the wrapped key', 'Covered', [T('erasure.test', /hard-deletes every row/)]),
    R('SEC-ENC-09', 'Master-key rotation script', 'Partial', [T('encryption.test', /^master-key rotation > /)], 'Tests the function in `src/rotate.ts`. The CLI wrapper `scripts/rotate-keys.ts` is not run by any test.', ['MT-DEP-16']),
  ]},
  { section: 'Security: database', rows: [
    R('SEC-DB-01', 'Tables in private schema `app`, not `public`', 'Covered', [T('database.test', /public holds none/), T('database.test', /PUBLIC has no access/)], 'Not run against Supabase\'s REST layer.', ['MT-DEP-04']),
    R('SEC-DB-02', 'RLS enabled with no policies, as a second wall', 'Partial', [T('database.test', /every table has RLS/), T('database.test', /RLS is a real wall/), T('database.test', /RLS hides every row/), T('database.test', /role that can bypass RLS/)], '**Deviates from the spec:** the migration adds `runtime_all` policies for the runtime role, because it has no BYPASSRLS. Other roles still see nothing. Decided in `docs/decisions/005-rls-role-scoped-policies.md`. The test named "every table has RLS enabled with no policies" asserts policies exist.', ['MT-DEP-05']),
    R('SEC-DB-03', 'Separate least-privilege runtime role, distinct from the migration role', 'Covered', [T('database.test', /^runtime role > /), T('config.test', /refuses an admin role/)], 'Not run on Supabase, whose `postgres` role differs.', ['MT-DEP-03']),
    R('SEC-DB-04', 'TLS `verify-full` with `DATABASE_CA_CERT`, mandatory in production', 'Covered', [T('tls.test', /^database TLS verify-full > /), T('database.test', /use verify-full/), T('config.test', /refuses a missing or invalid CA/), T('https.spec', /over real TLS/)], 'Real handshakes with a local CA. Not with Supabase\'s CA.', ['MT-DEP-06']),
    R('SEC-DB-05', 'Parameterised queries only', 'None', [], 'By reading: tagged templates throughout. `.unsafe` appears only in the migration runner and in dev and test setup scripts, not in request paths. No test and no lint rule enforces it.'),
    R('SEC-DB-06', 'Support the Supavisor session pooler; `prepare: false`', 'Partial', [T('database.test', /no prepared statements/)], 'The option is checked. Supavisor itself has never been used.', ['MT-DEP-03']),
  ]},
  { section: 'Security: HTTP', rows: [
    R('SEC-HTTP-01', 'Helmet strict CSP as specified, no unsafe-inline', 'Covered', [T('live/security.spec', /security headers and caching/), T('live/security.spec', /CSP blocks inline script/), T('http.test', /API-side route/)], 'On localhost and TLS terminator, not through Cloudflare.', ['MT-SEC-01', 'MT-SEC-13']),
    R('SEC-HTTP-02', 'HSTS, Referrer-Policy, Permissions-Policy, nosniff, COOP, CORP', 'Covered', [T('live/security.spec', /security headers and caching/), T('https.spec', /over real TLS/), T('http.test', /errors carry them too/)], '', ['MT-SEC-01']),
    R('SEC-HTTP-03', 'No CORS', 'Covered', [T('http.test', /CORS preflight/), T('live/security.spec', /security headers and caching/)], '', ['MT-SEC-04']),
    R('SEC-HTTP-04', '`no-store` on API; hashed assets immutable; `index.html` and `sw.js` no-cache', 'Covered', [T('http.test', /no-store/), T('http.test', /^static files > serves/), T('live/security.spec', /no-store too/), T('live/security.spec', /security headers and caching/)], '', ['MT-SEC-02']),
    R('SEC-HTTP-05', 'Body limit 64 KB', 'Covered', [T('http.test', /rejects bodies over 64 KB/)], '', ['MT-SEC-08']),
    R('SEC-HTTP-06', 'Strict zod validation rejecting unknown keys', 'Covered', [T('http.test', /unknown body keys/), T('http.test', /unknown query keys/), T('data.test', /^assessments > rejects/)]),
    R('SEC-HTTP-07', 'Errors are RFC 9457 with no internals', 'Covered', [T('http.test', /errors carry them too/), T('http.test', /malformed JSON/), T('logging.test', /answered opaquely/), T('hardening.test', /^10\. cursors/)], '', ['MT-SEC-08']),
    R('SEC-HTTP-08', 'Per-route rate limits', 'Covered', [T('otp.test', /per-IP route limit/), T('http.test', /files and the API are counted apart/), T('hardening.test', /a route limit applies/)], '', ['MT-SEC-11']),
  ]},
  { section: 'Security: logging, config, client, mail, supply chain', rows: [
    R('SEC-LOG-01', 'pino allow-list: method, route template, status, duration, request id. Never bodies, cookies, emails, IPs, query strings', 'Covered', [T('logging.test', /^logs > /), T('https.spec', /self-check line/), T('hardening.test', /logs each pattern of address headers once/)], '', ['MT-DEP-09']),
    R('SEC-LOG-02', 'Audit table: times to the day, HMAC-pseudonymised actor, for login, logout, consent, export, delete, email change', 'Covered', [T('erasure.test', /records login, logout/), T('erasure.test', /is audited/), T('erasure.test', /pseudonymous audit rows/), T('hardening.test', /stores audit times to the day/), T('hardening.test', /refuses a precise audit time/)]),
    R('SEC-CFG-01', 'Validate env at boot with zod; refuse to start if invalid', 'Covered', [T('config.test', /requires everything/), T('config.test', /names the variable/), T('config.test', /refuses PUBLIC_ORIGIN/), T('hardening.test', /refuses a header name/)], 'Tests `loadConfig`. The exit itself is manual.', ['MT-DEP-20']),
    R('SEC-CFG-02', 'Production refuses dev mail transport, missing CA, weak keys', 'Covered', [T('config.test', /refuses the dev mail transport/), T('config.test', /createMailer refuses/), T('config.test', /missing or invalid CA/), T('config.test', /refuses weak keys/), T('config.test', /refuses a weak key/)], '', ['MT-DEP-20']),
    R('SEC-CLI-01', 'Nothing sensitive in `localStorage` (theme only)', 'Covered', [T('resilience.spec', /nothing in localStorage/), T('live/guest.spec', /guest result: maximum/), T('guest.test', /writes nothing to localStorage/)], '', ['MT-SEC-05']),
    R('SEC-CLI-02', 'Query cache in memory only, cleared at logout', 'Covered', [T('live/authorisation.spec', /next person on the same tab/), T('live/authorisation.spec', /after sign-out the back button/), T('guards.test', /a 401 on a data route clears/), T('held.test', /dropped by a deliberate sign-out/)], '', ['MT-SHR-04', 'MT-SET-07']),
    R('SEC-CLI-03', 'Guest result in `sessionStorage` only', 'Covered', [T('guest.test', /resumes a check-in from sessionStorage/), T('live/guest.spec', /gone once the tab is closed/), T('CheckIn.test', /held in sessionStorage/)], '', ['MT-SHR-02', 'MT-RES-07']),
    R('SEC-CLI-04', 'Service worker never caches `/api`', 'Covered', [T('live/safety.spec', /service worker never serves/), T('resilience.spec', /stores nothing from \/api/)]),
    R('SEC-CLI-05', 'No `dangerouslySetInnerHTML`', 'None', [], 'Source search on 2026-11-06 found none. No test or lint rule prevents one being added. The CSP is a backstop.'),
    R('SEC-MAIL-01', 'SMTP via nodemailer, any provider', 'Partial', [T('https.spec', /over real TLS/), T('config.test', /accepts a complete setup/)], 'nodemailer talks required STARTTLS to a local stub. No real SMTP provider, ever.', ['MT-MAIL-01', 'MT-MAIL-02']),
    R('SEC-MAIL-02', 'Neutral subject and body, code in body only, no mention of anxiety or health', 'Covered', [T('otp.test', /is neutral/), T('hardening.test', /no subject or body/), T('hardening.test', /production refuses a sender/), T('https.spec', /over real TLS/)], 'What a lock screen actually shows is manual.', ['MT-MAIL-03', 'MT-MAIL-04']),
    R('SEC-MAIL-03', 'Transports: `smtp`, and `file:` for dev and e2e only', 'Covered', [T('config.test', /refuses the dev mail transport/), T('purge.test', /^file mail transport > /)]),
    R('SEC-SUP-01', 'Lockfile, `npm audit` clean', 'None', [], 'A CI step, not a test. `npm ci` and `npm audit` are in `ci.yml`, which has never run.', ['MT-SEC-14', 'MT-DEP-17']),
    R('SEC-SUP-02', 'Dependabot, CodeQL, CI gates, secret scanning guidance, exact-pinned Actions', 'None', [], 'Config exists (`.github/`, pinned by SHA). GitHub Actions has never run. Secret scanning is a repository setting.', ['MT-DEP-17']),
    R('SEC-SUP-03', 'Deploy config safety (no lifecycle scripts, checks pass first, client header, no migration credential)', 'Covered', [T('hardening.test', /^deploy config > /)], 'Reads `render.yaml`. Render has not run it.', ['MT-DEP-13']),
  ]},
  { section: 'Privacy', rows: [
    R('PRI-01', 'Plain-language notice before consent', 'Partial', [T('live/auth.spec', /^sign-up: email, code/), T('live/a11y.spec', /signed-in screens/)], 'The screen appearing is tested. Whether the words are plain, and legally enough, is a human call.', ['MT-CON-01', 'MT-CLN-09']),
    R('PRI-02', '18+ self-declaration and explicit health-data consent, versioned and timestamped', 'Covered', [T('data.test', /requires all three/), T('data.test', /records the versioned/), T('guards.test', /walks email, code and consent/)], '', ['MT-CON-01', 'MT-CON-02']),
    R('PRI-03', 'Re-prompt on version change', 'Covered', [T('data.test', /re-prompts when the version/), T('data.test', /out of date keeps every right/), T('Consent.test', /^re-prompt > /), T('Home.test', /out of date to the prompt/), T('live/consent.spec', /^re-prompt: /), T('purge.test', /merely out of date/)], 'Live, by making one account\'s accepted version old in the database. A real bumped build has not been deployed. Whether the words are clear is human.', ['MT-CON-04', 'MT-CON-05', 'MT-CON-06']),
    R('PRI-04', 'Consent gate after first code, so sign-up and sign-in look identical', 'Covered', [T('otp.test', /does not create an account/), T('live/auth.spec', /^sign-up: email, code/), T('live/auth.spec', /signing in again skips consent/)]),
    R('PRI-05', 'Unconsented accounts purged after 24h', 'Covered', [T('purge.test', /never consented after 24h/), T('live/auth.spec', /declining consent/)], '', ['MT-CON-03', 'MT-DEP-11']),
    R('PRI-06', 'View and correct in the UI', 'Covered', [T('live/settings.spec', /^rename/), T('data.test', /^profile > /), T('live/settings.spec', /email change needs/)], '', ['MT-SET-02', 'MT-SET-03']),
    R('PRI-07', 'Download all data as JSON', 'Covered', [T('erasure.test', /downloads all decrypted data/), T('live/settings.spec', /the download contains/), T('api.test', /^file downloads > /), T('hardening.test', /export filename is neutral/)], 'File contents against the whole app, and iOS downloads, are manual.', ['MT-SET-09', 'MT-SET-10']),
    R('PRI-08', 'Delete account now: fresh OTP, rows hard-deleted at once, no grace period', 'Covered', [T('erasure.test', /needs a fresh code/), T('erasure.test', /hard-deletes every row/), T('erasure.test', /brand-new, empty account/), T('live/settings.spec', /deleting the account needs a code/), T('otp.test', /a login code cannot confirm/)], '', ['MT-SET-12', 'MT-SET-13', 'MT-DEP-12']),
    R('PRI-09', 'Encrypted backups age out within the stated retention; deletion withdraws consent', 'Partial', [T('hardening.test', /publishes the backup retention/)], 'The app states the number. Whether Supabase\'s backups match is not testable here.', ['MT-DEP-14', 'MT-DEP-15']),
    R('PRI-10', 'Data minimised: email and optional display name only', 'Partial', [T('encryption.test', /plaintext columns are limited/), T('sessions.test', /does not store the User-Agent/)], 'No test asserts the absence of age, gender or occupation. By reading `001_init.sql` and the copy.', ['MT-SET-10']),
    R('PRI-11', 'Scheduled purge of expired sessions, codes and unconsented accounts', 'Covered', [T('purge.test', /^purge > removes/), T('purge.test', /keeps a live OTP/), T('purge.test', /is idempotent/), T('purge.test', /^retention timing > /)], 'The schedule is tested on fake timers. That a real instance stays up to run it is manual.', ['MT-DEP-11']),
    R('PRI-12', 'Audit retention one year', 'Covered', [T('purge.test', /audit rows older than a year/)]),
    R('PRI-13', 'Privacy and Terms pages with operator name and grievance contact from config', 'Partial', [T('http.test', /returns the public config/), T('hardening.test', /publishes where data is stored/), T('resilience.spec', /Help and tools work offline/), T('live/a11y.spec', /guest screens/)], 'Meta is tested, and the pages pass axe. No test reads the operator name on the page.', ['MT-SET-16']),
    R('PRI-14', 'Drafted from what the app really does, marked for legal review', 'None', [], 'A human review. Has not happened.', ['MT-CLN-09']),
  ]},
  { section: 'Clinical safety', rows: [
    R('CLN-01', 'Exact GAD-7 wording and cut points from `shared`', 'Covered', [T('gad7.test', /seven published items/), T('gad7.test', /at the published cut points/), T('gad7.test', /bands cover/), T('CheckIn.test', /exact shared wording/)], 'Tests pin the text to itself. Comparing with the published instrument is manual.', ['MT-CLN-01']),
    R('CLN-02', 'The server computes the score', 'Covered', [T('data.test', /computes the score and severity/), T('data.test', /refuses client-supplied/), T('gad7.test', /rejects a client-supplied score/)]),
    R('CLN-03', 'Never "diagnosis", always "screening"', 'Partial', [T('live/guest.spec', /^guest result: /), T('CheckIn.test', /reaches a scored result/)], 'The disclaimer\'s presence is tested. Nothing tests the absence of diagnostic wording across all copy.', ['MT-CLN-04']),
    R('CLN-04', '10+ recommends a professional', 'Covered', [T('CheckIn.test', /10 and over recommends/), T('gad7.test', /recommends a professional/), T('live/guest.spec', /bottom of moderate/)], '', ['MT-RES-03', 'MT-CLN-05']),
    R('CLN-05', 'Severe shows support prominently but calmly', 'Partial', [T('CheckIn.test', /severe: helpline call first/), T('live/guest.spec', /bottom of severe/)], '"Calmly" and "prominently" are for a clinician.', ['MT-RES-04', 'MT-CLN-03']),
    R('CLN-06', 'Prominent wording that the GAD-7 doesn\'t ask about self-harm', 'Partial', [T('CheckIn.test', /severe: helpline call first/)], 'Asserted for severe. The line at lower bands has no direct test.', ['MT-RES-01', 'MT-CLN-03']),
    R('CLN-07', 'Persistent "Get help" on every screen, including during the check-in', 'Covered', [T('Shell.test', /shows "Get help"/), T('live/safety.spec', /Get help is on every guest route/), T('live/safety.spec', /Get help is there mid check-in/), T('live/safety.spec', /Get help is on every signed-in route/), T('Shell.test', /chunk failed/), T('resilience.spec', /chunk that fails/)], '', ['MT-CHK-06', 'MT-NAV-02']),
    R('CLN-08', 'Helplines are `tel:` links, one tap', 'Partial', [T('gad7.test', /every helpline has a dialable/), T('live/safety.spec', /Get help is on every guest route/), T('guards.test', /tel links first/)], '**The `href` is all that is proved. No call has been placed. No number has been confirmed by phone, and the app now says so.**', ['MT-HELP-01', 'MT-HELP-02', 'MT-HELP-03', 'MT-HELP-04', 'MT-HELP-05', 'MT-HELP-06', 'MT-HELP-09']),
    R('CLN-09', 'Helplines work offline', 'Covered', [T('live/safety.spec', /Help works offline/), T('resilience.spec', /Help and tools work offline/), T('resilience.spec', /static first paint/)], 'A browser offline switch. Real airplane mode is manual.', ['MT-OFF-01', 'MT-OFF-02', 'MT-HELP-12']),
    R('CLN-10', 'Attribution displayed', 'Covered', [T('CheckIn.test', /reaches a scored result/)], '', ['MT-RES-13', 'MT-CLN-01']),
    R('CLN-11', 'Breathing tools warn to stop if dizzy', 'None', [], 'No test mentions it. Present in source at setup and during the session.', ['MT-TOL-01', 'MT-CLN-06']),
  ]},
  { section: 'Product', rows: [
    R('PRD-01', 'Works without an account: check-in with result, tools, help, legal', 'Covered', [T('live/guest.spec', /^guest result: /), T('live/safety.spec', /Get help is on every guest route/), T('guards.test', /Help needs no login/)], '', ['MT-DEV-01']),
    R('PRD-02', 'Guest result offered for saving after sign-in', 'Covered', [T('live/results.spec', /offered after sign-in/), T('CheckIn.test', /offers a guest sign-in/), T('CheckIn.test', /after sign-in, saving posts/), T('live/results.spec', /takenAt is honoured/), T('live/results.spec', /too old to save/)], '', ['MT-RES-08', 'MT-RES-10']),
    R('PRD-03', 'Home: greeting, last result, next check-in date (14 days), quick links', 'Partial', [T('live/results.spec', /Home shows the next check-in date/), T('misc.test', /is 14 days after/), T('live/settings.spec', /^rename: greeted/), T('audit.spec', /^home-account (light|dark)$/)], 'The "due" state and quick-link destinations have no direct test.', ['MT-TRD-06', 'MT-TRD-07']),
    R('PRD-04', 'Check-in: one item per screen, auto-advance with back', 'Covered', [T('CheckIn.test', /shows every GAD-7 item/), T('CheckIn.test', /back returns to the previous/), T('live/navigation.spec', /back and forward walk through the check-in/)], '', ['MT-CHK-01', 'MT-CHK-03']),
    R('PRD-05', 'Check-in: large tap targets, progress', 'None', [], 'Progress is not asserted. Targets only by axe `target-size` (24px).', ['MT-CHK-01', 'MT-DEV-10']),
    R('PRD-06', 'Check-in: resume in-session', 'Covered', [T('CheckIn.test', /resumes where you left off/), T('guest.test', /resumes a check-in/), T('live/guest.spec', /resume a check-in after a refresh/)], '', ['MT-CHK-05']),
    R('PRD-07', 'Difficulty item when any symptom was reported', 'Covered', [T('CheckIn.test', /skips the difficulty item/), T('guest.test', /needs the difficulty item/), T('gad7.test', /requires difficulty/), T('live/guest.spec', /all zero skips/)], '', ['MT-CHK-07']),
    R('PRD-08', 'Result: score, severity, plain meaning, next steps', 'Covered', [T('live/guest.spec', /^guest result: /), T('CheckIn.test', /10 and over recommends/)], '', ['MT-RES-01', 'MT-RES-02', 'MT-RES-03', 'MT-RES-04']),
    R('PRD-09', 'Result: difficulty shown', 'None', [], 'Stored and sent are tested. The sentence on the result screen is not.', ['MT-RES-02']),
    R('PRD-10', 'Result: save prompt', 'Covered', [T('CheckIn.test', /offers a guest sign-in/), T('live/results.spec', /offered after sign-in/), T('live/failures.spec', /server error on a signed-in check-in/)], '', ['MT-RES-08', 'MT-RES-09']),
    R('PRD-11', 'Result: doctor-friendly print view', 'Partial', [T('audit.spec', /print view of a result/)], 'Print media emulated. Print button, real PDF and paper are manual.', ['MT-PRN-01', 'MT-PRN-02', 'MT-PRN-03', 'MT-PRN-04']),
    R('PRD-12', 'Tools: paced breathing 4-6 default, box, 4-7-8', 'Partial', [T('misc.test', /^breathing rhythm > /), T('resilience.spec', /reduced motion/), T('audit.spec', /^breathe-(setup|in|out) /)], 'Timing logic and rendering are tested. Selecting rhythm and length, «Stop» and the end screen are not. Is "visual" right? Manual.', ['MT-TOL-01', 'MT-TOL-02', 'MT-TOL-03']),
    R('PRD-13', 'Tools: optional haptic', 'None', [], 'No test. Emulation has no vibration.', ['MT-TOL-04']),
    R('PRD-14', 'Tools: 5-4-3-2-1 grounding guided steps', 'Partial', [T('audit.spec', /^ground (light|dark)$/), T('resilience.spec', /Help and tools work offline/)], 'First step loads and passes axe. No test walks the steps.', ['MT-TOL-15', 'MT-TOL-16']),
    R('PRD-15', 'Tools: soundscapes by Web Audio, no audio downloads, no CSP change', 'Partial', [T('audit.spec', /^sounds (light|dark)$/), T('sound.test', /^soundscapes > /), T('Sounds.test', /^Sounds screen > /), T('live/keyboard.spec', /sounds start and stop/)], 'Start, stop, hide and unmount close the `AudioContext` without errors, on mocked Web Audio. **Nobody has listened, and no test hears anything.**', ['MT-TOL-08', 'MT-TOL-09', 'MT-TOL-10', 'MT-TOL-11', 'MT-TOL-12']),
    R('PRD-16', 'Tools: thought record', 'Covered', [T('JournalForm.test', /walks all five steps/), T('live/journal.spec', /through all five steps/)], '', ['MT-JRN-01']),
    R('PRD-17', 'Journal: CBT thought records, create, edit, delete, encrypted', 'Covered', [T('data.test', /^journal > /), T('live/journal.spec', /^(editing|deleting|a thought record)/), T('encryption.test', /raw SELECT/), T('JournalForm.test', /^thought record form > /)], '', ['MT-JRN-01', 'MT-JRN-07', 'MT-JRN-08']),
    R('PRD-18', 'Trends: accessible SVG chart with table alternative', 'Covered', [T('TrendChart.test', /^TrendChart > /), T('live/a11y.spec', /signed-in screens/), T('live/results.spec', /trends: list, chart, table/)], 'What a screen reader says is manual.', ['MT-TRD-02', 'MT-ACC-10']),
    R('PRD-19', 'Trends: history list, delete an entry', 'Covered', [T('live/results.spec', /trends: list, chart, table/), T('live/results.spec', /deleting from the result screen/), T('data.test', /gets and deletes one/)], '', ['MT-TRD-03', 'MT-RES-11']),
    R('PRD-20', 'Help: helplines, emergency 112, offline-capable, no login', 'Covered', [T('guards.test', /Help needs no login/), T('live/safety.spec', /Help works offline/), T('resilience.spec', /Help and tools work offline/)], '', ['MT-HELP-16']),
    R('PRD-21', 'Help: no animation', 'None', [], 'By reading `Help.tsx`.', ['MT-HELP-16']),
    R('PRD-22', 'Settings: name, email change to both addresses', 'Covered', [T('live/settings.spec', /^rename/), T('live/settings.spec', /email change needs/), T('hardening.test', /^1\. email change needs both inboxes > /), T('otp.test', /^Email change > /)], '', ['MT-SET-02', 'MT-SET-03', 'MT-SET-04']),
    R('PRD-23', 'Settings: sessions, theme, download, delete, legal', 'Partial', [T('live/settings.spec', /^sessions:/), T('resilience.spec', /nothing in localStorage/), T('live/settings.spec', /the download contains/), T('live/settings.spec', /deleting the account needs/)], 'Legal links only checked by loading their routes. Theme persistence and "Phone setting" are not tested.', ['MT-SET-15', 'MT-SET-16']),
  ]},
  { section: 'UX standards', rows: [
    R('UX-01', 'No horizontal scroll at 320-430px', 'Covered', [T('audit.spec', /^(home-first-run|help|settings-account) (light|dark)$/), T('live/a11y.spec', /axe and 320px/)], 'In emulated viewports. Real phones and large fonts are manual.', ['MT-DEV-03', 'MT-ACC-12']),
    R('UX-02', 'Desktop is a centred, comfortable layout', 'None', [], 'No test runs at desktop width.', ['MT-DEV-05']),
    R('UX-03', 'Bottom tab bar', 'Covered', [T('live/navigation.spec', /walk through the tabs/), T('audit.spec', /touch target/)], '', ['MT-NAV-01']),
    R('UX-04', 'Safe-area insets, `dvh`, thumb reach', 'None', [], 'Need a real notch and real browser toolbars.', ['MT-DEV-08', 'MT-DEV-09', 'MT-DEV-10']),
    R('UX-05', 'Targets at least 44px', 'Partial', [T('audit.spec', /touch target/)], 'Header and tab bar only. Elsewhere only axe `target-size`, which is 24px.', ['MT-DEV-10']),
    R('UX-06', '`inputmode="numeric"`, `autocomplete="one-time-code"`', 'Covered', [T('OtpInput.test', /mobile keyboards and one-time-code/), T('OtpInput.test', /paste/)], 'Attributes only. Real autofill is manual.', ['MT-MAIL-05', 'MT-MAIL-06', 'MT-MAIL-07']),
    R('UX-07', 'WCAG 2.2 AA: keyboard', 'Partial', [T('live/keyboard.spec', /^(skip link|sign-in and consent|check-in with arrow|a sheet takes focus|theme options|a focused control)/), T('CheckIn.test', /arrow keys move/), T('Settings.test', /^theme options > /)], 'Skip link, sign-in, consent, check-in, one sheet, theme, Settings tab order and focus not obscured, by script. Journal, Trends and other sheets are not walked. No person has used it.', ['MT-ACC-18']),
    R('UX-08', 'WCAG 2.2 AA: focus management on route change', 'Covered', [T('live/keyboard.spec', /moving between screens/), T('live/keyboard.spec', /check-in with arrow/), T('live/keyboard.spec', /a sheet takes focus/)], 'Where focus lands. What a screen reader then says is manual.', ['MT-ACC-03', 'MT-ACC-04', 'MT-ACC-18']),
    R('UX-09', 'WCAG 2.2 AA: labels and contrast', 'Partial', [T('audit.spec', /^(home-first-run|help|result-severe|settings-account) (light|dark)$/), T('live/a11y.spec', /axe and 320px/)], 'Axe, with only serious and critical failing the test. See `docs/ACCESSIBILITY.md`.', ['MT-ACC-14']),
    R('UX-10', 'WCAG 2.2 AA: live regions', 'Partial', [T('Shell.test', /announces being offline/), T('resilience.spec', /reduced motion/)], 'Presence of role. Nothing listens.', ['MT-ACC-05', 'MT-ACC-07']),
    R('UX-11', 'WCAG 2.2 AA: reduced motion', 'Covered', [T('resilience.spec', /reduced motion/)], 'Breathing only.', ['MT-ACC-16']),
    R('UX-12', 'WCAG 2.2 AA: no information by colour alone', 'Partial', [T('TrendChart.test', /never colour alone/)], 'Chart only.', ['MT-ACC-17', 'MT-RES-05']),
    R('UX-13', 'Light and dark', 'Covered', [T('audit.spec', /^(home-first-run|result-severe) (light|dark)$/), T('live/a11y.spec', /axe and 320px/)], 'Contrast rules. How it looks is manual.', ['MT-ACC-14', 'MT-SET-15']),
    R('UX-14', 'Skeletons, empty, error, offline states', 'Covered', [T('audit.spec', /^(trends-empty|journal-empty|home-account-empty) (light|dark)$/), T('live/failures.spec', /server error loading the journal/), T('guards.test', /offline state/), T('live/failures.spec', /a slow signed-in check-in/)], 'Skeletons are only waited for.', ['MT-OFF-05', 'MT-NAV-07']),
    R('UX-15', 'Error boundary, 404', 'Partial', [T('Shell.test', /chunk failed/), T('resilience.spec', /chunk that fails/), T('audit.spec', /^not-found /), T('live/authorisation.spec', /malformed ids/)], '`RouteError` is tested. `RootError` is not.', ['MT-NAV-03', 'MT-NAV-09']),
    R('UX-16', 'Code-split routes, real URLs, working back button', 'Covered', [T('live/navigation.spec', /back and forward/), T('live/navigation.spec', /back from Home/), T('resilience.spec', /chunk that fails/), T('guards.test', /remembering where they were going/)], '', ['MT-NAV-01', 'MT-NAV-05']),
    R('UX-17', 'Self-hosted fonts; no remote hosts', 'Covered', [T('live/security.spec', /names another host/)], 'The fixture also fails any live test that requests another host.', ['MT-SEC-10']),
    R('UX-18', 'Installable PWA with real icons', 'Partial', [T('audit.spec', /not locked to one orientation/), T('audit.spec', /^landscape 568x320/), T('live/landscape.spec', /small phone on its side/)], 'The manifest is read, and layouts fit 568x320. Nothing installs it, and icons are not checked.', ['MT-PWA-01', 'MT-PWA-02', 'MT-PWA-03', 'MT-DEV-07']),
    R('UX-19', 'Budget: initial JS under 170 KB gzipped', 'Covered', [T('live/compression.spec', /initial JS on the wire/), T('http.test', /^precompressed static files > /)], 'Bytes served over real HTTP on localhost. Through Render\'s edge is manual.', ['MT-DEP-19']),
    R('UX-20', 'Warm and human', 'None', [], 'A human judgement.', ['MT-CLN-10']),
  ]},
  { section: 'Testing requirements', rows: [
    R('TST-01', 'Vitest for logic and components', 'Covered', [T('gad7.test', /sums answers/), T('guest.test', /uses the shared scoring/), T('OtpInput.test', /cleans codes/)]),
    R('TST-02', 'API integration on real Postgres (`embedded-postgres`)', 'Covered', [T('database.test', /migration runner/)], 'All API suites but `config.test.ts` use it.'),
    R('TST-03', 'Covers cross-user access, OTP limits and expiry, enumeration resistance', 'Covered', [T('data.test', /^cross-user access > /), T('otp.test', /^OTP request > /), T('otp.test', /^OTP verify > /)]),
    R('TST-04', 'Covers CSRF, encryption at rest (raw SELECT shows no plaintext)', 'Covered', [T('http.test', /^CSRF > /), T('encryption.test', /raw SELECT/)]),
    R('TST-05', 'Covers export, deletion, consent gate, headers', 'Covered', [T('erasure.test', /^export > /), T('erasure.test', /^account deletion > /), T('data.test', /^consent gate > /), T('http.test', /^headers > /)]),
    R('TST-06', 'Playwright e2e on iPhone (WebKit) and Android (Chromium)', 'Partial', [T('live/auth.spec', /^sign-up/), T('https.spec', /over real TLS/)], 'Emulated: iPhone 14 viewport on desktop WebKit, Pixel 7 viewport on desktop Chromium. Not phones.', ['MT-DEV-01', 'MT-DEV-02']),
    R('TST-07', 'With axe, overflow checks at 320-430px, CSP-violation check', 'Covered', [T('audit.spec', /^(home-first-run|help) (light|dark)$/), T('live/a11y.spec', /axe and 320px/), T('live/security.spec', /CSP blocks inline/)], 'Overflow now also checked at 568x320.'),
    R('TST-08', 'Offline Help page', 'Covered', [T('live/safety.spec', /Help works offline/)], '', ['MT-OFF-01']),
  ]},
  { section: 'Non-goals the spec names as failures', rows: [
    R('NG-01', 'A person in distress cannot reach a helpline in one tap', 'Partial', [T('live/safety.spec', /Get help is on every guest route/)], 'Same limit as CLN-08.', ['MT-HELP-02', 'MT-ACC-23']),
    R('NG-02', 'Data leaks across users', 'Covered', [T('data.test', /^cross-user access > /), T('live/authorisation.spec', /next person on the same tab/), T('live/failures.spec', /someone else signing in never sees it/), T('held.test', /wipes it when someone else/)], '', ['MT-SHR-04', 'MT-JRN-11', 'MT-SEC-12']),
    R('NG-03', 'No third-party analytics, trackers, CDNs or remote fonts', 'Covered', [T('live/security.spec', /names another host/)], '', ['MT-SEC-10']),
    R('NG-04', 'No diagnosis, AI advice, invented statistics, or gamification', 'None', [], 'A copy review.', ['MT-CLN-04']),
    R('NG-05', 'Under-18s not served', 'Partial', [T('data.test', /requires all three/)], 'A self-declaration can only be checked for being required.', ['MT-CON-02']),
  ]},
  // docs/superpowers/specs/2026-11-11-safety-and-tracking-design.md
  { section: 'Safety and tracking (2026-11-11 spec)', rows: [
    R('ST-QX-01', 'Quick exit on every screen, signed in or not, mid check-in and on Help, next to Get help, keyboard reachable', 'Covered', [T('Shell.test', /quick exit next to "Get help"/), T('live/quick-exit.spec', /from every guest screen/), T('live/quick-exit.spec', /from every signed-in screen/), T('live/quick-exit.spec', /reachable by keyboard/)], '', ['MT-QX-01', 'MT-QX-02', 'MT-QX-03', 'MT-QX-10']),
    R('ST-QX-02', 'Replaces the history entry first, clears query cache, drafts and form text, attempts no sign-out', 'Covered', [T('quick-exit.test', /replaces the current history entry/), T('quick-exit.test', /clears the query cache/), T('quick-exit.test', /asks nothing of the network/), T('live/quick-exit.spec', /mid check-in/), T('live/quick-exit.spec', /gone from the screen before/)], 'The query cache is checked in a unit test: a page that has navigated away has no cache to inspect.', ['MT-QX-04', 'MT-QX-09']),
    R('ST-QX-03', 'Escape three times within 1.5 s, except while typing', 'Covered', [T('quick-exit.test', /^Escape three times > /), T('Shell.test', /Escape three times/), T('live/quick-exit.spec', /Escape three times exits/)], '', ['MT-QX-07']),
    R('ST-QX-04', 'Never blocked by modals, unsaved-change prompts, the service worker or the network; works offline', 'Covered', [T('Shell.test', /inside every open sheet/), T('live/quick-exit.spec', /not blocked by an open sheet/), T('live/quick-exit.spec', /not held back by an unsaved draft/), T('live/quick-exit.spec', /offline, the app still leaves/)], '', ['MT-QX-05', 'MT-QX-06']),
    R('ST-QX-05', '"About quick exit" on Help says what it does and does not do', 'Covered', [T('Legal.test', /Help explains quick exit/)], 'Wording needs clinician and safety review.'),
    R('ST-SP-01', 'Seven Stanley-Brown sections in order, all optional, examples as hints only, helplines prefilled', 'Covered', [T('tracking.test', /follows the Stanley-Brown order/), T('SafetyPlan.test', /example as a hint/), T('SafetyPlan.test', /always lists 112/)], 'Copy needs clinician review: docs/CLINICAL-SAFETY.md.'),
    R('ST-SP-02', 'Signed-in plan on the server, sealed like the journal, one per account', 'Covered', [T('api/test/tracking.test', /is 404 until saved/), T('api/test/tracking.test', /16 KB size steps/), T('api/test/tracking.test', /moved to another person/), T('encryption.test', /raw SELECT of every table/)], ''),
    R('ST-SP-03', 'Offline copy: non-extractable WebCrypto key and ciphertext in IndexedDB, nothing readable in any browser storage', 'Covered', [T('vault.test', /holds nothing readable/), T('vault.test', /cannot be exported/), T('live/safety-plan.spec', /opens offline after one load/), T('live/safety-plan.spec', /a guest makes a plan/)], '', ['MT-SP-01', 'MT-SP-02', 'MT-SP-07']),
    R('ST-SP-04', 'Cleared on sign-out, account deletion and another account signing in', 'Covered', [T('session-vault.test', /^the device copy follows the session > /), T('vault.test', /another account's sign-in removes it/), T('live/safety-plan.spec', /signing out removes the device copy/), T('live/safety-plan.spec', /second account on the same device/)], '', ['MT-SP-04', 'MT-SP-05']),
    R('ST-SP-05', 'Guests keep a device-only plan after a notice, can delete it, and can move it to an account after sign-in', 'Covered', [T('SafetyPlan.test', /guest is told in one line/), T('SafetyPlan.test', /delete the device copy/), T('SafetyPlan.test', /offers to move a guest plan/), T('live/safety-plan.spec', /guest plan moves to the account/)], '', ['MT-SP-06']),
    R('ST-SP-06', 'One-tap tel: links for people and professionals; print view', 'Covered', [T('SafetyPlan.test', /one-tap call buttons/), T('audit.spec', /print view of the safety plan/)], 'A real dial needs a real phone.', ['MT-SP-03', 'MT-SP-08', 'MT-SP-09']),
    R('ST-SP-07', 'Bounds: 10 items of 200, contacts 80 and 20 from [0-9 +()-]', 'Covered', [T('tracking.test', /bounds lists at 10 items/), T('api/test/tracking.test', /validates bounds/)], ''),
    R('ST-MD-01', '1 to 5 in words, optional note of 280, one per local day, same-day update, no future, at most 366 back', 'Covered', [T('tracking.test', /five levels in words/), T('MoodCard.test', /saves today by the phone/), T('api/test/tracking.test', /refuses future days/), T('MoodLog.test', /never a future day/), T('live/mood.spec', /logs today from Home/)], '', ['MT-SP-12']),
    R('ST-MD-02', 'Gentle Home card, no streaks or nagging', 'Covered', [T('MoodCard.test', /no streaks or reminders/), T('MoodLog.test', /never scolds/)], ''),
    R('ST-MD-03', 'Separate chart and table, labelled not a test score, never on the GAD-7 axis', 'Covered', [T('MoodChart.test', /^MoodChart > /), T('Trends.test', /own chart/), T('live/mood.spec', /logs today from Home/)], ''),
    R('ST-MD-04', 'Rating and note sealed, date plain; in export and erasure', 'Covered', [T('api/test/tracking.test', /same size/), T('api/test/tracking.test', /between two days/), T('erasure.test', /downloads all decrypted data/), T('erasure.test', /hard-deletes every row/)], ''),
    R('ST-RP-01', 'Report: period and opt-in sections with the right defaults, name optional, footer', 'Covered', [T('Report.test', /by default/), T('Report.test', /sections on and off/), T('Report.test', /period limits/), T('live/report.spec', /sections on and off/)], ''),
    R('ST-RP-02', 'Built in the browser, printed by the browser, A4 black on white, a page per section', 'Covered', [T('Report.test', /no server PDF/), T('audit.spec', /print view of the doctor report/), T('live/report.spec', /own stylesheet/)], 'A real A4 PDF from a phone is a manual check.', ['MT-SP-10', 'MT-SP-11']),
    R('ST-API-01', 'Moods and safety-plan endpoints: auth, consent, cross-user 404, bounds, per-user limit', 'Covered', [T('api/test/tracking.test', /^access > /), T('api/test/tracking.test', /validates the range/)], ''),
    R('ST-UX-01', 'Every new screen: axe, 320px, landscape, no CSP violations', 'Covered', [T('audit.spec', /^(safety-plan|mood-log|report|trends-mood)/), T('live/a11y.spec', /mood log, safety plan and report/), T('live/landscape.spec', /fit a small phone on its side/)], ''),
  ]},
  // docs/superpowers/specs/2026-11-11-reflections-design.md
  { section: 'Reflections (2026-11-11 spec)', rows: [
    R('RF-01', 'Start screen: "What would you like to do?", GAD-7 or Reflection, for guests and accounts, Get help and Quick exit visible', 'Covered', [T('Reflection.test', /asks what you would like to do/), T('live/reflection.spec', /offers both/)], '', ['MT-RF-01']),
    R('RF-02', 'The GAD-7 wording and order unchanged; the GAD-7 path unchanged', 'Covered', [T('questions.test', /byte for byte/), T('Reflection.test', /leads to the same check-in/), T('live/reflection.spec', /GAD-7 path is as it was/)], '', ['MT-RF-01']),
    R('RF-03', 'One catalogue with GAD-7 and 100 reflections told apart by type; migration equals the shared file', 'Covered', [T('questions.test', /exactly 100 reflections/), T('questions.test', /unique ids/), T('reflections.test', /seeds exactly the shared catalogue/)], ''),
    R('RF-04', 'Released questions immutable (wording, type, theme, position): trigger refuses changes and deletion; snapshot pins them; runtime role reads only', 'Covered', [T('reflections.test', /refuses to change wording/), T('released-questions.test', /keep their type, theme/), T('reflections.test', /read it and nothing more/), T('reflections.test', /RLS on/)], ''),
    R('RF-05', 'db:verify and the boot check refuse a live table that differs', 'Covered', [T('reflections.test', /boot check passes/), T('reflections.test', /refuses to start/), T('tooling.test', /fails on a question/)], ''),
    R('RF-06', 'GAD-7 answers stay 7 numbers, position i is GAD7-(i+1); no data migration', 'Covered', [T('reflections.test', /GAD-7 answers are stored as before/)], ''),
    R('RF-07', 'Bank style and exclusions: 20 per theme, at most 90 characters, banned words, no GAD-7 paraphrase, polarity', 'Partial', [T('questions.test', /short, plain/), T('questions.test', /clinical pathway/), T('questions.test', /which way each theme reads/)], 'Word lists, not an expert review. Every question needs clinician review.', ['MT-RF-06']),
    R('RF-08', 'Picker: 5 distinct, one per theme, crypto random, not from the last 3, active only', 'Covered', [T('questions.test', /^picking a reflection > /), T('Reflection.test', /second reflection asks different/), T('Reflection.test', /last three saved reflections/), T('live/reflection.spec', /second reflection uses different/)], '', ['MT-RF-02']),
    R('RF-09', 'Result: no score, plain summary read by polarity, matched suggestions, "not a test or a diagnosis"', 'Covered', [T('questions.test', /^the reflection summary > /), T('Reflection.test', /result with no score/), T('live/reflection.spec', /unscored result/)], '', ['MT-RF-02']),
    R('RF-10', 'A brings_help answer of 2 or more brings Get help forward, calmly', 'Covered', [T('questions.test', /about eight strain questions/), T('Reflection.test', /brings Get help forward/), T('live/reflection.spec', /brings Get help forward/)], 'Wording needs clinician review.', ['MT-RF-03']),
    R('RF-11', 'Accounts save automatically; guests save after signing in; held across a session ending', 'Covered', [T('Reflection.test', /saves automatically/), T('Reflection.test', /after signing in/), T('reflection-store.test', /held for its owner/), T('live/reflection.spec', /saved after signing in/)], '', ['MT-RF-04', 'MT-RF-05']),
    R('RF-12', 'API: auth, consent, cross-user 404, idempotency, refusals that echo nothing, per-user limit', 'Covered', [T('reflections.test', /^reflections: access > /), T('reflections.test', /replays it by clientRequestId/), T('reflections.test', /refuses unknown, inactive and GAD-7 ids/)], ''),
    R('RF-13', 'Encrypted at rest with AAD, ids and notes not visible, same size, swap fails', 'Covered', [T('reflections.test', /^reflections: at rest > /), T('encryption.test', /raw SELECT of every table/)], ''),
    R('RF-14', 'History, Trends theme count (not a score) and the doctor report section, off by default', 'Covered', [T('Trends.test', /lists reflections by date/), T('Report.test', /Reflections section/), T('live/reflection.spec', /appears in history/)], '', ['MT-RF-04']),
    R('RF-15', 'Export with question text resolved, and erasure; consent bumped with the notice', 'Covered', [T('erasure.test', /downloads all decrypted data/), T('erasure.test', /hard-deletes every row/), T('gad7.test', /adds reflections to the notice/), T('Legal.test', /covers reflections/)], 'Notice text needs legal review.'),
    R('RF-16', 'Every reflection screen: axe, 320px, landscape, no CSP violations', 'Covered', [T('audit.spec', /^(checkin-choice|reflection-)/), T('live/reflection.spec', /axe and 320px/), T('live/landscape.spec', /fit a small phone on its side/)], ''),
  ]},
];

// ── Rendering ─────────────────────────────────────────────────────────

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (s) => `\`${s}\``;
const PROJECTS = ['iphone', 'pixel', 'live-iphone', 'live-pixel', 'https-iphone', 'https-pixel'];
const COLLAPSE_OVER = 8;

function resolve(req, tests) {
  const hits = new Set();
  for (const { file, pattern } of req.tests) {
    const found = tests.filter((t) => t.file.includes(file) && pattern.test(t.name));
    if (found.length === 0) throw new Error(`${req.id}: no test matches ${file} ${pattern}`);
    found.forEach((t) => hits.add(t));
  }
  return [...hits];
}

function renderIds(found) {
  if (found.length === 0) return 'None';
  const byFile = new Map();
  for (const t of found) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
  return [...byFile.values()]
    .map((list) => (list.length > COLLAPSE_OVER
      ? `${list.slice(0, 3).map((t) => t.id).join(', ')} and ${list.length - 3} more in ${list[0].file.split('/').pop()}`
      : list.map((t) => t.id).join(', ')))
    .join('; ');
}

function checkManual(all) {
  if (!existsSync(MANUAL)) throw new Error(`${relative(ROOT, MANUAL)} is missing`);
  const known = new Set([...readFileSync(MANUAL, 'utf8').matchAll(/^### (MT-[A-Z]+-\d+):/gm)].map((m) => m[1]));
  for (const r of all) for (const m of r.manual) if (!known.has(m)) throw new Error(`${r.id}: unknown manual case ${m}`);
}

function render(tests) {
  const rows = REQUIREMENTS.flatMap((s) => s.rows);
  checkManual(rows);
  const vitest = tests.filter((t) => t.projects.length === 0);
  const pw = tests.filter((t) => t.projects.length > 0);
  const count = (fn) => tests.filter(fn).length;
  const runs = (project) => pw.filter((t) => t.projects.includes(project)).length;
  const totalRuns = pw.reduce((n, t) => n + t.projects.length, 0);
  const status = (s) => rows.filter((r) => r.status === s).length;

  let o = `# Automated test catalogue and traceability

<!-- Generated by scripts/generate-test-catalogue.mjs. Do not edit by hand: change the script or the tests, then regenerate. -->

Every automated test in the repository, as the test runners themselves list them, and a matrix from each requirement in \`${SPEC}\`, the accounts spec \`docs/superpowers/specs/2026-11-07-accounts-and-database-design.md\`, and the safety and tracking spec \`docs/superpowers/specs/2026-11-11-safety-and-tracking-design.md\`, to the tests that cover it.

**Regenerate** after changing tests, from the repository root. It needs only \`npm ci\`: it does not start a browser or a database, and it does not run anything.

\`\`\`sh
node scripts/generate-test-catalogue.mjs           # write this file
node scripts/generate-test-catalogue.mjs --check   # exit 1 if this file is out of date
\`\`\`

The script fails if a matrix row names a test or a manual case that no longer exists. Requirement rows are maintained by hand in \`REQUIREMENTS\` in that script. Test rows are not. IDs hash the file and test name, so renaming a test changes its ID.

This lists what exists. It does not say tests passed: for results, see \`docs/testing/TEST-REPORT.md\`. Manual cases are in \`docs/testing/MANUAL-TEST-CASES.md\`.

## Counts

| Level | Runner | Unique tests | Test runs |
| --- | --- | --- | --- |
`;
  const levels = ['Unit', 'API unit', 'API integration', 'Web unit and component', 'E2E mocked', 'E2E live', 'E2E HTTPS'];
  for (const l of levels) {
    const list = tests.filter((t) => t.level === l);
    const isPw = l.startsWith('E2E');
    o += `| ${l} | ${isPw ? 'Playwright' : 'Vitest'} | ${list.length} | ${list.reduce((n, t) => n + (t.projects.length || 1), 0)} |\n`;
  }
  o += `| **Total** | | **${tests.length}** | **${vitest.length + totalRuns}** |\n\n`;
  o += `Vitest: ${vitest.length}. Playwright: ${pw.length} unique tests, ${totalRuns} runs across projects: ${PROJECTS.map((p) => `${code(p)} ${runs(p)}`).join(', ')}.\n\n`;
  o += `Level definitions, and what each does and doesn't prove, are in \`docs/testing/TEST-STRATEGY.md\`.\n\n`;

  o += `## Traceability matrix\n\n${rows.length} requirements: ${status('Covered')} covered, ${status('Partial')} partial, ${status('None')} with no automated test.\n\n`;
  o += `**Covered** means a test exercises the requirement on the stack it runs on (localhost, emulated devices). It does not mean proved in production. **Partial** means part of it is untested: the note says which. **None** means no automated test. A row with many tests shows the first few, and the rest are in the catalogue under that file.\n`;
  const resolved = new Map();
  for (const { section, rows: list } of REQUIREMENTS) {
    o += `\n### ${section}\n\n| Req | Requirement | Status | Automated tests | Not covered, or note | Manual |\n| --- | --- | --- | --- | --- | --- |\n`;
    for (const r of list) {
      const found = resolve(r, tests);
      resolved.set(r.id, found);
      o += `| ${r.id} | ${cell(r.text)} | ${r.status} | ${cell(renderIds(found))} | ${cell(r.note.replace(/«([^»]*)»/g, '$1'))} | ${cell(r.manual.join(', '))} |\n`;
    }
  }

  o += `\n## Requirements with no automated coverage\n\nStated openly, so nobody assumes otherwise. Manual cases, where they exist, are the only check.\n\n| Req | Requirement | Why not, and how it is checked | Manual |\n| --- | --- | --- | --- |\n`;
  for (const r of rows.filter((x) => x.status === 'None')) o += `| ${r.id} | ${cell(r.text)} | ${cell(r.note)} | ${cell(r.manual.join(', ') || 'None')} |\n`;
  o += `\nThe **Partial** rows above also carry gaps, and these three matter most: CLN-08 (no call placed), PRD-15 (nobody has listened), and UX-07 (keyboard walked on some screens, by a script, not a person).\n`;

  o += `\n## Catalogue\n\n${tests.length} tests. Playwright rows list the projects each runs in. Duplicate names come from \`it.each\` tables whose titles don't vary.\n`;
  const byFile = new Map();
  for (const t of tests) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
  for (const [file, list] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    o += `\n### ${code(file)} (${list.length})\n\n| ID | File | Test name | Level | Requirement area |\n| --- | --- | --- | --- | --- |\n`;
    for (const t of list) {
      const lvl = t.projects.length ? `${t.level} (${t.projects.join(', ')})` : t.level;
      o += `| ${t.id} | ${code(file.split('/').pop())} | ${cell(t.name || '(unnamed)')} | ${lvl} | ${t.area} |\n`;
    }
  }
  return `${o}`;
}

const tests = collect();
const text = render(tests);
if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current !== text) {
    console.error(`${relative(ROOT, OUTPUT)} is out of date. Run: node scripts/generate-test-catalogue.mjs`);
    process.exit(1);
  }
  console.log(`${relative(ROOT, OUTPUT)} is up to date (${tests.length} tests).`);
} else {
  writeFileSync(OUTPUT, text);
  console.log(`Wrote ${relative(ROOT, OUTPUT)}: ${tests.length} tests.`);
}
