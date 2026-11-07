# Consent and privacy rights

## Purpose

Collect explicit, versioned consent before storing health data, and give people working rights over their data: see, correct, download, delete. The legal analysis is in [PRIVACY-COMPLIANCE.md](../PRIVACY-COMPLIANCE.md). This doc covers how the code behaves.

## User-facing behaviour

- After the first correct code, a person sees `/consent`: what is stored, why, their rights, and two checkboxes (18 or older; agree to storing health information).
- "Agree and continue" needs both boxes. "Not now, sign me out" ends the session.
- Until consent, check-ins, trends and journal are not reachable. A guest check-in still works.
- When `CONSENT_VERSION` changes, everyone sees the consent screen again before saving more.
- Settings offers rename, email change, download, and delete. Delete needs a fresh emailed code and takes effect at once.
- `/privacy`, `/terms` and `/about` are readable without an account. Operator name, grievance address, locations, mail provider and backup retention come from `GET /meta`. Offline, the page says these can't be loaded.

## How it works

**Consent gate.** `users.consent_version` holds the last accepted version. `hasCurrentConsent` compares it with `CONSENT_VERSION` in `packages/shared`. `requireConsent` returns 403 `consent_required` on data routes. On the client, `RequireAccount` and Home redirect to `/consent`, and `handleApiError` does the same on that 403.

**The gate never blocks rights.** `Me.acceptedConsentVersion` tells the screen which conversation it's having. Null is first-time consent: the screen says that if they don't agree, this new account is deleted after 24 hours. Anything else is a re-prompt: it shows `CONSENT_CHANGES` under "What changed", and says that existing data is kept. Both link to Settings, which for anyone with `consentRequired: true` shows `RightsOnlySettings`: their email, devices, download, sign-out and delete, with a prompt to review. Only the name and email change wait for consent, because the server refuses those until then.

**Recording.** `POST /me/consent` in one transaction inserts into `consents` (`ON CONFLICT DO NOTHING`), updates `users`, and adds an audit row. The body must have the current version and two literal `true` values.

**Unconsented accounts.** Removed by the hourly [purge](background-jobs.md) once 24 hours old, so 24 to about 25 hours after they were created. An account that once consented but is behind on the version is kept.

**Export.** `GET /me/export` decrypts and returns account, sign-in methods (not Google's subject value, and not the password hash), consents, assessments, journal and sessions, then adds an audit row. The filename is `account-data-YYYY-MM-DD.json`, which does not name the service. The client's `requestFile` accepts only a safe filename.

**Deletion.** `POST /me/delete/request` mails a code. `POST /me/delete/confirm` checks it, then in one transaction deletes the user (cascading to sessions, consents, assessments, journal, the Google identity and the user's codes, and taking the password hash with the row), deletes codes, code failures and password failures for the address, and writes an `account_delete` audit row. The client then clears its cache, guest data and drafts. Signing in again later with that address starts a new, empty account.

**Audit.** [audit.ts](../../apps/api/src/audit.ts) writes `actor_hmac`, `action` and the UTC day. Actions: `login`, `logout`, `logout_all`, `session_revoke`, `consent`, `export`, `email_change`, `account_delete`, `password_change`, `password_set`, `password_reset`, `google_link`, `google_unlink`. The runtime role cannot read these rows back. Retention is a year.

## Key files

- [apps/web/src/routes/Consent.tsx](../../apps/web/src/routes/Consent.tsx)
- [apps/web/src/routes/Legal.tsx](../../apps/web/src/routes/Legal.tsx)
- [apps/web/src/routes/Settings.tsx](../../apps/web/src/routes/Settings.tsx)
- [apps/api/src/routes/me.ts](../../apps/api/src/routes/me.ts)
- [apps/api/src/auth.ts](../../apps/api/src/auth.ts) (`requireConsent`)
- [apps/api/src/users.ts](../../apps/api/src/users.ts)
- [apps/api/src/audit.ts](../../apps/api/src/audit.ts)
- [packages/shared/src/schemas.ts](../../packages/shared/src/schemas.ts) (`CONSENT_VERSION`, `consentBody`)

## Data and API used

Tables: `users`, `consents`, `audit_log`, and all cascading tables on deletion.

Endpoints: `POST /me/consent`, `GET /me/export`, `POST /me/delete/request`, `POST /me/delete/confirm`, `PATCH /me`, `GET /meta`.

Env: `OPERATOR_NAME`, `GRIEVANCE_EMAIL`, `BACKUP_RETENTION_DAYS`, `DATA_LOCATION`, `SERVER_LOCATION`, `MAIL_PROVIDER`, `AUDIT_KEY`.

## Security/privacy notes

- `GET /me`, sessions, logout, export and the delete routes don't need consent at the API, so nobody is locked out of their own data there.
- `PATCH /me` and the email-change routes do need consent.
- Audit rows outlive erasure on purpose, and hold no direct link: an HMAC under a key the database doesn't hold, and only a day. Times can't be joined to session times.
- The export is plaintext once downloaded, and Settings says so.
- Backups: rows go at once, but a backup plus the master key can still decrypt until the backup ages out. The app says so, using `BACKUP_RETENTION_DAYS`. The owner must confirm that number against the Supabase plan.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Consent accepted twice for one version | `consents` keeps the first time. `users.consent_at` and the audit log record the later one. |
| An old client sends an old version | 400 `validation_failed`. |
| Wrong deletion code | 400 `invalid_code`, nothing deleted. |
| Deletion after the code is consumed, but the transaction fails | 500, data intact, and a new code is needed. |
| Declining consent while offline | The logout failure is ignored. Local data clears and the person goes home. The account is purged later. |
| `/meta` unavailable | Legal pages explain, and don't show a blank. The backup line says "within our backup retention period". |

## Tests that cover it

- [apps/api/test/data.test.ts](../../apps/api/test/data.test.ts) (consent gate)
- [apps/api/test/erasure.test.ts](../../apps/api/test/erasure.test.ts)
- [apps/api/test/purge.test.ts](../../apps/api/test/purge.test.ts)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (erasure honesty, neutral filename)
- [apps/web/src/shell/guards.test.tsx](../../apps/web/src/shell/guards.test.tsx)
- [apps/web/e2e/live/auth.spec.ts](../../apps/web/e2e/live/auth.spec.ts)
- [apps/web/e2e/live/settings.spec.ts](../../apps/web/e2e/live/settings.spec.ts)

## Known limits

These are limits to know about, and none is fixed yet.

- **Saved data can't be read in the app until they accept.** Someone who won't accept a new notice can download or delete it, but can't browse it. The screens say so.
- **An account with out-of-date consent is kept indefinitely** if the person never returns. See [retention](../PRIVACY-COMPLIANCE.md#retention-and-rule-83).
- **"Everything we hold".** Settings describes the export this way. It leaves out `audit_log` rows and short-lived `otp_codes` and `otp_failures` rows.
- Withdrawing consent means deleting the account. There is no withdrawal that keeps the account.
- Nomination, which the Privacy notice mentions, has no UI. It is by contacting the operator.
- The Privacy and Terms text is a draft pending legal review.
