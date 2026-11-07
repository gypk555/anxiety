# AnxioCare web

React 19, Vite, React Router, TanStack Query, Tailwind 4, `vite-plugin-pwa`. An installable PWA, served by the API in production from one origin.

## Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run dev:web` | Dev server on port 5173. Proxies `/api` to `localhost:8787`, so start `npm run dev:api` too. No service worker |
| `npm run build -w @anxiocare/web` | Builds to `apps/web/dist`, then writes `.br` and `.gz` copies of text files |
| `npm run preview -w @anxiocare/web` | Serves the build on port 4173, proxying `/api` |
| `npm test -w @anxiocare/web` | Vitest with jsdom |
| `npm run typecheck -w @anxiocare/web` | `tsc --noEmit` |
| `npm run test:e2e` | All Playwright suites, in `e2e/` |
| `npm run icons -w @anxiocare/web` | Re-renders PNG icons from `public/icon.svg`. The output is committed |

## Layout

| Path | What |
| --- | --- |
| `src/router.tsx` | All routes. `Help` and `Home` are in the first bundle, others are lazy |
| `src/routes/` | Screens |
| `src/shell/` | Frame, guard, error screens, update prompt |
| `src/ui/` | Shared components |
| `src/lib/` | API client, queries, guest storage, drafts, theme, sound, breathing |
| `src/styles.css` | Tokens and component classes |
| `e2e/` | `audit.spec.ts` and `resilience.spec.ts` (mocked API), `live/` (real stack), `https/` (production mode behind TLS) |
| `scripts/serve-csp.mjs` | Serves `dist` under the production CSP for the audit suite |
| `scripts/precompress.mjs` | Runs after `vite build`. The API serves these copies, and never compresses its own responses |

The `@` import alias points at `src`.

## Rules

- Nothing sensitive in `localStorage`. It's only for the theme (`anxiocare-theme`). Guest data is in `sessionStorage`, drafts and the query cache in memory.
- The CSP forbids inline scripts, `data:` URIs and other hosts. Keep assets self-hosted.
- `src/lib/zod-config.ts` must load first, or Zod trips the CSP.
- "Get help" stays in the header of every screen. See [CONTRIBUTING](../../CONTRIBUTING.md#rules-that-must-not-be-broken).

More: [app shell](../../docs/modules/app-shell-and-routing.md), [design system](../../docs/modules/design-system.md), [PWA and offline](../../docs/modules/pwa-and-offline.md).
