# 012. Passwords, Google sign-in and six-digit codes

Status: accepted, 2026-11-07. Decided by: the owner chose the sign-in methods and the code length. The builder chose the rest. Supersedes [decision 001](001-email-codes-instead-of-passwords.md) and the code length and failed-guess cap in [decision 010](010-eight-digit-codes-and-quotas.md). Design: [the spec](../superpowers/specs/2026-11-07-accounts-and-database-design.md).

## Context

Email codes alone made every sign-in wait on mail, and asked people in distress to switch apps. The owner wants separate **Create account** and **Sign in** screens, a password with a verified email, Google sign-in, an email code as a fallback, and 6-digit codes.

Six digits are 100 times easier to guess than eight, and codes now also gate password reset, so a guessed code is an account takeover.

## Decision

**Passwords.** Argon2id from `node:crypto`, so no new dependency and it works with `--ignore-scripts`. At least OWASP's minimum (m=19456 KiB, t=2, p=1), in a PHC string, so they can be raised, with a rehash at the next sign-in. Peppered with an HMAC under `PASSWORD_PEPPER` first. Three hashes run at once: two for anyone, and one kept for requests from a known device (below). Sixteen wait in each queue. Beyond that, 429. `PASSWORD_ARGON2_MEMORY_KIB` is capped at 65536, so the peak is 3 × 64 MiB = 192 MiB on a 512 MB instance. Before a sign-in attempt is counted or hashed, one client (IPv6 by /64) gets 10 a minute, and attempts from unknown devices draw on an instance-wide token bucket (30 at once, refilling 20 a second), so a flood is shed cheaply before it reaches the queue. Policy per NIST SP 800-63B: 10 to 128 characters, no composition rules, a bundled blocklist, and not containing the address's local part. No breach API, because that would be a third party seeing password hashes.

**Nothing about an account is stored before its code is verified.** That rules out pre-hijacking: there is no unverified account to take over, and none to clean up.

**Indistinguishable.** Unknown address, no password set and wrong password get the same status, headers and body, and do the same hashing work, against a dummy where there is no hash. An address already on file at **Create account** gets the same response and screen, and a neutral notice, under the same send quota.

**Device cookies.** After any successful sign-in (password, email code, create account, reset or Google), the browser gets a `__Host-device` cookie: a random 256-bit token, HttpOnly, Secure, `SameSite=Strict`, kept 365 days and renewed at each sign-in. Only an HMAC of it is stored, bound to the account, in `app.device_tokens`, at most 20 per account. A reset deletes all of an account's devices, and deleting the account deletes them too. A request with a valid device cookie for the account it names spends only that device's failure budget; the address-wide caps don't apply to it. This is OWASP's "device cookie" pattern: a stranger can spend an address's allowance, but not a device's that its owner already uses. Being `Strict`, the cookie isn't sent on the cross-site return from Google, so a Google sign-in always issues a new one.

**Six-digit codes.** The failed-guess cap falls from 50 to **20 a rolling day** per address, from devices that haven't signed in to the account. Within that, one client (IPv6 by /64) gets 5. A known device has its own 20 a day.

**One budget for the three anonymous purposes.** This differs from the spec, which says "per address and purpose". `login`, `register` and `password_reset` need no session and each one hands over an account. With a budget each, an attacker works two side by side (`login` plus `password_reset`, or `login` plus `register`) and doubles the odds. So those three share one budget. Purposes that need a session keep one each, so anonymous guessing can't block a person's own deletion, email change, password or re-authentication.

**Failed passwords.** From an unknown device: 10 a rolling day per canonical address and client (IPv6 by /64), and 100 a rolling day per address from anywhere. From a known device: 10 an hour for that device. Counted for addresses with no account too, then refused without evaluating, with the same answer. An attempt is reserved before the hash runs, so a parallel burst cannot pass a cap, and the hash runs outside any database transaction. A success gives back only its own reservation, so the owner signing in cannot refill an attacker's allowance. `login_failures.quota_hash` is an HMAC in its own domain (`login-quota:`), so it can't be joined with `otp_codes.quota_hash`.

**The yearly odds.** Codes: 20 guesses a day at a million codes is about **0.73% a year** for one targeted address from unknown devices (20 × 365 / 10⁶). Someone who holds a device cookie for the account, such as on a shared computer, gets up to that again per device. Passwords: at most **36,500 guesses a year** at one address from unknown devices (100 a day), down from 87,600 at 10 an hour. So a password among the 36,500 likeliest choices that pass the policy could fall within a year, while one chosen from 10⁸ equally likely choices has about 0.04%.

**Deviation from the brief.** The brief asked for an overall per-address cap of 100 a day for codes as well as passwords. For codes it stays at 20, because 100 would raise the yearly odds of a guessed code from about 0.7% to about 3.6%, and a guessed code is a takeover. 100 applies to passwords only.

**Changing a password is one transaction.** Change, set and reset lock the user row (`FOR UPDATE`). Change and set check inside that transaction that the session still exists and the stored hash is the one they started from, and answer 401 otherwise. Each revokes the other sessions in the same transaction. So a change racing a reset either lands first and is overwritten, or finds its session gone.

**Google.** Server-side authorisation code with PKCE, and no Google script in the browser, so the CSP doesn't change. Signature checked against Google's JWKS as well as `iss`, `aud`, `exp`, `nonce` and `email_verified=true`, using only `node:crypto`. State is in a `SameSite=Lax` `__Host-` cookie, because `Strict` wouldn't come back on the cross-site return. A used `state` is recorded in `app.oauth_state_uses` so it can never be replayed, which the spec's stateless cookie alone wouldn't guarantee.

- **Sign-in finds an account by Google subject only. It never links by address.** A Google account can be made for any address, and Google's `email_verified` says only that Google checked it once, so linking by address handed the account to whoever held that Google login. An address that already has an account and no link for that subject is refused to `/sign-in?error=google_link`, which tells the person to sign in another way and connect Google in Settings. This differs from the spec.
- **A new account from Google** only for an address Google hosts: `@gmail.com`, `@googlemail.com`, or a Workspace account, which carries `hd`. Anything else goes to `/sign-in?error=google_new`, which suggests creating an account with email.
- **Linking happens only from Settings.** `POST /me/identities/google/connect` needs a session that proved a password or an email code in the last 10 minutes. Signing in by password or code counts; a Google sign-in doesn't. It seals the account and session into the state, and the callback links only if that session still exists. Results go to `/settings?google=connected`, `taken` or `failed`.
- **Disconnecting** needs the same recent re-authentication, not a password. Email codes always remain, so it can't leave an account with no way in.
- **A password reset removes every linked identity** and mails a notice that Google was disconnected, because whoever reset may not be whoever connected it.
- An account holds one Google login: a second subject is refused.

**A wrong password is a 400, not a 401.** To the client a 401 means the session ended, which would clear what the browser is holding, including a guest result.

## Alternatives

- **A breach API for passwords.** A third party on the sign-in path, against [decision 008](008-no-third-party-analytics.md).
- **Storing unverified accounts.** The usual design, and the usual source of pre-hijacking and cleanup jobs.
- **Google's script in the browser.** A new CSP source and a third party on the page for everyone, not only those who choose it.
- **A budget per purpose for sign-in codes.** See above: it doubles the odds. Its one advantage is that someone spending the `login` budget doesn't also pause reset codes. Device cookies now cover that case for known devices.
- **Linking Google by verified address.** The spec's choice. It let anyone holding a Google login for a victim's address take the account, and it survived a password reset.
- **A higher code cap, to make lockouts harder.** It raises the odds of a takeover; device cookies protect known devices instead.
- **Eight digits.** The owner chose six for usability. The residual is in [SECURITY-EXCEPTIONS.md](../SECURITY-EXCEPTIONS.md).

## Consequences

- There is now a password store to protect, and a pepper to keep. Losing or changing `PASSWORD_PEPPER` invalidates every password, though people can recover by reset.
- Google becomes a processor for people who choose it, and learns they use this service. The notice and the screen say so.
- A device cookie is stored in each browser used to sign in. It is security-only and needs no consent banner; the privacy notice describes it.
- Whoever controls the inbox still controls the account, through email codes and reset. There's no second factor yet.
- The blocklist is hand-picked, not a breach corpus, so it catches the obvious and little else.
- A distributed attacker can lock a **new** device out: 100 wrong passwords a day from at least 10 networks, and 20 wrong codes from at least 4 networks, stop password and code sign-in, and reset, on any browser that has never signed in to the account. A **known** device can't be locked out this way. During a hashing flood, sign-ins from new devices can be shed with a 429, while known devices get the kept slot.
- Google sign-in for an existing account takes one extra step, once: connecting it in Settings.
