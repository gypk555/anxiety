# Results

## Purpose

Show what a GAD-7 score means, without diagnosing, with a next step that fits. Make it easy to take to a doctor.

## User-facing behaviour

`/result` shows a guest's or unsaved result, and `/result/:id` shows a saved one. Both have:

- Date, "{Severity} range", score out of 21, the plain meaning, and "This is a screening, not a diagnosis".
- A score scale: stitched bands with a marker and labelled ranges.
- What the person said about difficulty, if asked.
- Next steps. A score of 10 or more leads with "Talk to a professional". Below 10 it says "Keep an eye on it". All get calming tools and a check-in date 14 days on. An account that chose stress factors also gets "Tools that may help", the same fixed suggestions as Home (see [profile](profile.md)).
- A note that these questions don't ask about thoughts of self-harm, with a link to Help.
- "Print for a doctor".
- The GAD-7 attribution.

**Severe (15-21)** adds, near the top, a calm section with a Tele-MANAS call button and "See all helplines". It also shows the self-harm guidance in full.

**`/result` footer.** A guest sees "Sign in to save". Signed in, it offers "Save result" and "Don't save" with a confirmation. With no result in the tab, it redirects to `/check-in`.

**`/result/:id` footer.** "See all your check-ins" and "Delete this result", with a confirmation.

**Print.** `.print-only` shows a table of each item, answer and score, the total, difficulty, and the emergency and Tele-MANAS numbers. It hides navigation and next steps. Paper is always light.

## How it works

`ResultView` renders both pages. It takes score, answers, difficulty and `takenAt`. `severityFor` gives the band. The guest page computes the score with `scoreGad7` from stored answers. It never stores a score. The saved page uses the server's score.

Saving reuses `saveResult` from `CheckIn.tsx`, with the original `clientRequestId` and `takenAt`, so it's idempotent. On success, the tab copy clears and the page replaces to `/result/:id`.

`nextCheckInDate` adds `GAD7_RETAKE_INTERVAL_DAYS`. The Result page says "around" that date, and doesn't forbid an earlier check-in.

## Key files

- [apps/web/src/routes/Result.tsx](../../apps/web/src/routes/Result.tsx)
- [apps/web/src/routes/Help.tsx](../../apps/web/src/routes/Help.tsx) (`SelfHarmGuidance`)
- [apps/web/src/lib/dates.ts](../../apps/web/src/lib/dates.ts)
- [apps/web/src/lib/guest.ts](../../apps/web/src/lib/guest.ts)
- [packages/shared/src/gad7.ts](../../packages/shared/src/gad7.ts)
- [apps/web/src/styles.css](../../apps/web/src/styles.css) (print rules)

## Data and API used

Endpoints: `GET /assessments/:id`, `DELETE /assessments/:id`, `POST /assessments`. Browser: `sessionStorage` key `anxiocare.result.v1`. Table: `assessments`.

## Security/privacy notes

- `/result/:id` for someone else's row, or a malformed id, is a plain not-found screen. It can't confirm the row exists.
- Severity colours aren't used. Severity shows in words and position, so nobody reads it from a glance at colour.
- The print view holds health data. Printing is the person's choice.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Save fails | Says so, and the result stays in the tab |
| Result older than 24 hours | "This result is more than a day old, so it can't be saved." |
| Same-tab refresh on `/result` | Still there |
| After sign-in by the same person following a session loss | Result comes back. See [auth](auth-and-sessions.md) |
| Someone else signs in | Result is wiped |
| Saved result fails to load | Error state with retry and a Help link |
| Delete fails | The confirmation sheet shows the error |

## Tests that cover it

- [apps/web/src/routes/CheckIn.test.tsx](../../apps/web/src/routes/CheckIn.test.tsx) (`result by severity`)
- [apps/web/e2e/live/results.spec.ts](../../apps/web/e2e/live/results.spec.ts)
- [apps/web/e2e/live/guest.spec.ts](../../apps/web/e2e/live/guest.spec.ts)
- [apps/web/e2e/live/authorisation.spec.ts](../../apps/web/e2e/live/authorisation.spec.ts)
- [apps/web/e2e/audit.spec.ts](../../apps/web/e2e/audit.spec.ts) (print view)
- [apps/web/e2e/live/safety.spec.ts](../../apps/web/e2e/live/safety.spec.ts)

## Known limits

- `SaveOffer` treats any `validation_failed` on save as "more than a day old". In practice that's the only reachable one, but the wording isn't checked against the field.
- The meaning text is English only and has not had clinical review.
- The app has no way to check self-harm risk: the GAD-7 doesn't ask, and the screen says so.
- The print view has no patient name.
