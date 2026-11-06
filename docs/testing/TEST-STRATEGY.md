# Test strategy

How AnxioCare is tested, what each kind of test proves and doesn't, and how to run and extend them.

- Results of the latest run: [TEST-REPORT.md](TEST-REPORT.md)
- Every automated test, and requirement traceability: [TEST-CASES.md](TEST-CASES.md)
- Human test cases and release sign-off: [MANUAL-TEST-CASES.md](MANUAL-TEST-CASES.md)
- Accessibility status: [../ACCESSIBILITY.md](../ACCESSIBILITY.md)

## The principle

The spec names two failures worse than any bug: a person in distress can't reach a helpline in one tap, and data leaks across users. So tests are weighted towards those two, and run on real infrastructure wherever possible: real Postgres, a real browser, the real production bundle, real TLS.

Automation stops at the edge of the developer's machine. It can't place a phone call, hear a sound, read a lock screen or judge a sentence. Those are manual, and are not optional.

## Levels

Counts are from the last run. See [TEST-REPORT.md](TEST-REPORT.md).

| Level | Where | Tools | Tests | What runs for real | What is faked |
| --- | --- | --- | --- | --- | --- |
| Static | whole repo | `tsc`, `oxlint` | n/a | Type and lint rules | n/a |
| Unit | `packages/shared/src/*.test.ts`, `apps/api/test/config.test.ts` | Vitest | 25 + 26 | Scoring, schemas, config validation | Nothing needed |
| Web unit and component | `apps/web/src/**/*.test.{ts,tsx}` | Vitest, jsdom, Testing Library | 143 | React components, routing guards, client logic | The browser (jsdom), the network (`src/test/render.tsx`), and `<dialog>` modality |
| API integration | `apps/api/test/*.test.ts` | Vitest, `embedded-postgres`, Fastify `inject` | 268 | Postgres, migrations, roles, RLS, TLS handshakes, the whole route and hook chain | Mail (captured), and the TCP socket (`inject`) |
| E2E mocked | `apps/web/e2e/audit.spec.ts`, `resilience.spec.ts` | Playwright, axe-core | 107 × 2 | Production web build, production CSP, real browser engine | The API (`page.route`), and the headers come from a stand-in server |
| E2E live | `apps/web/e2e/live/*.spec.ts` | Playwright, axe-core | 95 × 2 | Bundled API serving the built web, real Postgres, real service worker | Mail goes to a file. Dev mode, plain HTTP on localhost, plain `session` cookie |
| E2E HTTPS | `apps/web/e2e/https/https.spec.ts` | Playwright, a local TLS terminator and SMTP stub | 2 × 2 | `NODE_ENV=production` config, `__Host-session`, verified TLS to Postgres and to SMTP (STARTTLS) | The edge (a local terminator stands in for Cloudflare), the SMTP provider (a stub), and the certificate (self-signed). Service worker blocked |
| Manual | [MANUAL-TEST-CASES.md](MANUAL-TEST-CASES.md) | People, phones | Not yet run | Everything | Nothing |

### What each level proves and doesn't

| Level | Proves | Doesn't prove |
| --- | --- | --- |
| Static | Types line up across `shared`, API and web. Lint rules hold (warnings don't fail it) | Behaviour |
| Unit | GAD-7 wording is pinned, cut points are right, schemas refuse bad input, production config refuses unsafe values | That the wording matches the published GAD-7: the test pins it to itself. That the server exits on bad config: tests call `loadConfig` |
| Web unit and component | Flows and states with exact shared wording, guards, session-ending logic, what is stored where, focus after a wrong code | Layout, CSS, real focus order, the service worker, real `<dialog>` trapping, what a screen reader says |
| API integration | Cross-user 404s, OTP limits under parallel load, raw `SELECT` shows no plaintext, RLS and role limits on real Postgres, headers, CSRF, deletion, logs | The network, real timing, Supabase's roles and pooler, Render's environment, a real mail provider |
| E2E mocked | Every listed screen, in light and dark, passes axe for serious and critical rules, has no overflow at 320, 390 and 430px, has no CSP violations. Print stylesheet. Offline after a visit | That the API agrees with the mock (live tests cover that). Moderate and minor axe rules. A real phone |
| E2E live | Whole journeys through the real UI and API, across two engines. Each test also fails on any console error, CSP violation, request to another host, or `/api` response from the service worker | HTTPS, `__Host-` cookie, production config, a real phone, real mail, real offline |
| E2E HTTPS | The production build boots with production config, sign-in works over TLS, the cookie is `__Host-session`, Secure and comes back, HSTS is present, mail goes over verified STARTTLS and stays neutral, the client address does not reach the log | Cloudflare, Render, Supabase, a trusted certificate, the service worker over HTTPS |
| Manual | Real calls, real phones, real mail, real audio, screen readers, clinical wording. All of it, when run | Regressions between runs |

### Playwright projects

Device profiles are `iPhone 14` (WebKit) and `Pixel 7` (Chromium). They set the viewport, user agent and touch. They run a desktop build of the engine, headless. **They are not an iPhone or a Pixel.** `navigator.vibrate`, wake lock, the home screen, `tel:`, the keyboard and the mail app don't exist in any meaningful way here.

| Project | Suite | Base URL |
| --- | --- | --- |
| `iphone`, `pixel` | Mocked: `audit`, `resilience` | `http://localhost:4173` |
| `live-iphone`, `live-pixel` | `e2e/live` | `http://localhost:8787` |
| `https-iphone`, `https-pixel` | `e2e/https` | `https://localhost:8443` |

## How to run

From the repository root, on the Node version in `.node-version`. `openssl` must be on the PATH for the TLS tests. Nothing needs Docker, a database or an account.

```sh
npm ci
npm run typecheck
npm run lint
npm test                  # all Vitest suites, with embedded Postgres
npx playwright install chromium webkit   # once, from apps/web
npm run test:e2e          # all six projects. Builds first. About 4 minutes
npm run build
npm audit --omit=dev      # must be clean
node scripts/generate-test-catalogue.mjs --check
```

One piece at a time:

```sh
npm test -w @anxiocare/shared
npm test -w @anxiocare/api
npm test -w @anxiocare/web

cd apps/api && npx vitest run test/otp.test.ts -t "is single use"
cd apps/web && npx vitest run src/routes/CheckIn.test.tsx

cd apps/web
npx playwright test --project=live-pixel e2e/live/auth.spec.ts
npx playwright test --project=iphone -g "result-severe dark"
npx playwright test --project=https-iphone
npx playwright test --project=pixel --headed -g "help light"

# Screenshots of each screen, width and theme, to a folder
SCREENS_DIR=/tmp/screens npx playwright test --project=pixel e2e/audit.spec.ts

# Keep your own servers, with the environment in playwright.config.ts
E2E_REUSE=1 npx playwright test --project=live-pixel
```

Playwright starts three servers, and lists them under `webServer` in `apps/web/playwright.config.ts`. The first one builds. Ports used: 8787, 8443, 4173, 54387 to 54390. The mocked server has `reuseExistingServer: true`, so a stale one left on 4173 serves an old `dist`: kill it if results look odd.

## Environments

| Environment | Used by | Mail | Database | Cookie | Notes |
| --- | --- | --- | --- | --- | --- |
| In process | API tests | `CapturingMailer`, in memory | Embedded Postgres, a new database per harness | `__Host-session` (`NODE_ENV=test`) | `app.inject`, origin `https://app.test` |
| Mock | E2E mocked | None | None | None | `apps/web/scripts/serve-csp.mjs` serves `dist` with a copy of the CSP. `/api` returns 503 unless mocked by `e2e/fixtures.ts` |
| Dev build | E2E live | `file:` to `.e2e-outbox/mail.jsonl` | Embedded Postgres in `apps/api/.pgdata-e2e`, port 54387, wiped each run by `DEV_FRESH=1` | `session` | `apps/api/scripts/dev.ts` with `DEV_USE_BUILD=1`: real `dist/server.js`, in `NODE_ENV=development` |
| Production mode, locally | E2E HTTPS | SMTP over STARTTLS to a stub, to `.e2e-outbox/https-mail.jsonl` | Embedded Postgres with TLS, port 54388 | `__Host-session` | `apps/api/scripts/https-stack.ts`. Logs go to `.e2e-outbox/https-server.log` |
| CI | All of the above | As above | As above | As above | Ubuntu. Has never run: see [TEST-REPORT.md](TEST-REPORT.md) |
| Staging | Manual | Real provider | Separate Supabase project | `__Host-session` | Doesn't exist yet. Owner to create. Destructive manual cases need it |
| Production | Manual smoke only | Real provider | Supabase, Mumbai | `__Host-session` | Doesn't exist yet |

## How the setups work

### Postgres in API tests

`apps/api/test/global-setup.ts` starts one embedded Postgres for the run: temp directory, free port, `fsync=off`, 300 connections. It creates a migration role that is deliberately not a superuser (like Supabase's `postgres`), and the runtime role from the same SQL production uses. The port goes to tests through Vitest's `provide` and `inject`.

`createHarness()` in `apps/api/test/helpers.ts` then gives each suite:

- **Its own database,** named `t_<pid>_<n>_<hex>`, with the real migrations applied by the migration role.
- **`h.app`:** the real app built by `buildApp`, using the runtime role. Tests go through `Client`, which keeps a cookie and sends CSRF headers.
- **`h.admin`:** a superuser connection, for looking at raw rows as an attacker with a dump would, and for moving time (`UPDATE app.sessions SET last_seen_at = now() - interval '…'`). Time is never mocked.
- **`h.runtime`,** `h.mailer` and `h.logs`, to assert on what the app can do, what it sent and what it logged.

Each `Client` gets its own IP through `remoteAddress`, so rate limits fire only where a test wants them. `uniqueEmail()` keeps quotas apart. Mail is sent after the response, so call `await h.app.drainBackground()` before reading `h.mailer`. `requestCode()` does this for you.

`apps/api/test/tls.test.ts` starts its own Postgres with TLS, using certificates from `openssl`, to prove the hostname and CA checks fail when they should.

### Postgres and faults in live E2E

The first Playwright server runs `npm run build && npm run dev -w @anxiocare/api` with `DEV_USE_BUILD=1`, `DEV_FRESH=1`, `DEV_PG_DIR=.pgdata-e2e` and `DEV_PG_PORT=54387`. It runs the same bundle production runs. Its data and keys are thrown away on each start, and it does not touch a developer's dev database.

`apps/web/e2e/live/support.ts` reads the superuser password from `apps/api/.pgdata-e2e.keys.json`, to inject faults without mocking anything:

- `injectFault(userId, table, 'fail' | 'slow')` adds a trigger scoped to one user, so parallel tests are not affected.
- `corruptJournal(userId)` damages one ciphertext, as real corruption would.

`TRUST_PROXY_HOPS=1` lets each test send its own `X-Forwarded-For` (`10.x.y.z`, random per test). So per-IP limits stay on at production values, and one test can't spend another's allowance. Sending more than a test's own share still gets a 429, by design.

### The outbox

In dev and live E2E, `MAIL_TRANSPORT=file:<repo>/.e2e-outbox/mail.jsonl`. Each mail is one JSON line: `at`, `from`, `to`, `subject`, `text`, `purpose`, `code`. `code` is plain digits, and `text` prints them grouped. The file has mode 0600, is git-ignored, and is appended to across runs and never truncated.

`support.ts` reads it through `mailCount(email, purpose)` and `waitForCode(email, purpose, after)`. Delivery happens after the 202, so always poll: take the count before the request, then wait for a line after it. `file:` is refused in production twice: in config validation, and again in `createMailer`.

### The HTTPS stack

`apps/api/scripts/https-stack.ts`, started by Playwright, is production mode on this machine:

```text
browser -TLS-> terminator (https://localhost:8443) -HTTP-> dist/server.js -TLS verify-full-> Postgres
                                                                 \-STARTTLS-> SMTP stub
```

- It generates a self-signed EC certificate for `localhost`, valid 2 days, in a temp directory. Node trusts it through `NODE_EXTRA_CA_CERTS`. The server gets it as `DATABASE_CA_CERT`.
- Postgres runs with `ssl=on`, and the server connects as `anxiocare_runtime`, with verified TLS.
- The SMTP stub speaks just enough protocol for nodemailer's required STARTTLS, and writes to `.e2e-outbox/https-mail.jsonl`.
- The terminator overwrites `X-Forwarded-For` and `CF-Connecting-IP`, as Render's edge is documented to, with client address `198.51.100.77`. The test asserts the log line `client ip resolved: public IPv4 via header`, and that the address never reaches the log.
- All secrets are random per run. `NODE_ENV=production`: nothing about production validation is relaxed.

The browser runs with `ignoreHTTPSErrors` and `serviceWorkers: 'block'`, because service workers refuse self-signed certificates. So the service worker has not been exercised over HTTPS.

### What every live test checks without being asked

The `guard` fixture in `support.ts` is automatic. A live test fails if, at any point, there is: a console error, an uncaught exception, a CSP violation, a request to another origin, or an `/api` response served by the service worker. A test that provokes a failure on purpose says so first: `guard.expectHttpError(/path/, status)`, `guard.expectOfflineErrors()`, `guard.expectCspViolation()`.

Mocked tests don't have the guard. `audit.spec.ts` watches CSP violations only.

### Axe

Both suites use `withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])`, and **only fail on `serious` and `critical` impact.** Moderate and minor violations don't fail anything, and aren't reported anywhere. See [../ACCESSIBILITY.md](../ACCESSIBILITY.md).

## Test data

- **All of it is made up.** Personas like `asha.menon@example.in` are in `apps/web/e2e/fixtures.ts`. API payloads use `SECRET-THOUGHT` markers so plaintext is easy to spot in a raw row. E2E accounts come from `uniqueEmail(tag)`.
- **Everything is throwaway.** Databases and keys are recreated each run. CI uploads a report and screenshots on failure, kept 7 days, and these hold only made-up data.
- **Band boundaries:** answers for each band are in `apps/web/e2e/live/guest.spec.ts` and in MT-RES in the manual cases.
- **The manual cases use real inboxes and real systems,** so they have their own rules at the top of [MANUAL-TEST-CASES.md](MANUAL-TEST-CASES.md). No real personal content, ever.

## How to write new tests

**Choose the lowest level that can fail for the right reason.** A scoring rule is a unit test. A permission rule is an API integration test on real Postgres. Something that depends on layout, the service worker, or CSP is E2E. If it can't be automated, add a manual case.

**Rules everywhere:**

1. Import wording from `@anxiocare/shared` (`GAD7_ITEMS`, `HELPLINES`, and so on) rather than retyping it, so a test can't quietly agree with a typo. Exact UI labels that aren't shared are asserted literally, on purpose.
2. Watch the test fail before you trust it: break the code, or flip the assertion, once.
3. When fixing a bug, add the test that would have caught it.
4. Prove the negative as well: not only that the owner can read a row, but that another user gets a 404 and the row is unchanged.

**API tests:**

```ts
const h = await createHarness();                        // in beforeAll; close in afterAll
const { client } = await signInConsented(h);            // a new client, IP and account
const other = await signInConsented(h);
const r = await other.client.get(`${API}/journal/${id}`);
expect(r.statusCode).toBe(404);
const raw = await h.admin`SELECT payload_ct FROM app.journal_entries WHERE id = ${id}::uuid`;
```

Move time with `h.admin`. Don't mock it. Don't share an address between tests unless the test is about quotas.

**Live E2E tests:** import `test` and `expect` from `./support`, not Playwright, or you lose the guard. Use the helpers: `signUp`, `signIn`, `takeCheckin`, `answerItems`, `seedAssessment`, `seedJournal`, `api(context)`. Find things by role and accessible name. Those are what screen reader users get, so a broken label breaks the test. Each test gets its own account. `newContext()` gives a second device with the same guard.

**New screen or route:**

1. Add it to `SCREENS` in `apps/web/e2e/screens.ts`. It then gets axe, overflow and CSP checks, in both themes and in both engines.
2. Add it to the route lists in `e2e/live/safety.spec.ts`, so "Get help" is proved on it.
3. Add it to the lists in `e2e/live/a11y.spec.ts`, if it shows real data.
4. Add it to the route map and the cases in [MANUAL-TEST-CASES.md](MANUAL-TEST-CASES.md).

**Afterwards:** run `node scripts/generate-test-catalogue.mjs`. Update `REQUIREMENTS` in that script if a requirement's coverage changed. A renamed test will fail the script until the matrix is updated: that is intended.

Don't use `test.only` (`forbidOnly` fails it in CI). Don't add retries: this suite has none, and a flaky test here is hiding a race.

## CI coverage

Defined in `.github/workflows/`, runs on PRs and pushes to `main`. **It has never run.** Actions are pinned by SHA.

| Job | Steps | Fails on |
| --- | --- | --- |
| `verify` (20 min) | `npm ci`, typecheck, lint, `npm test`, `npm audit --omit=dev`, `npm audit --audit-level=high`, build | Any failure. Lint warnings don't fail it |
| `e2e` (45 min) | `npm ci`, install Chromium and WebKit with deps, `npm run test:e2e`. Uploads report on failure | Any failure |
| `CodeQL` | `security-extended` for JavaScript and TypeScript. Also weekly | Findings, as configured in GitHub |

`render.yaml` sets `autoDeployTrigger: checksPass` on `main`, so a failing check should hold a deploy. Dependabot opens weekly updates for npm and Actions.

**Not in CI:** the catalogue check, the JS budget, Node versions other than `.node-version`, and anything manual. CI runs Linux builds of WebKit and Chromium, and the only results so far are from macOS, so expect small differences on first run.

## Known gaps

The full list is in [TEST-CASES.md](TEST-CASES.md#requirements-with-no-automated-coverage). The ones that matter most:

| Gap | Risk | Covered by |
| --- | --- | --- |
| No phone call has been placed. No number has been verified | A helpline number is wrong or unreachable | MT-HELP, every release |
| No real device, anywhere | Layout, keyboard, safe areas, audio, autofill and install | MT-DEV, MT-PWA, MT-MAIL |
| Nothing hears a sound: Web Audio is mocked, and tests prove only that start, stop, hide and unmount close the context without errors. Grounding is only checked by axe | Tools harsh or silent, with a green build | MT-TOL. Worth adding a component test for Grounding |
| `live/keyboard.spec.ts` walks the main journeys by script. Journal, Trends and most sheets aren't walked, and no person has tried it | Keyboard failures there go unseen | MT-ACC-18 |
| No screen reader has been used | Unknown | MT-ACC |
| Axe fails only on serious and critical | Moderate issues go unseen | Consider failing on all impacts, or reporting them |
| The live consent journey makes one account's accepted version old in the database. No test deploys a bumped build | A real version bump could still surprise | MT-CON-04 to 06 |
| Dizziness warning, difficulty sentence and progress indicator have no test | Copy could vanish in a refactor | Worth one-line component tests |
| The JS budget is enforced on localhost, not through Render's edge | The edge could change what arrives | `live/compression.spec.ts`, MT-DEP-19 |
| The mock CSP in `serve-csp.mjs` is a copy of the server's | Mock audit passes under a CSP production doesn't use | `live/security.spec.ts` pins the real one exactly |
| `rotate-keys` CLI and `RootError` aren't exercised. `schedulePurge` runs on fake timers only | A broken wrapper goes unseen | MT-DEP-11, MT-DEP-16, MT-NAV-09 |
| `notify-all` has never used a real mail provider | A breach notice could fail when it matters | Try it before launch: `docs/OPERATIONS.md#how-to-reach-people` |
| Supabase, Render, Cloudflare, a real SMTP provider, GitHub Actions | The design is unverified on the real platform | MT-DEP, MT-SEC, MT-MAIL |
