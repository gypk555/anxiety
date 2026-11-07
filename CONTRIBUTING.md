# Contributing

Read the [README](README.md) and [architecture](docs/ARCHITECTURE.md) first. This app holds mental health data and can be used by people in crisis, so some rules are absolute. They are listed below.

## Setup

```sh
npm install
npm run dev:api    # terminal 1
npm run dev:web    # terminal 2
```

No `.env` is needed. Local sign-in codes are printed in the API terminal. Requirements and all commands are in the [README](README.md#commands).

## Branches and commits

- Branch from `main`. Don't push to `main` directly. `render.yaml` deploys `main` once checks pass.
- Branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Commit messages: conventional style, such as `fix: keep the draft when a save fails`. Say what changed for a person, or why, rather than listing files.
- Never put real personal or health data, or real secrets, in a commit, test, screenshot or issue. Tests use made-up data.

## Tests required

Before opening a pull request:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Lint currently reports some warnings, and exits 0. Don't add errors.

For any change to a screen or flow, also run `npm run test:e2e`. It needs browsers once: `npx playwright install chromium webkit` in `apps/web`. See [the testing docs](docs/testing/).

CI runs all of this, plus `npm audit --omit=dev` (any finding fails) and `npm audit --audit-level=high`.

What a change must include:

| Change | Add or update |
| --- | --- |
| Any bug fix | A test that fails without the fix |
| New or changed endpoint | Tests in `apps/api/test`, [docs/API.md](docs/API.md), shared schema |
| Anything scoped to a user | A cross-user test: other people's rows return 404 |
| New table or column | Follow [adding a migration](docs/DATABASE.md#adding-a-migration) |
| New logged field | A check in [logging.test.ts](apps/api/test/logging.test.ts) |
| New screen | Add it to the e2e lists, with "Get help" present and axe passing at 320px, in both themes |

Change a module's behaviour, and update its page in [docs/modules/](docs/modules/). A significant new decision gets a new file in [docs/decisions/](docs/decisions/).

## Rules that must not be broken

Raise any change to these with the owner first. A passing test suite doesn't make it acceptable.

**GAD-7 wording.** Items, options, cut points and attribution in [packages/shared/src/gad7.ts](packages/shared/src/gad7.ts) are a validated instrument. Don't reword, add, remove or reorder them. Don't add subscales or new scoring. The word is "screening", never "diagnosis". The server computes the saved score, and the client never sends one. See [clinical safety](docs/CLINICAL-SAFETY.md).

**Helplines.**

- Numbers live only in [packages/shared/src/helplines.ts](packages/shared/src/helplines.ts).
- Phone a number before changing it, and set `HELPLINES_CHECK_METHOD` to `'phone'` with a new `HELPLINES_CHECKED_ON` only when someone has really phoned them all.
- "Get help" stays on every screen, including during the check-in, and must work with no login and offline.
- Help stays in the first bundle, with no animation and no network need.
- Don't add anything that gets between a person and a `tel:` link.

**No third parties.** No analytics, trackers, ad SDKs, CDNs, remote fonts, chat widgets or error-reporting services in the client. No new source in the CSP. All assets are self-hosted. Adding a processor on the server needs an update to the Privacy notice, and the owner's agreement. See [decision 008](docs/decisions/008-no-third-party-analytics.md).

**No sensitive logging.** Never log bodies, cookies, emails, IP addresses, query strings, user agents, codes, tokens, user ids or error messages from the database or SMTP. Logs are allow-listed. Keep them so.

**Also:**

- Nothing sensitive in `localStorage`: it's for the theme only. The query cache stays in memory.
- The service worker never caches `/api`.
- No `dangerouslySetInnerHTML`.
- Mail wording never names the product or its subject.
- All SQL is parameterised. Every data query filters on the session's user.
- Tables stay in `app`. Sensitive columns stay encrypted.
- No streaks, confetti or celebration of scores. Severity isn't shown by colour.
- No under-18s, and no clinician or employer access.

## Pull requests

Fill in the [template](.github/pull_request_template.md). Keep each PR to one thing. Security problems go through [SECURITY.md](SECURITY.md), not public issues.
