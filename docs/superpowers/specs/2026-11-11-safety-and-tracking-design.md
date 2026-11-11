# Quick exit, safety plan, daily mood log, doctor-ready report: design

Extends `2026-11-06-production-rebuild-design.md` and `2026-11-07-accounts-and-database-design.md`. Their security,
privacy, clinical-safety and UX rules still bind. Owner chose these four on 2026-11-11. Rotating reflection questions are
deferred: do not build them.

## 1. Quick exit
For someone who must hide the app at once, for example because someone nearby should not see it.
- A "Quick exit" control on every screen, signed in or not, including during the check-in and on Help, next to "Get help".
  It must be small enough not to compete with Get help, but always visible, and reachable by keyboard.
- Also triggered by pressing Escape three times within 1.5 seconds, except while the person is typing in a field.
- On use, synchronously and before anything else:
  1. Replace the current history entry with a neutral page (`location.replace`) to `https://www.google.com/search?q=weather+today`.
  2. Clear in-memory state: query cache, held drafts, any form text.
  3. Sign-out is not attempted, because there's no time for the network.
- It cannot remove earlier history entries. A short "About quick exit" section on Help explains that limit in plain words:
  what it does, what it doesn't, how to clear browser history, and private browsing.
- It never asks for confirmation, and nothing in it may be slower than an immediate navigation.
- Works offline, because navigation to the destination may fail, but the app is gone from the screen either way.

## 2. Personal safety plan
A short plan the person writes in calm times, to use in hard moments, following the structure of the Stanley-Brown
safety plan. The sections, in order, each a short list:
1. Warning signs that a hard time may be starting
2. Things I can do on my own to calm down
3. People and places that help me take my mind off things
4. People I can ask for help: name and phone, shown as one-tap call buttons
5. Professionals and helplines: prefilled with emergency 112 and the shared HELPLINES, plus the person's own doctor or therapist
6. Making my surroundings safer
7. What matters most to me, and reasons to keep going

Rules:
- Gentle, optional, never pre-filled with opinions except the helplines. Any section may be left empty. Show an example per
  section as a hint, never as a value. Copy needs clinician review, recorded in `docs/CLINICAL-SAFETY.md`.
- Available from Help and from Tools, and linked from the severe result.
- Signed-in people: stored on the server, encrypted like the journal, one plan per account. Edit any time.
- Offline: after it has loaded once, a signed-in person's plan must still open offline. Hold only an encrypted copy on the
  device. Use a random device key in IndexedDB, non-extractable via WebCrypto (`extractable: false`), with the ciphertext in
  IndexedDB too. It is cleared on sign-out, on account deletion, and when another account signs in. Never in localStorage.
  Tell the person, in one line, that a copy is kept on this device so it works offline.
- Guests: they can create a plan too. It is kept only on this device under the same encryption, after a clear one-line
  notice, and can be deleted at any time. After signing in, offer to move it to the account, then remove the device copy.
- Print or save as PDF via the print stylesheet. A plain, large-text view, readable in a crisis.
- Phone numbers of other people are third parties' personal data. They are encrypted, never logged, and covered by the
  privacy notice. Bump `CONSENT_VERSION` and update the privacy notice and `docs/PRIVACY-COMPLIANCE.md`.

## 3. Daily mood log
- "How are you today?" on a 1-5 scale with words, not only faces or colours: Very low, Low, Okay, Good, Very good.
  Optional note of up to 280 characters.
- One entry per calendar day in the person's local time zone (`YYYY-MM-DD` from the device). Logging again the same day
  updates it. Past days can be edited or deleted, but no future dates, and nothing more than 366 days back.
- Account only. A gentle card on Home. Optional, never nagging, no streaks, no "you missed a day".
- Trends: a separate small chart and a table alternative for mood, clearly labelled "Your daily mood log, not a test
  score". It is never combined on one axis with GAD-7.
- The rating and the note are encrypted. The date stays plaintext for ordering and uniqueness.
- Included in export and in erasure.

## 4. Doctor-ready report
- `/report`, account only. The person picks a period (last 1, 3 or 6 months, or all). They opt in to sections; defaults in
  brackets:
  - GAD-7 scores, with date, score, range and difficulty (on)
  - a small chart of them (on)
  - a mood log summary of weekly averages (on)
  - mood notes (off)
  - safety plan (off)
  - journal entries (off)
- Header: the person's name if they choose. Footer: "Self-reported. A screening, not a diagnosis", the GAD-7 attribution
  and the generation date.
- Built in the browser from data already fetched. No server PDF and no new endpoint. "Save as PDF" through the browser's
  print dialog with a dedicated print stylesheet, A4, black on white, page breaks between sections.
- Preview on screen first. Large type, accessible table structure.

## API (under `/api/v1`, all `requireAuth` + `requireConsent`, per-user rate limit applies)
- `GET /moods?from=YYYY-MM-DD&to=YYYY-MM-DD` (to ≥ from, span ≤ 400 days) returns entries.
- `PUT /moods/:day` takes `{ rating: 1-5, note: string ≤280 }` and is an idempotent upsert.
- `DELETE /moods/:day`.
- `GET /safety-plan` returns the plan or 404. `PUT /safety-plan` takes the full plan. `DELETE /safety-plan`.
- Shared zod schemas in `packages/shared`. Strict objects, bounded list lengths: max 10 items per section, each ≤ 200
  characters. Contacts: name ≤ 80, phone up to 20 characters from `[0-9 +()-]`.
- Caps: mood entries naturally capped by day. One plan per user.

## Data
Migration `004`, never editing 001–003:
- `app.mood_entries`: `user_id`, `day date`, `payload_ct`, `created_at`, `updated_at`. Primary key `(user_id, day)`.
- `app.safety_plans`: `user_id` primary key, `payload_ct`, `updated_at`.
- Grants and `runtime_all` policies only for `anxiocare_runtime`, RLS on.
- AAD binds the ciphertext to its table, row and user, as elsewhere.
- Export, erasure, purge, `db:verify` expectations and `docs/DATABASE.md` updated.

## Testing
TDD. API: cross-user 404s, consent gate, validation bounds, encryption at rest (raw select shows no plaintext), AAD swap
fails, erasure removes all, export includes all.

Web unit tests and live e2e on iPhone and Pixel:
- Quick exit: from every main route including mid check-in, the history entry is replaced, nothing is left in the query
  cache, Escape ×3 works and doesn't fire while typing.
- Safety plan:
  - guest create, offline open, sign-in migration
  - signed-in offline open after one load
  - cleared on sign-out
  - a second account on the same device never sees it
  - one-tap `tel:` links
- Mood: log, update same day, chart and table.
- Report: sections on and off change content, and the print stylesheet is applied.
- Every screen: axe, 320px overflow and landscape checks, no CSP violations.
