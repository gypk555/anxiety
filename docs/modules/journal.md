# Journal

## Purpose

CBT thought records: write down what happened and what went through your mind, weigh it up, and find a more balanced view. Stored encrypted, and visible only to the person.

## User-facing behaviour

- `/journal`: a list, newest first, showing date, thought and situation. An empty state explains the idea. "Show older entries" loads more.
- `/journal/new`: five steps with progress.
  1. What happened? (required)
  2. What went through your mind? (required)
  3. How did it feel? Preset and custom feelings, and a strength from 0 to 10.
  4. What supports it, and what doesn't fit? (optional)
  5. A more balanced view (optional), and optionally a strength now.
- `/journal/:id`: read, then edit or delete with a confirmation.
- `/journal/:id/edit`: the same form, filled in.
- Leaving with unsaved changes asks first. Closing the tab triggers the browser's warning, except during a [quick exit](quick-exit.md), which must never be held up.
- A draft survives moving around the app, and Home and the list point back to it. A reload or sign-out discards it.
- All of it needs an account and current consent. The Tools screen says so.

## How it works

The step is in the URL (`?step=2`), so back and forward work. The Form validates required parts per step, in kind words. A link or reload that reaches step 5 with required parts empty goes back to that step.

Drafts live in a `Map` in [drafts.ts](../../apps/web/src/lib/drafts.ts), keyed `new` or the entry id, and only in memory. If a save hits a lost session, `holdWork` keeps them for the same person.

On save, the client parses with the shared `journalBody`, then sends POST or PATCH. The server re-validates, seals the whole body as `journal_entries.payload`, and for POST takes an advisory lock to count against the cap of 2,000 first. PATCH replaces the whole payload and sets `updated_at`.

Paging is a keyset on `(created_at, id)`.

## Key files

- [apps/web/src/routes/Journal.tsx](../../apps/web/src/routes/Journal.tsx)
- [apps/web/src/routes/JournalForm.tsx](../../apps/web/src/routes/JournalForm.tsx)
- [apps/web/src/lib/drafts.ts](../../apps/web/src/lib/drafts.ts)
- [apps/web/src/lib/held.ts](../../apps/web/src/lib/held.ts)
- [apps/api/src/routes/journal.ts](../../apps/api/src/routes/journal.ts)
- [packages/shared/src/schemas.ts](../../packages/shared/src/schemas.ts) (`journalBody`, `journalResponse`)

## Data and API used

Table: `journal_entries`. Endpoints: `GET /journal`, `POST /journal`, `GET /journal/:id`, `PATCH /journal/:id`, `DELETE /journal/:id`. Field limits: [API](../API.md#journal).

## Security/privacy notes

- Text never touches browser storage, not even as a draft. A test checks.
- The whole payload is one sealed blob, padded in 4 KB steps, so a dump shows a coarse size at most.
- Text renders as React text. `dangerouslySetInnerHTML` isn't used anywhere.
- Nobody monitors what is written. The Terms say so. A person writing about self-harm gets no automated response, and "Get help" remains in the header.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Save fails | Says so, adds "Your draft is safe here", and stays on the step |
| Offline at save | Same. Retry works when back online |
| Slow save | Button shows "Saving" and is disabled |
| Session lost while saving | Text is held in memory. It comes back for the same person, and is wiped for anyone else |
| Reload with a draft | The draft is gone, after the browser's warning |
| Entry not found, or someone else's | Not-found screen |
| Too long | The form's `maxLength` stops it. The server would answer 400 |
| Feelings at 10 | Further ones are ignored |
| 2,000 entries | 409 with wording that suggests deleting and downloading |

## Tests that cover it

- [apps/web/src/routes/JournalForm.test.tsx](../../apps/web/src/routes/JournalForm.test.tsx)
- [apps/api/test/data.test.ts](../../apps/api/test/data.test.ts) (`journal`, `pagination`, `cross-user access`)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (size steps, caps)
- [apps/web/e2e/live/journal.spec.ts](../../apps/web/e2e/live/journal.spec.ts)
- [apps/web/e2e/live/failures.spec.ts](../../apps/web/e2e/live/failures.spec.ts)

## Known limits

- POST isn't idempotent. The button blocks a double tap, but if a response is lost and the person saves again, there will be two entries.
- No search, tags or export per entry. The full download is in Settings.
- Drafts don't persist across reloads, on purpose.
- Editing has no conflict check: the last save wins across tabs.
