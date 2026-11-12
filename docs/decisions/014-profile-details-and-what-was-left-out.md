# 014. Profile details from the old version, and what was left out

Status: accepted, 2026-11-12. Decided by: the owner (the [spec](../superpowers/specs/2026-11-12-profile-details-design.md)), built as described in [profile](../modules/profile.md).

## Context

The old version (commit `fb4b34a`) had an avatar, stress factors, occupation, age and gender, and a number of other features. The owner asked for the profile details back, all optional except the name, with the best UX. The clinical-safety rules ([CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md)) forbid comparison with others, invented statistics and "insights".

## Decision

Bring back the profile details as fixed choices only: an age range (never a birth date), gender, occupation, stress factors and an avatar. Encrypt them as one padded blob, use them only to show back, for the report if chosen, and to suggest existing tools. Offer them once, after the name, never as a gate. Bring back two low-risk gains: a quiet breath counter, and "Delete all check-ins".

Not brought back, for clinical-safety reasons:

- The extended 14-item mode, reworded GAD-7 items, category breakdowns and "clinical context" text. See [decision 007](007-exact-gad7.md).
- The demographic insight.
- Confetti, colour-coded severity, and red and green trend arrows.
- The canned reframe.
- Demo mode.
- Binaural or "theta" sound claims.
- Non-India helplines.

## Consequences

- The privacy notice changes, so `CONSENT_VERSION` moved, once, together with the required name, to `2026-11-13`.
- Gender with health data needs the lawyer's view; the suggestions need the clinician's.
- Nothing about the details is analysed, so the app can't say anything about groups of people, by design.
