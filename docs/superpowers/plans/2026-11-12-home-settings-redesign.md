# Home and Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Home and Settings screens to the approved mockups: a hierarchy led by what is due today, a one-tap mood scale, and Settings grouped into labelled lists with destructive actions last.

**Architecture:** Two new presentational components (`ui/MoodScale.tsx`, `ui/SettingsList.tsx`) carry the new visual patterns. `MoodCard`, `Home` and `Settings` are recomposed from them and from the existing `Sheet`/`ConfirmSheet`, mutations and queries. No API, schema or router changes.

**Tech Stack:** React 19, react-router 8, TanStack Query 5, Tailwind 4 (tokens in `apps/web/src/styles.css`), lucide-react, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-home-settings-redesign-design.md`

## Global Constraints

- Start no task until the Reflections session's work (Home.tsx, styles.css, e2e, lib/*) is committed and the owner says go.
- Use only the existing tokens and component classes (`patch`, `patch-quilted`, `btn-*`, `chip`, `link`, `stitch-rule`, `night`). Only new CSS: `.mood-step` and `.settings-row` in `styles.css` `@layer components`.
- Header (Quick exit, Get help) and tab bar are untouched.
- Mood scale words, in order: `Very low`, `Low`, `Okay`, `Good`, `Very good` (from `MOOD_LEVELS`). Always visible text; never colour or shape alone.
- No streak, "in a row" or "missed" wording anywhere.
- Targets ≥ 44px, works at 320px wide and 568×320 landscape, axe clean in both themes (existing `e2e/audit.spec.ts`).
- Copy fixed by the spec: "How are you today?", "One tap saves it for today. Only you can see this, and it isn't a test score.", "Saved for today", "You're feeling <word lowercased>", "Time for a check-in", "Your check-ins", "Your space", "For right now", "Report for your doctor", "Delete my account".

## Review Focus

1. Rapid double tap on two mood steps while the first save is in flight: only the last choice should end up saved, and the UI should never show a word that isn't what the server stored. → Task 2 test "a second tap while saving is ignored".
2. "Very good" at 320px: label wraps to two lines inside its step, never truncates or overflows. → Task 1 CSS + Task 6 audit at 320px.
3. Consent-required account in Settings: Name and Email rows must not offer editing (server refuses). → Task 4 test kept/adapted from "holds back only what the server refuses".
4. Google disabled and not connected: no Google row at all. → Task 4 test.
5. Home with no saved check-in yet: shows the "Time for a check-in" card (first-time wording), not an empty "Your check-ins". → Task 5 test.

---

### Task 1: MoodScale component

**Files:**
- Create: `apps/web/src/ui/MoodScale.tsx`
- Create: `apps/web/src/ui/MoodScale.test.tsx`
- Modify: `apps/web/src/styles.css` (add `.mood-step` in `@layer components`)

**Interfaces:**
- Produces: `export function MoodScale(props: { label: string; value: number | null; onChange: (rating: number) => void; disabled?: boolean; action?: ReactNode }): JSX.Element` (renders `role="group"` labelled by an `h2` with `label`; `action` renders at the right of the heading, used for the "Mood log" link)
- Produces: `export function LevelBars(props: { level: number; className?: string }): JSX.Element` (inline SVG, `aria-hidden`, 5 bars of heights 6/9/12/15/18 in a 34×20 viewBox, first `level` filled with `currentColor`-driven madder, rest `surface-2`)

- [ ] **Step 1: Write failing tests** in `MoodScale.test.tsx`:
  - `renders five buttons in order with their words` → `getAllByRole('button').map(b => b.textContent)` equals the five words.
  - `marks the chosen step pressed` → value 3 gives `aria-pressed="true"` only on Okay.
  - `calls onChange with the step's rating` → click Good → `onChange` called with 4.
  - `disabled stops choices` → with `disabled`, click does nothing and buttons are `disabled`.
- [ ] **Step 2: Run** `npx vitest run src/ui/MoodScale.test.tsx` → FAIL (module not found).
- [ ] **Step 3: Implement** `MoodScale` and `LevelBars`. Grid of 5 equal columns, `gap-1.5`; each step is a `<button type="button" className="mood-step" aria-pressed>` with `LevelBars` above the word. `.mood-step`: column flex, centred, `min-height: 5.25rem`, `border: 2px solid var(--line)`, `border-radius: 0.875rem`, `background: var(--surface)`, `font-size: 0.875rem`, `font-weight: 550`, `line-height: 1.15`, `overflow-wrap: anywhere`; `[aria-pressed='true']` uses `--primary`/`--on-primary` and bars switch to on-primary.
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `feat(web): add one-row mood scale`.

### Task 2: MoodCard one-tap save

**Files:**
- Modify: `apps/web/src/ui/MoodCard.tsx`
- Modify: `apps/web/src/ui/MoodCard.test.tsx`
- Modify: `apps/web/e2e/live/mood.spec.ts`

**Interfaces:**
- Consumes: `MoodScale`, `LevelBars` (Task 1); existing `saveMood(day, { rating, note })`, `fetchMoods`, `moodsKey`, `todayLocal`, `MoodNote`.
- Produces: `export function MoodCard(props: { compact?: boolean }): JSX.Element | null`. `compact` is used by Home when a check-in is due: saved state renders as a single patch row ("Today you said <word>" + Change); unsaved renders the full scale.

- [ ] **Step 1: Rewrite tests** in `MoodCard.test.tsx` (keep `todayLocal` test):
  - `one tap saves today, with no note` → click Okay → PUT body `{ rating: 3, note: '' }`; then `findByText('Saved for today')` and `getByText("You're feeling okay")`.
  - `a second tap while saving is ignored` → PUT handler resolves on a deferred promise; click Low then Good; release; exactly one PUT, body rating 2.
  - `add a note after saving` → saved entry rating 4; click `Add a note`; type in `A note, if you like`; click `Save note` → PUT body `{ rating: 4, note: 'Slept badly' }`.
  - `change reopens the scale with the saved choice pressed` → saved rating 2; click `Change`; group `How are you today?` has Low pressed; click Good → PUT rating 4, note kept from the saved entry.
  - `keeps the choice when saving fails, and says so` → 500 on PUT; click Very low; `alert` matches `/went wrong/`; Very low pressed; scale enabled again.
  - `links to the mood log` → link `Mood log` href `/mood` in both states.
  - `no streak wording` → body text not matching `/streak|in a row|missed/i`.
- [ ] **Step 2: Run** `npx vitest run src/ui/MoodCard.test.tsx` → new tests FAIL.
- [ ] **Step 3: Implement.** Unsaved: `patch-quilted` section with `MoodScale` (`action` = `Mood log` link), `disabled={save.isPending}`, `onChange` sets rating and mutates immediately with the existing note (saved entry's note when changing, else `''`); footnote copy from Global Constraints. Saved: check mark in a `surface-2` circle, "Saved for today", display-font "You're feeling {moodLabel(r).toLowerCase()}", `LevelBars`, saved note if any, two equal buttons `Add a note` (btn-quiet) and `Change` (btn-secondary), and a `Mood log` link. `Add a note` swaps the buttons for `MoodNote` + `Save note` (btn-primary small) + `Cancel`. Saving announces via an `aria-live="polite"` region ("Saved for today"). Errors render `role="alert"` with `errorMessage`.
- [ ] **Step 4: Run** the unit test → PASS. Then update `e2e/live/mood.spec.ts` lines 8 and 13 to tap the step and assert `Saved for today` instead of clicking `Save for today`.
- [ ] **Step 5: Commit** `feat(web): mood card saves on one tap`.

### Task 3: Settings list components

**Files:**
- Create: `apps/web/src/ui/SettingsList.tsx`
- Create: `apps/web/src/ui/SettingsList.test.tsx`
- Modify: `apps/web/src/styles.css` (add `.settings-row`)

**Interfaces:**
- Produces: `export function SettingsGroup(props: { title?: string; id: string; tone?: 'default' | 'danger'; children: ReactNode }): JSX.Element` — `section` labelled by a small ink-soft `h2` (visually `text-sm font-semibold`, still an h2), children inside a `patch`-coloured rounded list `ul`; `danger` adds the faint dashed outline and madder titles.
- Produces: `export function SettingsRow(props: { icon: LucideIcon; title: string; description?: string; value?: string; to?: string; onClick?: () => void; ariaLabel?: string }): JSX.Element` — `li` containing a `Link` (when `to`), a `button` (when `onClick`), or a plain `div` (neither; no chevron). Accessible name is `ariaLabel ?? title`; `description` and `value` are tied with `aria-describedby`. Rows have no divider lines between them (owner decision: no dashed lines in Settings); spacing alone separates them.

- [ ] **Step 1: Write failing tests:** `a row with onClick is a button named by its title, described by its value` (`getByRole('button', { name: 'Password' })` has description `Set`); `a row with to is a link`; `a row with neither is static text, no chevron`; `a group is a region named by its title`; `rows have no divider` (no `.stitch-rule` / `hr` inside a group).
- [ ] **Step 2: Run** `npx vitest run src/ui/SettingsList.test.tsx` → FAIL.
- [ ] **Step 3: Implement** both components and `.settings-row` (flex, `gap: 0.875rem`, `min-height: 3.75rem`, `padding: 0.75rem 1rem`, full-width hit area, `text-align: left`, focus ring from base styles; chevron is lucide `ChevronRight` `aria-hidden`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): add settings group and row`.

### Task 4: Settings restructure

**Files:**
- Modify: `apps/web/src/routes/Settings.tsx`
- Modify: `apps/web/src/routes/Settings.test.tsx`
- Modify: `apps/web/e2e/live/settings.spec.ts`, `e2e/live/accounts.spec.ts`, `e2e/live/consent.spec.ts`, `e2e/live/keyboard.spec.ts` (only selectors that this changes)

**Interfaces:**
- Consumes: `SettingsGroup`, `SettingsRow` (Task 3); existing `Sheet`, `ConfirmSheet`, `ChangePassword`, `AddPassword`, `ConfirmItsYou`, mutations and queries already in the file.

Decisions this task implements:
- Signed-in order: profile card (haldi initial circle from `displayName` or email's first letter, name or "Add your name", email) → group **Account** (Name row value = display name or "Not set", opens sheet `Your name` with the existing field label `Optional. Only used to greet you.` and `Save name`; Email row description = email, opens existing `Change your email` sheet) → group **Sign-in and security** (Password row value `Set`/`Not set`, opens existing change/add sheet; Google row only when `m.google || googleOn`, value `Connected`/`Not connected`, opens connect flow or the disconnect confirm; Email codes static row value `Always on`; Signed-in devices row description "This device and N other(s)" or "Only this device", opens sheet `Signed-in devices` containing the existing list) → **Appearance** (existing radiogroup, restyled as a segmented control; labels `Phone setting`, `Light`, `Dark`) → **On this phone** (install row, only when available) → group **Your data and privacy** (Download my data as a button row with progress text in its description, Privacy notice, Terms of use, About AnxioCare and the GAD-7) → Sign out (btn-secondary with icon) and `Sign out on all devices` (btn-ghost) → group `Delete your account` with `tone="danger"` and the single row `Delete my account` opening the existing sheet.
- Rights-only (consent outstanding): agreement patch first, then Email as a static row (no editing), Sign-in and security, Appearance, Your data and privacy, sign out, delete. No Name row.
- Guest: card "You're not signed in" with `Sign in` (primary) and `Create account` (secondary) side by side, then Appearance, On this phone, About and legal group.
- Notices from flows (`Email updated…`, `Password changed…`, Google outcomes) render in one `aria-live` region under the relevant group.

- [ ] **Step 1: Update tests:** keep every existing behaviour test, changing only how they reach controls (click the `Email` row before `Change your email` dialog, etc.). Add: `rows show current state` (Password row described by `Set`; devices row described by `Only this device` for one session); `no Google row when Google is off and not connected`; `delete is the last control on the page` (last button in `main` is `Delete my account`); `consent outstanding: no Name row, Email row is not a button`.
- [ ] **Step 2: Run** `npx vitest run src/routes/Settings.test.tsx` → new/changed tests FAIL.
- [ ] **Step 3: Implement** the layout above in `Settings.tsx`. Move `ProfileName` into a `NameSheet`, move `Sessions` inside a `DevicesSheet`. Keep all mutation and reauth logic unchanged.
- [ ] **Step 4: Run** unit tests → PASS. Update the e2e selectors: `settings.spec.ts` lines 7, 14, 17, 31, 99, 150 (open the `Name` / `Email` / `Signed-in devices` row first; devices are a `dialog` named `Signed-in devices`), and any match in the other three specs from `grep -n "Save name\|Change email\|Signed-in devices" e2e/live`.
- [ ] **Step 5: Commit** `feat(web): group settings into labelled lists`.

### Task 5: Home, signed in

**Files:**
- Modify: `apps/web/src/routes/Home.tsx`
- Modify: `apps/web/src/routes/Home.test.tsx`
- Modify: `apps/web/src/lib/dates.ts` (add `formatLongDay`)

**Interfaces:**
- Consumes: `MoodCard({ compact })` (Task 2), `SettingsGroup`/`SettingsRow` (Task 3) for "Your space", existing `ResumeNotes`, `nextCheckInDate`, `greeting`, `formatDate`, `severityFor`.
- Produces: `export function formatLongDay(d?: Date): string` → e.g. `Thursday, 12 November` (`en-GB`, weekday long, day numeric, month long).

Decisions:
- `due = !last || nextCheckInDate(last.takenAt) <= now`.
- Order: date line + greeting h1 → `ResumeNotes` (restyled rows with chevron; the reflection-in-progress row adds a progress bar `answered / STEPS`; logic unchanged) → if due: `CheckInDue` quilted card, then `MoodCard compact`; else `MoodCard` → `For right now` tiles (Breathe tile uses `night` class) → if not due: `Your check-ins` patch (eyebrow `Last check-in · <date>`, `<band>, <score> of 21`, badge `Next <date>`, `Check in now` btn-secondary → `/check-in`, `See result` btn-quiet → `/result/:id`) → thought-record draft row (existing condition) → `Your space` group with rows Safety plan (`Your steps for a hard moment`, `/safety-plan`), Mood log (`One word a day`, `/mood`), Report for your doctor (`A printable summary`, `/report`).
- `CheckInDue`: eyebrow `It's been two weeks since <date>` (or `Your first check-in` when no `last`), h2 `Time for a check-in`, two link rows `Anxiety check (GAD-7)` (`7 questions · about 2 minutes`, `/check-in/gad7`) and `Reflection` (`5 gentle questions · not scored`, `/reflection/1`), and when `last` exists a line `Last time: <band>, <score> of 21.` with `See result` link. Confirm the two target paths against the router after the Reflections commit; if the chooser owns entry, link both to `/check-in` with the choice preselected via the chooser's existing mechanism.

- [ ] **Step 1: Write failing tests** in `Home.test.tsx` (keep the existing ones):
  - `not due: leads with the mood question, then tools, check-ins and your space` → headings in DOM order: `How are you today?`, `For right now`, `Your check-ins`, `Your space`.
  - `due: leads with Time for a check-in, offering both kinds` → links `Anxiety check (GAD-7)` and `Reflection` present; `Your check-ins` absent.
  - `no check-in yet counts as due, with first-time wording` → text `Your first check-in`.
  - `your space links` → Safety plan `/safety-plan`, Mood log `/mood`, Report for your doctor `/report`.
  - `formatLongDay` unit test in a new `src/lib/dates.test.ts` case: `new Date(2026, 10, 12)` → `Thursday, 12 November`.
- [ ] **Step 2: Run** `npx vitest run src/routes/Home.test.tsx src/lib/dates.test.ts` → FAIL.
- [ ] **Step 3: Implement** `AccountHome`, `CheckInDue`, `YourCheckIns`, `YourSpace` in `Home.tsx` (replacing `LastResult`/`NoResultYet`) and `formatLongDay`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): home leads with what is due today`.

### Task 6: Home first run, screens and docs

**Files:**
- Modify: `apps/web/src/routes/Home.tsx` (`FirstRun`)
- Modify: `apps/web/src/routes/Home.test.tsx`
- Modify: `apps/web/e2e/screens.ts` (add `home-account-due`, `home-mood-saved`, `settings-devices-sheet`, `settings-name-sheet`)
- Modify: `apps/web/e2e/live/guest.spec.ts`, `a11y.spec.ts`, `navigation.spec.ts`, `quick-exit.spec.ts` only where first-run selectors change
- Modify: `docs/modules/app-shell-and-routing.md` (Home section), the settings/mood module docs that describe these screens, `docs/testing/TEST-CASES.md` via `node scripts/generate-test-catalogue.mjs` if that is how it's maintained, `CHANGELOG.md`

Decisions: `FirstRun` keeps the rings (smaller, `--hero-rings` reduced so they clear the header), h1 `How have the last two weeks been?`, privacy line `A private check-in. Your answers stay on this phone unless you choose to save them.`, the same two choice rows as `CheckInDue`, `ResumeNotes`, a `night` row `Overwhelmed? Breathe first` / `One minute. Works offline.` → `/tools/breathe`, the 18+ line, and a patch `Want to see how you change over time?` / `An account saves your check-ins, mood log and journal.` with `Sign in` → `/sign-in` and `Create account` → `/create-account`.

- [ ] **Step 1: Update tests:** the guest test now expects links `Sign in` (`/sign-in`) and `Create account`; add `first run offers both check-ins and breathing` (links `Anxiety check (GAD-7)`, `Reflection`, `Overwhelmed? Breathe first` → `/tools/breathe`).
- [ ] **Step 2: Run** → FAIL; **Step 3: Implement** `FirstRun`; **Step 4: Run** → PASS.
- [ ] **Step 5: Full verification:**
  - `npm run typecheck && npm run lint && npm test` at repo root → all pass.
  - `npx playwright test --project=iphone --project=pixel` in `apps/web` (audit at 320/390/430/568×320, both themes) → pass, no axe serious/critical.
  - `npx playwright test --project=live-iphone e2e/live/{mood,settings,guest,navigation,keyboard,a11y,accounts,consent,quick-exit}.spec.ts` → pass.
  - Screenshot `home-account`, `home-account-due`, `home-first-run`, `settings-account`, `settings-guest` and compare against the approved mockups.
- [ ] **Step 6: Update docs and CHANGELOG, then commit** `feat(web): first-run home and docs for the redesign`. (Commits only with the owner's go-ahead.)
