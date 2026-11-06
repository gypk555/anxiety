# Auth and sessions

## Purpose

Let a person prove they control an email address, and keep them signed in safely, without the app ever holding a password. Why codes: [decision 001](../decisions/001-email-codes-instead-of-passwords.md). Why these limits: [decision 010](../decisions/010-eight-digit-codes-and-quotas.md).

## User-facing behaviour

- `/sign-in`: enter an email. The same screen serves new and returning people. A note says the email won't mention anxiety or health.
- `/sign-in/code`: enter the 8-digit code. It submits by itself on the eighth digit, and paste works, including "1234 5678" or a whole sentence. "Send a new code" unlocks after 45 seconds. "Use a different email" goes back.
- New accounts, and anyone behind on the consent version, go to `/consent` next. Others go on to where they were headed.
- Every sign-in after the first emails the owner: the device label, and how to sign out everywhere.
- Settings lists signed-in devices. A person can sign out one device, this device, or all devices.
- If a session ends while someone is working, they land on `/sign-in` with a note. Their unsaved work comes back if the same person signs in.

## How it works

**Requesting a code.** `POST /auth/otp/request` answers 202 at once. All address-dependent work runs after the response, through [`Background`](background-jobs.md). `deliverOtp` then calls `issueOtp`, which in one transaction holds an advisory lock on the address, checks quotas, retires any live code for the same purpose and target, and stores an HMAC of the new code. Then it mails it.

**Limits.**

| Limit | Value | Enforced in |
| --- | --- | --- |
| Code length | 8 digits from `randomInt` | `generateOtp` |
| Lifetime | 10 minutes | `otp_codes.expires_at` |
| Tries per code | 5 | `attempts`, with a `CHECK` |
| Sends, per purpose | 5 an hour per address and client, 20 an hour per address | Postgres |
| Failed guesses, per purpose | 50 in a rolling 24 hours, per address | Postgres, `otp_failures` |
| Route limits | See [API](../API.md#endpoints) | Process memory |

Quotas count the canonical address (lower case, no `+tag`, Gmail without dots), so variants of one inbox share a budget. Delivery goes to the address as typed, and identity uses the normalised address, because elsewhere those can be different mailboxes.

**Verifying.** `consumeOtps` holds the same lock, refuses without evaluating if the failed-guess cap is reached, adds an attempt, then compares HMACs in constant time. The HMAC covers purpose, email hash, subject user, binding and code, so a code for one purpose cannot be used for another. A wrong guess at a live code adds a row to `otp_failures`. A guess with no live code adds nothing, so spending an address's cap takes ten mails that its owner would see.

**Creating the account.** `findOrCreateUser` tries an insert with `ON CONFLICT (email_hash) DO NOTHING`. A first-login race is settled by the unique index: the loser reads the winner's row.

**Sessions.** `createSession` makes a 256-bit token and stores only its SHA-256, plus a sealed device label such as "Safari on iPhone". The cookie is `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, with a 90-day `Max-Age`. `lookupSession` checks the token format, the absolute limit (90 days, never extended) and the idle limit (30 days, sliding). It updates `last_seen_at` at most every 5 minutes. No response needs to re-set the cookie.

**Email change.** `POST /me/email/request` mails a code to each address. The current-address code is bound to the requested new address through the HMAC. `POST /me/email/verify` checks both as one decision: both right consumes both, and anything else consumes neither and doesn't say which was wrong. Success moves the blind index, re-seals the address, ends other sessions and notifies the old address.

**On the client.** [`handleApiError`](../../apps/web/src/lib/queries.ts) treats a 401 on any request as a lost session. A wrong code is a 400, so it never triggers this. `sessionEnded` moves work into memory (`holdWork`), clears the cache, and redirects once with `next`. `settleHeld` gives it back only to the same user id.

## Key files

- [apps/api/src/otp.ts](../../apps/api/src/otp.ts)
- [apps/api/src/auth.ts](../../apps/api/src/auth.ts)
- [apps/api/src/routes/auth.ts](../../apps/api/src/routes/auth.ts)
- [apps/api/src/routes/me.ts](../../apps/api/src/routes/me.ts) (email change)
- [apps/api/src/users.ts](../../apps/api/src/users.ts)
- [apps/api/src/device.ts](../../apps/api/src/device.ts)
- [apps/web/src/routes/SignIn.tsx](../../apps/web/src/routes/SignIn.tsx)
- [apps/web/src/ui/OtpInput.tsx](../../apps/web/src/ui/OtpInput.tsx)
- [apps/web/src/lib/queries.ts](../../apps/web/src/lib/queries.ts)
- [apps/web/src/lib/held.ts](../../apps/web/src/lib/held.ts)

## Data and API used

Tables: `users`, `sessions`, `otp_codes`, `otp_failures`, `audit_log` (`login`, `logout`, `logout_all`, `session_revoke`, `email_change`).

Endpoints: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `GET /me`, `POST /me/email/request`, `POST /me/email/verify`.

Env: `EMAIL_INDEX_KEY`, `OTP_PEPPER`, `AUDIT_KEY`, `CLIENT_IP_HEADER`, `TRUST_PROXY_HOPS`.

## Security/privacy notes

- The request path never touches an account, so neither the response nor its timing reveals one exists. Accounts are created only at the first correct code.
- Codes are stored only as HMACs under a key the database never sees. A database dump gives neither codes nor session tokens.
- The client address is kept only inside `source_hash`, a keyed hash. The User-Agent is reduced to a label from a fixed vocabulary and is not stored.
- Attacker with a borrowed phone: a live session alone cannot move an account to a new address.
- CSRF rules apply to sign-in too.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Over a send quota | 202, nothing sent, and the person isn't told. The screen says to try again later. |
| Mail provider fails | 202 already sent. Logged with no details. No retry. |
| Wrong, expired, reused or superseded code | 400 `invalid_code`, all the same. The boxes clear. |
| New code requested | The earlier code stops working. |
| Over the failed-guess cap | Even the right code gets `invalid_code`, until old failures leave the 24-hour window. |
| Two tabs racing a first login | Both succeed against one account. |
| A signed-in person opens `/sign-in` | Redirected on. |
| `/sign-in/code` with no email in state, such as after a reload | Back to `/sign-in`. |
| `next` points off-site or into sign-in | `safeNext` ignores it. |

## Tests that cover it

- [apps/api/test/otp.test.ts](../../apps/api/test/otp.test.ts)
- [apps/api/test/sessions.test.ts](../../apps/api/test/sessions.test.ts)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (email change, quotas, sign-in notice)
- [apps/web/src/shell/guards.test.tsx](../../apps/web/src/shell/guards.test.tsx)
- [apps/web/src/ui/OtpInput.test.tsx](../../apps/web/src/ui/OtpInput.test.tsx)
- [apps/web/src/lib/held.test.ts](../../apps/web/src/lib/held.test.ts)
- [apps/web/e2e/live/auth.spec.ts](../../apps/web/e2e/live/auth.spec.ts)
- [apps/web/e2e/live/settings.spec.ts](../../apps/web/e2e/live/settings.spec.ts)
- [apps/web/e2e/https/https.spec.ts](../../apps/web/e2e/https/https.spec.ts)

## Known limits

- Anyone can spend an address's 20 sign-in codes an hour, or (with ten mails the owner sees) its 50 failed guesses for a day, delaying that person's sign-in. Active sessions and email-change and deletion codes are unaffected. Accepted.
- Whoever controls the inbox controls the account. There is no second factor.
- Phone sign-in is deferred, because India's DLT SMS registration is a business process.
- A returning device also gets the sign-in notice, because nothing identifying a device is stored.
- Route limits are per process. See [API foundation](api-foundation.md#rate-limits).
- The session cookie has never crossed a real Render edge.
