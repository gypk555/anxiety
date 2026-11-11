# Reflections

## Purpose

A second, separate kind of check-in. Five short questions from a bank of 100, different each time, to help the person notice how they're doing. Never scored. The GAD-7 is unchanged, and the two never mix. Design: [the reflections spec](../superpowers/specs/2026-11-11-reflections-design.md).

| Type, as stored | Name on screen | What it is |
| --- | --- | --- |
| `gad7` | Anxiety check (GAD-7) | The validated screening questionnaire: the same 7 questions, scored. Unchanged |
| `reflection` | Reflection | 5 questions from the bank, one per theme, never scored |

## User-facing behaviour

- `/check-in` asks "What would you like to do?" and offers two large choices:
  - **Anxiety check (GAD-7)**: "7 questions, the same each time. Gives a score you can track and share with a doctor. About 2 minutes." It goes to `/check-in/gad7`, the same intro as before, then `/check-in/1` to `/check-in/7` and the difficulty item, exactly as before.
  - **Reflection**: "5 questions, different each time, to notice how you're doing. No score. About 2 minutes." It starts at once.
- Both are open to guests and to accounts. Get help and Quick exit stay in the header, as on every screen.
- One question per screen at `/reflection/1` to `/reflection/5`, with the check-in's stepper, back button, arrow keys and auto-advance. Above each question is its theme. Answers: Not at all, A little, Quite a bit, A lot.
- Then `/reflection/note`: "Anything else on your mind? (optional)", up to 280 characters, with a live count, and "See your reflection".
- The result has no number, no severity word and no chart:
  - a short summary, such as "Worry and how your body felt came up today." and "Things you did for yourself helped.", or "Nothing stood out strongly today."
  - "This is a reflection, not a test or a diagnosis."
  - "What you said": each question and its answer, and the note
  - "What you could do next", matched to what came up: slow breathing for the body; a thought record (accounts) or grounding (guests) for worry; grounding for things going on around them; the mood log for accounts
  - if a question marked `brings_help` was answered "Quite a bit" or more: "Support is here if you want it", brought forward as for a severe GAD-7 result, with a one-tap call, all helplines and the safety plan, then the self-harm guidance. Otherwise a line that these questions don't ask about thoughts of harming yourself, with a link to Help.
- Accounts save automatically and land on `/reflections/:id`, which can be deleted. If the save fails, the result stays in the tab at `/reflection/result` with "Save reflection".
- Guests see "Sign in to save" and "Create an account". After signing in, Home shows "Your reflection is still here", and the result offers "Save reflection". Home also offers "Continue your reflection" for one left half-way.
- Trends has a Reflections section, only once there is one: each by date with a "Reflection" label, opening to its answers, and "Themes that came up most in the last 30 days", labelled "A count, not a score". No chart, and never on the GAD-7 axis.
- The doctor report has "Reflections", off by default: each one's date, questions and answers. Notes appear only with "Reflection notes" on too.

## How it works

**One catalogue.** [packages/shared/src/questions.ts](../../packages/shared/src/questions.ts) holds every question as typed data: the GAD-7, built from [gad7.ts](../../packages/shared/src/gad7.ts) with its wording and order unchanged, as `GAD7-1` to `GAD7-7`, and the 100 reflections, `REF-001` to `REF-100`. Each reflection has a `theme`, a `polarity` (`strain` for worry, body and situations; `support` for coping and connection) and `bringsHelp`. Migration `005_questions.sql` seeds `app.questions` with exactly this data. The app reads the wording from the shared bundle, never from the table, so a Reflection works offline and for guests with no request. The bank is in its own lazy chunk, not the first bundle.

**Picking.** `pickReflection` in [reflections.ts](../../packages/shared/src/reflections.ts) takes one active question from each theme, in theme order, with `crypto.getRandomValues` and no modulo bias. It leaves out the questions of the last 3 reflections: this tab's (`anxiocare.reflection-recent.v1`), and for an account its last 3 saved ones too (`GET /reflections?limit=3`). If that request fails, as offline, the tab's alone are used. If a theme had nothing left, it uses all of that theme's active questions rather than skip the theme.

**The summary.** `summarizeReflection` reads each answer by polarity. A strain answer of 2 or more names its theme as having come up. A support answer of 2 or more names its theme as having helped. A low support answer is never strain. `bringsHelp` is any `brings_help` question at 2 or more.

**In the tab.** [reflection-store.ts](../../apps/web/src/lib/reflection-store.ts), in `sessionStorage`: progress (`anxiocare.reflection.v1`: ids and answers), the unsaved result (`anxiocare.reflection-result.v1`) and recent ids. Question ids and numbers, never question text. The note is held in memory only, like journal drafts, because a browser restores `sessionStorage` with a reopened tab: a reload before saving loses it. Cleared with the rest of the guest data: on sign-out, by quick exit, and when a session ends underneath the person, when it's held for its owner like the rest of their work, recent question ids included ([held.ts](../../apps/web/src/lib/held.ts)).

**Saving.** `POST /reflections` with `clientRequestId`, so a retry returns the same row. The server checks every id against `app.questions` (exists, `type = 'reflection'`, active), exactly 5 distinct ids, and answers 0 to 3, and seals `{ answers: [{ q, a }], note? }` with the person's key. `/reflections/:id` reads `GET /reflections/:id`, or the row already loaded by Trends' list, which seeds it.

**GAD-7 answers.** Stored as before: 7 numbers, position `i` being `GAD7-(i+1)`. See [DATABASE.md](../DATABASE.md#appassessments).

## Key files

- [packages/shared/src/questions.ts](../../packages/shared/src/questions.ts): the catalogue
- [packages/shared/src/reflections.ts](../../packages/shared/src/reflections.ts): picking, the contract, the summary
- [apps/api/migrations/005_questions.sql](../../apps/api/migrations/005_questions.sql)
- [apps/api/src/routes/reflections.ts](../../apps/api/src/routes/reflections.ts)
- [apps/api/src/questions.ts](../../apps/api/src/questions.ts): the boot check and `db:verify`'s comparison
- [apps/web/src/routes/CheckIn.tsx](../../apps/web/src/routes/CheckIn.tsx) (`CheckInChoice`)
- [apps/web/src/routes/Reflection.tsx](../../apps/web/src/routes/Reflection.tsx)
- [apps/web/src/lib/reflection.ts](../../apps/web/src/lib/reflection.ts), [apps/web/src/lib/reflection-store.ts](../../apps/web/src/lib/reflection-store.ts)
- [apps/web/src/ui/Question.tsx](../../apps/web/src/ui/Question.tsx): the question frame both use
- [apps/web/src/routes/Trends.tsx](../../apps/web/src/routes/Trends.tsx) (`ReflectionsSection`), [apps/web/src/routes/Report.tsx](../../apps/web/src/routes/Report.tsx) (`ReflectionList`)

## Data and API used

Tables: `questions` (plaintext, read-only to the app) and `reflections`. Endpoints: `GET /reflections`, `GET /reflections/:id`, `POST /reflections`, `DELETE /reflections/:id`, all needing a session and current consent, under the per-account rate limit. See the [API](../API.md#reflections) and [DATABASE.md](../DATABASE.md#appquestions). In the export, with each question's wording resolved, and removed by erasure.

## Security/privacy notes

- Answers and the note are sealed together with AAD `reflections.payload:<id>:<user>`, padded to 2 KB, so every row is the same size and a dump shows neither which questions were asked nor how they were answered.
- A 400 never echoes the ids or text sent. A test checks the logs hold no question ids, notes or request ids.
- Released questions are immutable in the database: a trigger refuses changes to `id`, `type`, `theme`, `position`, `text` and `answer_set`, and refuses deletion. A shared test pins each released id against a snapshot. A rewording is a new id. `db:verify` and the server's boot check refuse a table that differs from the shared file.
- Reflections are new health data, so `CONSENT_VERSION` moved to `2026-11-12`. See [PRIVACY-COMPLIANCE.md](../PRIVACY-COMPLIANCE.md#consent-version-2026-11-12).

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Save fails, or offline at the end | The result stays in the tab: "We couldn't save this just now…" and "Save reflection" |
| Offline at the start, signed in | Starts with the tab's recent questions only |
| Skipping ahead by URL | Back to the first unanswered question |
| Unknown id in the tab's storage | Starts again rather than show something wrong |
| A question retired after it was answered | Still reads back, from the shared file |
| A guest result more than a day old | 400 on save: "This reflection is more than a day old…" |
| `/reflections/:id` that isn't theirs, or doesn't exist | The 404 page |
| 1,000 saved reflections | 409, with how to make room |

## Tests that cover it

- [packages/shared/src/questions.test.ts](../../packages/shared/src/questions.test.ts): 100 questions, 20 per theme, unique ids and wording, at most 90 characters, banned words, GAD-7 byte for byte, polarity, `brings_help`, the picker, the contract and the summary
- [apps/api/test/reflections.test.ts](../../apps/api/test/reflections.test.ts): the seed equals the shared file, the GAD-7 mapping, immutability, runtime grants and RLS, the boot check (also by starting the real server), refusals, cross-user 404s, the consent gate, encryption at rest, AAD swaps
- [apps/api/test/erasure.test.ts](../../apps/api/test/erasure.test.ts), [encryption.test.ts](../../apps/api/test/encryption.test.ts), [logging.test.ts](../../apps/api/test/logging.test.ts), [tooling.test.ts](../../apps/api/test/tooling.test.ts) (`db:verify`)
- [apps/web/src/lib/reflection-store.test.ts](../../apps/web/src/lib/reflection-store.test.ts), [apps/web/src/routes/Reflection.test.tsx](../../apps/web/src/routes/Reflection.test.tsx), and the reflection cases in `Trends.test.tsx`, `Report.test.tsx`, `Home.test.tsx`, `Legal.test.tsx`
- [apps/web/e2e/live/reflection.spec.ts](../../apps/web/e2e/live/reflection.spec.ts) on iPhone and Pixel, the reflection screens in [audit.spec.ts](../../apps/web/e2e/audit.spec.ts), [live/landscape.spec.ts](../../apps/web/e2e/live/landscape.spec.ts) and [live/compression.spec.ts](../../apps/web/e2e/live/compression.spec.ts)

## Known limits

- Every question needs clinician review before launch: [CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md#reflection-questions).
- English only, like the GAD-7.
- The GAD-7-overlap and licensed-scale checks are word lists, not an expert comparison.
- The Trends theme count fetches up to 10 pages (500 reflections) to cover 30 days, and says so if it stopped short.
- Recent questions for a guest are only this tab's: a new tab starts fresh.
