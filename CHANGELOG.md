# Changelog

## Unreleased

### Create account says when an email already has an account

The owner's decision, 2026-11-12 ([decision 015](docs/decisions/015-say-when-an-email-already-has-an-account.md)).

- `POST /auth/register/request` answers 409 `account_exists` for an address with an account and sends no email; the `account_exists_notice` mail is gone. Every limit and the send quota are counted the same way for both kinds of address, and past the quota both get the same quiet 202.
- Create account shows "There's already an account for this email." in place, focused and announced, with **Sign in**, **Continue with Google** and **Reset password**, keeping the email and `next`. The typed password is cleared. Continue with Google was already offered up front.
- `CONSENT_VERSION` is now `2026-11-14`: the privacy notice says that someone typing your address on Create account is told an account exists.

### Required name, and optional profile details

From the owner's request (name) and [the profile details spec](docs/superpowers/specs/2026-11-12-profile-details-design.md).

- **The name is required.** Create account asks for "Your name or a nickname", 1 to 60 characters once trimmed, with the error under the field. `POST /auth/register/verify` refuses an account without one (400, nothing echoed), before the code is spent. `PATCH /me` takes a non-null name: it can be changed, never removed.
- **"What should we call you?"** (`/name`), asked once after consent of an account with no name: Google (never asked for a name), email-code and older accounts. Gated like consent, on the client, keeping `next`; never in front of Help, Quick exit, Settings, export, delete or sign-out. The Google callback redirects there itself. Guests are unaffected.
- **About you** (`/about-you`), offered once after the name: avatar, age range, gender, what you do, stress factors, all optional, from fixed lists. **Skip for now** and **Save**; either is remembered (`aboutSeen`). Never a gate. Editable and clearable in Settings → About you. The avatar shows in Settings and the header.
- Stress factors suggest existing tools on Home ("Tools that may help") and in the GAD-7 result's next steps. No comparison, scoring or insight.
- The doctor report has an **About me** section, off by default.
- Breathing shows a quiet "Breath N" counter.
- **Delete all check-ins** in Settings → Your data, naming the count, after a recent re-authentication. `DELETE /assessments`.
- API: `PATCH /me/profile`, `POST /me/about-seen`, `DELETE /assessments`; `Me` gains `profile` and `aboutSeen`; the export has `profile` in words. Migration `006_profile.sql` (`users.profile_ct`, sealed and padded to 512 bytes; `users.about_seen_at`; audit action `assessments_delete`).
- `CONSENT_VERSION` is now `2026-11-13`, one bump for both changes: the notice no longer calls the name optional (it can be a nickname), and lists the optional details honestly instead of "Nothing about your age, gender or job". See [decision 014](docs/decisions/014-profile-details-and-what-was-left-out.md) for what was not brought back.

### Home and Settings redesign

From [the Home and Settings redesign spec](docs/superpowers/specs/2026-11-12-home-settings-redesign-design.md). Web only; no API or data changes.

- **Home leads with what's due today.** The date over the greeting. When the two-week check-in is due (or there's none yet), "Time for a check-in" leads, offering the Anxiety check (GAD-7) and a Reflection, one tap each; otherwise the mood card leads. Then For right now (Breathe on the night surface), Your check-ins, and a new **Your space** list: Safety plan, Mood log, Report for your doctor.
- **Mood card: one tap saves today.** Five equal steps in one row, each a word under a rising-bars mark. No Save button; the steps lock while saving. Afterwards, "Saved for today · You're feeling okay", with Add a note and Change. Focus moves to the result and a live region announces it. A save that lands after sign-out or quick exit no longer writes into the cleared cache.
- **First visit:** smaller rings, both check-in choices, "Overwhelmed? Breathe first" and a soft sign-in card.
- **Settings is grouped:** a profile card, then Account, Sign-in and security, Appearance (Phone, Light, Dark), On this phone, and Your data and privacy, as rows with no dividers that show their current state and open sheets. Name and Signed-in devices move into sheets; connecting Google first asks "Connect Google?". Sign out follows, and Delete my account is last, alone.
- Esc in a sheet opened from another sheet now closes only the top one.
- Initial JS 159.9 KB gzipped (was 157.7 KB); the Reflection question bank still loads only when a Reflection starts.

### Reflections

From [the reflections spec](docs/superpowers/specs/2026-11-11-reflections-design.md).

- **The start of a check-in asks what you'd like to do:** the **Anxiety check (GAD-7)**, unchanged, now at `/check-in/gad7`, or a **Reflection**.
- **Reflection:** 5 questions from a bank of 100, one from each of 5 themes, different each time, never scored. An optional note of up to 280 characters. The result is a plain summary, the answers and matched suggestions. Get help comes forward when one of 8 questions is answered "Quite a bit" or more. Accounts save automatically; guests can save after signing in. See [reflections](docs/modules/reflections.md).
- **One question catalogue,** `packages/shared/src/questions.ts`, holding the GAD-7 (wording and order unchanged) and the 100 reflections by id. Migration `005_questions.sql` seeds `app.questions` with exactly that data; wording is immutable by trigger; `db:verify` and the server's boot check refuse a mismatch.
- API: `GET`, `POST /reflections` and `DELETE /reflections/:id`. Reflections are in the export with question wording resolved, and erasure removes them.
- Trends lists reflections by date, with themes counted (not scored). The doctor report has a Reflections section, off by default.
- `CONSENT_VERSION` is now `2026-11-12`, adding reflections to the privacy notice.
- GAD-7 answers are stored as before. Their position-to-id mapping is documented in `docs/DATABASE.md`.

### Safety and tracking

From [the safety and tracking spec](docs/superpowers/specs/2026-11-11-safety-and-tracking-design.md).

### Added

- **Quick exit.** A quiet "Quick exit" beside "Get help" on every screen, and in every sheet, plus Escape three times outside a text field.
  - It replaces the current history entry with a weather search.
  - It hides the app at once and clears memory, drafts, the guest check-in and form text.
  - It is synchronous: no confirmation, and no request, sign-out included.
  - Help explains what it can't do. See [quick exit](docs/modules/quick-exit.md).
- **Personal safety plan** at `/safety-plan`, after the Stanley-Brown structure.
  - Seven optional steps, with examples as hints only.
  - One-tap calls to the people added, and 112 and every helpline always listed.
  - Linked from Help, Tools and the severe result. Print or save as PDF.
  - Accounts store it encrypted on the server. Guests keep it on the device only.
  - It opens offline from an encrypted IndexedDB copy under a non-extractable WebCrypto key. Sign-out, deletion and another account's sign-in remove the copy. A guest plan can move to an account. See [safety plan](docs/modules/safety-plan.md) and [decision 013](docs/decisions/013-encrypted-offline-safety-plan.md).
- **Daily mood log.** "How are you today?" on Home: Very low to Very good, with an optional note of up to 280 characters.
  - One entry per local day. Past days up to 366 days back can be changed or deleted on `/mood`.
  - Trends has its own chart and table, "Your daily mood log, not a test score". No streaks. See [mood log](docs/modules/mood-log.md).
- **Doctor report** at `/report`, built in the browser from data already fetched.
  - Choose the period and the sections. Private writing and the name are off by default.
  - A4 print stylesheet with a page per section, and a "screening, not a diagnosis" footer. See [doctor report](docs/modules/doctor-report.md).
- API: `GET /moods`, `PUT` and `DELETE /moods/:day`, and `GET`, `PUT` and `DELETE /safety-plan`. Migration `004_mood_and_safety_plan.sql`. Both are in the export, and erasure removes them.

### Changed

- `CONSENT_VERSION` is now `2026-11-11`. The privacy notice covers the mood log, the safety plan, other people's numbers in it, and the on-device copy. Everyone with an account is asked to accept again.
- Below 390px the header shows the logomark without the wordmark, to make room for Quick exit.
- The report, safety plan and mood log are lazy-loaded chunks. The initial JS stays within the 170 KB gzip budget.

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
