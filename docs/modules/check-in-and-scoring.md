# Check-in and scoring

## Purpose

Administer the GAD-7, with its item and option wording as published, on a phone, with or without an account, and score it correctly. Why exact wording: [decision 007](../decisions/007-exact-gad7.md). Why no account is needed: [decision 009](../decisions/009-guest-check-in.md). Clinical safety rules are in [CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md).

## User-facing behaviour

- `/check-in`: "What would you like to do?", the Anxiety check (GAD-7) or a [Reflection](reflections.md).
- `/check-in/gad7`: a short intro. It says about two minutes, no right or wrong answers, a screening and not a diagnosis, for adults. If answers exist, it offers "Continue from question N" and "Start again".
- `/check-in/1` to `/check-in/7`: one question per screen, with the stem above it, four large options, and progress as stitches. Choosing an option moves on after 260 ms. Back returns with the answer still selected.
- `/check-in/difficulty`: the functional question, only when any answer was above "Not at all".
- "Get help" stays in the header throughout. There is no tab bar.
- At the end, a guest goes to `/result`. A signed-in, consented person sees "Saving your result", then `/result/:id`.

## How it works

**Wording and scoring** live in [packages/shared/src/gad7.ts](../../packages/shared/src/gad7.ts): `GAD7_STEM`, `GAD7_ITEMS`, `GAD7_OPTIONS`, `DIFFICULTY_STEM`, `DIFFICULTY_OPTIONS`, `GAD7_ATTRIBUTION`, `SEVERITY_BANDS`, `GAD7_REFERRAL_CUTOFF` (10), `GAD7_RETAKE_INTERVAL_DAYS` (14), `scoreGad7`, `severityFor`.

| Score | Severity | Recommends a professional |
| --- | --- | --- |
| 0-4 | minimal | No |
| 5-9 | mild | No |
| 10-14 | moderate | Yes |
| 15-21 | severe | Yes |

Difficulty is not scored.

**Progress.** [guest.ts](../../apps/web/src/lib/guest.ts) keeps `anxiocare.checkin.v1` in `sessionStorage`: `clientRequestId`, `answers` (null until answered), `difficulty`. Reads are validated with Zod, so corrupt storage counts as nothing. `CheckInStep` redirects if there is no progress, or if the URL skips ahead.

**Finishing.** `completeCheckin` makes a result with `takenAt`, and `useFinish` moves it to `anxiocare.result.v1`. If signed in and consented, it posts immediately.

**Saving.** `POST /assessments` validates the body, checks for a replay, applies the `takenAt` rules, then computes the score and severity itself. In a transaction it takes an advisory lock, counts rows against the cap of 1,000, and inserts with `ON CONFLICT (user_id, client_request_id) DO NOTHING`. Payload sealed: answers, difficulty, score, severity.

**Time rules** (`resolveTakenAt`). Missing means now. More than 60 seconds ahead is rejected. Up to 60 seconds ahead is clamped to now. Older than 24 hours is rejected.

## Key files

- [packages/shared/src/gad7.ts](../../packages/shared/src/gad7.ts)
- [packages/shared/src/schemas.ts](../../packages/shared/src/schemas.ts) (`assessmentCreateBody`, `assessmentResponse`)
- [apps/web/src/routes/CheckIn.tsx](../../apps/web/src/routes/CheckIn.tsx)
- [apps/web/src/lib/guest.ts](../../apps/web/src/lib/guest.ts)
- [apps/web/src/ui/Stitches.tsx](../../apps/web/src/ui/Stitches.tsx)
- [apps/api/src/routes/assessments.ts](../../apps/api/src/routes/assessments.ts)

## Data and API used

Table: `assessments`. Endpoint: `POST /assessments`. Browser: `sessionStorage` keys `anxiocare.checkin.v1` and `anxiocare.result.v1`.

## Security/privacy notes

- A guest's answers aren't sent anywhere. `sessionStorage` is gone when the tab closes.
- `localStorage` isn't used for any of this. A test checks.
- The server never accepts a score. A `score` key is an unknown key, so it's a 400.
- A signed-out page load still calls `GET /me`, which gets a 401. That reveals an IP to the host, as any page load does, and no check-in data.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Refresh mid check-in | Resumes in the same tab |
| Tab closed | Everything is gone, by design |
| `/check-in/9`, `/check-in/abc` | Back to the GAD-7 intro, `/check-in/gad7` |
| URL skips ahead | First unanswered question |
| `/check-in/difficulty` with all zeros | Back to question 7 |
| `sessionStorage` blocked | Works until a reload |
| All "Not at all" | Skips difficulty, and sends `difficulty: null` |
| Save fails or goes offline | Result stays in the tab. `/result` offers to save. |
| Retried save | Same `clientRequestId` returns the same row with 200 |
| A chunk fails to load | Error screen. Help opens without a reload. |
| Over 1,000 saved | 409 with wording that suggests deleting and downloading. Result stays in the tab. |

## Tests that cover it

- [packages/shared/src/gad7.test.ts](../../packages/shared/src/gad7.test.ts)
- [apps/web/src/routes/CheckIn.test.tsx](../../apps/web/src/routes/CheckIn.test.tsx)
- [apps/web/src/lib/guest.test.ts](../../apps/web/src/lib/guest.test.ts)
- [apps/api/test/data.test.ts](../../apps/api/test/data.test.ts) (`assessments`)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (caps)
- [apps/web/e2e/live/guest.spec.ts](../../apps/web/e2e/live/guest.spec.ts)
- [apps/web/e2e/live/results.spec.ts](../../apps/web/e2e/live/results.spec.ts)
- [apps/web/e2e/live/navigation.spec.ts](../../apps/web/e2e/live/navigation.spec.ts)
- [apps/web/e2e/live/failures.spec.ts](../../apps/web/e2e/live/failures.spec.ts)

## Known limits

- `GAD7_STEM` says "the following problem" (singular), because one item shows per screen. The published form says "problems". The difficulty item also leaves out its lead-in. The About page discloses both. The test covers items, not the stem. A reviewer should accept or reject these: see [clinical safety](../CLINICAL-SAFETY.md#wording-and-the-disclosed-adaptation).
- `DIFFICULTY_STEM` leaves out the published lead-in about having checked off problems, for the same one-at-a-time reason.
- English only. No validated translations are included.
- A result is lost if the tab closes before it's saved.
- 18+ is stated on screen, and confirmed at consent. Guests aren't asked.
- `useFinish` reads `me.data` at finish time. If `/me` hasn't returned yet, a signed-in person is treated as a guest, and sees the save offer.
