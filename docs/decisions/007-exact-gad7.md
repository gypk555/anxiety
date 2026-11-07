# 007. Exact GAD-7, and removal of the extended scale

Status: accepted, 2026-11-06. Decided by: the builder.

## Context

The prototype on `main` reworded GAD-7 items, for example "Feeling nervous, anxious, or on edge over the past 2 weeks?", added seven more "Extended Clinical & Somatic" questions, and gave category labels and explanations. The GAD-7's cut points are validated only for the published items and scoring. A made-up extension gives numbers with no evidence behind them, to people who may act on them.

## Decision

- The check-in is exactly seven GAD-7 items, with their published options and 0-21 scoring, plus the unscored difficulty item when a symptom was reported.
- Wording, cut points and attribution live only in [packages/shared/src/gad7.ts](../../packages/shared/src/gad7.ts).
- The extended questions and subscale breakdowns are gone.
- The word is always "screening", never "diagnosis". The app doesn't invent statistics.

## Alternatives

- **Keep the extended scale, labelled as extra.** It would still look like a clinical result.
- **Friendlier rewording.** Changes what the instrument measures.
- **A longer validated instrument.** Would need separate licensing and clinical review, and isn't needed for a screening.

## Consequences

- Scores mean what the literature says they mean.
- A wording change is a safety matter, not a copy edit. See [CONTRIBUTING](../../CONTRIBUTING.md#rules-that-must-not-be-broken).
- Two adaptations exist for one-at-a-time display, and need clinical sign-off: the stem says "problem" (singular), and the difficulty stem drops its "If you checked off any problems" lead-in. See [check-in](../modules/check-in-and-scoring.md#known-limits).
- The GAD-7 doesn't ask about self-harm, so the app says so and keeps "Get help" on every screen.
- The app is less detailed than the prototype looked. That's the point.
