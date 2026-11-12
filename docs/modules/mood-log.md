# Mood log

## Purpose

A daily rating of how the person is, in words, with an optional short note. It's separate from the GAD-7, and never treated as a score.

## User-facing behaviour

- Account only.
- Home has a card, "How are you today?", with five equal steps in one row: Very low, Low, Okay, Good, Very good. Each is a word under a small rising-bars mark; they are buttons with `aria-pressed`, in words, never faces or colours alone. A "Mood log" link sits beside the question.
- **One tap saves today.** There is no separate Save button; the steps are disabled while saving, so a second tap can't send a second rating. If saving fails, the chosen step stays pressed, the error shows, and the person can tap again.
- Once today is logged, the card shows "Saved for today" with the "Mood log" link beside it, "You're feeling okay", the bars mark, any note, and **Add a note** (or **Edit note**) and **Change**. A note is optional, up to 280 characters with a live count, saved with "Save note". Change reopens the steps with today's choice pressed and keeps the note.
- When a check-in is due, the check-in leads Home and the saved mood shows as one quiet line, "Today you said Good", with Change.
- There are no streaks, no reminders, and no "you missed a day". If the card's request fails, Home shows nothing for it, rather than an error.
- `/mood` shows:
  - a 30-day chart
  - "Days": the last 365 days, newest first, each with Change
  - "Log another day", with a date picker limited to today and the 366 days before it
- A day's sheet changes it, or deletes it after asking.
- Trends has its own section, "Your daily mood log, not a test score": the 30-day chart and a link to `/mood`. It sits below the check-in chart and never shares an axis with it.
- Every mood chart has "Show the mood log as a table": date, mood in words, and note.

## How it works

The day is the phone's own calendar day, from `todayLocal()` in [mood.ts](../../apps/web/src/lib/mood.ts). Logging again on the same day is `PUT /moods/:day`, an idempotent upsert.

The client applies the exact rule in the phone's time zone: not after today, and not more than 366 days back. The server can't know the time zone, so `moodDayAllowedOnServer` allows the widest honest window: up to today in UTC+14, and back to 366 days before today in UTC-12.

[MoodChart](../../apps/web/src/ui/MoodChart.tsx) is hand-built SVG, like the [trend chart](trends.md):

- a y axis of the five words
- a running-stitch line, with a dot for each logged day
- a title and description joined by `aria-labelledby`

## Key files

- [apps/web/src/ui/MoodCard.tsx](../../apps/web/src/ui/MoodCard.tsx)
- [apps/web/src/ui/MoodPicker.tsx](../../apps/web/src/ui/MoodPicker.tsx)
- [apps/web/src/ui/MoodChart.tsx](../../apps/web/src/ui/MoodChart.tsx)
- [apps/web/src/routes/MoodLog.tsx](../../apps/web/src/routes/MoodLog.tsx)
- [apps/web/src/routes/Trends.tsx](../../apps/web/src/routes/Trends.tsx) (`MoodSection`)
- [apps/web/src/lib/mood.ts](../../apps/web/src/lib/mood.ts)
- [packages/shared/src/tracking.ts](../../packages/shared/src/tracking.ts) (`MOOD_LEVELS`, `moodBody`, `moodRangeQuery`, `moodDayAllowedOnServer`)
- [apps/api/src/routes/moods.ts](../../apps/api/src/routes/moods.ts)

## Data and API used

Table: `mood_entries`, primary key `(user_id, day)`. Endpoints:

- `GET /moods?from=&to=`, where `to` is on or after `from`, and the span is at most 400 days
- `PUT /moods/:day` with `{ rating: 1-5, note: ≤280 }`
- `DELETE /moods/:day`

See the [API](../API.md#daily-mood-log). Included in the export and removed by erasure.

## Security/privacy notes

- The rating and the note are sealed together, padded to 2 KB, so every row is the same size and a dump can't tell ratings or note lengths apart.
- The AAD row id is the day, so a ciphertext moved to another day fails to open.
- The day is plaintext, for ordering and uniqueness. A database reader can see which days someone logged, but not how they felt.
- The day, the range and the note are never logged. A test checks.
- Mood data is held in memory only, in the query cache.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Save fails | "Something went wrong…" in an alert. The choice and note stay |
| Future day or over 366 days back | Refused on the phone, "Choose today or a day in the past year." The server answers 400 too |
| Malformed day in the URL | 400 `validation_failed`, with `fieldErrors.day` |
| Deleting a day with no entry | 404 |
| Midnight while the card is open | The card keeps the day it was opened with until it re-renders |
| Phone clock wrong | The day the phone believes is stored, within the server's window |

## Tests that cover it

- [apps/web/src/ui/MoodCard.test.tsx](../../apps/web/src/ui/MoodCard.test.tsx)
- [apps/web/src/ui/MoodChart.test.tsx](../../apps/web/src/ui/MoodChart.test.tsx)
- [apps/web/src/routes/MoodLog.test.tsx](../../apps/web/src/routes/MoodLog.test.tsx)
- [apps/web/src/routes/Trends.test.tsx](../../apps/web/src/routes/Trends.test.tsx)
- [packages/shared/src/tracking.test.ts](../../packages/shared/src/tracking.test.ts)
- [apps/api/test/tracking.test.ts](../../apps/api/test/tracking.test.ts)
- [apps/web/e2e/live/mood.spec.ts](../../apps/web/e2e/live/mood.spec.ts), and the mood screens in [audit.spec.ts](../../apps/web/e2e/audit.spec.ts) and [live/a11y.spec.ts](../../apps/web/e2e/live/a11y.spec.ts)

## Known limits

- One entry a day. Several moods in one day can only go in the note.
- No offline logging or queued writes.
- `/mood` lists 365 days, the chart 30.
- The server's day window is wider than the phone's rule, so a client with a changed clock can store a day up to 14 hours "ahead".
