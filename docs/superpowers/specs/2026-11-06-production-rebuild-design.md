# AnxioCare production rebuild: design

Status: the owner chose the stack and opted out of further questions. Everything else is the builder's call.
The previous prototype is on `main` (`git show main:src/...`); use it only to understand the idea.

## Intent
Free, private anxiety self-check for adults in India, used on phones: take the GAD-7, understand the score
without being diagnosed, use calming tools, track change over time, reach real help immediately. It holds
identifiable mental health data, so trust and safety come before features.

## Owner decisions
- Public app; each user's data is private to them. India first. Accounts with server storage.
- Node API on Render, Supabase as the Postgres database. Full rewrite. Mobile-first responsive web.

## Non-goals / anti-goals
- No diagnosis, no AI advice, no invented statistics, no gamification (no confetti, streaks or celebration of scores).
- No third-party analytics, trackers, ad SDKs, CDNs or remote fonts. No clinician or employer access.
- No unvalidated scales or subscale "breakdowns". Under-18s not served (DPDP parental-consent burden).
- Failure even if it works: a person in distress cannot reach a helpline in one tap, or data leaks across users.

## Architecture
npm workspaces. `packages/shared` (GAD-7, helplines, zod contract: the single source of truth; already written),
`apps/api` (Fastify 5, TypeScript, `postgres`), `apps/web` (React 19, Vite, React Router, TanStack Query, Tailwind 4, PWA).
**One origin**: the API process serves the built SPA and `/api/v1/*`. `onrender.com` is a public suffix, so split
hosts would be cross-site and break strict cookies. Single Render web service, `render.yaml`.
Supabase is plain Postgres only, Mumbai region, reached with TLS verification. No Supabase client in the browser.

## Security requirements (all mandatory)
**Auth**: passwordless email OTP (no password store). 8 digits from CSPRNG, stored as HMAC with a server pepper, 10 min
expiry, single use, 5 attempts per code, constant-time compare. Request endpoint always answers 202 identically and
sends mail out of band so neither response nor timing reveals whether an account exists. Limits enforced in the DB per
purpose: 5 sends an hour per (canonical address, client), 20 per canonical address, and 50 failed guesses a rolling day; plus per-client route limits. Phone OTP deferred: India's DLT SMS registration is a business process.
**Sessions**: opaque 256-bit token in `__Host-session` cookie (HttpOnly, Secure, SameSite=Strict, Path=/; plain `session`
name only in development on localhost). Only the SHA-256 hash is stored. 30-day sliding idle, 90-day absolute. New token at each login.
Users can list and revoke sessions and log out everywhere.
**CSRF**: SameSite=Strict + exact `Origin` check against `PUBLIC_ORIGIN` + required custom header (`CSRF_HEADER`) on all non-GET.
**Authorisation**: every data query is scoped by the session's user id; cross-user access returns 404. Data routes return 403
`consent_required` until the current consent version is accepted.
**Encryption at rest (application layer)**: per-user 256-bit data key, wrapped by a versioned master key from env
(`ENCRYPTION_KEYS="v1:<b64>"`, `ENCRYPTION_ACTIVE_KEY=v1`). AES-256-GCM, fresh random nonce, AAD binds ciphertext to
`table:rowId:userId`, so rows cannot be swapped. Encrypted and padded to fixed sizes or size steps, so length reveals nothing: email, display name, device label, assessment answers/score/severity,
journal payload. Plaintext limited to ids, timestamps, hashes. Email lookup uses an HMAC blind index with a separate key.
Deleting a user destroys the wrapped key. Include a master-key rotation script.
**Database**: tables in private schema `app`, not `public`, so Supabase's auto REST API cannot reach them; RLS enabled with no policies
as a second wall; separate least-privilege runtime role (no DDL, no access to anything else) distinct from the migration role.
TLS `verify-full` with `DATABASE_CA_CERT` mandatory in production. Parameterised queries only. Support Supavisor session pooler; `prepare: false`.
**HTTP**: Helmet with strict CSP (`default-src 'none'`, self for script/style/img/font/connect/manifest/worker, no unsafe-inline,
`frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), HSTS, `Referrer-Policy: no-referrer`, `Permissions-Policy`, nosniff, COOP/CORP.
No CORS. `Cache-Control: no-store` on all API responses; hashed assets immutable; `index.html` and `sw.js` no-cache. Body limit 64 KB. Strict zod validation
rejecting unknown keys. Errors are RFC 9457 with no internals. Per-route rate limits.
**Logging**: pino with allow-list serialisers: method, route template, status, duration, request id. Never bodies, cookies, emails, IPs, query strings.
Audit table, with times to the day only, and HMAC-pseudonymised actor for login, logout, consent, export, delete, email change.
**Config**: validate all env at boot with zod and refuse to start if invalid; production refuses dev mail transport, missing CA, or weak keys.
**Client**: nothing sensitive in `localStorage` (theme only). Query cache in memory only and cleared at logout. Guest result in `sessionStorage` only.
Service worker never caches `/api`. No `dangerouslySetInnerHTML`.
**Mail**: SMTP via nodemailer (any provider). Neutral subject and body ("Your sign-in code") with the code in the body only and no mention of anxiety or health,
because lock screens and shared inboxes expose it. Transports: `smtp`, and `file:<path>` for dev/e2e only.
**Supply chain**: lockfile, `npm audit` clean, Dependabot, CodeQL, CI gates, secret scanning guidance. Exact-pinned GitHub Actions.

## Privacy (DPDP Act 2023 / Rules 2025)
Main duties phase in around May 2027; build to them now. Plain-language notice before consent; 18+ self-declaration and explicit health-data consent,
versioned and timestamped; re-prompt on version change. Consent gate happens after first code verification so sign-up and sign-in look identical; unconsented accounts purged after 24h.
Rights in the UI: view and correct, download all data (JSON), delete account now (fresh OTP; rows hard-deleted at once, no grace period; encrypted backups age out within the stated retention), which also withdraws consent.
Data minimised: email and optional display name only. The prototype's age, gender and occupation are dropped. Scheduled purge of expired sessions, codes and unconsented accounts.
Audit retention one year. Privacy and Terms pages, drafted from what the app really does, with operator name and grievance contact from config, marked for legal review in docs.

## Clinical safety
Exact GAD-7 wording and cut points from `shared`; the server computes the score. Never "diagnosis": always "screening". 10+ recommends a professional.
Severe shows support prominently but calmly. Prominent wording: the GAD-7 doesn't ask about self-harm, so a persistent "Get help" control is on every screen, including during the check-in.
Helplines are `tel:` links, one tap, and work offline. Attribution displayed. Breathing tools warn to stop if dizzy.

## Product
Works without an account: check-in with result, tools, help, legal. Account adds saving: trends, journal, settings. Guest result is offered for saving after sign-in.
- **Home**: greeting, last result with next check-in date (14 days), quick links to tools.
- **Check-in**: one item per screen, large tap targets, auto-advance with back, progress, resume in-session, difficulty item when any symptom was reported.
- **Result**: score, severity, plain meaning, difficulty, next steps, save prompt, doctor-friendly print view.
- **Tools**: paced breathing (4-6 default, box, 4-7-8; visual, optional haptic), 5-4-3-2-1 grounding guided steps, soundscapes generated by Web Audio (no audio downloads, no CSP change), thought record.
- **Journal**: CBT thought records, create/edit/delete, encrypted.
- **Trends**: accessible hand-built SVG chart with table alternative (drop Chart.js), history list, delete an entry.
- **Help**: helplines, emergency 112, offline-capable, no login, no animation.
- **Settings**: name, email change (OTP to both the current and the new address), sessions, theme, download data, delete account, legal.

## UX standards
Mobile-first 320-430px; desktop is a centred, comfortable layout. Bottom tab bar, safe-area insets, `dvh`, targets at least 44px, thumb reach, no horizontal scroll at 320px, `inputmode="numeric"`/`autocomplete="one-time-code"`.
WCAG 2.2 AA: keyboard, focus management on route change, labels, live regions, contrast, reduced motion, no information by colour alone. Light and dark. Skeletons, empty, error and offline states, error boundary, 404, code-split routes, real URLs and working back button.
Self-hosted fonts. Installable PWA with real icons. Budget: initial JS under 170 KB gzipped. Warm and human, the opposite of the prototype's neon-on-slate look.

## Testing
Vitest for logic and components. API integration tests on real Postgres (`embedded-postgres`) covering cross-user access, OTP limits and expiry, enumeration resistance, CSRF, encryption at rest (raw SELECT shows no plaintext),
export, deletion, consent gate, headers. Playwright e2e on iPhone (WebKit) and Android (Chromium) with axe, overflow checks at 320-430px, CSP-violation check, offline Help page.

## Left to the owner (cannot be done from here)
Supabase project and Render service creation, secrets, SMTP provider with SPF/DKIM, operator identity and grievance contact, legal review, phoning each helpline before launch, clinical review of copy.
