# Profile details: avatar, age range, gender, occupation and stress factors: design

Owner decision, 2026-11-12: bring back the old version's profile details (commit fb4b34a): avatar, stress factors,
occupation, age and gender. The name is now required (a separate change). Everything else here is **optional**, and
the owner asked for the best UX. These specs still bind: `2026-11-06-production-rebuild-design.md`,
`2026-11-07-accounts-and-database-design.md` and the clinical-safety rules (`docs/CLINICAL-SAFETY.md`: no comparison
with others, no invented statistics, no "insights").

## Fields
All are optional except the name. Each is a fixed choice, never free text, so the data is less identifying and can't
carry anything unexpected.

| Field | Choices |
|---|---|
| `avatar` | `sage` 🧘 Calm Sage, `leaf` 🌿 Gentle Leaf, `spark` ✨ Bright Spark, `ocean` 🌊 Ocean Breeze, `mountain` 🏔️ Mountain Peak. Default: the name's initial, as today. |
| `ageRange` | `18-24`, `25-34`, `35-44`, `45-59`, `60+`, `na` (Prefer not to say). A range, never a birth date or exact age. The app is 18+ only. |
| `gender` | `woman`, `man`, `nonbinary`, `na` (Prefer not to say) |
| `occupation` | `student`, `employed`, `self_employed`, `homemaker`, `looking`, `retired`, `other`, `na` |
| `stressFactors` | Multi-select, at most 8: `work`, `studies` (studies and exams), `money`, `family`, `relationships`, `health`, `sleep`, `screens` (screen time and news) |

The emoji are decoration only. Every choice also has a text label, and the emoji are `aria-hidden`.

## Flow
1. **Create account:** email, code, password and name (required). Nothing else, to keep sign-up short.
2. **After consent and the name**, show "About you" once, for new accounts and for existing accounts that haven't seen
   it. It is one screen:
   - The intro: "All optional. It helps you choose what to put in a report for your doctor, and suggests tools that fit.
     It's never used to compare you with anyone."
   - The avatar picker first, then age range, gender, occupation and stress factors as large tap targets.
   - Two buttons of equal weight: **Save** and **Skip for now**. Skipping is remembered on the server (an `aboutSeenAt`
     timestamp), so it is never asked again. It is never a gate.
   - Get help and Quick exit are always visible, as on every screen.
3. **Settings → Profile:** every field can be edited or cleared at any time. The avatar shows in the header and in
   Settings.

## Uses (purpose limitation, stated in the privacy notice)
- **Avatar:** display only.
- **Stress factors:**
  - Home and the GAD-7 result suggest matching existing tools: sleep → breathing (slow exhale) and sounds; work,
    studies or money → the thought record and grounding; screens → a short note to take a break.
  - The Reflection picker gives no extra weight. Keep the one-per-theme rule.
- **Age range, gender and occupation:** only shown back to the person, and in the doctor report.
- **Doctor report:** a new "About me" section, off by default. When ticked, it includes the age range, gender,
  occupation and stress factors that are set.
- **Never:** no scoring, no "people like you" comparisons, no demographic insight text, no analytics. These fields are
  never logged and never sent to Google or Brevo.

## Storage
- **Encryption:** one sealed JSON blob per user, `{ avatar?, ageRange?, gender?, occupation?, stressFactors? }`, with
  AAD bound to `users.profile:<user>:<user>` and padded to one bucket.
- **Migration:** `006_profile.sql` adds `app.users.profile_ct bytea NULL` and `about_seen_at timestamptz NULL`, through
  the migrator, with existing grants. Never edit 001–005.
- **Validation:** a strict zod schema in `packages/shared`. Values come only from the enums above, with no unknown keys.
- **API:**
  - `GET /me` returns `profile` and `aboutSeen: boolean`.
  - `PATCH /me/profile` takes the partial profile; `null` clears a field.
  - `POST /me/about-seen` records a skip or a save.
  - `PATCH /me/profile` and `POST /me/about-seen` need `requireAuth` and `requireConsent`. `DELETE /me/profile` clears every detail and needs only `requireAuth`: it is a right, like download and delete (amended after the security review). The per-user rate limit applies to all.
- **Data rights:** the profile is in export with labels resolved, and erasure removes it with the user row.

## Privacy and legal
- **Notices:** the privacy notice, Consent.tsx and Legal.tsx currently promise "Nothing about your age, gender or job".
  Replace that with an honest, plain list:
  - These details are optional, and chosen from ranges and lists.
  - They're encrypted.
  - What each is used for.
  - They can be removed at any time.
- **Consent:** bump `CONSENT_VERSION`. Update `docs/PRIVACY-COMPLIANCE.md` (data map, purpose, retention) and
  `docs/THREAT-MODEL.md`.
- **Reviews:** add a lawyer review item in `docs/LAUNCH-CHECKLIST.md`, because gender combined with health data is
  sensitive. Clinician review covers the stress-factor tool suggestions.

## Small UX gains from the old version (low risk)
- **Breathing:** a quiet cycle counter, "Breath 3", in the existing Breathe screen. It is announced politely, never
  scored.
- **Check-in history:** "Delete all check-ins" in Settings → Your data, behind a ConfirmSheet that names the count. Add
  `DELETE /assessments`, which needs `requireAuth` but not consent (a right; amended after the security review), is scoped to the user, and requires a recent
  re-authentication like other destructive actions. It's part of the right to erasure.

## Not brought back (clinical-safety reasons, documented in docs/decisions)
- The extended 14-item mode, reworded GAD-7 items, category breakdowns and "clinical context" text.
- The demographic insight.
- Confetti, colour-coded severity and red/green trend arrows.
- The canned reframe.
- Demo mode.
- Binaural or "theta" sound claims.
- Non-India helplines.

## Testing
TDD.
- **Shared:** enums and strict schemas.
- **API:**
  - cross-user isolation and the consent gate;
  - invalid values refused with no echo of the input;
  - encryption at rest, with no plaintext in a raw select;
  - swapping AAD fails;
  - export and erasure;
  - `DELETE /assessments` scoped to the user, needing re-authentication.
- **Web:** the About-you screen (save, skip, never shown again), editing in Settings, the report "About me" section
  toggle, the stress-factor suggestions, and the cycle counter.
- **e2e on iPhone and Pixel:** the flow end to end, axe, 320px overflow, landscape, and no CSP violations.
