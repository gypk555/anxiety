# Home and Settings redesign

Date: 2026-11-12. Status: approved by the owner (mockups reviewed, "go ahead").
Mockups: rendered from the scratch HTML mockup used in the design conversation (screens 1, 1b, 1c, 2, 3, 4, 5, 6).

## Intent

Home and Settings work, but read as flat stacks of equally loud cards and sections. Someone opening Home can't
tell what to do next; someone opening Settings scrolls past ten look-alike sections, with "Delete your account"
above Appearance. The redesign keeps the kantha visual language (patches, running-stitch, Yrsa/Anek, existing
tokens) and changes hierarchy and grouping, not the brand.

## Goals

- Home leads with the one thing that matters today: the mood question normally, "Time for a check-in" once the
  two-week check-in is due. Only that card is quilted (dashed stitch).
- The calming tools stay one tap from Home, with Breathe visually distinct.
- Safety plan, Mood log and Report for your doctor get an entry point on Home ("Your space").
- Logging today's mood is one tap.
- Settings is grouped, shows each setting's current state in its row, and puts destructive actions last.

## Non-goals and anti-goals

- No new colours, fonts or component styles beyond what the mockups show; severity is still not colour-coded.
- No changes to the header (Quick exit, Get help) or the tab bar.
- No API or data-model changes. Mood save uses the existing endpoint.
- Not a failure mode we accept: anything that hides the help/exit controls, adds streaks or guilt ("you missed a
  day"), or relies on colour or faces alone for the mood scale.

## Constraints

- A parallel session is shipping Reflections. Home must keep: the check-in start (`/check-in` is now a chooser
  between GAD-7 and Reflection), the resume-a-reflection link in ResumeNotes, the mood card, and links to
  `/safety-plan` and `/report`. Code changes start only after that work is committed.
- Accessibility rules already in the codebase hold: 44px targets, WCAG 2.2 AA, radio/pressed patterns, live
  regions for saved/error states, works at 320px and in landscape.
- Offline: a guest or offline user sees the guest Home, which must work without a server.

## Approaches considered

1. **Restyle in place**: keep the current structure, adjust spacing and emphasis. Cheap, but leaves the core
   problems (no hierarchy, missing entry points, Settings ordering).
2. **Restructure with existing components** (chosen): reorder and regroup, introduce a small set of shared pieces
   (settings row/group, mood scale), reuse existing Sheets for editing. Fixes the UX problems with moderate code
   churn and no new dependencies.
3. **New design system pass**: rebuild both pages on new primitives. Out of proportion to the problem and would
   collide with the parallel session's work.

## Design

### Home, signed in

Order, top to bottom:
1. Date line (ink-soft) and greeting ("Good evening, Asha.").
2. ResumeNotes (unchanged logic), styled as a patch row with chevron; the reflection one shows a progress bar.
3. **Today card** (the only quilted card):
   - Check-in not due: the mood card (below).
   - Check-in due (or no check-in yet): "Time for a check-in" with the two choices (Anxiety check GAD-7, Reflection),
     a primary button, and "Last time: <band>, <score> out of 21. See result". When due, the mood card drops to its
     compact form below this card.
4. **For right now**: four tiles (Breathe, Ground, Sounds, Write); Breathe uses the night surface.
5. **Your check-ins** (when not due): last result, "Next <date>" badge, "Check in now" and "See result".
6. **Your space**: list rows for Safety plan, Mood log, Report for your doctor.

### Mood card (owner-approved: one-tap save)

- Header: "How are you today?" with a "Mood log" link on the right.
- Five equal-width steps in one row, each with a rising-bars mark (n of 5 filled) and its word. Buttons with
  `aria-pressed`, words always visible.
- Tapping a step saves immediately (existing save mutation). While saving, the tapped step shows pressed and the
  group is busy; on error, the error shows in the card and the step stays selectable.
- Saved state: check mark, "Saved for today", "You're feeling <word>", bars mark; "Add a note" and "Change"
  buttons; "<n> days logged this month" is optional and shown only if available without a new request.
- "Add a note" reveals the existing MoodNote field with a "Save note" button.
- Footnote: "One tap saves it for today. Only you can see this, and it isn't a test score."

### Home, first visit (guest)

Smaller rings, headline and privacy line, the two check-in choices as rows, "Overwhelmed? Breathe first" as a
night-surface row, the 18+/screening line, and a soft sign-in card at the bottom.

### Settings, signed in

Groups are plain rounded lists with no divider lines between rows (owner decision, 2026-11-12).


1. Profile card: initial in a haldi circle, name, email.
2. **Account** group: Name (value, opens a sheet to edit), Email (opens the existing change-email sheet).
3. **Sign-in and security** group: Password (Set/Not set, opens change/add sheet), Google (connected state; row
   shown when Google is enabled or connected), Email codes (always on, no chevron), Signed-in devices (summary,
   opens a sheet with the existing device list and per-device sign-out).
4. **Appearance**: segmented control (Phone, Light, Dark), same radio keyboard pattern as today.
5. **Your data and privacy** group: Download my data, Privacy notice, Terms of use, About.
6. Sign out (secondary button) and "Sign out on all devices" (ghost).
7. Delete my account, alone at the bottom in an outlined group, opening the existing delete sheet.
8. "Add to home screen" appears in an "On this phone" group when the browser offers it.

Consent-required (rights-only) Settings keeps its agreement patch at the top and uses the same grouping with only
the rows it allows today.

### Settings, not signed in

"You're not signed in" card with Sign in and Create account, then Appearance, On this phone, About and legal.

## Decided by the builder (my calls)

- Name editing moves from an inline field into a sheet, consistent with email and password.
- Signed-in devices moves behind a row into a sheet.
- The settings row and group become a shared UI component; the mood scale replaces MoodPicker on Home only
  (MoodLog page keeps its current picker unless it reuses the scale trivially).

## Left to the builder

Exact spacing, the bars mark as an inline SVG component, test updates (unit, e2e copy changes such as
"Save for today", screens.ts entries), and doc updates in docs/modules.
