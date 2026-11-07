# Help and crisis

## Purpose

A person in distress must reach a helpline in one tap, from anywhere, with no account, on a bad network. The spec counts failing this as failing outright, whatever else works. Safety rules are in [CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md).

## User-facing behaviour

- **"Get help"** is in the header on every screen, including mid check-in, the code screen, the consent gate and not-found.
- **`/help`**: a yellow "Call 112" button first, then each helpline with a call button, hours and a description. WhatsApp and website links where available. Then guidance on thoughts of self-harm, links to breathing and grounding, and how and when the numbers were checked. No login and no animation.
- **Before the app loads**: after 2.5 seconds on a slow load, "Still loading" and call links fade in. With JavaScript off, the same links show.
- **Results**: severe results show Tele-MANAS first, and every result says the GAD-7 doesn't ask about self-harm.
- The manifest lists Help as a home-screen shortcut.

Helplines in the code (`HELPLINES`):

| Name | Number | Hours as shown |
| --- | --- | --- |
| Emergency services | 112 | |
| Tele-MANAS | 14416 | 24 hours, every day |
| Tele-MANAS (toll-free) | 1800-891-4416 | 24 hours, every day |
| Vandrevala Foundation | +91 99996 66555 (also WhatsApp) | 24 hours, every day |
| iCALL (TISS) | +91 91529 87821 | Monday to Saturday, daytime |

## How it works

All numbers live in [packages/shared/src/helplines.ts](../../packages/shared/src/helplines.ts). Nothing else should hold a number.

**First bundle.** [router.tsx](../../apps/web/src/router.tsx) imports `Help` and `Home` directly, not lazily, so a failed chunk can't strand someone away from Help.

**No server needed.** Help reads only from `shared`. It doesn't call `useMe` or any API.

**Static links.** The `staticHelpLinks` plugin in [vite.config.ts](../../apps/web/vite.config.ts) replaces `<!--help-links-->` in `index.html` from shared data at build time. `.boot-late` in [styles.css](../../apps/web/src/styles.css) reveals them with a delayed CSS animation, so it works before any script runs.

**Offline.** The service worker precaches the app. See [PWA and offline](pwa-and-offline.md).

**Error screens.** `RouteError` and `NotFound` keep the header and link to Help. `RootError`, for when the shell itself fails, uses a plain link for a full page load.

## Key files

- [packages/shared/src/helplines.ts](../../packages/shared/src/helplines.ts)
- [apps/web/src/routes/Help.tsx](../../apps/web/src/routes/Help.tsx)
- [apps/web/src/shell/Shell.tsx](../../apps/web/src/shell/Shell.tsx) (`GetHelpLink`)
- [apps/web/src/shell/RouteError.tsx](../../apps/web/src/shell/RouteError.tsx)
- [apps/web/index.html](../../apps/web/index.html)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts)
- [apps/web/src/router.tsx](../../apps/web/src/router.tsx)

## Data and API used

None. Static data from `packages/shared`.

## Security/privacy notes

- A `tel:` link hands off to the phone. The app doesn't record that it was tapped.
- `wa.me` and helpline websites are links a person chooses. They open other services under those services' terms, and they aren't loaded by the app. The Help page marks websites as needing internet.
- The Help page tells people these services are independent, and that AnxioCare isn't an emergency service.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Offline, after one visit | Help opens and links work, if the phone can call |
| First visit with no network | Nothing loads. A browser error page is the limit of what a website can do |
| Slow network | Static call links after 2.5 seconds |
| JavaScript off | Static call links in `<noscript>` |
| A route's chunk fails | Error screen with "Go to Help", which works without reloading |
| App shell crashes | `RootError` with a full-page link to `/help` |
| Desktop browser with no phone app | `tel:` depends on the system. Numbers are visible as text |

## Tests that cover it

- [apps/web/e2e/live/safety.spec.ts](../../apps/web/e2e/live/safety.spec.ts)
- [apps/web/e2e/resilience.spec.ts](../../apps/web/e2e/resilience.spec.ts)
- [apps/web/src/shell/Shell.test.tsx](../../apps/web/src/shell/Shell.test.tsx)
- [apps/web/src/shell/guards.test.tsx](../../apps/web/src/shell/guards.test.tsx) (`Help needs no login`)
- [packages/shared/src/gad7.test.ts](../../packages/shared/src/gad7.test.ts) (`helplines`)

## Known limits

- **The numbers have been checked against published sources, not by phone.** Help and About say so, from `helplinesCheckNote(HELPLINES_CHECK_METHOD, HELPLINES_CHECKED_ON)`. The design spec leaves phoning each helpline to the owner. Once that's done, change the method and the date, as in [the procedure](../CLINICAL-SAFETY.md#procedure). See [LAUNCH-CHECKLIST.md](../LAUNCH-CHECKLIST.md).
- Tests check that numbers are dialable in format, not that a person answers.
- No crisis detection anywhere. The app does not read what people write.
- English only, though the services themselves offer many languages.
- India only.
