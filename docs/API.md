# API reference

Taken from the route source in [apps/api/src/routes/](../apps/api/src/routes/) and [apps/api/src/app.ts](../apps/api/src/app.ts). Responses shown were checked against a running local server.

Base path: `/api/v1`, except `/healthz` and `/readyz`. There is one origin and no CORS, so browsers on other sites cannot read responses.

## Conventions

**Session.** A cookie named `__Host-session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age` 90 days). With `NODE_ENV=development` the name is `session` and it is not `Secure`.

**CSRF.** Every request that is not GET or HEAD needs both of these, on every route including sign-in:

- `Origin` exactly equal to `PUBLIC_ORIGIN`, or a `DEV_ORIGINS` entry
- `x-anxiocare-csrf: 1`

Otherwise: 403 `csrf_failed`. This check runs before routing, so a POST to an unknown path also gets it.

**Bodies.** `application/json` only, at most 64 KB. Schemas are strict, so an unknown key is a 400. POST routes marked "no body" accept nothing, or an empty JSON body.

**Caching and compression.** Every API response has `cache-control: no-store, no-transform`. API responses hold personal data, so they are never compressed here, and the edge is asked not to, because a compressed length can leak content (BREACH). Only static files are compressed. See [apps/api/README.md](../apps/api/README.md).

**Errors.** RFC 9457, `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "The request is not valid",
  "status": 400,
  "code": "validation_failed",
  "requestId": "c41a8ec7-76ee-47cc-ab97-3cbd99cd6bb5",
  "fieldErrors": { "takenAt": ["must not be in the future"] }
}
```

`fieldErrors` appears only on validation errors. Unknown keys are reported under `_` and are never echoed. `detail` appears only on the cap 409s and is written for the person using the app. Switch on `code`, not on `title`.

| Code | Status | When |
| --- | --- | --- |
| `validation_failed` | 400, and other 4xx | Bad body or query, bad JSON, or a tampered cursor. Also 413 for too large and 415 for a wrong content type, with no `fieldErrors`. |
| `invalid_code` | 400 | A wrong, expired, used, superseded or over-limit code. All look the same. |
| `invalid_credentials` | 400 | Unknown address, no password set, wrong password or over a failure cap. All look the same. A 400, because the web client treats any 401 as a lost session. |
| `unauthenticated` | 401 | No session, or an expired one. |
| `csrf_failed` | 403 | See above. |
| `consent_required` | 403 | Signed in, but has not accepted the current consent version. |
| `reauth_required` | 403 | Connecting or disconnecting Google needs this session to have proved a password or an email code in the last 10 minutes. Use `POST /me/reauth/password` or the `/me/reauth/code` pair, then retry. |
| `not_found` | 404 | No such thing, a malformed id, or another person's row. All look the same. |
| `conflict` | 409 | Email taken (after both correct codes), or a storage cap reached. |
| `rate_limited` | 429 | See below. Has a `retry-after` header. |
| `internal_error` | 500 | Anything unexpected. Contains no internals. |
| `forbidden` | | Listed in `ERROR_CODES` and handled by the web client. The API has no route that sends it. |

Check order for a guarded route: CSRF, rate limit, body parse, session, consent, then body validation. So a malformed JSON body gets 400 even with no session, while a well-formed but invalid body gets 401 first.

**Rate limits.** Per client address (an IPv4 address, or an IPv6 /64), in each process's memory, reset on restart. Responses carry `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`. A route's own limit replaces the global one for that route.

**Per account.** On top of the per-address limits, every route that needs a session allows **60 requests a minute per signed-in account**, shared by all its devices (`USER_RATE_LIMIT_PER_MINUTE`, 10-6000). It's counted after the session check, in each process's memory, in a fixed one-minute window. Over it, the answer is `429 rate_limited` with a `Retry-After` header in seconds. It's keyed by account rather than address because mobile carriers in India put many phones behind one IP. Routes without a session (sign-in, register, codes, Google, `/meta`) only have the per-address limits. Tested in `apps/api/test/user-rate-limit.test.ts`.

| Bucket | Limit |
| --- | --- |
| `/api` routes with no limit of their own, and unknown `/api` paths | 600 a minute |
| Everything else: static files, SPA navigations, `/readyz` | 6,000 a minute, counted apart from the API |
| `/healthz` | None |

**Pagination.** `?limit=` 1 to 100, default 50, and `?cursor=` from the previous page. Other query keys are a 400. Response: `{ "items": [...], "nextCursor": "..." | null }`, newest first. Treat cursors as opaque.

## Shared contract versus not

In [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts): all request bodies (`otpRequestBody`, `otpVerifyBody`, `registerRequestBody`, `registerVerifyBody`, `loginBody`, `passwordForgotBody`, `passwordResetBody`, `passwordChangeBody`, `passwordSetBody`, `consentBody`, `emailChangeRequestBody`, `emailChangeVerifyBody`, `accountDeleteConfirmBody`, `profilePatchBody`, `assessmentCreateBody`, `journalBody`), the `pageQuery`, the responses `meResponse`, `signInMethodsResponse`, `sessionResponse`, `assessmentResponse`, `journalResponse`, `metaResponse`, `problemResponse`, the `pageOf` wrapper, and `ERROR_CODES`, `CONSENT_VERSION`, `CSRF_HEADER`, `CSRF_HEADER_VALUE`, `OTP_LENGTH`.

Only in the API, with no shared schema:

- Status codes and rate limits
- The `{ items }` wrapper on `GET /auth/sessions`
- The whole shape of `GET /me/export`
- `/healthz` and `/readyz`
- The "no body" rule (`emptyBody` in [validate.ts](../apps/api/src/validate.ts)) and the cursor format
- The `takenAt` window, and the 1,000 and 2,000 row caps

## Endpoints

| Method and path | Session | Consent | Limit | Success |
| --- | --- | --- | --- | --- |
| `POST /auth/otp/request` | No | No | 20 / 10 min | 202 |
| `POST /auth/otp/verify` | No | No | 30 / 10 min | 200 `Me` |
| `POST /auth/register/request` | No | No | 20 / 10 min | 202 |
| `POST /auth/register/verify` | No | No | 30 / 10 min | 200 `Me` |
| `POST /auth/login` | No | No | 60 / 10 min | 200 `Me` |
| `POST /auth/password/forgot` | No | No | 20 / 10 min | 202 |
| `POST /auth/password/reset` | No | No | 30 / 10 min | 200 `Me` |
| `GET /auth/google/start` | No | No | 30 / 10 min | 302 |
| `GET /auth/google/callback` | No | No | 30 / 10 min | 302 |
| `POST /auth/logout` | Optional | No | Global | 204 |
| `POST /auth/logout-all` | Yes | No | Global | 204 |
| `GET /auth/sessions` | Yes | No | Global | 200 |
| `DELETE /auth/sessions/:id` | Yes | No | Global | 204 |
| `GET /me` | Yes | No | Global | 200 `Me` |
| `PATCH /me` | Yes | **Yes** | Global | 200 `Me` |
| `POST /me/consent` | Yes | No | Global | 200 `Me` |
| `POST /me/email/request` | Yes | **Yes** | 10 / hour | 202 |
| `POST /me/email/verify` | Yes | **Yes** | 20 / 10 min | 200 `Me` |
| `POST /me/password` | Yes | No | 20 / 10 min | 204 |
| `POST /me/password/set/request` | Yes | No | 10 / hour | 202 |
| `POST /me/password/set` | Yes | No | 20 / 10 min | 204 |
| `GET /me/sign-in-methods` | Yes | No | Global | 200 |
| `POST /me/reauth/password` | Yes | No | 20 / 10 min | 204 |
| `POST /me/reauth/code/request` | Yes | No | 10 / hour | 202 |
| `POST /me/reauth/code` | Yes | No | 20 / 10 min | 204 |
| `POST /me/identities/google/connect` | Yes | No | 20 / 10 min | 200 `{ url }` |
| `DELETE /me/identities/google` | Yes | No | Global | 204 |
| `GET /me/export` | Yes | No | 10 / hour | 200 file |
| `POST /me/delete/request` | Yes | No | 10 / hour | 202 |
| `POST /me/delete/confirm` | Yes | No | 20 / 10 min | 204 |
| `GET /assessments` | Yes | **Yes** | Global | 200 page |
| `POST /assessments` | Yes | **Yes** | 60 / min | 201 or 200 |
| `GET /assessments/:id` | Yes | **Yes** | Global | 200 |
| `DELETE /assessments/:id` | Yes | **Yes** | Global | 204 |
| `GET /journal` | Yes | **Yes** | Global | 200 page |
| `POST /journal` | Yes | **Yes** | 60 / min | 201 |
| `GET /journal/:id` | Yes | **Yes** | Global | 200 |
| `PATCH /journal/:id` | Yes | **Yes** | 60 / min | 200 |
| `DELETE /journal/:id` | Yes | **Yes** | Global | 204 |
| `GET /moods?from=&to=` | Yes | **Yes** | Global | 200 `{ items }` |
| `PUT /moods/:day` | Yes | **Yes** | 60 / min | 200 |
| `DELETE /moods/:day` | Yes | **Yes** | Global | 204 |
| `GET /safety-plan` | Yes | **Yes** | Global | 200 or 404 |
| `PUT /safety-plan` | Yes | **Yes** | 60 / min | 200 |
| `DELETE /safety-plan` | Yes | **Yes** | Global | 204 |
| `GET /meta` | No | No | Global | 200 |
| `GET /healthz` | No | No | None | 200 |
| `GET /readyz` | No | No | Web bucket | 200 or 503 |

"Consent: no" on the rights routes is deliberate, so nobody is locked out of their own data. All statuses below are in addition to the common 403 `csrf_failed`, 429 and 500.

### Sign-in

#### `POST /auth/otp/request`

Body: `{ "email": string }`, trimmed and lowercased, at most 254 characters.

202 with an empty body, whether or not an account exists, and whether or not a code was sent. If a quota says no, nothing is sent and the response is the same. Quotas per purpose: 5 an hour per address and client, 20 an hour per address.

Errors: 400 `validation_failed` for a malformed address.

#### `POST /auth/otp/verify`

Body: `{ "email": string, "code": "123456" }`. Exactly 6 digits.

200 `Me`, plus `Set-Cookie` for the session and the device cookie. Creates the account on first success. Consent is not needed here: `consentRequired: true` in the response tells the client to go to the consent screen. A later sign-in mails the owner a notice.

Errors: 400 `invalid_code`, 400 `validation_failed`.

**Device cookie.** Every successful sign-in, by any route, also sets `__Host-device` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, 365 days): a random token, stored only as an HMAC, bound to the account. A request carrying a valid one for the account it names spends that device's own failure budgets (10 wrong passwords an hour, 20 wrong codes a day) instead of the address's, and gets a hashing slot kept for known devices. It never signs anyone in. A reset revokes all of an account's devices; deleting the account clears it. Without it, failures count per address and client (/64) and per address: passwords 10 and 100 a day, codes 5 and 20 a day. Over a cap the answer is the usual one.

**Passwords.** 10 to 128 characters as a person counts them, not trimmed, with no composition rules. Refused if common, or holding the address's local part. Refusals are 400 `validation_failed` with words for people in `fieldErrors.password`, and never repeat the password. A refused password is checked before the code, so it doesn't spend the code. 429 `rate_limited` means password hashing is at capacity, and nothing was spent.

#### `POST /auth/register/request`

Body: `{ "email": string }`. 202 with an empty body, always. A new address gets a code, purpose `register`. An address with an account gets a neutral notice with no code, under the same send quota. Nothing is stored about the account. Errors: 400 `validation_failed` for a malformed address.

#### `POST /auth/register/verify`

Body: `{ "email", "code", "password", "displayName"? }`. 200 `Me`, plus `Set-Cookie`, with `consentRequired: true`. This is what creates the account. If the address has an account by now, 400 `invalid_code`, and nothing about it changes. Errors: 400 `invalid_code`, 400 `validation_failed`, 429.

#### `POST /auth/login`

Body: `{ "email", "password" }`. The password is checked for shape only, so a rule added later can't lock out an older password. 200 `Me`, plus `Set-Cookie`, and a new-sign-in notice after the response. Errors: 400 `invalid_credentials`, in the same form for an unknown address, an account with no password, a wrong password, and an address or device over a failure cap, where nothing is evaluated. 429 at hashing capacity, after 10 attempts a minute from one client (/64), when the instance-wide bucket for unknown devices is empty, or over the route limit. These are checked before anything is counted or hashed.

#### `POST /auth/password/forgot`

Body: `{ "email" }`. 202 with an empty body, always. A code, purpose `password_reset`, goes only to an existing account.

#### `POST /auth/password/reset`

Body: `{ "email", "code", "password" }`. 200 `Me`, plus `Set-Cookie`. In one transaction with the user row locked: sets the hash, **revokes every session**, **removes every linked Google identity**, revokes every device cookie, clears the address's password failures, and starts one new session and device. Mails a notice, and a second one saying Google was disconnected if it was. Errors: 400 `invalid_code`, 400 `validation_failed`, 429.

#### `GET /auth/google/start?next=`

A plain navigation, not a fetch. For signing in only; connecting is `POST /me/identities/google/connect`. 302 to Google, with state, nonce and PKCE S256, and scopes `openid email`. Sets `__Host-google-oauth` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 10 minutes, encrypted). `next` must be a same-origin path, and otherwise becomes `/`. With Google off, 302 to `/sign-in?error=google`.

#### `GET /auth/google/callback`

From Google. Checks state, single use and the cookie, exchanges the code server to server, then checks the signature, `iss`, `aud`, `azp`, `exp`, `iat`, `nonce` and `email_verified=true`. Then, by the mode sealed in the state cookie:

- **Sign-in.** Finds the account by Google subject only, and **never links by address**. An address that already has an account goes to `/sign-in?error=google_link` (sign in another way, then connect Google in Settings). With no account, it creates one only for a `gmail.com` or `googlemail.com` address, or a token with an `hd` claim; otherwise `/sign-in?error=google_new`. Success: 302 to `next`, or `/consent?next=` if consent is outstanding, with `Set-Cookie` for the session and device cookie. The session does not count as a re-authentication.
- **Connect.** Links the Google login to the account that started it, only if that session still exists. 302 to `/settings?google=connected`, or `taken` if the Google login belongs to another account or this account has a different one, or `failed` for anything else. Mails a notice and audits on a new link.

Any other failure: 302 to `/sign-in?error=google`, plus `next` if it was valid (or `/settings?google=failed` for a connect), with no detail in the URL.

#### `POST /auth/logout`

No body. Reachable with an expired session or none. 204, ends this session if there is one, always clears the cookie. Errors: 400 `validation_failed` if a body was sent.

#### `POST /auth/logout-all`

No body. 204, ends every session of this user, clears the cookie. Errors: 400, 401.

#### `GET /auth/sessions`

200 `{ "items": SessionInfo[] }`, not paginated. Live sessions only, most recently used first.

```json
{ "items": [{ "id": "uuid", "deviceLabel": "Safari on iPhone", "createdAt": "ISO", "lastSeenAt": "ISO", "current": true }] }
```

Errors: 401.

#### `DELETE /auth/sessions/:id`

204. Clears the cookie if it was the current session. Errors: 401, 404 (including another user's session).

### Account

`Me`:

```json
{ "id": "uuid", "email": "a@example.com", "displayName": null, "createdAt": "ISO", "consentRequired": false, "consentVersion": "2026-11-07", "acceptedConsentVersion": "2026-11-06" }
```

`consentVersion` is the current version the server requires. `acceptedConsentVersion` is the one the person last accepted, or null if they never have, so the client can tell first-time consent from a re-prompt.

#### `GET /me`

200 `Me`. Errors: 401. Signed-out visitors get this 401 on most page loads. This is normal.

#### `PATCH /me`

Body: `{ "displayName": string | null }`, trimmed, at most 60 characters. An empty string or null clears it. 200 `Me`. Errors: 400, 401, 403 `consent_required`.

#### `POST /me/consent`

Body:

```json
{ "version": "2026-11-06", "adultConfirmed": true, "healthDataConsent": true }
```

`version` must equal the current `CONSENT_VERSION`, and both booleans must be `true`. 200 `Me`. Errors: 400, 401.

#### `POST /me/email/request`

Body: `{ "newEmail": string }`. 202 with an empty body, whether or not the address is taken. Mails one code to the current address and one to the new address. Errors: 400, 401, 403 `consent_required`.

#### `POST /me/email/verify`

Body: `{ "newEmail": string, "currentCode": "123456", "code": "123456" }`. `currentCode` came to the current inbox, `code` to the new one.

The two codes are one decision: both right consumes both, anything else consumes neither, and each try costs both an attempt. 200 `Me`. Other sessions are ended, and the old address gets a notice.

Errors: 400 `invalid_code`, 400 `validation_failed`, 401, 403 `consent_required`, 409 `conflict` if the address is taken, only after both correct codes.

#### `POST /me/password`

Body: `{ "currentPassword", "password" }`. 204. In one transaction with the user row locked, checks this session still exists and the stored hash is unchanged, then keeps this session, ends the others, mails a notice and audits. Errors: 400 `invalid_credentials` for a wrong current password, which counts against the same caps as sign-in, 400 `validation_failed`, 401 (also when a reset or another change got there first: nothing changed), 429.

#### `POST /me/password/set/request`

No body. For an account with no password. 202, and a code, purpose `password_set`, goes to the address on the account. Errors: 401, 409 `conflict` if it has a password.

#### `POST /me/password/set`

Body: `{ "code", "password" }`. 204. The same transaction and checks as a change. Keeps this session, ends the others, mails a notice and audits. Errors: 400 `invalid_code`, 400 `validation_failed`, 401 (also when the session ended or a password appeared meanwhile), 409 `conflict` if it has a password.

#### `GET /me/sign-in-methods`

200 `{ "password": boolean, "google": boolean }`. Errors: 401.

#### `POST /me/reauth/password`

Body: `{ "password" }`. 204, and this session counts as re-authenticated for 10 minutes. Under the same failure caps as sign-in. Errors: 400 `invalid_credentials` (also for an account with no password), 400 `validation_failed`, 401, 429.

#### `POST /me/reauth/code/request`

No body. 202, and a code, purpose `reauth`, goes to the address on the account. Errors: 400, 401.

#### `POST /me/reauth/code`

Body: `{ "code": "123456" }`. 204, re-authenticated for 10 minutes. Its own failed-guess budget. Errors: 400 `invalid_code`, 400 `validation_failed`, 401.

#### `POST /me/identities/google/connect`

No body. Needs a recent re-authentication. 200 `{ "url": string }`, and sets `__Host-google-oauth` sealing this account and session. The client then navigates to `url`; Google returns to the callback above. Errors: 400, 401, 403 `reauth_required`, 404 when Google is off.

#### `DELETE /me/identities/google`

Needs a recent re-authentication, not a password: email codes always remain. 204, a notice and an audit row. Errors: 401, 403 `reauth_required`, 404 if none is connected.

#### `GET /me/export`

200 with `content-disposition: attachment; filename="account-data-YYYY-MM-DD.json"`. The filename does not name the service. Audited. Errors: 401.

```json
{
  "exportedAt": "ISO",
  "account": { "id": "uuid", "email": "...", "displayName": null, "createdAt": "ISO" },
  "signInMethods": { "password": true, "google": false },
  "consents": [{ "version": "...", "adultConfirmed": true, "healthDataConsent": true, "acceptedAt": "ISO" }],
  "assessments": ["Assessment, newest first"],
  "journal": ["JournalEntry, newest first"],
  "moods": ["MoodEntry, oldest day first"],
  "safetyPlan": "SafetyPlan with updatedAt, or null",
  "sessions": [{ "id": "uuid", "deviceLabel": "...", "createdAt": "ISO", "lastSeenAt": "ISO", "expiresAt": "ISO" }]
}
```

Not in the export: `otp_codes`, `otp_failures`, `login_failures`, `device_tokens`, `oauth_state_uses` and `audit_log` rows, the password hash, and Google's subject value.

#### `POST /me/delete/request`

No body. 202 with an empty body. Mails a confirmation code. Errors: 400, 401.

#### `POST /me/delete/confirm`

Body: `{ "code": "123456" }`. 204, session and device cookies cleared, account gone at once. Errors: 400 `invalid_code`, 400 `validation_failed`, 401.

### Assessments

`Assessment`:

```json
{ "id": "uuid", "takenAt": "ISO", "answers": [3, 3, 3, 3, 3, 0, 0], "difficulty": 1, "score": 15, "severity": "severe" }
```

`severity` is one of `minimal`, `mild`, `moderate`, `severe`.

#### `GET /assessments`

Query: `limit`, `cursor`. 200 page of `Assessment`, ordered by `takenAt`. Errors: 400, 401, 403 `consent_required`.

#### `POST /assessments`

Body:

```json
{
  "clientRequestId": "uuid",
  "answers": [0, 1, 2, 3, 0, 1, 2],
  "difficulty": 1,
  "takenAt": "2026-11-06T10:00:00.000Z"
}
```

- `answers`: exactly 7 integers, 0 to 3.
- `difficulty`: 0 to 3 or null. Required when any answer is above 0.
- `takenAt`: optional. It may be up to 24 hours old. Up to 60 seconds ahead is treated as now. Later than that is rejected.
- A `score` or `severity` key is rejected. The server computes them.

201 with the new row. 200 with the original row if this user has already used this `clientRequestId`. A replay answers before the age check, so a late retry still works.

Errors: 400, 401, 403 `consent_required`, 409 `conflict` at 1,000 saved rows.

#### `GET /assessments/:id`

200 `Assessment`. Errors: 401, 403 `consent_required`, 404.

#### `DELETE /assessments/:id`

204. Errors: 401, 403 `consent_required`, 404.

### Journal

Request body for POST and PATCH. PATCH replaces the whole entry, so it needs every field.

```json
{
  "situation": "1 to 2000 characters",
  "thought": "1 to 2000 characters",
  "feelings": ["up to 10, each 1 to 40 characters"],
  "intensityBefore": 5,
  "evidenceFor": "up to 2000, may be empty",
  "evidenceAgainst": "up to 2000, may be empty",
  "balancedThought": "up to 2000, may be empty",
  "intensityAfter": null
}
```

Strings are trimmed. Intensities are integers from 0 to 10. `intensityAfter` may be null. `JournalEntry` is this plus `id`, `createdAt` and `updatedAt`.

#### `GET /journal`

Query: `limit`, `cursor`. 200 page of `JournalEntry`, ordered by `createdAt`. Errors: 400, 401, 403 `consent_required`.

#### `POST /journal`

201 `JournalEntry`. Not idempotent. Errors: 400, 401, 403 `consent_required`, 409 `conflict` at 2,000 entries.

#### `GET /journal/:id`

200. Errors: 401, 403 `consent_required`, 404.

#### `PATCH /journal/:id`

200. Errors: 400, 401, 403 `consent_required`, 404.

#### `DELETE /journal/:id`

204. Errors: 401, 403 `consent_required`, 404.

### Daily mood log

One entry per calendar day, where the day is the person's own local date as `YYYY-MM-DD`, sent by the phone. Schemas: `moodBody`, `moodResponse`, `moodRangeQuery` in [packages/shared/src/tracking.ts](../packages/shared/src/tracking.ts).

```json
{ "rating": 3, "note": "up to 280 characters, may be empty" }
```

`rating` is an integer from 1 (Very low) to 5 (Very good). `note` is trimmed and required, even if empty. Unknown keys are refused. `MoodEntry` is this plus `day`, `createdAt` and `updatedAt`.

The server doesn't know the person's time zone, so it accepts any day from 366 days before today in UTC-12 up to today in UTC+14 (`moodDayAllowedOnServer`). The app applies the exact rule, no future day and nothing more than 366 days back, in the phone's own zone.

#### `GET /moods?from=YYYY-MM-DD&to=YYYY-MM-DD`

Both required. `to` on or after `from`, at most 400 days apart. 200 `{ "items": MoodEntry[] }`, ordered by day, oldest first, not paginated: a range holds at most 401 rows. Errors: 400, 401, 403 `consent_required`.

#### `PUT /moods/:day`

Idempotent upsert: logging again on the same day replaces the rating and note, keeps `createdAt` and moves `updatedAt`. 200 `MoodEntry`, for a new day and an update alike. Errors: 400 `validation_failed` for a day that isn't a real date, is in the future or is too old (`fieldErrors.day`), or for a bad body; 401; 403 `consent_required`.

#### `DELETE /moods/:day`

204. Errors: 400 for a day that isn't a real date, 401, 403 `consent_required`, 404 when there is no entry for that day.

### Safety plan

One plan per account, after the Stanley-Brown safety plan. PUT always sends the whole plan, and every section may be an empty list. Schemas: `safetyPlanBody`, `safetyPlanResponse`.

```json
{
  "warningSigns": ["up to 10, each 1 to 200 characters"],
  "copingStrategies": [],
  "distractions": [],
  "helpContacts": [{ "name": "1 to 80 characters", "phone": "up to 20 of 0-9 space + ( ) -, with a digit, or empty" }],
  "professionals": [{ "name": "Dr Rao", "phone": "080 2345 6789" }],
  "saferSurroundings": [],
  "reasonsToLive": []
}
```

Strings are trimmed. At most 10 contacts in each contact list. Helplines and 112 are not stored: the app shows them from `HELPLINES`. The response is the plan plus `updatedAt`. Other people's names and numbers are sealed with the rest of the plan, and never logged.

#### `GET /safety-plan`

200 plan. Errors: 401, 403 `consent_required`, 404 when none has been saved.

#### `PUT /safety-plan`

Upsert of the whole plan. 200 plan. Errors: 400, 401, 403 `consent_required`.

#### `DELETE /safety-plan`

204. Errors: 401, 403 `consent_required`, 404 when there is none.

### Public

#### `GET /meta`

200. The Privacy and Terms pages show these values. The API sends them from config.

```json
{
  "operatorName": "...",
  "grievanceEmail": "...",
  "consentVersion": "2026-11-07",
  "backupRetentionDays": 7,
  "dataLocation": "Mumbai, India",
  "serverLocation": "Singapore",
  "mailProvider": "our email provider",
  "googleEnabled": false
}
```

#### `GET /healthz`

Liveness: `{ "status": "ok" }`. Touches nothing and has no rate limit. Render's health check uses it.

#### `GET /readyz`

Readiness: runs `SELECT 1`. 200 `{ "status": "ok" }`, or 503 `{ "status": "unavailable" }`. The 503 is not a problem document and has no details.

## Static files

Not part of the API, but on the same origin. See [API foundation](modules/api-foundation.md#static-files).
