# Doctor report

## Purpose

A clear summary to take to a doctor, made from the person's own data, which they choose. It's printed, or saved as a PDF, by the browser.

## User-facing behaviour

- `/report`, account only. Linked from Trends, "Make a report for your doctor".
- Period: Last month, Last 3 months (the default), Last 6 months, or Everything.
- What to include, with defaults:

  | Section | Default |
  | --- | --- |
  | GAD-7 scores | On |
  | A chart of the scores | On |
  | Mood log, weekly averages | On |
  | Mood notes | Off |
  | Safety plan | Off |
  | Journal entries | Off |
  | Reflections | Off |
  | Reflection notes | Off |
  | About me | Off |

  A line explains that private writing is left out unless it's added.
- "Put my name at the top" is off by default. When on, it shows a name field filled from the account's name (required since 2026-11-13, and possibly a nickname), which can be changed for this report only.
- **About me**, off by default: the age range, gender, what the person does ("Occupation") and "Things that cause stress", in words, only those that are set, or "No details added.". The avatar never goes in. See [profile](profile.md).
- The preview below, labelled "Report preview", is what prints:
  - a header, "Anxiety check-in summary", with the name if chosen and the period
  - each section in large type
  - a footer: "Self-reported. A screening, not a diagnosis.", the GAD-7 attribution, and "Made on <date>"
- The GAD-7 table has Date, Score ("10 of 21"), Range, and Day-to-day difficulty.
- The weekly mood table has Week starting (Monday), Days logged, and an average from 1 to 5 with the nearest word. The report says the mood log is not a test score and not part of the GAD-7.
- Reflections: each one's date, then a table of its five questions and answers in words. Its note appears only with "Reflection notes" on as well. The section says reflections are not scored and not part of the GAD-7. See [reflections](reflections.md).
- "Save as PDF or print" calls `window.print()`.

## How it works

Built in the browser in [Report.tsx](../../apps/web/src/routes/Report.tsx), from the same endpoints the app already uses: every page of `/assessments`, `/moods` for the last 400 days, and, only when switched on, every page of `/journal` and `/safety-plan`. There's no new endpoint and no server-side PDF.

The print stylesheet, in [styles.css](../../apps/web/src/styles.css) under `@media print`:

- uses A4 (`@page { size: A4; margin: 18mm }`) and the existing black-on-white paper tokens
- hides the controls, header and tab bar, which are `no-print`
- starts each `.report-section` after the first on a new page (`break-before: page`)
- hides buttons inside the report, such as the chart's table toggle
- keeps table rows and journal entries whole

## Key files

- [apps/web/src/routes/Report.tsx](../../apps/web/src/routes/Report.tsx) (`weeklyAverages`)
- [apps/web/src/styles.css](../../apps/web/src/styles.css) (`.report`, `.report-section`, `.report-header`, `.report-footer`)
- [apps/web/src/ui/TrendChart.tsx](../../apps/web/src/ui/TrendChart.tsx)

## Data and API used

Reads only: `GET /assessments`, `GET /moods`, `GET /journal`, `GET /safety-plan`. Nothing is sent.

## Security/privacy notes

- The report exists only in the page and in whatever file the person saves. Nothing is uploaded or stored by the app.
- Private writing is off by default, and so is the name.
- A saved PDF is outside the app's control once it's on the phone. The page says nothing is sent, but doesn't warn about where the person keeps the file.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| No check-ins in the period | "No check-ins in this period." The chart section is left out |
| No mood days | "No days logged in this period." |
| No safety plan | "No safety plan saved." |
| A section's data fails to load | That section shows the error with Try again. The rest still prints |
| Long words | Wrap anywhere in table cells, so nothing is cut off at 320px or on paper |

## Tests that cover it

- [apps/web/src/routes/Report.test.tsx](../../apps/web/src/routes/Report.test.tsx)
- [apps/web/e2e/live/report.spec.ts](../../apps/web/e2e/live/report.spec.ts)
- [apps/web/e2e/audit.spec.ts](../../apps/web/e2e/audit.spec.ts) (screens, and the print view: A4 page breaks, black on white, no controls)
- [apps/web/e2e/live/a11y.spec.ts](../../apps/web/e2e/live/a11y.spec.ts)

## Known limits

- "Everything" covers mood days only from the last 400 days, the widest range the moods API serves. Moods can't be logged further back than 366 days anyway.
- Page breaks and A4 depend on the browser's print engine. WebKit honours less of `@page` than Chromium. Not yet tried on a real phone's "Save as PDF": see MT-SP in the manual test cases.
- The period is counted in calendar months back from now, on the phone's clock.
