# Name and profile details

## Purpose

What to call the person, which is required, and a few optional details about them: an avatar, an age range, gender, occupation and what tends to cause them stress. The details help the person choose what to put in a report for their doctor, and suggest existing tools that fit. They are never used to compare anyone with anyone. Specs: [profile details](../superpowers/specs/2026-11-12-profile-details-design.md). Why some things from the old version were left out: [decision 014](../decisions/014-profile-details-and-what-was-left-out.md).

## User-facing behaviour

**The name.** Create account asks for **Your name or a nickname**, 1 to 60 characters once trimmed. An account without one (made with Google, which is never asked for a name, by email code, or before 2026-11-13) is asked "What should we call you?" at `/name` once, after consent. It is gated like consent, on the client: Help, Quick exit, Settings (download, delete, sign-out) and the tools are never behind it, and it offers **Not now, sign me out** and **Download or delete my data**. In Settings the name can be changed, never removed. See [auth and sessions](auth-and-sessions.md) and [consent](consent-and-privacy-rights.md#the-name-gate).

**About you** (`/about-you`), offered once, right after the name, or after the next sign-in for an existing account that hasn't seen it:

- "All optional. It helps you choose what to put in a report for your doctor, and suggests tools that fit. It's never used to compare you with anyone."
- Avatar first (Calm Sage 🧘, Gentle Leaf 🌿, Bright Spark ✨, Ocean Breeze 🌊, Mountain Peak 🏔️, or "Your initial"), then Age range (18 to 24, 25 to 34, 35 to 44, 45 to 59, 60 or over, Prefer not to say), Gender (Woman, Man, Non-binary, Prefer not to say), What you do (Student, Employed, Self-employed, Homemaker, Looking for work, Retired, Something else, Prefer not to say), and "What tends to cause you stress?" (Work, Studies and exams, Money, Family, Relationships, Health, Sleep, Screen time and news). Each single choice also has "Not set". All are large chips.
- **Skip for now** and **Save**, of equal weight. Either one records `about_seen_at`, so it is never offered again. It is never a gate: `RequireAccount` doesn't send anyone there.

**Settings → Account → About you** edits or clears every field. The avatar shows in Settings' profile card and in the header (a link to Settings, hidden below 360px).

**Uses:**

- Avatar: display only. Never in the report.
- Stress factors: Home's "Tools that may help" and the GAD-7 result's next steps suggest existing tools, from [suggestions.ts](../../apps/web/src/lib/suggestions.ts): sleep → slow-exhale breathing and sounds; work, studies or money → a thought record and grounding; screens → a short note to take a break. Family, relationships and health suggest nothing extra. The Reflection picker is unchanged.
- Age range, gender, occupation: shown back to the person, and in the report's **About me** section only if ticked (off by default).

**Breathing** has a quiet "Breath N" cycle counter, and **Settings → Your data** has **Delete all check-ins**: see [relief tools](relief-tools.md) and [settings](settings.md).

## How it works

Lists and schemas: [packages/shared/src/profile.ts](../../packages/shared/src/profile.ts). `profileSchema` is strict, every field optional, values only from the lists, stress factors unique and at most 8. `profileDetailsPatchBody` takes any part; null, or `[]` for stress factors, clears a field; `applyProfilePatch` applies it. `readableProfile` turns ids into words for the export and the report.

On the server ([users.ts](../../apps/api/src/users.ts), [routes/me.ts](../../apps/api/src/routes/me.ts)): the profile is one sealed JSON blob in `users.profile_ct`, AAD `users.profile:<user>:<user>`, padded to 512 bytes so every profile is the same size, an empty one included. `toMe` opens it and parses it again, and adds `aboutSeen`. `PATCH /me/profile` (merged under `SELECT … FOR UPDATE`, so two changes at once both land) and `POST /me/about-seen` need sign-in and consent. `DELETE /me/profile` clears everything with sign-in only: a right, offered in `RightsOnlySettings` as "Clear my profile details". The per-user rate limit applies. An empty profile is sealed too, once About you is seen, so `profile_ct` being set says nothing about whether details were given. `profileOf` checks each field on the way out, drops a value no longer on its list, and logs `profile_value_dropped` with no value, so `/me` and the export always answer. The export has `profile` in words. Erasure removes it with the user row. Migration `006_profile.sql`.

On the client: `afterSignIn` in [lib/next-path.ts](../../apps/web/src/lib/next-path.ts) sends to `/about-you` after consent and the name when `aboutSeen` is false. [AboutYou.tsx](../../apps/web/src/routes/AboutYou.tsx) and the Settings sheet share [ProfileForm](../../apps/web/src/ui/ProfileForm.tsx), which sends every field (null when not set) through `profilePatch`.

## Key files

- [packages/shared/src/profile.ts](../../packages/shared/src/profile.ts), [schemas.ts](../../packages/shared/src/schemas.ts) (`displayNameSchema`, `meResponse`)
- [apps/api/migrations/006_profile.sql](../../apps/api/migrations/006_profile.sql)
- [apps/web/src/routes/Name.tsx](../../apps/web/src/routes/Name.tsx), [AboutYou.tsx](../../apps/web/src/routes/AboutYou.tsx)
- [apps/web/src/ui/NameField.tsx](../../apps/web/src/ui/NameField.tsx), [ProfileForm.tsx](../../apps/web/src/ui/ProfileForm.tsx), [SuggestionList.tsx](../../apps/web/src/ui/SuggestionList.tsx)
- [apps/web/src/lib/suggestions.ts](../../apps/web/src/lib/suggestions.ts)

## Security/privacy notes

- No free text: every detail is from a fixed list, a range never a birth date, and nothing under 18.
- Encrypted at rest, padded to one size, never logged, never sent to Google or the mail provider, no analytics.
- No scoring, no "people like you", no demographic insight. The suggestion wording is fixed and needs clinician review.
- In the privacy notice from consent version `2026-11-13`. See [PRIVACY-COMPLIANCE.md](../PRIVACY-COMPLIANCE.md#consent-version-2026-11-13).

## Tests that cover it

- [packages/shared/src/profile.test.ts](../../packages/shared/src/profile.test.ts), [gad7.test.ts](../../packages/shared/src/gad7.test.ts) (`the name`)
- [apps/api/test/profile.test.ts](../../apps/api/test/profile.test.ts), [accounts.test.ts](../../apps/api/test/accounts.test.ts) (no name), [data.test.ts](../../apps/api/test/data.test.ts) (`profile`), [google.test.ts](../../apps/api/test/google.test.ts) (`the name`)
- [apps/web/src/routes/Name.test.tsx](../../apps/web/src/routes/Name.test.tsx), [AboutYou.test.tsx](../../apps/web/src/routes/AboutYou.test.tsx), [lib/suggestions.test.ts](../../apps/web/src/lib/suggestions.test.ts), Settings, Report, Home, CheckIn, Breathe and Shell tests
- e2e: [live/profile.spec.ts](../../apps/web/e2e/live/profile.spec.ts), the name steps across the live suites, and the `name`, `about-you`, `settings-about-you` and `home-suggestions` audit screens

## Known limits

- The name gate and About you are client-side. The API does not refuse data routes for a missing name.
- An existing account with a long-lived session is offered About you only at its next sign-in.
- The suggestions and the lists are English only, like the rest of the app.
