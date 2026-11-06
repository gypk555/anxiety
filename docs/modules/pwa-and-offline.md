# PWA and offline

## Purpose

Installable on a phone, with Help and the tools working with no network, while the service worker never stores any personal data. Why a PWA: [decision 006](../decisions/006-pwa-first.md).

## User-facing behaviour

- Add to home screen, from Settings or the browser. Opens standalone, in either orientation, with shortcuts to Help and Breathe.
- After one visit, offline still gives: Help, Tools, Sounds, the check-in with a guest result, and the legal pages minus server-provided details.
- A banner says "You're offline. Help, breathing and grounding still work."
- Screens that need data show a clear offline state, with a Help link.
- When a new version is ready, a small "New version available" prompt offers Later or Refresh. It never interrupts on its own.

## How it works

`vite-plugin-pwa` generates the service worker from [vite.config.ts](../../apps/web/vite.config.ts):

- `strategies: 'generateSW'`, `registerType: 'prompt'`, `injectRegister: false`. Registration comes from the bundle through `useRegisterSW` in `UpdatePrompt`, because the CSP forbids inline script.
- `globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}']`, ignoring Vietnamese font files. The last build precached 42 entries, about 841 KiB.
- `runtimeCaching: []`. It caches nothing it wasn't told to at build time.
- `navigateFallback: '/index.html'`, with `navigateFallbackDenylist: [/^\/api(\/|$)/]`.
- `skipWaiting: false`, `clientsClaim: false`, `cleanupOutdatedCaches: true`.
- `devOptions: { enabled: false }`, so there's no service worker with `npm run dev:web`.

The server sends `sw.js`, `index.html` and the manifest with `cache-control: no-cache`, and hashed `/assets/*` as immutable. See [API foundation](api-foundation.md#static-files).

`useOnline` follows `online` and `offline` events. The query client uses `networkMode: 'always'`, so requests really fail and show an error, rather than silently pausing. A `NetworkError` retries once.

Icons are committed in `apps/web/public/icons`, generated from `public/icon.svg` by `npm run icons -w @anxiocare/web`. Render's build runs with `--ignore-scripts`, and doesn't regenerate them.

## Key files

- [apps/web/vite.config.ts](../../apps/web/vite.config.ts)
- [apps/web/src/shell/UpdatePrompt.tsx](../../apps/web/src/shell/UpdatePrompt.tsx)
- [apps/web/src/shell/Shell.tsx](../../apps/web/src/shell/Shell.tsx) (`OfflineBanner`)
- [apps/web/src/lib/online.ts](../../apps/web/src/lib/online.ts)
- [apps/web/src/routes/Settings.tsx](../../apps/web/src/routes/Settings.tsx) (`InstallRow`)
- [apps/web/scripts/gen-icons.mjs](../../apps/web/scripts/gen-icons.mjs)
- [apps/api/src/static.ts](../../apps/api/src/static.ts)

## Data and API used

None. The service worker's cache holds only built files. In-progress data stays in `sessionStorage` or memory.

## Security/privacy notes

- `/api` is never cached. Two e2e tests inspect the caches, and API responses also carry `no-store`.
- `GET /me` and any other data are never available offline, so an unattended device doesn't expose them from a cache.
- All files come from this origin. Fonts are self-hosted. `assetsInlineLimit: 0`, because the CSP has no `data:` source.
- Sign-out leaves the app's files cached, not personal data.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| First visit offline | The browser's error page |
| Goes offline while signed in | Cached queries in memory stay until reload. New requests show the offline state |
| Reload offline, signed in | `/me` fails. Home shows the guest view. Data routes show the offline state |
| Update prompt ignored | The old version keeps running until all tabs close |
| A mid-session deploy removes old chunks | A chunk error screen appears with Help and Reload. Precached chunks still load |
| Offline at the end of a signed-in check-in | The result stays in the tab, and can be saved later |
| iOS | There's no install prompt event, so Settings shows Safari's steps |

## Tests that cover it

- [apps/web/e2e/resilience.spec.ts](../../apps/web/e2e/resilience.spec.ts)
- [apps/web/e2e/live/safety.spec.ts](../../apps/web/e2e/live/safety.spec.ts)
- [apps/web/e2e/live/failures.spec.ts](../../apps/web/e2e/live/failures.spec.ts)
- [apps/web/src/shell/Shell.test.tsx](../../apps/web/src/shell/Shell.test.tsx)
- [apps/api/test/http.test.ts](../../apps/api/test/http.test.ts) (`static files`)

## Known limits

- No background sync or queued writes. Saving needs a connection.
- No push notifications, so there are no reminders.
- The HTTPS e2e suite blocks service workers, since they refuse a self-signed certificate. Service-worker tests run over plain localhost.
- Not tried on a real device against a deployed origin.
- The spec's budget of 170 KB gzipped for initial JavaScript is enforced by `live/compression.spec.ts`, which counts the bytes served over real HTTP. That's on localhost, not through Render's edge. See MT-DEP-19.
