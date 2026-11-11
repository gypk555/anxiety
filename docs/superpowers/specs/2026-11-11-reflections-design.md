# Reflections: a second, unscored check-in, and one question catalogue: design

Extends `2026-11-06-production-rebuild-design.md`, `2026-11-07-accounts-and-database-design.md` and
`2026-11-11-safety-and-tracking-design.md`. Their security, privacy, clinical-safety and UX rules still bind. Owner
decisions (2026-11-11):
- The GAD-7 and the new questions are separate. At the start, the person picks one and goes ahead.
- All questions are kept in one separate collection, with the GAD-7 and the new questions told apart by type.
- Saved answers refer to questions by id. The question text is never saved with the answers.
- The question types get names.
- The bank holds 100 new questions.

## Names
| type (stored) | Name in the UI | What it is |
|---|---|---|
| `gad7` | **Anxiety check (GAD-7)** | The validated screening questionnaire: the same 7 questions, scored. Unchanged. |
| `reflection` | **Reflection** | 5 questions drawn from a bank of 100, different each time, never scored. |

## Start screen
`/check-in` first asks "What would you like to do?" and offers two large choices:
- **Anxiety check (GAD-7):** "7 questions, the same each time. Gives a score you can track and share with a doctor. About 2 minutes."
- **Reflection:** "5 questions, different each time, to notice how you're doing. No score. About 2 minutes."

Get help and Quick exit stay visible as on every screen. Both choices are open to guests and to accounts, the same as
the check-in today.

## The question catalogue
Table `app.questions`. It is not personal data, so it is plaintext with no user_id and no RLS by user. The runtime
role has SELECT only.

| column | notes |
|---|---|
| `id text PRIMARY KEY` | Stable and never reused: `GAD7-1` … `GAD7-7`, `REF-001` … `REF-100` |
| `type text NOT NULL CHECK (type IN ('gad7','reflection'))` | |
| `theme text` | For a reflection, one of the 5 themes below. NULL for gad7. |
| `position smallint` | Order for gad7, 1-7. NULL for reflection. |
| `text text NOT NULL` | |
| `answer_set text NOT NULL` | `gad7_frequency` (the GAD-7's own 4 options) or `reflection_amount` |
| `brings_help boolean NOT NULL DEFAULT false` | A "Quite a bit" or "A lot" answer brings Get help forward |
| `active boolean NOT NULL DEFAULT true` | Retire with `active=false`. Never edit text in place. |
| `added_at timestamptz NOT NULL DEFAULT now()` | |

- Immutable wording: once a question is released, its text never changes, because old answers must keep their
  meaning. A rewording is a new id, and the old one is set inactive, in a new migration. A DB trigger refuses UPDATE of
  `text`, `type`, `answer_set` and `id`, and refuses DELETE.
- Single source of truth: `packages/shared/src/questions.ts` holds the catalogue as typed data, both the GAD-7, which is
  re-exported from the existing `gad7.ts` with its wording and order unchanged, and the 100 reflections. Migration
  `005_questions.sql` seeds the table with exactly that data. A test checks that the migration equals the shared file.
  `db:verify` and the boot check confirm the live table matches, and refuse to start on a mismatch.
- The web app uses the shared bundle, so a Reflection works offline and for guests with no extra request.

### GAD-7 answers
GAD-7 answers are already saved as numbers only: an array of 7 values in the encrypted assessment payload, with no
text. The array position i means `GAD7-(i+1)`. Keep that stored format exactly as it is, with no data migration. Document
the mapping in `docs/DATABASE.md`, and let the API test assert it.

## The reflection bank: 100 questions
- **Themes:** 5 themes × 20 questions:
  - `worry`: worry and thoughts
  - `body`: body, sleep, tension, breathing, appetite
  - `situations`: triggers and situations, such as work, study, family, social, money, health and news
  - `coping`: coping and what helped
  - `connection`: support and connection
- **Answer set:** every question uses `reflection_amount`: Not at all (0), A little (1), Quite a bit (2), A lot (3). The
  question is written to fit that scale and is about the person's own experience "today" or "lately".
- **Style:**
  - Plain, warm Indian English at a reading age of about 12.
  - At most 90 characters.
  - Second person, neutral, never leading or judging.
  - No clinical labels and no diagnosis words.
  - Works across cultures in India: no alcohol-centric or dating-centric assumptions, and family can mean joint family.
- **Coping and connection:** these are framed positively, for example "How much did talking to someone help today?".
  The summary must read their direction correctly: a high score there is good. A `polarity` field (`'strain'` or
  `'support'`) records this.
- **Exclusions:**
  - No questions about self-harm, suicide, abuse or substance use. Asking those properly needs a clinical pathway the
    app doesn't have.
  - No GAD-7 paraphrases.
  - No copyrighted scale items: no BAI, HADS or other licensed instruments.
- **Get help:** about 8 strain questions are marked `brings_help`, such as hopelessness, feeling overwhelmed and
  feeling unable to cope.
- Every question is listed in `docs/CLINICAL-SAFETY.md` as needing clinician review.

## A Reflection session
- **Picking the questions:** 5 questions on the client, one from each theme, chosen with `crypto.getRandomValues`. Any
  question asked in the person's last 3 reflections is left out, if any are known: for accounts, from their saved
  reflections; for guests, from the session held in the tab. Only active questions are used.
- **The flow:** one question per screen, the same stepper as the check-in. A single optional note of at most 280
  characters goes at the end, under "Anything else on your mind? (optional)".
- **Results:** there is no number, no severity word and no chart of totals. The result shows:
  - A short plain-words summary built from the answers: the themes with strain answers of 2 or more, for example
    "Sleep and worry came up today", and the support answers that helped. If nothing stands out, a neutral line.
  - Matched suggestions from what exists: breathing for body, the journal for worry, the safety plan and helplines for
    `brings_help`, and the mood log.
  - If any `brings_help` question is answered 2 or more, the Get help panel is brought forward as the severe GAD-7 result
    does. It is not alarmist.
  - "This is a reflection, not a test or a diagnosis."
- **Saving:** accounts save automatically, as the GAD-7 does. Guests can save after signing in through the existing
  "held" flow.

## Storage of answers
Table `app.reflections`, created in migration `005`:
- `id uuid PK`
- `user_id uuid FK ON DELETE CASCADE`
- `client_request_id uuid` (idempotency, unique per user)
- `taken_at timestamptz(3)`
- `payload_ct bytea`
- `created_at`

The payload is encrypted with the user's key and AAD `reflections.payload:<id>:<user>`. It holds
`{ answers: [{ q: 'REF-017', a: 0-3 }, …5], note?: string }`. It holds question ids and numbers only, never question
text. The server checks every id against `app.questions`: it must exist, be `type='reflection'` and be active. There
must be exactly 5 distinct ids, and `a` must be an integer from 0 to 3. Anything else is a 400 that echoes no input.
Padding uses the same bucket approach as moods. RLS is on, with `runtime_all` for `anxiocare_runtime` only, and grants
as in migration 004.

## API (under `/api/v1`)
- **Reflections:** all three routes need `requireAuth` and `requireConsent`, and the per-user rate limit applies.
  - `POST /reflections` saves one, with idempotency by `clientRequestId`, as for assessments.
  - `GET /reflections?cursor` returns a page, newest first, in the same shape as assessments.
  - `DELETE /reflections/:id` removes one.
- **No questions endpoint:** the client uses the shared bundle, so none is needed.
- **Zod:** schemas are strict and live in `packages/shared`.

## Elsewhere
- **History:** reflections appear with the date and a "Reflection" label, and open to their answers. The text is
  looked up from the shared catalogue by id.
- **Trends:** no reflection chart. Optionally a simple "themes that came up most this month" count, labelled as not a
  score. Never on the GAD-7 axis.
- **Doctor report:** a "Reflections" section, off by default, lists each one's date, its questions and answers, and its
  note, but only if the note option is on.
- **Data rights:** reflections are included in export (with question text resolved, so the export is readable) and in
  erasure. `CONSENT_VERSION` is not bumped unless the privacy notice's data list changes; it does change, so bump it,
  and add reflections to the notice and `docs/PRIVACY-COMPLIANCE.md`.
- **Docs:** `docs/modules/reflections.md`, plus updates to `API.md`, `DATABASE.md`, `CLINICAL-SAFETY.md`, the test
  catalogues and the manual test cases.

## Testing
TDD.
- **Shared:**
  - exactly 100 reflections, 20 per theme;
  - unique ids;
  - every text at most 90 characters;
  - the GAD-7 wording and order are byte-identical to before;
  - no banned words (a list: suicide, kill, die, self-harm, alcohol and others);
  - the picker returns 5 distinct questions, one per theme, avoids recent ones, and only uses active questions.
- **API:**
  - the migration matches the shared catalogue;
  - the immutability trigger works;
  - the runtime role can't write `app.questions`;
  - cross-user 404s and the consent gate;
  - an unknown, inactive or gad7 id is refused;
  - wrong counts and out-of-range answers are refused;
  - encryption at rest: a raw select shows no ids or notes;
  - swapping AAD fails;
  - export and erasure.
- **e2e on iPhone and Pixel:**
  - choose Reflection, answer it and see the result;
  - a `brings_help` answer brings Get help forward;
  - a second reflection uses different questions;
  - the GAD-7 path is unchanged;
  - history and report;
  - axe, 320px overflow and landscape checks, no CSP violations.
