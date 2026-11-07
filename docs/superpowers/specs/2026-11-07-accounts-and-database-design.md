# Accounts and database setup: design

Extends `2026-11-06-production-rebuild-design.md`, whose security rules still bind. Supersedes
ADR "email codes instead of passwords" and "8-digit codes".

## Owner decisions (2026-11-07)
- Separate **Create account** and **Sign in** screens.
- **Password + verified email**, **Google sign-in**, and **email code** as a fallback sign-in.
- Codes are **6 digits**.

Everything below is the builder's design.

> **Superseded in part** after the second security review (see [decision 012](../../decisions/012-passwords-google-and-six-digit-codes.md)): Google sign-in never links to an existing account by address, and linking happens only from Settings after re-authentication; disconnecting needs re-authentication, not a password; failure caps are per address and network plus per address (passwords 10 and 100 a day, codes 5 and 20 a day), with device cookies giving known browsers their own budgets; hashing has a per-network limit, a bucket and a slot kept for known devices. The text below is the original design.

## Risk of 6-digit codes
Codes now gate password reset, so guessing a code is an account takeover route. With 8 digits and 50 failures a day the
yearly odds for one targeted address were about 0.02%. Six digits with the same cap would be 1.8%. So the failed-guess cap
drops to **20 per 24h per address and purpose** (about 0.7% a year against a sustained, single-target attack), plus the existing
5 attempts per code, and a neutral mail after a password reset. Record this residual in `docs/SECURITY-EXCEPTIONS.md`.

## Passwords
- `node:crypto` `argon2` (Argon2id, Node 24.7+; no new dependency, works with `--ignore-scripts`). Set `engines` accordingly.
  Parameters at or above OWASP's minimum (m=19456 KiB, t=2, p=1), stored in the PHC string so they can be raised, with rehash on login when below current.
- Pepper: HMAC the password with new secret `PASSWORD_PEPPER` before hashing. Validated at boot; added to `generate-secrets`, `.env.example`, `render.yaml`.
- Bound concurrent hashing with a small semaphore (queue, then 429/503) so login floods can't exhaust memory on a 512 MB instance.
- Policy, per NIST SP 800-63B: 10-128 characters, no composition rules, paste allowed, spaces allowed. Reject a bundled list of common passwords (local file, no network call, so no third-party breach API) and anything containing the email's local part. Check server-side; the client mirrors it with a plain-language hint, a show/hide toggle, `autocomplete=new-password`/`current-password`. The schema must not echo passwords in errors or logs (add a logging test).

## Flows
All responses stay enumeration-safe; all mail is neutral and sent after the response.

**Create account.** Screen collects optional name, email, password. `POST /auth/register/request {email}` → always 202.
- New address: mail a code (purpose `register`).
- Existing account: mail a notice with no code ("you already have an account; sign in or reset your password").
Then the code screen. `POST /auth/register/verify {email, code, password, displayName?}` creates the account, stores the hash, starts a session.
The client holds the password in memory only until this call. **Nothing about the account is stored before the code is verified**, which rules out pre-hijacking (an attacker registering someone's address in advance) and removes unverified-account handling.

**Sign in.** `POST /auth/login {email, password}`. Unknown address, no password set, and wrong password are indistinguishable in body, status and timing (verify against a dummy hash). Same `invalid_credentials` error (add to `ERROR_CODES`).
Failures per address: 10 per hour, then refuse without evaluating, same response. Per-IP route limits (keyed /64 as elsewhere). Failures stored hashed by address, in the DB, purged by the job. Successful login: new session, existing new-sign-in notice.

**Email code sign-in.** Existing `/auth/otp/*` stays, offered as "Email me a code instead". As today, a verified code for an unknown address creates an account with no password. This is safe because the code proves ownership.

**Forgot password.** `POST /auth/password/forgot {email}` → always 202; code mailed (purpose `password_reset`) only when an account exists. `POST /auth/password/reset {email, code, password}` sets the hash, **revokes all sessions**, mails a notice, starts a new session.

**Change or set password** (Settings). Has a password: `POST /me/password {currentPassword, password}`. Google or code-only account: `POST /me/password/set/request` mails a code, `POST /me/password/set {code, password}`. Both revoke other sessions and mail a notice. Audit each.

**Consent gate** is unchanged and applies after all of these. All new endpoints reachable without consent.

## Google sign-in
Server-side OAuth 2.0 authorisation code with PKCE and OIDC. **No Google script or SDK in the browser**: CSP stays as it is; the button is a plain link styled per Google's branding guidelines, with a local SVG.
- `GET /api/v1/auth/google/start?next=`: validates `next` as a same-origin path, generates state, nonce and PKCE verifier, stores them in a short-lived (10 min) signed or encrypted HttpOnly Secure `__Host-` cookie with **SameSite=Lax** (required for the cross-site return), redirects to Google.
- `GET /api/v1/auth/google/callback`: checks state, exchanges the code server-to-server, validates `iss`, `aud`, `exp`, `nonce`, `email_verified=true` (direct TLS channel per OIDC Core 3.1.3.7; use JWKS signature checks too if it can be done without a heavy dependency). Clears the cookie. Sets the session, then redirects to `next`. Errors redirect to `/sign-in?error=google` with a neutral message; no error detail in the URL.
- New table `app.user_identities (user_id, provider, subject_hmac, created_at)`, unique on `(provider, subject_hmac)`. Find by subject first; otherwise find by email blind index and link (safe since every existing account has a proven email), mailing a notice that Google was linked; otherwise create the account.
- Settings shows sign-in methods; disconnect Google only when a password exists.
- Config: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, both optional, both or neither. `/meta` returns `googleEnabled`; the button is hidden when off. The redirect URI derives from `PUBLIC_ORIGIN`. Scopes: `openid email` only, so Google doesn't send us their name or photo.
- Endpoint base URLs overridable only outside production, so tests run a fake OIDC provider. Production boot refuses an override.
- Privacy notice and `docs/PRIVACY-COMPLIANCE.md`: Google becomes a processor for people who choose it, and it learns they use this service. The Sign-in screen says so in one plain line by the button.
- Erasure removes identities. Export includes sign-in methods, not subject values.

## Data
New migration `002_accounts.sql`; never edit 001. Add `password_hash` to `app.users`, `user_identities`, `login_failures`, grants and `runtime_all` policies as in 001 for the runtime role; new OTP purposes. Update `docs/DATABASE.md`.

## Database setup tooling
The owner has to run this against a real Supabase project, so make it hard to get wrong. Secrets stay on their machine: never ask for them in chat.
- `npm run db:setup`: reads `.env.setup` (gitignored; add `.env.setup.example`) holding the admin connection string and CA path. Generates app secrets once into a gitignored file, refusing to overwrite an existing one. Creates or updates the runtime role, runs migrations, and runs the verification. Idempotent. Prints the values to copy into Render, and never logs the connection password.
- `npm run db:verify`: read-only report of pass/fail for TLS verified, Postgres version, schema `app` exists, nothing of ours in `public`, RLS on all tables, policies limited to the runtime role, runtime role attributes, migrations applied with checksums, `anon`/`authenticated` denied.
- `npm run doctor`: validates a full production env without starting the server: config schema, DB connection and role, SMTP connect and auth (`verify`, sends nothing), Google config shape, public origin. Each failure says how to fix it, without printing secret values.
- All three tested against embedded Postgres. Update `docs/DEPLOYMENT.md` to use them; state in plain terms that they've never met real Supabase.

## Other work included
- Friendly sign-in errors, keyboard and focus coverage on the new screens, and `autocomplete` attributes so password managers work.
- Settings section "Sign-in and security": methods, change or set password, sessions.
- Docs: ADRs for this decision, `docs/API.md`, `docs/modules/auth-and-sessions.md`, threat model, manual test cases, test report, launch checklist including creating the Google OAuth client and consent screen.

## Not included
Second-factor authentication, passkeys, reminders by email, Hindi. Hindi needs a validated GAD-7 translation, so it's a separate piece of work.
