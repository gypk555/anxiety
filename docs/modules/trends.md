# Trends

## Purpose

Show a person how their saved scores change over time, in a form that works for screen readers and doesn't judge. Why it's hand-built: [decision 011](../decisions/011-hand-built-svg-chart.md).

## User-facing behaviour

- `/trends` needs an account and current consent.
- One sentence states the latest score and how it compares with the one before, such as "That is 3 lower than your check-in on ...". It doesn't say better or worse.
- A chart of scores over time, with severity bands named in words. "Show these as a table" gives the same numbers, newest first.
- A history list, each entry linking to its result, with a delete button and a confirmation.
- "Show older check-ins" loads more.
- No check-ins: an explanation and a "Start the check-in" button. One check-in: a dot, and a note that the line starts with the next one.
- Under the chart, "Make a report for your doctor" opens the [doctor report](doctor-report.md).
- Below a stitched rule, a separate section, "Your daily mood log, not a test score", has its own 30-day chart and table, with a link to `/mood`. It never shares an axis with the GAD-7. See [mood log](mood-log.md).

Home also shows the latest result and next check-in date: `Next check-in: {date}`, or a nudge once it's been two weeks or more.

## How it works

`Trends.tsx` uses `useInfiniteQuery` with `fetchAssessments`, default page size 50, newest first. It sorts a copy oldest first for the chart.

`TrendChart.tsx` draws a responsive SVG with a `ResizeObserver`. The height is 216. X is linear in time with a minimum range of 14 days, and Y maps 0 to 21. `trendSummary` writes the sentence, and the same sentence becomes the SVG's `<desc>`. The SVG has `role="img"`, labelled by its title and description. Band lines sit at each cut point, and the points are a dashed stitched line with dots.

Deleting calls `DELETE /assessments/:id` and invalidates `assessmentsKey`, which covers the list, Home's latest and any open result.

## Key files

- [apps/web/src/routes/Trends.tsx](../../apps/web/src/routes/Trends.tsx)
- [apps/web/src/ui/TrendChart.tsx](../../apps/web/src/ui/TrendChart.tsx)
- [apps/web/src/lib/queries.ts](../../apps/web/src/lib/queries.ts) (`fetchAssessments`, `assessmentsKey`)
- [apps/web/src/routes/Home.tsx](../../apps/web/src/routes/Home.tsx) (`LastResult`)

## Data and API used

Endpoints: `GET /assessments`, `DELETE /assessments/:id`. Table: `assessments`, read through `assessments_page_idx`.

## Security/privacy notes

- Listing filters on `user_id`, and a cursor from someone else's list reveals nothing. A test checks both.
- All payloads are decrypted on each request. Scores are never stored in plaintext for charting.
- The query cache is in memory only, and cleared at sign-out.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Offline or server error | Error state, with retry and a Help link |
| Session ended | Redirect to sign-in |
| Delete fails | Error stays in the sheet, and nothing changes |
| Many points on the same day | Points overlap. The table still shows each one |
| Narrow screen | `innerW` has a floor of 40, and no horizontal page scroll at 320px |

## Tests that cover it

- [apps/web/src/ui/TrendChart.test.tsx](../../apps/web/src/ui/TrendChart.test.tsx)
- [apps/web/src/routes/Trends.test.tsx](../../apps/web/src/routes/Trends.test.tsx) (the mood section stands apart)
- [apps/web/e2e/live/results.spec.ts](../../apps/web/e2e/live/results.spec.ts) (`trends: list, chart, table, delete`)
- [apps/api/test/data.test.ts](../../apps/api/test/data.test.ts) (`pagination`, `cross-user access`)
- [apps/web/e2e/live/a11y.spec.ts](../../apps/web/e2e/live/a11y.spec.ts)

## Known limits

- **Only loaded pages are charted.** Past 50 check-ins, the chart and the sentence cover just what's loaded until "Show older check-ins" is pressed. The newest data is always included, so the sentence stays right.
- The chart has no tooltip, zoom or per-point focus. The table and list provide the detail.
- Home fetches a full first page to show one result.
- Up to 1,000 saved check-ins.
