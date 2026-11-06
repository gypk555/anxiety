# Test report

**Date: 2026-11-06.** Branch `production-rebuild`, last commit `fb4b34a`, on an **uncommitted working tree**: no commit identifies this exact code yet. The results below are from a final run on this machine, from 20:54 to 21:03 IST, after the defects listed under [issues fixed](#issues-found-and-fixed) were fixed. The documents were then edited, and no source or test changed after that run.

## Summary

- **All automated checks passed:** typecheck clean, lint with 0 errors and 12 warnings, 462 of 462 Vitest, 408 of 408 Playwright on each of two consecutive full runs, build succeeded, `npm audit --omit=dev` found 0 vulnerabilities.
- **Initial JS is 149.0 KB gzipped, against a 170 KB budget,** now enforced through real HTTP on localhost.
- **The app has never run on a real phone, Supabase, Render, a real mail provider or GitHub Actions. No helpline has been phoned. Nobody has listened to the audio, used a screen reader, or used the app with a keyboard in person.**
- **This is not a release sign-off.** Passing here means it's ready for manual testing. See [What has not been tested](#what-has-not-been-tested) and the [issues found and fixed](#issues-found-and-fixed).

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
| `npm run lint` | Pass with warnings | 0 errors, **12 warnings** |
| `npm run build` | Pass | 2322 modules transformed. PWA precache: 42 entries, 848.47 KiB. 32 files precompressed. API bundle `dist/server.js` 69.5 kb |
| `npm audit --omit=dev` | Clean: 0 vulnerabilities | From the final run |
| `npm audit` | 6: 2 low, 4 moderate. All in build tooling | From the final run. Exits 1, as before. Documented in `docs/SECURITY-EXCEPTIONS.md` |

### Vitest

| Workspace | Files | Tests | Passed | Failed | Duration (as logged) |
| --- | --- | --- | --- | --- | --- |
| `@anxiocare/shared` | 1 | 25 | 25 | 0 | 154 ms |
| `@anxiocare/api` | 14 | 294 | 294 | 0 | 4.19 s |
| `@anxiocare/web` | 18 | 143 | 143 | 0 | 12.62 s |
| **Total** | **33** | **462** | **462** | **0** | |

### Playwright

**First run: 408 passed, 0 failed, in 4.1 minutes. Second run, straight after: 408 passed, 0 failed, in 4.1 minutes.** This includes the live suite each time. No retries are configured, so none hid a flake. Per-project counts come from the run's output, and are the same in both.

| Project | Suite | Passed |
| --- | --- | --- |
| `iphone` | Mocked (WebKit) | 107 |
| `pixel` | Mocked (Chromium) | 107 |
| `live-iphone` | Live (WebKit) | 95 |
| `live-pixel` | Live (Chromium) | 95 |
| `https-iphone` | HTTPS (WebKit) | 2 |
| `https-pixel` | HTTPS (Chromium) | 2 |
| **Total** | | **408** |

| Spec | `iphone` | `pixel` | `live-iphone` | `live-pixel` | `https-iphone` | `https-pixel` | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `audit.spec.ts` | 101 | 101 | | | | | 202 |
| `resilience.spec.ts` | 6 | 6 | | | | | 12 |
| `live/a11y.spec.ts` | | | 4 | 4 | | | 8 |
| `live/auth.spec.ts` | | | 5 | 5 | | | 10 |
| `live/authorisation.spec.ts` | | | 5 | 5 | | | 10 |
| `live/compression.spec.ts` | | | 5 | 5 | | | 10 |
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
| `https/https.spec.ts` | | | | | 2 | 2 | 4 |

The grand total of runs is 870: 462 Vitest and 408 Playwright. Unique tests: 666. Each is listed in [TEST-CASES.md](TEST-CASES.md).

### Traceability

143 spec requirements are mapped in [TEST-CASES.md](TEST-CASES.md): 98 covered on the stack the tests run on, 29 partial, 16 with no automated test. "Covered" there means localhost and emulation, not production.

## Known warnings

Lint gives 12 warnings, and no errors. None was fixed. The linter doesn't fail on warnings.

| Rule | Count | Where |
| --- | --- | --- |
| `react(only-export-components)` | 4 | `ui/OtpInput.tsx:5`, `ui/TrendChart.tsx:16`, `routes/Journal.tsx:64`, `routes/CheckIn.tsx:150` |
| `react(purity)` | 3 | `routes/Home.tsx:127`, `routes/SignIn.tsx:93`, `routes/Breathe.tsx:188` |
| `eslint(no-unused-vars)` | 2 | `public/theme-init.js:12`, `scripts/generate-test-catalogue.mjs:412` |
| `eslint(no-empty-pattern)` | 1 | `e2e/live/support.ts:102` |
| `react(set-state-in-effect)` | 1 | `routes/Settings.tsx:492` |
| `react-hooks(exhaustive-deps)` | 1 | `routes/Settings.tsx:495` |

Paths are under `apps/web/`, as in the output, apart from the script. The script's warning wasn't counted in the last report, and none of the fixes added a new kind. Expected browser errors are handled by `guard` in the live suite, and any unexpected one would have failed its test.

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

**Residual risk.** Repeated wrong guesses can block sign-in for an address for up to 24 hours. Confirmed in code: over the cap, `consumeOtps` refuses without evaluating, even the right code. It costs an attacker ten mails, which the owner sees, because only guesses at live codes count. Existing sessions are unaffected, and deletion and email change are unaffected because caps are per purpose. Also accepted: many clients can spend an address's 20 sign-in codes an hour. Recorded in [`docs/SECURITY-EXCEPTIONS.md`](../SECURITY-EXCEPTIONS.md#24-hour-sign-in-lockout), and in "Known costs, accepted" in `apps/api/README.md`.

**Limits of this verification.**

- The brief says the attack scripts were re-run and confirmed the fixes. **Those scripts are not in the repository, and their output isn't in the logs, so this report can't confirm that run.** The regression tests above are what's verifiable here.
- No independent penetration test has been done. Nothing was tested against the real edge: see MT-SEC.

## Performance: initial JS

**Measured: 149.0 KB gzipped. Budget: 170 KB. Margin: 21.0 KB.**

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
| Manual test cases | 252 written. **None has been run** | All |

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
```

To re-measure initial JS by hand, using the precompressed files `apps/web/dist/index.html` lists. `live/compression.spec.ts` does this over HTTP:

```sh
cd apps/web/dist
for f in $(grep -oE '(src|href)="/[^"]+\.js"' index.html | sed -E 's/.*"(.*)"/\1/'); do
  printf '%s %s\n' "$f" "$(wc -c < ".$f.gz")"
done
```
