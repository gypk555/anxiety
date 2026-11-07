# AnxioCare

A free, private anxiety self-check for adults in India, built for phones. A person takes the GAD-7 questionnaire, reads what the score means without being diagnosed, uses calming tools, tracks change over time, and can reach a real helpline in one tap from any screen.

The app holds identifiable mental health data, so privacy and safety rules come before features. It is a screening and self-care tool. It does not diagnose, treat or give medical advice.

**Status: not deployed.** It has never run on Supabase, on Render, or with a real SMTP provider. Every test so far uses an embedded local Postgres, a local TLS stack and a stub mail server. Legal review, clinical review of the copy, and phoning each helpline are still open. See [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md).

## Features

Without an account:

- GAD-7 check-in: one question per screen, resume after a refresh, optional difficulty question when any symptom was reported.
- Result with score, severity range, plain meaning, next steps and a print view for a doctor.
- Paced breathing (slow exhale, box, 4-7-8), 5-4-3-2-1 grounding, and soundscapes generated on the device.
- Help screen: emergency 112 and helplines as `tel:` links. It needs no login and works offline after one visit. "Get help" is in the header of every screen.
- Privacy, Terms and About pages. Light and dark themes. Installable as a PWA.

With an account (password, Google, or an emailed code):

- Save check-ins, including a result taken before signing in.
- Trends: a chart with a table alternative, a history list, and deleting an entry.
- Journal: CBT thought records. Create, edit, delete.
- Settings: name, email change (a code from each inbox), signed-in devices, download all data as JSON, delete the account at once.

Not in the app, on purpose: diagnosis, AI advice, streaks or celebration of scores, third-party analytics, trackers, ads, CDNs, remote fonts, and clinician or employer access. It is not for under-18s.

## Tech stack

| Part | Choice |
| --- | --- |
| Monorepo | npm workspaces: `packages/shared`, `apps/api`, `apps/web` |
| API | Node, Fastify 5, TypeScript (scripts run directly by Node, esbuild bundles the server), `postgres` driver, Pino, Nodemailer, Zod |
| Web | React 19, Vite 8, React Router, TanStack Query, Tailwind 4, `vite-plugin-pwa` |
| Database | Postgres. Planned host: Supabase, Mumbai region, used as plain Postgres |
| Hosting | One Render web service in Singapore, defined in [render.yaml](render.yaml) (not yet created) |
| Tests | Vitest, `embedded-postgres`, Playwright, axe |

## Requirements

- Node 24.7 or newer, for `crypto.argon2` (`engines` in [package.json](package.json)). [.node-version](.node-version) pins 26, which CI and Render use.
- npm, which comes with Node.
- For the end-to-end tests only: Playwright browsers and `openssl`.

Docker and an installed Postgres are not needed.

## Quick start

```sh
npm install
npm run build      # optional: lets the API on :8787 serve the app too
npm run dev:api    # terminal 1: API on http://localhost:8787
npm run dev:web    # terminal 2: app on http://localhost:5173
```

`dev:api` needs no setup and no `.env` file. It starts an embedded Postgres on port 54329, creates the runtime role, runs the migrations, generates local keys, and writes mail to a file. Its data stays in `apps/api/.pgdata-dev*`, which git ignores.

To sign in locally, create an account or enter any address and choose **Email me a code instead**. The code is printed in the API terminal, and also added to `.e2e-outbox/mail.jsonl`.

If `dev:api` stops with `checksum mismatch for applied migration`, your local database was made from an older migration file. `DEV_FRESH=1 npm run dev:api` wipes the local database and keys and starts again.

Neither the server nor the scripts read a `.env` file. Outside `dev:api`, set real environment variables. Each one is described in [.env.example](.env.example) and in [the API foundation doc](docs/modules/api-foundation.md).

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run dev:api` | Local API with embedded Postgres and file mail, port 8787 |
| `npm run dev:web` | Vite dev server, port 5173. Proxies `/api` to `localhost:8787` |
| `npm run build` | Builds the web app to `apps/web/dist`, then bundles the API to `apps/api/dist/server.js` |
| `npm start` | Runs the bundled API. Needs a full environment, and exits if config is invalid |
| `npm run migrate` | Applies pending migrations using `DATABASE_MIGRATION_URL` |
| `npm run typecheck` | `tsc --noEmit` in each workspace |
| `npm run lint` | oxlint |
| `npm test` | Unit, component and API integration tests in every workspace. API tests start their own Postgres |
| `npm run test:e2e` | All Playwright suites. Builds first. Run `npx playwright install chromium webkit` in `apps/web` once |
| `npm audit --omit=dev` | CI fails on any finding in shipped dependencies |
| `npm audit --audit-level=high` | CI fails on high or critical. Accepted lower findings are in [docs/SECURITY-EXCEPTIONS.md](docs/SECURITY-EXCEPTIONS.md) |

Workspace commands:

| Command | What it does |
| --- | --- |
| `npm run db:setup` | From `.env.setup`, makes a real database ready: secrets once, runtime role, migrations, verification. Idempotent |
| `npm run db:verify` | Read-only pass or fail report on that database |
| `npm run doctor` | Checks a full production environment, without starting the server |
| `npm run generate-secrets -w @anxiocare/api` | Prints new keys and the SQL for the runtime role. The output is secret |
| `npm run purge -w @anxiocare/api` | One purge run. Needs the full environment |
| `npm run rotate-keys -w @anxiocare/api` | Rewraps all data keys under the active master key. Needs the full environment |
| `npm run notify-all -w @anxiocare/api -- --subject ... --body-file ...` | Breach notice to every account. Prints only the count unless given `--send`: [how to use it](docs/OPERATIONS.md#how-to-reach-people) |
| `npm test -w @anxiocare/api` | API tests only (also `-w @anxiocare/web`, `-w @anxiocare/shared`) |
| `npm run preview -w @anxiocare/web` | Serves `apps/web/dist` on port 4173, proxying `/api` |
| `npm run icons -w @anxiocare/web` | Re-renders the PNG icons from `public/icon.svg`. The output is committed |

Local options for `dev:api`: `DEV_FRESH=1`, `DEV_USE_BUILD=1` (run `dist/server.js`; build first), `DEV_PG_DIR`, `DEV_PG_PORT`, `PORT`, `MAIL_TRANSPORT`, `PUBLIC_ORIGIN`, `DEV_ORIGINS`. Details are in [apps/api/README.md](apps/api/README.md).

## Repository layout

```text
packages/shared/    GAD-7 wording and scoring, helplines, Zod request and response schemas
apps/api/
  migrations/       SQL migrations
  scripts/          dev, build, migrate, purge, rotate-keys, notify-all, generate-secrets, https-stack (e2e)
  src/              Fastify app, routes/, crypto, OTP, mail, purge, config
  test/             Integration tests on real Postgres
apps/web/
  src/routes/       One file per screen or screen family
  src/shell/        App frame, guards, error screens, update prompt
  src/ui/           Shared components, including the chart
  src/lib/          API client, queries, guest storage, drafts, theme, sound
  e2e/              Playwright: audit (mocked API), live/ (real stack), https/ (production mode behind TLS)
scripts/            generate-test-catalogue.mjs: writes docs/testing/TEST-CASES.md
docs/               Everything linked below
render.yaml         Render service definition
.env.example        Every production setting, with comments
```

## Documentation

**Understanding the system**

- [Architecture](docs/ARCHITECTURE.md): diagrams, request lifecycle, data flows, trust boundaries
- [API reference](docs/API.md)
- [Database](docs/DATABASE.md): tables, encryption per column, roles, RLS, migrations
- [Glossary](docs/GLOSSARY.md)

**Modules**

[Auth and sessions](docs/modules/auth-and-sessions.md) · [Consent and privacy rights](docs/modules/consent-and-privacy-rights.md) · [Encryption](docs/modules/encryption.md) · [Email](docs/modules/email.md) · [Background jobs](docs/modules/background-jobs.md) · [Check-in and scoring](docs/modules/check-in-and-scoring.md) · [Results](docs/modules/results.md) · [Trends](docs/modules/trends.md) · [Journal](docs/modules/journal.md) · [Relief tools](docs/modules/relief-tools.md) · [Help and crisis](docs/modules/help-and-crisis.md) · [Settings](docs/modules/settings.md) · [PWA and offline](docs/modules/pwa-and-offline.md) · [Design system](docs/modules/design-system.md) · [App shell and routing](docs/modules/app-shell-and-routing.md) · [API foundation](docs/modules/api-foundation.md)

**Decisions**

1. [Email codes instead of passwords](docs/decisions/001-email-codes-instead-of-passwords.md) (superseded by 012)
2. [Single origin](docs/decisions/002-single-origin.md)
3. [Supabase as plain Postgres, private schema](docs/decisions/003-supabase-as-plain-postgres.md)
4. [Application-layer encryption with per-user keys](docs/decisions/004-application-layer-encryption.md)
5. [RLS with role-scoped policies, not BYPASSRLS](docs/decisions/005-rls-role-scoped-policies.md)
6. [PWA first, not native](docs/decisions/006-pwa-first.md)
7. [Exact GAD-7, extended scale removed](docs/decisions/007-exact-gad7.md)
8. [No third-party analytics](docs/decisions/008-no-third-party-analytics.md)
9. [Guest check-in](docs/decisions/009-guest-check-in.md)
10. [Eight-digit codes and quotas](docs/decisions/010-eight-digit-codes-and-quotas.md) (partly superseded by 012)
11. [Hand-built SVG chart](docs/decisions/011-hand-built-svg-chart.md)
12. [Passwords, Google and six-digit codes](docs/decisions/012-passwords-google-and-six-digit-codes.md)

**Security, privacy and safety**

- [Security policy and how to report a problem](SECURITY.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Privacy compliance](docs/PRIVACY-COMPLIANCE.md)
- [Clinical safety](docs/CLINICAL-SAFETY.md)
- [Accepted security exceptions](docs/SECURITY-EXCEPTIONS.md)

**Running it**

- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
- [Launch checklist](docs/LAUNCH-CHECKLIST.md)

**Testing and quality**

- [Automated test cases](docs/testing/TEST-CASES.md)
- [Manual test cases](docs/testing/MANUAL-TEST-CASES.md)
- [Accessibility](docs/ACCESSIBILITY.md)

**Working on the project**

- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Original design spec](docs/superpowers/specs/2026-11-06-production-rebuild-design.md). Written before the build. Where it differs from the code, the code is right.
- Package notes: [apps/api](apps/api/README.md), [apps/web](apps/web/README.md), [packages/shared](packages/shared/README.md)
