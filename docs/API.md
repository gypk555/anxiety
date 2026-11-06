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
| `unauthenticated` | 401 | No session, or an expired one. |
| `csrf_failed` | 403 | See above. |
| `consent_required` | 403 | Signed in, but has not accepted the current consent version. |
| `not_found` | 404 | No such thing, a malformed id, or another person's row. All look the same. |
| `conflict` | 409 | Email taken (after both correct codes), or a storage cap reached. |
| `rate_limited` | 429 | See below. Has a `retry-after` header. |
| `internal_error` | 500 | Anything unexpected. Contains no internals. |
| `forbidden` | | Listed in `ERROR_CODES` and handled by the web client. The API has no route that sends it. |

Check order for a guarded route: CSRF, rate limit, body parse, session, consent, then body validation. So a malformed JSON body gets 400 even with no session, while a well-formed but invalid body gets 401 first.

**Rate limits.** Per client address (an IPv4 address, or an IPv6 /64), in each process's memory, reset on restart. Responses carry `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`. A route's own limit replaces the global one for that route.

| Bucket | Limit |
| --- | --- |
| `/api` routes with no limit of their own, and unknown `/api` paths | 600 a minute |
| Everything else: static files, SPA navigations, `/readyz` | 6,000 a minute, counted apart from the API |
| `/healthz` | None |

**Pagination.** `?limit=` 1 to 100, default 50, and `?cursor=` from the previous page. Other query keys are a 400. Response: `{ "items": [...], "nextCursor": "..." | null }`, newest first. Treat cursors as opaque.

## Shared contract versus not

In [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts): all request bodies (`otpRequestBody`, `otpVerifyBody`, `consentBody`, `emailChangeRequestBody`, `emailChangeVerifyBody`, `accountDeleteConfirmBody`, `profilePatchBody`, `assessmentCreateBody`, `journalBody`), the `pageQuery`, the responses `meResponse`, `sessionResponse`, `assessmentResponse`, `journalResponse`, `metaResponse`, `problemResponse`, the `pageOf` wrapper, and `ERROR_CODES`, `CONSENT_VERSION`, `CSRF_HEADER`, `CSRF_HEADER_VALUE`, `OTP_LENGTH`.

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
| `POST /auth/logout` | Optional | No | Global | 204 |
| `POST /auth/logout-all` | Yes | No | Global | 204 |
| `GET /auth/sessions` | Yes | No | Global | 200 |
| `DELETE /auth/sessions/:id` | Yes | No | Global | 204 |
| `GET /me` | Yes | No | Global | 200 `Me` |
| `PATCH /me` | Yes | **Yes** | Global | 200 `Me` |
| `POST /me/consent` | Yes | No | Global | 200 `Me` |
| `POST /me/email/request` | Yes | **Yes** | 10 / hour | 202 |
| `POST /me/email/verify` | Yes | **Yes** | 20 / 10 min | 200 `Me` |
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

Body: `{ "email": string, "code": "12345678" }`. Exactly 8 digits.

200 `Me`, plus `Set-Cookie`. Creates the account on first success. Consent is not needed here: `consentRequired: true` in the response tells the client to go to the consent screen. A later sign-in mails the owner a notice.

Errors: 400 `invalid_code`, 400 `validation_failed`.

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
{ "id": "uuid", "email": "a@example.com", "displayName": null, "createdAt": "ISO", "consentRequired": false, "consentVersion": "2026-11-06", "acceptedConsentVersion": "2026-11-06" }
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

Body: `{ "newEmail": string, "currentCode": "12345678", "code": "12345678" }`. `currentCode` came to the current inbox, `code` to the new one.

The two codes are one decision: both right consumes both, anything else consumes neither, and each try costs both an attempt. 200 `Me`. Other sessions are ended, and the old address gets a notice.

Errors: 400 `invalid_code`, 400 `validation_failed`, 401, 403 `consent_required`, 409 `conflict` if the address is taken, only after both correct codes.

#### `GET /me/export`

200 with `content-disposition: attachment; filename="account-data-YYYY-MM-DD.json"`. The filename does not name the service. Audited. Errors: 401.

```json
{
  "exportedAt": "ISO",
  "account": { "id": "uuid", "email": "...", "displayName": null, "createdAt": "ISO" },
  "consents": [{ "version": "...", "adultConfirmed": true, "healthDataConsent": true, "acceptedAt": "ISO" }],
  "assessments": ["Assessment, newest first"],
  "journal": ["JournalEntry, newest first"],
  "sessions": [{ "id": "uuid", "deviceLabel": "...", "createdAt": "ISO", "lastSeenAt": "ISO", "expiresAt": "ISO" }]
}
```

Not in the export: `otp_codes`, `otp_failures` and `audit_log` rows.

#### `POST /me/delete/request`

No body. 202 with an empty body. Mails a confirmation code. Errors: 400, 401.

#### `POST /me/delete/confirm`

Body: `{ "code": "12345678" }`. 204, cookie cleared, account gone at once. Errors: 400 `invalid_code`, 400 `validation_failed`, 401.

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

### Public

#### `GET /meta`

200. The Privacy and Terms pages show these values. The API sends them from config.

```json
{
  "operatorName": "...",
  "grievanceEmail": "...",
  "consentVersion": "2026-11-06",
  "backupRetentionDays": 7,
  "dataLocation": "Mumbai, India",
  "serverLocation": "Singapore",
  "mailProvider": "our email provider"
}
```

#### `GET /healthz`

Liveness: `{ "status": "ok" }`. Touches nothing and has no rate limit. Render's health check uses it.

#### `GET /readyz`

Readiness: runs `SELECT 1`. 200 `{ "status": "ok" }`, or 503 `{ "status": "unavailable" }`. The 503 is not a problem document and has no details.

## Static files

Not part of the API, but on the same origin. See [API foundation](modules/api-foundation.md#static-files).
