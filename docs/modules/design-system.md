# Design system

## Purpose

A warm, calm, consistent look for people who may be distressed, on cheap phones, in both themes, with no third-party assets.

The visual idea is kantha: quilts made from old saris and sewn with running stitch. Dashes stand in for stitches, solid fills for cloth patches. Accessibility standards are in [ACCESSIBILITY.md](../ACCESSIBILITY.md).

## User-facing behaviour

- Light theme: faded madder-pink cotton with indigo ink. Dark theme: indigo, never black. Haldi yellow is the one warm accent, and call buttons always use it.
- Follows the phone's setting, unless overridden in Settings. The breathing screen is always dark.
- Mobile first, with a centred column on desktop.
- No gradients for decoration, no shadows, no celebration.

## How it works

Everything is in [apps/web/src/styles.css](../../apps/web/src/styles.css), with Tailwind 4 through `@tailwindcss/vite`. There is no `tailwind.config`.

**Colour tokens.** CSS variables on `:root`, repeated for `@media (prefers-color-scheme: dark)` under `:root:not([data-theme='light'])`, and for `:root[data-theme='dark'], .night`. `@theme inline` exposes them as Tailwind colours.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#f6e9e3` | `#16163c` | Page |
| `--surface` | `#fff8f4` | `#20204e` | Patches, fields |
| `--surface-2` | `#eedcd3` | `#2b2b60` | Quiet buttons, skeletons |
| `--ink` | `#1f1f58` | `#f8ebe3` | Text |
| `--ink-soft` | `#514d78` | `#c3bddb` | Secondary text |
| `--primary` | `#26266a` | `#f2bd4a` | Primary buttons, selected options |
| `--on-primary` | `#fff6ef` | `#1a1a48` | Text on primary |
| `--madder` | `#96294f` | `#f2a9bf` | Links, errors, Get help |
| `--haldi` | `#eeb02b` | `#eeb02b` | Call buttons, marker |
| `--thread` | `#a84a6b` | `#e78fab` | Stitches |
| `--line` | `#dcc4ba` | `#3b3b74` | Borders |
| `--focus` | `#96294f` | `#f2bd4a` | Focus ring |

Also: `--haldi-deep`, `--on-haldi`, `--thread-faint`, `--scrim`.

**Severity has no colour.** This is deliberate: severity shows in words and position.

**Type.** Yrsa Variable for display (`--font-display`), Anek Latin Variable for body (`--font-body`). Both are self-hosted from `@fontsource-variable`. A custom scale from `--text-xs` (0.8125rem) to `--text-3xl` (2.75rem). Inputs are at least 16px, so iOS doesn't zoom.

**CSS classes.**

| Class | What |
| --- | --- |
| `.btn` + `-primary`, `-secondary`, `-quiet`, `-ghost`, `-call`, `-small` | Buttons. Min height 3.25rem, small 2.75rem |
| `.btn-google` | The Google button, per Google's branding guidelines. A deliberate exception to the palette, using `--google-fill`, `--google-ink` and `--google-outline` |
| `.link` | Inline link with a stitched underline |
| `.patch`, `.patch-quilted` | A card. The quilted one marks what matters most |
| `.stitch-rule` | A dashed divider |
| `.field` | Text input, `aria-invalid` thickens the border |
| `.option` | Large answer row. `aria-pressed` selects |
| `.chip` | Small choice. `aria-pressed` or `aria-checked` |
| `.range` | Slider |
| `.sheet` | Bottom sheet on `<dialog>`, centred on desktop |
| `.skeleton` | Loading block |
| `.boot`, `.boot-late`, `.boot-call`, `.boot-noscript` | Static first paint |
| `.breath-*`, `.hero*` | Breathing and first-run art |
| `.print-only`, `.no-print` | Print view |
| `.night` | Forces dark tokens within its subtree |

**Components** in [apps/web/src/ui/](../../apps/web/src/ui/):

- `PageTitle`: the h1. Sets the document title and moves focus after navigation.
- `Sheet`, `ConfirmSheet`: native modal `<dialog>`, for focus trap, Esc and an inert background.
- `OtpInput`: one real input with boxes drawn behind it.
- `PasswordField`: a real password input, for password managers and paste, with a show or hide button in the tab order.
- `GoogleButton`: a plain link with a local SVG mark, shown only when `/meta` says Google is on.
- `Stitches`: a progress bar.
- `Skeleton`, `PageSkeleton`, `ErrorState`.
- `StitchRing`, `Knot`, `RingsMark`, `Logomark`: decorative.
- `TrendChart`: see [trends](trends.md).

Icons come from `lucide-react`, always `aria-hidden`, with text alongside.

**Motion.** Kept small. `prefers-reduced-motion` reduces all animation and transitions to nearly nothing, and stops breathing rings from scaling.

## Key files

- [apps/web/src/styles.css](../../apps/web/src/styles.css)
- [apps/web/src/ui/](../../apps/web/src/ui/)
- [apps/web/public/icon.svg](../../apps/web/public/icon.svg)
- [apps/web/src/lib/theme.ts](../../apps/web/src/lib/theme.ts)
- [apps/web/public/theme-init.js](../../apps/web/public/theme-init.js)

## Data and API used

None. Only `localStorage` key `anxiocare-theme`.

## Security/privacy notes

- All assets are local. No Google Fonts or CDN, because a remote font request would tell a third party who is visiting.
- CSP: `style-src 'self'`. Tailwind builds to a file. React `style` props set properties through the DOM, which the CSP allows. Browser-parsed inline `<style>` or `style=""` isn't allowed.
- `data:` URIs aren't allowed, so `assetsInlineLimit` is 0.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Very narrow (320px) | No horizontal scroll, tested at 320, 390 and 430 |
| Tall text setting | Text sizes are in rem |
| Printing | Paper is always light, using `!important`, and the score scale keeps its backgrounds |
| Font fails to load | Falls back to Georgia or the system sans |

## Tests that cover it

- [apps/web/e2e/audit.spec.ts](../../apps/web/e2e/audit.spec.ts) (axe, overflow, CSP, touch targets, in both themes)
- [apps/web/e2e/live/a11y.spec.ts](../../apps/web/e2e/live/a11y.spec.ts)
- [apps/web/src/ui/OtpInput.test.tsx](../../apps/web/src/ui/OtpInput.test.tsx)
- [apps/web/src/ui/TrendChart.test.tsx](../../apps/web/src/ui/TrendChart.test.tsx)

## Known limits

- Dark token values are repeated in two blocks. This is a CSS limit for the media-query-plus-override pattern. Change both.
- There are no Storybook or component docs beyond this page.
- Latin script only, in line with the app's English-only content.
