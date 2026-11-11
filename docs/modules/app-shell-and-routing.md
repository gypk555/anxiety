# App shell and routing

## Purpose

The frame around every screen, the URL map, access guards, global error and session handling, and how data is fetched on the client.

## User-facing behaviour

- Header: wordmark, "Quick exit" and "Get help", plus tabs at the `md` breakpoint. Below 390px the wordmark shows only the logomark, so both buttons fit at 320px.
- Quick exit is also in every open sheet, and Escape three times anywhere outside a text field does the same. See [quick exit](quick-exit.md).
- Bottom tab bar on phones: Home, Tools, Journal, Trends, Settings. One-task screens hide it. "Get help" never goes away.
- Real URLs, and a working back button. Focus moves to the new screen's heading after navigation, and scroll resets except on back.
- Skeletons while loading, error states with "Go to Help", and a 404 screen with Home and Help.

### Home

Home leads with what matters today. Only that card is quilted.

- **Signed in**: the date ("Thursday, 12 November") over the greeting; any work left half-done in this tab (resume rows, with a progress bar); then either
  - **check-in due** (14 days since the last one, or none yet): "Time for a check-in" with both choices, Anxiety check (GAD-7) and Reflection, one tap each, and "Last time: <band>, <score> out of 21. See result"; today's mood follows as one quiet line; or
  - **not due**: the mood card (one tap saves, see [mood log](mood-log.md)).
  Then **For right now** (Breathe on the night surface, Ground, Sounds, Write), **Your check-ins** when not due (last result, a "Next <date>" badge, Check in now and See result), and **Your space**: Safety plan, Mood log, Report for your doctor.
- **First visit or guest**: the rings, "How have the last two weeks been?", a privacy line, both check-in choices, "Overwhelmed? Breathe first", the 18+ line, and a "Want to see how you change over time?" card with Sign in and Create account.
- The Reflection choice picks its questions on tap; the question bank is loaded then, not in the first bundle.

## How it works

**Routes**, from [router.tsx](../../apps/web/src/router.tsx). `Help` and `Home` are in the first bundle. All others are `lazy`.

| Path | Screen | Needs account | Handle |
| --- | --- | --- | --- |
| `/` | Home | No | |
| `/help` | Help | No | wide |
| `/check-in` | What would you like to do? GAD-7 or Reflection | No | focus |
| `/check-in/gad7` | GAD-7 intro | No | focus |
| `/reflection/:step` | Reflection question 1-5, or `note` | No | focus |
| `/reflection/result` | A reflection in this tab, not yet saved | No | |
| `/check-in/:step` | Question or difficulty | No | focus |
| `/result` | Guest result | No | |
| `/result/:id` | Saved result | **Yes** | |
| `/reflections/:id` | Saved reflection | **Yes** | |
| `/tools` | Tools | No | |
| `/tools/breathe` | Breathe | No | focus, night |
| `/tools/ground` | Grounding | No | focus |
| `/tools/sounds` | Sounds | No | |
| `/trends` | Trends | **Yes** | |
| `/mood` | Mood log | **Yes** | |
| `/report` | Doctor report | **Yes** | wide |
| `/safety-plan` | Safety plan | No, a guest's plan stays on the device | |
| `/safety-plan/edit` | Write or change the plan | No | focus |
| `/journal` | Journal list | **Yes** | |
| `/journal/new` | New entry | **Yes** | focus |
| `/journal/:id` | Entry | **Yes** | |
| `/journal/:id/edit` | Edit | **Yes** | focus |
| `/settings` | Settings | No | |
| `/sign-in` | Email and password | No | focus |
| `/create-account` | Name, email and password | No | focus |
| `/create-account/code` | Code | No | focus |
| `/forgot-password` | Email | No | focus |
| `/forgot-password/reset` | Code and new password | No | focus |
| `/sign-in/code` | Code | No | focus |
| `/consent` | Consent | Handled itself | focus, wide |
| `/privacy`, `/terms`, `/about` | Legal | No | wide |
| `*` | Not found | No | |

Handles (`RouteHandle`): `focus` hides the tab bar, `night` forces the dark canvas, `wide` widens the column.

**Guard.** `RequireAccount` waits for `/me`, then redirects to `/sign-in?next=...` or `/consent?next=...`, or shows the error state. It doesn't treat a network failure as signed out. `safeNext` allows only same-origin paths, and never loops back into sign-in or consent.

**Errors.** `RouteError` sits inside the shell, so a failing screen keeps "Get help". It recognises chunk-load errors. `RootError` is the last resort, using plain links.

**Data.** `queryClient` in [queries.ts](../../apps/web/src/lib/queries.ts) is in memory only. Settings: `staleTime` 30 seconds (`/me` 5 minutes, `/meta` 1 hour), `gcTime` 10 minutes, no refetch on focus, retry once on `NetworkError`. Nothing is persisted.

[`api.ts`](../../apps/web/src/lib/api.ts) wraps fetch: base `/api/v1`, 20-second timeout, CSRF header on anything but GET, `credentials: 'same-origin'`, and parses problem documents into `ApiError`. `errorMessage` turns codes into words for people, and never shows raw server text. Responses are validated against the shared schemas.

**Global handling.** `handleApiError` is attached to the query and mutation caches. A 401 redirects once to sign-in, and calls `sessionEnded`. A 403 `consent_required` refreshes `/me` and redirects to consent.

**Session changes and the device.** `wipeClientData` also removes the encrypted account copy of the safety plan. `fetchMe` removes a copy that belongs to another account. See [safety plan](safety-plan.md).

**Startup.** `main.tsx` imports `zod-config` first, which sets `jitless`, since Zod's JIT would otherwise probe `new Function` and trip the CSP.

## Key files

- [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
- [apps/web/src/router.tsx](../../apps/web/src/router.tsx)
- [apps/web/src/shell/Shell.tsx](../../apps/web/src/shell/Shell.tsx)
- [apps/web/src/shell/Guards.tsx](../../apps/web/src/shell/Guards.tsx)
- [apps/web/src/shell/RouteError.tsx](../../apps/web/src/shell/RouteError.tsx)
- [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts)
- [apps/web/src/lib/queries.ts](../../apps/web/src/lib/queries.ts)
- [apps/web/src/lib/quick-exit.ts](../../apps/web/src/lib/quick-exit.ts)
- [apps/web/src/lib/held.ts](../../apps/web/src/lib/held.ts)
- [apps/web/src/lib/next-path.ts](../../apps/web/src/lib/next-path.ts)
- [apps/web/src/lib/zod-config.ts](../../apps/web/src/lib/zod-config.ts)
- [apps/web/src/ui/PageTitle.tsx](../../apps/web/src/ui/PageTitle.tsx)

## Data and API used

`GET /me` on most screens, through `useMe`. A signed-out person gets a 401, which is a normal state. Browser storage rules: [PWA and offline](pwa-and-offline.md), [check-in](check-in-and-scoring.md).

## Security/privacy notes

- The session cookie is `HttpOnly`, so JavaScript can't read it. All "am I signed in" logic comes from `/me`.
- The cache is memory only and is wiped at sign-out.
- The URL never holds personal data. `next` holds a path.
- Guards are about experience. The server enforces access on every request.
- `/result/:id` shows not-found for any row that isn't yours.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Network failure on `/me` on a guarded route | Offline state, not a sign-in screen |
| Several 401s together | Only the first redirects, so `next` isn't overwritten by `/sign-in` |
| Guest gets a 401 from `/me` | Guest data is kept |
| Session ended mid-work | Work is held in memory, and restored only for the same user id |
| Someone else signs in on the same tab | Nothing of the last person remains |
| Chunk fails to load | `RouteError` explains, answers are still there, and Help opens |
| A response fails schema validation | Treated as a query error |
| Request takes over 20 seconds | `NetworkError` |

## Tests that cover it

- [apps/web/src/shell/guards.test.tsx](../../apps/web/src/shell/guards.test.tsx)
- [apps/web/src/shell/Shell.test.tsx](../../apps/web/src/shell/Shell.test.tsx)
- [apps/web/src/lib/api.test.ts](../../apps/web/src/lib/api.test.ts)
- [apps/web/src/lib/held.test.ts](../../apps/web/src/lib/held.test.ts)
- [apps/web/src/lib/session-vault.test.ts](../../apps/web/src/lib/session-vault.test.ts)
- [apps/web/e2e/live/quick-exit.spec.ts](../../apps/web/e2e/live/quick-exit.spec.ts)
- [apps/web/src/lib/misc.test.ts](../../apps/web/src/lib/misc.test.ts) (`safeNext`)
- [apps/web/e2e/live/navigation.spec.ts](../../apps/web/e2e/live/navigation.spec.ts)
- [apps/web/e2e/live/authorisation.spec.ts](../../apps/web/e2e/live/authorisation.spec.ts)
- [apps/web/e2e/live/failures.spec.ts](../../apps/web/e2e/live/failures.spec.ts)

## Known limits

- Journal and Trends tabs show to guests, then lead to sign-in, with a one-line reason.
- `sessionList` in `queries.ts` accepts an array or `{ items }`, although the API only returns `{ items }`. Harmless.
- No route-level data loaders: each screen fetches on render.
