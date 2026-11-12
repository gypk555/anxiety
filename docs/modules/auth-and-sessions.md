# Auth and sessions

## Purpose

Let a person prove they control an email address, sign in by password, Google or an emailed code, and stay signed in safely. Why: [decision 012](../decisions/012-passwords-google-and-six-digit-codes.md). Why these limits: [decision 010](../decisions/010-eight-digit-codes-and-quotas.md) and [the odds](../SECURITY-EXCEPTIONS.md#six-digit-codes-the-odds-of-a-guess).

## User-facing behaviour

- `/sign-in`: email and password. **Sign in**, **Forgot your password?**, **Email me a code instead**, **Create an account**, and **Continue with Google** when it's on, with one plain line about what Google learns.
- `/create-account`: **Your name or a nickname** (required, 1 to 60 characters once trimmed, with its error shown under the field), email and password, with a plain-language hint and a show or hide toggle. The address gets a code. Nothing is stored yet. `register/verify` refuses a missing or blank name with 400 `validation_failed`, before the code is spent, echoing nothing back.
- `/create-account/code`: the same screen for every address. The code creates the account. An address with an account gets a mail saying so, with no code, and the screen mentions that this can happen.
- `/forgot-password` and `/forgot-password/reset`: email, then a code and a new password together. Same screen whether or not an account exists. A reset signs out every other device.
- `/sign-in/code`: the emailed code. It submits by itself on the sixth digit, and paste works, including "123 456" or a whole sentence. "Send a new code" unlocks after 45 seconds. "Use a different email" goes back.
- New accounts, and anyone behind on the consent version, go to `/consent` next, by every route. Then an account with no name goes to `/name` ("What should we call you?"): one made with Google (which is never asked for a name), by email code, or before the name was required. Then, once only, the optional `/about-you`. Then on to where they were headed, through `next`. `afterSignIn` and `accountStep` in [lib/next-path.ts](../../apps/web/src/lib/next-path.ts) decide this, and the Google callback does the same on the server (`/consent`, then `/name`, then `/about-you` once).
- The name screen is gated like consent: `RequireAccount` and Home send an account without a name there, but Help, Quick exit, Settings (download, delete, sign out) and the tools never wait on it, and it has **Not now, sign me out** and **Download or delete my data**. About you is never a gate: see [profile](profile.md).
- Every sign-in after the first emails the owner: the device label, and how to sign out everywhere.
- Settings has **Sign-in and security**: the ways in, change or add a password, **Connect Google** and **Disconnect Google** (each after confirming it's you with a password or an email code), and signed-in devices. See [settings](settings.md).
- **Continue with Google** for an address that already has an account, but no Google link, is refused with `/sign-in?error=google_link`: sign in another way, then connect Google in Settings. For a new address that Google doesn't host (not Gmail, not a Workspace account), `/sign-in?error=google_new` suggests creating an account with email.
- If a session ends while someone is working, they land on `/sign-in` with a note. Their unsaved work comes back if the same person signs in. Google isn't offered at that moment, because leaving the page would lose what's held in memory.

## How it works

**Passwords.** [`Passwords`](../../apps/api/src/passwords.ts) wraps `node:crypto`'s Argon2id, with an HMAC under `PASSWORD_PEPPER` first, and an NFKC normalise, so a phone and a laptop agree. Hashes are PHC strings holding their own parameters. A semaphore runs 3 at once: 2 for anyone, 1 kept for requests from a known device, each queue holding 16, then 429. `PASSWORD_ARGON2_MEMORY_KIB` is capped at 65536, so the peak is 192 MiB. Before a sign-in attempt is counted or hashed, `admit` allows one client (IPv6 by /64) 10 a minute, and takes a token from an instance-wide bucket (30, refilling 20 a second) unless the request has a known device. Both are in process memory. Policy, shared with the client: `passwordProblem` in [passwords.ts](../../packages/shared/src/passwords.ts).

**Checking one.** `checkPassword` in [routes/accounts.ts](../../apps/api/src/routes/accounts.ts) reserves a row in `login_failures`. With a valid device cookie for the account, under a per-device lock, it refuses at 10 in the last hour for that device. Otherwise, under a per-address lock, it refuses at 10 in the last day for this address and client, or 100 for the address from anywhere. It runs the hash outside any transaction, and gives the row back only on success or when shed for load. An address with no account, or no password, is hashed against a dummy made at start-up. Everything failing the same way gets `invalid_credentials`, a 400, because the client treats a 401 as a lost session.

**Create account.** `deliverRegistration` issues a code under the usual quota, then mails it, or mails a notice for an address that has an account. The code it issues in that case is never sent. `register/verify` checks the password rules first, so a refused password doesn't spend the code, then holds a hashing slot while it spends the code and hashes, so a code can't be spent with nothing able to hash. `createUserWithPassword` inserts with `ON CONFLICT DO NOTHING`, and a conflict is `invalid_code`: a code from before an account existed can't set its password.

**On the client, the password** is in component state, and in a module variable for the hop from form to code screen, because router state ends up in `history.state`. Its mutations read it from a closure, not `variables`, with `gcTime: 0`, so the mutation cache doesn't keep it.

**Device cookies.** [devices.ts](../../apps/api/src/devices.ts). Every successful sign-in calls `rememberDevice`, which keeps a `__Host-device` cookie already valid for this account, renewing it for 365 days, or issues a new random 256-bit token. Only `HMAC(OTP_PEPPER, token)` is stored in `device_tokens`, bound to the account, newest 20 kept. `knownDevice` resolves the cookie against the address being tried, in one query whether or not the address has an account. A known device spends only its own failure budgets and gets the kept hashing slot. A reset deletes all the account's devices; deleting the account cascades. Being `SameSite=Strict`, the cookie isn't sent on the return from Google, so a Google sign-in issues a new one.

**Re-authentication.** `sessions.reauth_at` records when this session last proved a password or an email code. Signing in by password, code, create account or reset sets it; a Google sign-in doesn't. `POST /me/reauth/password`, under the same caps as sign-in, or `POST /me/reauth/code/request` then `POST /me/reauth/code` (purpose `reauth`, its own guess budget), set it again. `requireRecentReauth` answers 403 `reauth_required` unless it is within 10 minutes, by the database's clock.

**Google.** See [routes/google.ts](../../apps/api/src/routes/google.ts) and [google.ts](../../apps/api/src/google.ts). `start` validates `next` with the shared `safeNext`, and seals state, nonce, verifier, `next` and the mode `signin` into a `SameSite=Lax` cookie. `POST /me/identities/google/connect` needs a recent re-authentication, seals the mode `connect` with the account and session ids, and answers `{ url }` for the browser to go to. `callback` checks state, records it as used in `oauth_state_uses`, exchanges the code, then checks the signature and claims.
- Sign-in mode finds the account by subject only. **It never links by address**: an address with an account goes to `/sign-in?error=google_link`. With no account, it creates one only for `gmail.com`, `googlemail.com`, or a token with `hd`; otherwise `/sign-in?error=google_new`. Then it sets the session and device cookie and redirects. Other failures go to `/sign-in?error=google`, with a reason word in the log, and no detail in the URL.
- Connect mode links to the sealed account only if the sealed session still exists, audits `google_link`, mails a notice, and redirects to `/settings?google=connected`. A subject linked to another account, or an account with a different Google login, gives `taken`; anything else, `failed`.
- `DELETE /me/identities/google` needs a recent re-authentication and no password: email codes always remain.

**Requesting a code.** `POST /auth/otp/request` answers 202 at once. All address-dependent work runs after the response, through [`Background`](background-jobs.md). `deliverOtp` then calls `issueOtp`, which in one transaction holds an advisory lock on the address, checks quotas, retires any live code for the same purpose and target, and stores an HMAC of the new code. Then it mails it.

**Limits.**

| Limit | Value | Enforced in |
| --- | --- | --- |
| Code length | 6 digits from `randomInt` | `generateOtp` |
| Lifetime | 10 minutes | `otp_codes.expires_at` |
| Tries per code | 5 | `attempts`, with a `CHECK` |
| Sends, per purpose | 5 an hour per address and client, 20 an hour per address | Postgres |
| Failed guesses, unknown device | 20 in a rolling 24 hours per address, at most 5 of them per client (/64). `login`, `register` and `password_reset` share one budget, and each signed-in purpose has its own | Postgres, `otp_failures` |
| Failed guesses, known device | 20 in a rolling 24 hours for that device | Postgres, `otp_failures.device_id` |
| Failed passwords, unknown device | 10 in a rolling 24 hours per address and client (/64), 100 per address, whether or not it has an account | Postgres, `login_failures` |
| Failed passwords, known device | 10 an hour for that device | Postgres, `login_failures.device_id` |
| Sign-in attempts before hashing | 10 a minute per client (/64); unknown devices also share a bucket of 30, refilling 20 a second | `Passwords.admit`, process memory |
| Password hashing | 3 at once, one kept for known devices, 16 queued each, then 429 | `Passwords` |
| Route limits | See [API](../API.md#endpoints) | Process memory |

Quotas count the canonical address (lower case, no `+tag`, Gmail without dots), so variants of one inbox share a budget. Delivery goes to the address as typed, and identity uses the normalised address, because elsewhere those can be different mailboxes.

**Verifying.** `consumeOtps` holds the same lock, refuses without evaluating if the failed-guess cap is reached, adds an attempt, then compares HMACs in constant time. The HMAC covers purpose, email hash, subject user, binding and code, so a code for one purpose cannot be used for another. A wrong guess at a live code adds a row to `otp_failures`. A guess with no live code adds nothing, so spending an address's cap takes four mails that its owner would see.

**Creating the account by code or Google.** `findOrCreateUser` tries an insert with `ON CONFLICT (email_hash) DO NOTHING`. A first-login race is settled by the unique index: the loser reads the winner's row.

**Sessions.** `createSession` makes a 256-bit token and stores only its SHA-256, plus a sealed device label such as "Safari on iPhone". The cookie is `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, with a 90-day `Max-Age`. `lookupSession` checks the token format, the absolute limit (90 days, never extended) and the idle limit (30 days, sliding). It updates `last_seen_at` at most every 5 minutes. No response needs to re-set the cookie.

**Forgot, change, set.** Each writes in one transaction that locks the user row (`FOR UPDATE`). A reset sets the hash, revokes every session, removes every Google link (mailing a notice that Google was disconnected), deletes every device token, clears password failures, and starts one new session and device. Change needs the current password, under the same caps as sign-in. Set is for an account with no password, needs a code and is refused if one exists, so a borrowed phone can't skip knowing it. Change and set re-check inside the transaction that their session still exists and the stored hash is the one they began with, and answer 401 otherwise, so a change racing a reset can't win. They keep this session and end the others. Each mails a notice and audits.

**Email change.** `POST /me/email/request` mails a code to each address. The current-address code is bound to the requested new address through the HMAC. `POST /me/email/verify` checks both as one decision: both right consumes both, and anything else consumes neither and doesn't say which was wrong. Success moves the blind index, re-seals the address, ends other sessions and notifies the old address.

**On the client.** [`handleApiError`](../../apps/web/src/lib/queries.ts) treats a 401 on any request as a lost session. A wrong code is a 400, so it never triggers this. `sessionEnded` moves work into memory (`holdWork`), clears the cache, and redirects once with `next`. `settleHeld` gives it back only to the same user id.

## Key files

- [apps/api/src/otp.ts](../../apps/api/src/otp.ts)
- [apps/api/src/passwords.ts](../../apps/api/src/passwords.ts)
- [apps/api/src/google.ts](../../apps/api/src/google.ts)
- [apps/api/src/routes/accounts.ts](../../apps/api/src/routes/accounts.ts)
- [apps/api/src/routes/google.ts](../../apps/api/src/routes/google.ts)
- [packages/shared/src/passwords.ts](../../packages/shared/src/passwords.ts)
- [packages/shared/src/common-passwords.ts](../../packages/shared/src/common-passwords.ts)
- [packages/shared/src/next-path.ts](../../packages/shared/src/next-path.ts)
- [apps/web/src/routes/CreateAccount.tsx](../../apps/web/src/routes/CreateAccount.tsx)
- [apps/web/src/routes/ForgotPassword.tsx](../../apps/web/src/routes/ForgotPassword.tsx)
- [apps/web/src/ui/PasswordField.tsx](../../apps/web/src/ui/PasswordField.tsx)
- [apps/web/src/ui/GoogleButton.tsx](../../apps/web/src/ui/GoogleButton.tsx)
- [apps/web/src/lib/pending-registration.ts](../../apps/web/src/lib/pending-registration.ts)
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

Tables: `users`, `sessions`, `otp_codes`, `otp_failures`, `login_failures`, `device_tokens`, `user_identities`, `oauth_state_uses`, `audit_log` (`login`, `logout`, `logout_all`, `session_revoke`, `email_change`, `password_change`, `password_set`, `password_reset`, `google_link`, `google_unlink`).

Endpoints: `POST /auth/register/request`, `POST /auth/register/verify`, `POST /auth/login`, `POST /auth/password/forgot`, `POST /auth/password/reset`, `GET /auth/google/start`, `GET /auth/google/callback`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /me/password`, `POST /me/password/set/request`, `POST /me/password/set`, `GET /me/sign-in-methods`, `POST /me/reauth/password`, `POST /me/reauth/code/request`, `POST /me/reauth/code`, `POST /me/identities/google/connect`, `DELETE /me/identities/google`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `GET /me`, `POST /me/email/request`, `POST /me/email/verify`.

Env: `EMAIL_INDEX_KEY`, `OTP_PEPPER`, `AUDIT_KEY`, `PASSWORD_PEPPER`, `PASSWORD_ARGON2_MEMORY_KIB`, `PASSWORD_ARGON2_PASSES`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OIDC_BASE_URL` (refused in production), `CLIENT_IP_HEADER`, `TRUST_PROXY_HOPS`.

## Security/privacy notes

- No request path answers differently for an address with an account. Address-dependent work runs after the response, and password checks do the same hashing work either way. Accounts are created only at the first correct code, or a verified Google sign-in for an address Google hosts, so there's nothing to pre-hijack.
- Passwords are never logged, echoed in an error, or kept in `sessionStorage`, `localStorage`, history or the URL.
- Codes are stored only as HMACs under a key the database never sees. A database dump gives neither codes nor session tokens.
- The client address is kept only inside `source_hash`, a keyed hash. The User-Agent is reduced to a label from a fixed vocabulary and is not stored.
- Attacker with a borrowed phone: a live session alone cannot move an account to a new address, or connect or disconnect Google.
- Error code `reauth_required` (403): the client asks for a password or an email code, then retries.
- CSRF rules apply to sign-in too.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Over a send quota | 202, nothing sent, and the person isn't told. The screen says to try again later. |
| A wrong password, or an unknown address | 400 `invalid_credentials`, all the same. The field clears and takes focus. After three failures on one screen, a general note about the pause. |
| Over a failed-password cap | Even the right password gets `invalid_credentials`, the same answer, until old failures leave the window. A known device is unaffected by the address caps. A reset clears the address's failures. |
| 11th sign-in attempt in a minute from one client, or the bucket empty | 429 `rate_limited`, before anything is counted or hashed. |
| Hashing at capacity | 429, and nothing was spent. The screen says to wait a few minutes. |
| Create account for an address with an account | Same response and screen. A notice instead of a code. |
| A password the server refuses, at the code step | Back to the form with the server's words. The code isn't spent. |
| Reload on the create-account code screen | The password is gone, so back to the form. |
| Google: the person cancels, or anything fails | `/sign-in?error=google` and a neutral message, keeping a valid `next`. |
| Google: a verified address with an account, not linked to this subject | Refused: `/sign-in?error=google_link`. Nothing linked, no session. |
| Google: a new address Google doesn't host | Refused: `/sign-in?error=google_new`. Nothing stored. |
| Connect or disconnect Google without a recent re-authentication | 403 `reauth_required`; the screen asks for a password or an email code. |
| Connect: the session ended before Google sent the person back | `/settings?google=failed`, nothing linked. |
| A password change or set racing a reset | The loser gets 401 and changes nothing. |
| Mail provider fails | 202 already sent. Logged with no details. No retry. |
| Wrong, expired, reused or superseded code | 400 `invalid_code`, all the same. The boxes clear. |
| New code requested | The earlier code stops working. |
| Over the failed-guess cap | Even the right code gets `invalid_code`, until old failures leave the 24-hour window. |
| Two tabs racing a first login | Both succeed against one account. |
| A signed-in person opens `/sign-in` | Redirected on. |
| `/sign-in/code` with no email in state, such as after a reload | Back to `/sign-in`. |
| `next` points off-site or into sign-in | `safeNext` ignores it. |

## Tests that cover it

- [apps/api/test/accounts.test.ts](../../apps/api/test/accounts.test.ts)
- [apps/api/test/security-regressions.test.ts](../../apps/api/test/security-regressions.test.ts) (the second security review's attacks)
- [apps/api/test/google.test.ts](../../apps/api/test/google.test.ts)
- [apps/api/test/otp.test.ts](../../apps/api/test/otp.test.ts)
- [packages/shared/src/passwords.test.ts](../../packages/shared/src/passwords.test.ts)
- [apps/web/src/routes/SignIn.test.tsx](../../apps/web/src/routes/SignIn.test.tsx)
- [apps/web/src/routes/SignInSecurity.test.tsx](../../apps/web/src/routes/SignInSecurity.test.tsx)
- [apps/web/e2e/live/accounts.spec.ts](../../apps/web/e2e/live/accounts.spec.ts)
- [apps/api/test/sessions.test.ts](../../apps/api/test/sessions.test.ts)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (email change, quotas, sign-in notice)
- [apps/web/src/shell/guards.test.tsx](../../apps/web/src/shell/guards.test.tsx)
- [apps/web/src/ui/OtpInput.test.tsx](../../apps/web/src/ui/OtpInput.test.tsx)
- [apps/web/src/lib/held.test.ts](../../apps/web/src/lib/held.test.ts)
- [apps/web/e2e/live/auth.spec.ts](../../apps/web/e2e/live/auth.spec.ts)
- [apps/web/e2e/live/settings.spec.ts](../../apps/web/e2e/live/settings.spec.ts)
- [apps/web/e2e/https/https.spec.ts](../../apps/web/e2e/https/https.spec.ts)

## Known limits

- Anyone can spend an address's 20 sign-in codes an hour. Someone sending from at least 4 networks can spend its 20 failed code guesses for a day (with four mails the owner sees), and from at least 10 networks its 100 failed passwords, stopping sign-in and reset on any device never used for that account. Known devices, active sessions and signed-in codes are unaffected. Accepted: [exception](../SECURITY-EXCEPTIONS.md#sign-in-lockout-of-a-new-device).
- Under a hashing flood, new devices can get 429 while known devices get through.
- One device cookie per browser: signing in to a second account on it replaces the first account's.
- Whoever controls the inbox controls the account, through a code or a reset, even with a password set. There is no second factor.
- The common-password list is hand-picked. See [the exception](../SECURITY-EXCEPTIONS.md#common-password-list-is-hand-picked).
- Google has only ever been a fake provider. Nothing here has met real Google.
- `PASSWORD_PEPPER` can't be rotated without everyone resetting.
- Phone sign-in is deferred, because India's DLT SMS registration is a business process.
- A returning device also gets the sign-in notice. The device cookie isn't used for that, so the notice still reaches the owner if a cookie is copied.
- Route limits are per process. See [API foundation](api-foundation.md#rate-limits).
- The session cookie has never crossed a real Render edge.
