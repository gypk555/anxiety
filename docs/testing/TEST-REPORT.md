# Test report

**Date: 2026-11-07.** Branch `production-rebuild`, last commit `a5a1800`, on an **uncommitted working tree**: no commit identifies this exact code yet. The results below are from final runs on this machine on 2026-11-07, between 17:02 and 17:13 for Playwright, after the accounts and database-setup work in [the accounts spec](../superpowers/specs/2026-11-07-accounts-and-database-design.md) and the fixes from the [second security review](#second-security-review-accounts-code-2026-11-07).

## Summary

- **All automated checks passed:** typecheck clean, lint with 0 errors and 18 warnings, 835 of 835 Vitest, Playwright 565 passed and 1 skipped (566 runs) on each of two consecutive full runs, build succeeded, `npm audit --omit=dev` found 0 vulnerabilities. The clean `npm ci --ignore-scripts` check below is from the earlier run and was not repeated.
- **Initial JS is 149.6 KB gzipped, against a 170 KB budget.** The common-password list is kept out of it, and a test checks that.
- **The app has never run on a real phone, Supabase, Render, a real mail provider, real Google or GitHub Actions. `db:setup`, `db:verify` and `doctor` have only met embedded Postgres and an SMTP stub. Google has only been a local fake provider. No password manager has been tried. No helpline has been phoned.**
- **This is not a release sign-off.** Passing here means it's ready for manual testing. See [What has not been tested](#what-has-not-been-tested).

## Environment

| Item | Value | Source |
| --- | --- | --- |
| OS | macOS 27.2 (Darwin 27.2.0) | `sw_vers`, on the same machine |
| Node | 26.0.0 (`.node-version`: 26) | `node -v`, on the same machine |
| Test runners | Vitest 4.1.12, Playwright 1.65.0 | Test output, `playwright --version` |
| Browsers | Chromium 158.0.8127.18 (revision 1254), WebKit 27.2 (revision 2388), headless builds bundled with Playwright | `playwright-core/browsers.json`, and the installed `ms-playwright` folders |
| Device profiles | Playwright `iPhone 14` on WebKit, `Pixel 7` on Chromium. **Emulated viewports on desktop browser engines** | `apps/web/playwright.config.ts` |
| Accessibility engine | axe-core 4.14.0 through `@axe-core/playwright` 4.14.0 | `node_modules` |
| Database | Embedded PostgreSQL, `embedded-postgres` 18.6.0-beta.19 (a beta package) | `node_modules` |
| Build | Vite 8.3.6, vite-plugin-pwa 2.0.0, TypeScript 6 | Build output, `package.json` |

## Results

### Static and build

| Check | Result | Detail |
| --- | --- | --- |
| `npm run typecheck` | Pass | `shared`, `api` and `web`. No errors printed |
| `npm run lint` | Pass with warnings | 0 errors, **18 warnings** |
| `npm run build` | Pass | 2331 modules transformed. PWA precache: 45 entries, 886.82 KiB. API bundle `dist/server.js` 129.3 kb |
| `npm audit --omit=dev` | Clean: 0 vulnerabilities | |
| `npm audit` | 6: 2 low, 4 moderate. All in build tooling | Unchanged. Documented in `docs/SECURITY-EXCEPTIONS.md` |
| Clean install | Pass | A copy of the working tree, `npm ci --ignore-scripts`, `npm run build`, then its `dist/server.js` started by `https-stack.ts` with `NODE_ENV=production` and Google configured: `/healthz` and `/readyz` ok, `/meta` shows `googleEnabled: true`, Google start answers 302 to `accounts.google.com`, which was not followed |
| `node scripts/generate-test-catalogue.mjs --check` | Pass | 1118 tests listed |

### Vitest

| Workspace | Files | Tests | Passed | Failed | Duration (as logged) |
| --- | --- | --- | --- | --- | --- |
| `@anxiocare/shared` | 2 | 83 | 83 | 0 | 228 ms |
| `@anxiocare/api` | 18 | 566 | 566 | 0 | 21.21 s |
| `@anxiocare/web` | 19 | 186 | 186 | 0 | 12.54 s |
| **Total** | **39** | **835** | **835** | **0** | |

New in this pass: `security-regressions.test.ts` (26 tests, one block per finding of the second review). Also new API files from the accounts work: `accounts.test.ts` (password flows, caps, semaphore, rehash, reset, purposes, logging), `google.test.ts` (fake provider, every rejection, linking, disconnect, erasure), `tooling.test.ts` (`db:setup`, `db:verify` and `doctor` as subprocesses, against embedded Postgres with TLS and a non-superuser admin role).

### Playwright

**First run: 565 passed, 1 skipped, 0 failed, in 5.5 minutes (17:02 to 17:08). Second run, straight after: 565 passed, 1 skipped, 0 failed, in 5.4 minutes (17:08 to 17:13).** No retries are configured. The skip is the clipboard paste test on WebKit, where Playwright can't grant clipboard permission. Paste is also covered in a component test.

| Project | Suite | Runs |
| --- | --- | --- |
| `iphone` | Mocked (WebKit) | 133 |
| `pixel` | Mocked (Chromium) | 133 |
| `live-iphone` | Live (WebKit) | 143, 1 skipped |
| `live-pixel` | Live (Chromium) | 143 |
| `https-iphone` | HTTPS (WebKit) | 7 |
| `https-pixel` | HTTPS (Chromium) | 7 |
| **Total** | | **566** |

| Spec | `iphone` | `pixel` | `live-iphone` | `live-pixel` | `https-iphone` | `https-pixel` | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `audit.spec.ts` | 127 | 127 | | | | | 254 |
| `resilience.spec.ts` | 6 | 6 | | | | | 12 |
| `live/a11y.spec.ts` | | | 4 | 4 | | | 8 |
| `live/accounts.spec.ts` | | | 47 | 47 | | | 94 |
| `live/auth.spec.ts` | | | 5 | 5 | | | 10 |
| `live/authorisation.spec.ts` | | | 5 | 5 | | | 10 |
| `live/compression.spec.ts` | | | 6 | 6 | | | 12 |
| `live/consent.spec.ts` | | | 9 | 9 | | | 18 |
| `live/failures.spec.ts` | | | 12 | 12 | | | 24 |
| `live/guest.spec.ts` | | | 8 | 8 | | | 16 |
| `live/journal.spec.ts` | | | 6 | 6 | | | 12 |
| `live/keyboard.spec.ts` | | | 8 | 8 | | | 16 |
| `live/landscape.spec.ts` | | | 2 | 2 | | | 4 |
| `live/navigation.spec.ts` | | | 5 | 5 | | | 10 |
| `live/results.spec.ts` | | | 8 | 8 | | | 16 |
| `live/safety.spec.ts` | | | 6 | 6 | | | 12 |
| `live/security.spec.ts` | | | 6 | 6 | | | 12 |
| `live/settings.spec.ts` | | | 6 | 6 | | | 12 |
| `https/https.spec.ts` | | | | | 7 | 7 | 14 |

The grand total of runs is 1,401: 835 Vitest and 566 Playwright. Unique tests: 1,118. Each is listed in [TEST-CASES.md](TEST-CASES.md).

**Seen once, earlier in the day, not since.** In one development run before the final two, WebKit reported two failures that did not recur in three full runs after: `live/auth.spec.ts` "sign-up" with "Fetch API cannot load ... due to access control checks" from a fetch cut off by navigation, and `live/consent.spec.ts` "never consented" timing out waiting for a download. Both specs predate this work. Treat them as possible flakes to watch.

### Traceability

171 requirements are mapped in [TEST-CASES.md](TEST-CASES.md), including 28 from the accounts spec and its second review: 125 covered on the stack the tests run on, 30 partial, 16 with no automated test. "Covered" there means localhost and emulation, not production.

## Known warnings

Lint gives 18 warnings, and no errors. None was fixed. The linter doesn't fail on warnings.

| Rule | Count | Where |
| --- | --- | --- |
| `react(purity)` | 7 | `routes/Home.tsx:129`, `routes/SignIn.tsx:175`, `routes/Breathe.tsx:188`, `routes/CreateAccount.tsx:40,125`, `routes/ForgotPassword.tsx:24,75`: `Date.now()` as a state initialiser for the resend cooldown, the existing pattern |
| `react(only-export-components)` | 6 | `ui/OtpInput.tsx:5`, `ui/TrendChart.tsx:16`, `routes/Journal.tsx:64`, `routes/CheckIn.tsx:150`, `routes/SignIn.tsx:30,35` |
| `eslint(no-unused-vars)` | 2 | `public/theme-init.js:12`, `scripts/generate-test-catalogue.mjs:444` |
| `eslint(no-empty-pattern)` | 1 | `e2e/live/support.ts:107` |
| `react(set-state-in-effect)` | 1 | `routes/Settings.tsx:844` |
| `react-hooks(exhaustive-deps)` | 1 | `routes/Settings.tsx:846` |

Paths are under `apps/web/`, apart from the script. Seven are new, from the new screens, all of kinds already present.

## Security review

The owner's security review reported 14 items. Each row below was checked against the current code and tests for this report.

| Severity | Finding | Outcome | Verified in code | Regression tests that passed |
| --- | --- | --- | --- | --- |
| High | Email-change takeover: a session plus the new address's code moved an account | Fixed. Needs a code from each inbox, checked as one decision. The current-address code is bound to the new address | `apps/api/src/routes/me.ts`, `consumeOtps` in `otp.ts` | `hardening.test.ts` "1. email change needs both inboxes" (8 tests), `live/settings.spec.ts` |
| Medium | OTP send-quota denial of service | Fixed. Quotas per purpose: 5 an hour per address and client, 20 per address | `issueOtp` in `otp.ts` | `hardening.test.ts`: "allows five sends", "allows twenty sends", "keeps quotas per purpose" |
| Medium | No guess cap across codes: 5 attempts per code, but unlimited codes | Fixed. 50 failed guesses a rolling day per address and purpose | `consumeOtps` in `otp.ts` | `hardening.test.ts`: "caps failed guesses", "counts real wrong guesses" |
| Medium | Ciphertext length leak | Fixed. Padding inside `sealText`: fixed sizes, journal in 4 KB steps | `pad` in `crypto.ts` | `hardening.test.ts` "4. ciphertext length" (4 tests) |
| Medium | IPv6 /64 and `+tag` rate-limit bypass | Fixed. IPv6 counts by /64. Quota uses a canonical address. Mail goes as typed | `rateKey` in `client-ip.ts`, `canonicalEmailForQuota` in `otp.ts` | `hardening.test.ts` "5. rate limit keys" (3 tests), "canonicalises for quota only" |
| Medium | Erasure honesty and audit join | Fixed. App states backups age out, with the number from config. Audit times to the UTC day, enforced by `CHECK` | `Settings.tsx`, `Legal.tsx`, `001_init.sql:113` | `hardening.test.ts` "6. erasure honesty" (4 tests) |
| Low | Auth before limiter | Fixed. Limiter runs on `onRequest` | `app.ts` | `hardening.test.ts` "7. limiter order" (3 tests) |
| Low | No per-user quota | Fixed. 2,000 journal entries, 1,000 assessments | `routes/journal.ts`, `routes/assessments.ts` | `hardening.test.ts` "8. per-user storage caps" (3 tests) |
| Low | Identifying download file name | Fixed. `account-data-YYYY-MM-DD.json` | `routes/me.ts`, `lib/api.ts` | `hardening.test.ts` "the export filename is neutral", `api.test.ts`, `live/settings.spec.ts` |
| Low | Cursor gave a 500 | Fixed. Answers 400 | `routes/assessments.ts`, `routes/journal.ts` | `hardening.test.ts` "10. cursors" |
| Deploy, 4 plausible items | The brief gives only the count. The repository shows these: migration credential in the server's environment, client address behind Cloudflare, lifecycle scripts on install, deploying before checks pass | Mitigated in config, or documented. **None verified on a real Render service** | `render.yaml`, `server.ts`, `client-ip.ts`, `docs/SECURITY-EXCEPTIONS.md`, `apps/api/README.md` | `hardening.test.ts` "deploy config" (5 tests), `https.spec.ts` |

**Residual risk.** Repeated wrong guesses can block sign-in for an address for up to 24 hours. Confirmed in code: over the cap, `consumeOtps` refuses without evaluating, even the right code. It costs an attacker ten mails, which the owner sees, because only guesses at live codes count. Existing sessions are unaffected, and deletion and email change are unaffected because caps are per purpose. Also accepted: many clients can spend an address's 20 sign-in codes an hour. Recorded in [`docs/SECURITY-EXCEPTIONS.md`](../SECURITY-EXCEPTIONS.md#sign-in-lockout-of-a-new-device), and in "Known costs, accepted" in `apps/api/README.md`.

**Limits of this verification.**

- For this first review, the brief says the attack scripts were re-run and confirmed the fixes. **Those scripts are not in the repository, and their output isn't in the logs, so this report can't confirm that run.** The regression tests above are what's verifiable here. (The second review's scripts are kept: see the next section.)
- No independent penetration test has been done. Nothing was tested against the real edge: see MT-SEC.

## Second security review: accounts code (2026-11-07)

A second review of the new account code reported four flaws and two minor items, each with an attack script. Every attack was first turned into a failing test in `apps/api/test/security-regressions.test.ts` (20 of its first 23 tests failed before the fix), then fixed. The reviewer's scripts are kept, unchanged apart from import paths, in `apps/api/test/attacks/`. They print outcomes rather than assert, and run with `npx vitest run --config test/attacks/vitest.config.ts --reporter=verbose` from `apps/api`. The scratchpad copy was lost to a power cut; the repository copy was recreated verbatim from the session.

| Finding | Before | After (script re-run, 17:02) | Fix | Regression tests |
| --- | --- | --- | --- | --- |
| Google takeover: a Google login with an account's address, any subject, signed in to it and stayed linked after a reset | Callback 302 to `/consent`, `/me` 200 as the victim; after the victim's reset, the attacker's Google still got in | 302 to `/sign-in?error=google_link`, `/me` 401; after reset, 401 | Sign-in finds accounts by Google subject only, never by address. Linking only from Settings (`POST /me/identities/google/connect`), bound to the session that asked and needing a password or email code proved in the last 10 minutes. New accounts from Google only for gmail.com, googlemail.com or an `hd` claim. A reset removes linked identities and mails a notice. Unlinking needs re-authentication, not a password | "finding 1" (8 tests), `google.test.ts`, `live/accounts.spec.ts` (4 Google tests) |
| Password change racing a reset | Attacker kept the password 6 of 6 | 0 of 6 in the script; 0 of 50 per run in the test, run 4 times (200 iterations) | Change, set and reset lock the user row (`FOR UPDATE`) in one transaction; change and set re-check the session and the stored hash there, else 401. Other sessions are revoked in the same transaction | "finding 2" (2 tests) |
| Lockout: 10 wrong passwords, or 34 requests across codes and passwords, locked the owner out | Owner 400 on password, code and reset | Password 200 on a new device; code and reset 200 (that device is known once its password sign-in succeeds) | Device cookies (`__Host-device`, HMAC stored, revoked by reset and deletion). Without one: passwords 10 a day per address and network, 100 a day per address; codes 5 a day per address and network, 20 a day per address. With one: only that device's own budget | "finding 3" (8 tests), `live/accounts.spec.ts` "known devices" |
| Argon2 flood: 40 concurrent strangers left the owner with a 429 | Owner 429 | A known device gets the kept slot (test); the script's owner is a new device and is still shed (429), as designed | 2 general slots plus 1 for known devices; 10 sign-in attempts a minute per /64 and an instance-wide bucket before anything is counted or hashed; `PASSWORD_ARGON2_MEMORY_KIB` at most 65536 (192 MiB peak) | "finding 4" (6 tests) |
| `login_failures.quota_hash` joinable with `otp_codes.quota_hash` | Same HMAC | Different HMAC domains | `loginQuotaKey` (`login-quota:`) | "minor items" |
| Secrets file mode | Appended file kept its mode | 0600, also fixed on an existing file | `chmodSync` in `ensureSecrets` | "minor items" |

Timing, in the script, median ms for a password account, a code-only account and an unknown address: 31.2, 31.5, 31.5 (interleaved) and 35.5, 32.9, 27.1 (sequential). Uniform, as before the fixes.

**Deviation from the brief.** It asked for an overall cap of 100 failures a day per address for codes as well as passwords. Codes keep 20, because 100 would raise the odds of guessing a 6-digit code from about 0.7% to about 3.6% a year. Recorded in [decision 012](../decisions/012-passwords-google-and-six-digit-codes.md) and [SECURITY-EXCEPTIONS.md](../SECURITY-EXCEPTIONS.md).

**Residual.** A new device can be locked out by an attacker using several networks; a known device can't. Under a flood, a new device's sign-in can be shed with a 429. Not verified: anything on a real edge, real Google, or more than one instance (the per-/64 limit and bucket are in memory, per instance).

## Performance: initial JS

**Measured: 149.6 KB gzipped (149,599 bytes, from the `.gz` files `index.html` lists). Budget: 170 KB. Margin: 20.4 KB.** The table below is from the previous report's measurement through HTTP. The entry file is now `index-CCY4Ezxe.js` at 145,731 gzip bytes. `live/compression.spec.ts` checks the budget over HTTP and passed in both runs. A first build put the common-password list in the entry chunk, at 152.4 KB. It now has its own chunk, loaded only by the screens that set a password, and a test checks it stays out.

Method: `live/compression.spec.ts` starts from the real server over real HTTP, with Node's own client so that nothing decodes the bytes. It reads the scripts `index.html` lists, asks for each with `Accept-Encoding: gzip`, sums the bytes on the wire, and fails at 170,000. It also checks that each decoded response equals the raw file. The test doesn't print its total, so the table gives the sizes of the same precompressed files in `apps/web/dist`.

| File | Why it loads | Raw bytes | Gzip bytes | Brotli bytes |
| --- | --- | --- | --- | --- |
| `/assets/index-BqDmk959.js` | `<script type="module">` | 475,726 | 145,139 | 125,900 |
| `/assets/PageTitle-DUwcXZeM.js` | `<link rel="modulepreload">`, and the entry imports it statically | 9,106 | 3,522 | 3,145 |
| `/theme-init.js` | `<script>` | 550 | 346 | 263 |
| **Initial JS** | | **485,382** | **149,007** | **129,308** |

Other figures, for context:

- **`workbox-window`** is a dynamic import that runs right after start, to register the service worker. It isn't counted, and at about 2.3 KB it wouldn't change the result.
- **The precache is 42 entries, 848.47 KiB uncompressed,** fetched in the background on the first visit. On 2G, that is the number to watch: see MT-OFF-08.

**Caveats.**

1. **This is localhost.** What Render's edge does to these bytes hasn't been seen: MT-DEP-19. API responses are not compressed here, and carry `no-transform` to ask the edge not to either. Whether it honours that is also unverified.
2. **No real load time has been measured.** No Lighthouse run, no real phone, no real network. Script parse time on a low-end phone is unknown: see MT-DEV-01.

## What has not been tested

Stated plainly. None of the following has happened, in any form:

| Not tested | What that means | Manual cases |
| --- | --- | --- |
| **`db:setup`, `db:verify`, `doctor` on real systems** | Tested as subprocesses against embedded Postgres with TLS, a Supabase-like non-superuser admin role, and an SMTP stub. Never against Supabase's pooler, its `postgres` role's real permissions, or a real SMTP provider | MT-AUTH-22 |
| **Real Google** | Only a local fake provider, on another site, with real signatures. Google's consent screen, verification and real ID tokens are unknown | MT-AUTH-18, 19 |
| **Password managers** | Only `autocomplete`, `name` and `type` are checked. No manager has offered, saved or filled a password | MT-AUTH-11, 13 |
| **Live Supabase** | The migrations, runtime role, RLS, session pooler and CA have only met embedded Postgres. Nothing has run in Mumbai | MT-DEP-02 to 06, 10, 14 |
| **Render** | `render.yaml`, pre-deploy, health checks, start command and environment have never run | MT-DEP-01, 13, 18, 20 |
| **The real edge** | Cloudflare's behaviour with `CF-Connecting-IP`, compression and headers comes from documents and people's reports, not observation | MT-DEP-07, 08, 19, MT-SEC |
| **Real SMTP** | No mail has reached a real inbox. SPF, DKIM, spam placement, lock-screen text and autofill are all unknown | MT-MAIL |
| **GitHub Actions** | `ci.yml` and `codeql.yml` have never run. Dependabot has never opened anything. All results here are from macOS, and CI is Linux | MT-DEP-17 |
| **Real devices** | No iPhone, no Android phone, no foldable, no tablet. Playwright's "iPhone" is a viewport on desktop WebKit | MT-DEV, MT-PWA |
| **Real calls** | **No helpline has been phoned. No `tel:` link has opened a dialler. WhatsApp hasn't been opened.** The app now says the numbers were checked against published sources and not yet by phone | MT-HELP |
| **Listening to audio** | No person or test has heard the soundscapes. Tests press play and stop, and prove only that the `AudioContext` is torn down without errors, on mocked Web Audio, with a real-browser smoke test for errors | MT-TOL-08 to 14 |
| Haptics and wake lock | Never fired on hardware | MT-TOL-04 to 06 |
| Real offline, 2G, airplane mode | Only a browser switch | MT-OFF |
| Landscape on a phone, or installed | Emulated at 568x320, and the manifest is read. Never rotated, never installed | MT-DEV-06, 07 |
| Mailing everyone | `notify-all` has run against a capture mailer and the file transport, on a test database. Never a real provider | `docs/OPERATIONS.md` |
| Install to home screen | Never done | MT-PWA |
| Screen readers, a person using a keyboard, large font, colour vision | Axe, and scripted key presses on the main journeys. See [../ACCESSIBILITY.md](../ACCESSIBILITY.md) | MT-ACC |
| Printing | The stylesheet was checked in emulation. Nobody has seen a page | MT-PRN |
| Clinical review | No clinician has read the copy. The spec requires this | MT-CLN-01 to 08 |
| Legal review | No lawyer has read the notice or terms. The spec requires this | MT-CLN-09 |
| Load, soak, restore | No load test, no backup restore, no key-rotation drill on a real system | MT-DEP-15, 16 |
| Manual test cases | 264 written. **None has been run** | All |

## Issues found and fixed

All were found by reading code while writing the test documents, and fixed on 2026-11-06, each with a test seen to fail first. IDs match [MANUAL-TEST-CASES.md](MANUAL-TEST-CASES.md). "Fixed" means on this stack. Each still needs confirming on a real device.

| ID | Severity | Issue | Fix | Tests |
| --- | --- | --- | --- | --- |
| KI-1 | Medium | Consent out of date locked rights out of the UI, and Home looked signed out | Home routes to the prompt. Settings keeps sign out, download, delete and devices without accepting | `live/consent.spec.ts`, `Home.test.tsx`, `Settings.test.tsx`, `data.test.ts` |
| KI-2 | Medium | Help claimed "Numbers last checked" when nobody had phoned | "Checked against published sources", dated, until `HELPLINES_CHECK_METHOD` is set to `'phone'` | `Legal.test.tsx`, `gad7.test.ts` |
| KI-3 | Medium | Installed app locked to portrait | Lock removed. Layouts checked at 568x320 | `audit.spec.ts`, `live/landscape.spec.ts` |
| KI-4 | Medium | Consent copy untrue at a re-prompt | First-time and re-prompt copy differ. The re-prompt states what changed, and that data is kept and reachable | `Consent.test.tsx`, `live/consent.spec.ts` |
| KI-5 | Low | **Go again** dropped the chosen sound | Plays it again | `Breathe.test.tsx` |
| KI-6 | Low | Wake lock not re-requested, and timer ran while hidden | Re-requested on return. Hidden time doesn't count | `Breathe.test.tsx`, on mocks |
| KI-7 | Low | Label could say "Playing" while silent | Follows `AudioContext` state, and says so. A hidden screen stops the sound | `sound.test.ts`, `Sounds.test.tsx`, on mocks |
| KI-8 | Low | At the guess cap, the message sent the owner in circles | After two wrong codes, a general note. **Declined: saying the address is capped,** which would tell an attacker it worked | `SignIn.test.tsx` |
| KI-9 | Low | Offline Settings gave no reason | **We can't load your account**, with **Try again** | `Settings.test.tsx` |
| KI-10 | Low | No resend in the email-change and delete sheets | Added, with the 45-second wait | `Settings.test.tsx` |
| KI-11 | Low | Theme radios had no arrow keys | Roving tabindex and arrow keys | `Settings.test.tsx`, `live/keyboard.spec.ts` |
| KI-12 | Low | Test title said the opposite of its assertion | Renamed | `database.test.ts` |
| KI-13 | To confirm | The API didn't compress | Static files precompressed, brotli and gzip, with `Vary`. API responses never compressed | `http.test.ts`, `live/compression.spec.ts` |

Also fixed:

| Issue | Fix | Tests |
| --- | --- | --- |
| Retention longer than promised | Purge hourly. Unconsented accounts go at 24 to about 25 hours. On erasure, code rows for the user and every spelling of the address go at once | `purge.test.ts`, `erasure.test.ts` |
| **The hourly purge alone couldn't keep "about an hour" for code rows.** The hourly send quota needs a row for an hour after sending, so an hourly job could leave it for up to two | A separate sweep of dead code rows every 5 minutes, so at most 1 hour 5 minutes | `purge.test.ts` |
| About page said "published wording" | Says item and option wording is as published, and the stem and difficulty lead-in are lightly adapted | `Legal.test.tsx` |
| Privacy notice omitted Cloudflare | Named, even offline | `Legal.test.tsx` |
| A focused control could sit under the tab bar: WCAG 2.4.11. Found by the new test | `scroll-padding` | `live/keyboard.spec.ts` |
| Check-in answers had no arrow keys | Added. Each stays a Tab stop | `CheckIn.test.tsx`, `live/keyboard.spec.ts` |
| `AudioContext` was never closed | Closed after the fade, on stop, hide and unmount | `sound.test.ts`, `Sounds.test.tsx` |
| `dev.ts` orphaned Postgres when a migration failed | Stops it, exits 1, and a checksum mismatch hints at `DEV_FRESH=1` | `dev-script.test.ts` |
| No way to mail everyone in a breach | `apps/api/scripts/notify-all.ts` | `notify.test.ts` |

**Still open, and not part of this work:** the remaining copy mismatches in [PRIVACY-COMPLIANCE.md](../PRIVACY-COMPLIANCE.md#where-the-app-text-and-the-code-disagree), for the lawyer.

Test gaps are listed in [TEST-STRATEGY.md](TEST-STRATEGY.md#known-gaps). Two more things to note: `HELPLINES_CHECK_METHOD` and `HELPLINES_CHECKED_ON` must be updated once every number has really been phoned (MT-HELP), and a borrower holding an unlocked session can download all data with no fresh code, which the spec allows (see MT-SHR-05).

## Reproducing this

```sh
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
node scripts/generate-test-catalogue.mjs --check
```

To re-measure initial JS by hand, using the precompressed files `apps/web/dist/index.html` lists. `live/compression.spec.ts` does this over HTTP:

```sh
cd apps/web/dist
for f in $(grep -oE '(src|href)="/[^"]+\.js"' index.html | sed -E 's/.*"(.*)"/\1/'); do
  printf '%s %s\n' "$f" "$(wc -c < ".$f.gz")"
done
```
