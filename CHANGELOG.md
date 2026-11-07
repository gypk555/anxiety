# Changelog

## 1.0.0 (unreleased)

A full rewrite of the earlier prototype. Not deployed: it has not run on Supabase, Render or real SMTP.

### Added

- Monorepo with `packages/shared`, `apps/api` and `apps/web`, served from one origin.
- GAD-7 check-in, with item and option wording as published and a lightly adapted stem and difficulty lead-in, scored on the server for saved results. Guests can complete it with no account.
- Result screen with a print view, relief tools (breathing, grounding, generated sound), Help with one-tap helplines, and a persistent "Get help" control.
- Separate **Create account** and **Sign in** screens: password with a verified email, Google sign-in, and an emailed 6-digit code as a fallback, with database-enforced send quotas and failure caps. Passwords are Argon2id with a pepper. See [decision 012](docs/decisions/012-passwords-google-and-six-digit-codes.md).
- `npm run db:setup`, `npm run db:verify` and `npm run doctor`, so a real database and environment are hard to get wrong.
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

### Security (second review, before release)

- **Google can no longer take over an account by its address.** Sign-in finds an account by Google subject only. An existing address is refused with a pointer to Settings, where Google is connected from a signed-in session that proved a password or email code in the last 10 minutes. A new account from Google needs a Gmail address or a Workspace account. A password reset removes every Google link and says so by mail. Disconnecting needs that same recent proof, not a password.
- **A password change can no longer race a reset.** Change, set and reset write in one transaction that locks the account; change and set give up with 401 if their session ended or the password moved meanwhile. Proved by the reviewer's race, run 50 times.
- **Strangers can no longer lock someone out of devices they already use.** Device cookies (`__Host-device`, stored only as an HMAC) give a known browser its own failure budget. Elsewhere, failures count per address and network as well as per address, with 100 wrong passwords a day and 20 wrong codes a day per address. Kept at 20 for codes, not raised, so the odds of a guessed code stay about 0.7% a year.
- **A hashing flood can no longer shut everyone out.** Sign-in attempts are limited per network and by an instance-wide bucket before hashing, and one hashing slot is kept for known devices. `PASSWORD_ARGON2_MEMORY_KIB` is capped at 65536.
- Password-failure rows use their own HMAC domain, so they can't be joined with code rows. `npm run db:setup` keeps the secrets file at mode `0600`.

### Removed from the prototype

- The extended 14-question scale and its subscale breakdowns. The check-in is now exactly the GAD-7.
- Collection of age, gender and occupation.
- Chart.js, confetti, and storing results in the browser's permanent storage.
