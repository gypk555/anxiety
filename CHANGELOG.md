# Changelog

## 1.0.0 (unreleased)

A full rewrite of the earlier prototype. Not deployed: it has not run on Supabase, Render or real SMTP.

### Added

- Monorepo with `packages/shared`, `apps/api` and `apps/web`, served from one origin.
- GAD-7 check-in, with item and option wording as published and a lightly adapted stem and difficulty lead-in, scored on the server for saved results. Guests can complete it with no account.
- Result screen with a print view, relief tools (breathing, grounding, generated sound), Help with one-tap helplines, and a persistent "Get help" control.
- Accounts by emailed 8-digit code, with database-enforced send quotas and a failed-guess cap.
- Sessions in an HttpOnly cookie, with listing and revoking. 30 days idle, 90 days at most.
- Trends with an accessible SVG chart and table, and a CBT thought record journal.
- Versioned consent gate, JSON export, immediate account deletion, and a pseudonymous audit log.
- Application-layer encryption with a per-user data key, versioned master keys and a rotation script.
- Private `app` schema, a least-privilege runtime role, and role-scoped RLS.
- Installable PWA. Help, tools and legal pages work offline after one visit. The service worker never stores `/api`.
- CI: typecheck, lint, tests, dependency audit, build, Playwright, CodeQL, Dependabot.
- Engineering documentation.
- Breach notification tool, `apps/api/scripts/notify-all.ts`.
- Precompressed static files, brotli and gzip. API responses are never compressed.

### Removed from the prototype

- The extended 14-question scale and its subscale breakdowns. The check-in is now exactly the GAD-7.
- Collection of age, gender and occupation.
- Chart.js, confetti, and storing results in the browser's permanent storage.
