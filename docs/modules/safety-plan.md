# Safety plan

## Purpose

A short plan the person writes at a calmer time, to read in a hard moment. It follows the structure of the Stanley-Brown safety plan. It works with or without an account, and offline once it has opened.

## User-facing behaviour

- Reached from Help ("Open your safety plan"), from Tools, and from the severe result.
- `/safety-plan` shows the plan as numbered steps, in large type:
  1. Warning signs that a hard time may be starting
  2. Things I can do on my own to calm down
  3. People and places that help me take my mind off things
  4. People I can ask for help
  5. Professionals and helplines
  6. Making my surroundings safer
  7. What matters most to me, and reasons to keep going
- Empty steps are left out, except step 5. Step 5 always shows Call 112 and every shared helpline, then the person's own doctor or therapist.
- A contact with a phone number is a one-tap haldi call button, "Call Didi, +91 98765 43210". A contact with no number is shown as a name only.
- With nothing written yet, a quilted patch explains the idea and offers "Make your plan".
- `/safety-plan/edit` has one fieldset per step. Each fieldset has the title, a gentle prompt, and "For example: …" as a hint. The example is never filled in as a value. Lists start with one empty row. Each section takes at most 10 items or contacts.
- One line says where the plan is kept:
  - For a guest: "kept only on this device, encrypted".
  - For an account: "a copy is kept on this device, encrypted, so it opens without a connection".
  - Offline: "You're offline. This is the copy saved on this device on …".
- Actions under the plan: Change your plan, Print or save as PDF, and Delete this plan, which asks first.
- After signing in, if a guest plan is on the device, the plan page offers "Move it to your account", or "Not now". Moving saves it to the account and removes the guest copy. If the account already has a plan, the offer says that moving replaces it.
- Leaving the form with unsaved changes asks first. Closing the tab triggers the browser's warning, except during a quick exit.

## How it works

`usePlanSource` in [SafetyPlan.tsx](../../apps/web/src/routes/SafetyPlan.tsx) decides where the plan comes from:

| State | Source | Can change it |
| --- | --- | --- |
| Signed in, consented, online | `GET /safety-plan`. 404 means no plan | Yes, `PUT /safety-plan` |
| Signed in, but `GET /safety-plan` fails with no connection | The device copy for this account | No: "Changing your plan needs a connection" |
| Reloaded offline, so `/me` fails and nobody is known | The account copy on the device, otherwise the guest copy | Only a guest copy |
| Guest (`/me` is 401) | The guest copy on the device | Yes, on the device |
| Consent out of date | Sent to `/consent` | |

Whenever the server answers, an effect updates the device copy: a plan is saved, and "no plan" removes it.

**The device copy** lives in [vault.ts](../../apps/web/src/lib/vault.ts):

- IndexedDB database `anxiocare-vault`, store `kv`.
- `device-key`: an AES-GCM 256 key from `crypto.subtle.generateKey` with `extractable: false`. It is made once, in a single transaction, so two first saves can't each make one.
- `plan:guest` and `plan:account`, each `{ iv, ct, savedAt }`. The account record also has `owner`, the SHA-256 of `anxiocare-plan-owner:<user id>`, never the id itself.
- The additional data binds the ciphertext to its slot and owner, so a guest copy can't be read as an account's, or one account's as another's.
- A record that fails to decrypt or validate is treated as absent.

**When the account copy is removed.** These all go through `wipeClientData` in [queries.ts](../../apps/web/src/lib/queries.ts):

- sign-out, and declining consent, which signs out
- account deletion
- a session that ends underneath the person (a 401)

When any account signs in, `forgetOtherAccounts` removes a copy owned by a different account. A guest plan stays until the person deletes it or moves it.

On save, the form drops blank rows, then parses with the shared `safetyPlanBody`. The server parses again and seals the whole plan as `safety_plans.payload`.

## Key files

- [apps/web/src/routes/SafetyPlan.tsx](../../apps/web/src/routes/SafetyPlan.tsx)
- [apps/web/src/lib/vault.ts](../../apps/web/src/lib/vault.ts)
- [apps/web/src/lib/safety-plan.ts](../../apps/web/src/lib/safety-plan.ts) (`telHref`, `tidyPlan`)
- [apps/web/src/lib/queries.ts](../../apps/web/src/lib/queries.ts) (clearing on session changes)
- [packages/shared/src/tracking.ts](../../packages/shared/src/tracking.ts) (`SAFETY_PLAN_SECTIONS`, `safetyPlanBody`)
- [apps/api/src/routes/safety-plan.ts](../../apps/api/src/routes/safety-plan.ts)
- [apps/api/migrations/004_mood_and_safety_plan.sql](../../apps/api/migrations/004_mood_and_safety_plan.sql)

## Data and API used

Table: `safety_plans`, one row per account. Endpoints: `GET`, `PUT` and `DELETE /safety-plan`. Limits:

- At most 10 items per section, each up to 200 characters.
- A contact's name is up to 80 characters.
- A phone number is up to 20 characters from `[0-9 +()-]`, with at least one digit, or empty.

See the [API](../API.md#safety-plan). In the browser: IndexedDB `anxiocare-vault` only.

## Security/privacy notes

- Other people's names and numbers are third parties' personal data. They are sealed with the plan, never logged, and covered by the privacy notice. See [PRIVACY-COMPLIANCE.md](../PRIVACY-COMPLIANCE.md).
- Nothing about the plan touches `localStorage` or `sessionStorage`. IndexedDB holds only ciphertext, a nonce, a timestamp, an owner hash, and a key that script can use but never read out. Unit and e2e tests dump all three storages and look for plaintext markers.
- On the server the plan is padded in 16 KB steps, so a dump shows a coarse size at most.
- Text renders as React text.
- Nobody reads a plan, and nothing in it triggers an alert. The Terms say so.
- Why a device key, and not something else: [decision 013](../decisions/013-encrypted-offline-safety-plan.md).

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Save fails | Says so, adds "Your writing is still here", and stays on the form |
| Offline, signed in, plan loaded before | Shown from the device copy, read-only, with the date it was saved |
| Offline, never loaded on this device | "You're offline, and no safety plan is saved on this device." The helplines still show |
| Offline guest | Reads, changes and deletes the device copy |
| Phone with letters | "A phone number can only have digits, spaces, and + ( ) -." Nothing is saved |
| Contact with a phone but no name | "Each person needs a name, even just a first name." |
| IndexedDB blocked (some private modes) | Guest saving fails with the usual error. An account still saves to the server, without an offline copy |
| Another account signs in on the device | The first account's copy is removed before the plan page can read it |
| Damaged or swapped device record | Treated as no copy |

## Tests that cover it

- [apps/web/src/lib/vault.test.ts](../../apps/web/src/lib/vault.test.ts)
- [apps/web/src/lib/session-vault.test.ts](../../apps/web/src/lib/session-vault.test.ts)
- [apps/web/src/routes/SafetyPlan.test.tsx](../../apps/web/src/routes/SafetyPlan.test.tsx)
- [apps/web/src/routes/Legal.test.tsx](../../apps/web/src/routes/Legal.test.tsx)
- [packages/shared/src/tracking.test.ts](../../packages/shared/src/tracking.test.ts)
- [apps/api/test/tracking.test.ts](../../apps/api/test/tracking.test.ts), plus [encryption](../../apps/api/test/encryption.test.ts), [erasure](../../apps/api/test/erasure.test.ts) and [logging](../../apps/api/test/logging.test.ts)
- [apps/web/e2e/live/safety-plan.spec.ts](../../apps/web/e2e/live/safety-plan.spec.ts)
- [apps/web/e2e/audit.spec.ts](../../apps/web/e2e/audit.spec.ts) (screens and the print view), [live/a11y.spec.ts](../../apps/web/e2e/live/a11y.spec.ts), [live/landscape.spec.ts](../../apps/web/e2e/live/landscape.spec.ts), [live/safety.spec.ts](../../apps/web/e2e/live/safety.spec.ts)

## Known limits

- The device copy doesn't protect against someone holding the unlocked phone, who can open the app. It protects only against someone reading the browser's storage files or a backup of them.
- Reloaded offline with nobody known, the app shows the last signed-in account's copy. Sign-out and another account's sign-in remove it, but a session that expired while the phone stayed offline hasn't been seen yet, so its copy is still there.
- Safari and other WebKit browsers may delete a site's IndexedDB after 7 days without a visit (Intelligent Tracking Prevention), except in an installed home-screen app. The offline copy, or a guest's only copy, can then disappear. A guest should know their plan isn't backed up.
- Clearing site data in the browser deletes the guest plan for good.
- Moving a guest plan replaces the account's plan whole. There's no merging.
- There's no conflict check between devices: the last save wins.
- The wording hasn't had clinician review yet. See [CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md#safety-plan-wording).
