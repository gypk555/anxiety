# Threat model

What could go wrong for the people who use AnxioCare, what stops it, how we know, and what risk remains. For how the system is built, see [ARCHITECTURE.md](ARCHITECTURE.md). For how to respond when something does go wrong, see [OPERATIONS.md](OPERATIONS.md).

**Status of the evidence.** Tests named here run against real Postgres and a real browser in CI, but not against Supabase, Render, Cloudflare or a real mail provider. Anything that depends on those is marked **unverified live**, and [DEPLOYMENT.md](DEPLOYMENT.md) has the checks that close it. Test references are `file:line` at the time of writing.

## What matters most

The worst outcome here is not a typical data breach. It is a person's employer, family or partner learning about their mental health, or someone in distress not reaching help. Those two failures shape the choices below.

## Assets

| ID | Asset | Where it lives | Why it matters |
| --- | --- | --- | --- |
| A1 | Check-in answers, scores, severity | `app.assessments.payload_ct`, encrypted. Plaintext in server memory and in the browser. | Health data, identifiable through the account. |
| A2 | Thought records | `app.journal_entries.payload_ct`, encrypted. | Free text. May hold the most sensitive things a person writes anywhere. |
| A2a | Mood log and safety plan, including other people's names and numbers | `app.mood_entries`, `app.safety_plans`, encrypted. An encrypted copy of the plan in the browser's IndexedDB, under a non-extractable key. | Crisis planning, and third parties' personal data. |
| A3 | Email address and display name | `app.users.email_ct`, `display_name_ct`, encrypted. Plaintext at the mail provider. | Links everything to a real person. |
| A4 | The fact that someone uses this app | Mail subject and sender, lock screens, inboxes, browser history, an installed icon. | Disclosure alone can cause harm. |
| A5 | Master keys | `ENCRYPTION_KEYS` in Render's environment and in the owner's secret store. | Holding these and a database copy reveals everything. |
| A6 | `EMAIL_INDEX_KEY`, `OTP_PEPPER`, `AUDIT_KEY` | Render's environment and the owner's secret store. | Address lookup, code checking, pseudonym linking. |
| A7 | Session tokens | Browser cookie. SHA-256 only in `app.sessions`. | Full access to one account. |
| A8 | Sign-in codes | Mailbox and mail provider. HMAC only in `app.otp_codes`. | Sign-in. |
| A9 | Database credentials | Render's environment and the owner's secret store. | Reach to ciphertext and metadata. |
| A10 | Help page and helpline numbers | `packages/shared/src/helplines.ts`, shipped in the bundle, precached. | Wrong or unreachable help is a safety failure. |
| A11 | Availability of an account | Sign-in. | A person who cannot reach their history or delete it has lost something. |

## Actors

| ID | Actor | Goal |
| --- | --- | --- |
| T1 | Someone with the person's unlocked phone: family, partner, colleague | Read what is there, possibly over time. |
| T2 | Someone who knows a person's email address and wants to deny them access or find out if they use the app | Lockout, enumeration, harassment by mail. |
| T3 | Someone who has control of the person's mailbox | Sign in as them. |
| T4 | Anonymous internet attacker | Other users' data, injection, abuse. |
| T5 | Another signed-in user | Cross-account access. |
| T6 | A vendor's insider, or an attacker inside a vendor (Supabase, Render, Cloudflare, mail) | Data held or passing through. |
| T7 | Compromised dependency or build tool | Code execution on the server or in the browser. |
| T8 | The owner, by mistake, or an attacker on the owner's accounts (GitHub, Render, Supabase, DNS, mail, laptop) | Accidental exposure, keys, malicious deploy. |
| T9 | A government authority with legal powers | Compelled disclosure. Out of scope as an attacker, and on the lawyer's list. |

## Trust boundaries

```
 Phone or browser                 (trusts: the bundle, its own storage)
   | TLS. Terminates at the edge. Where exactly is not documented by Render.
 Cloudflare edge, Render's load balancers    (see plaintext traffic, if TLS ends there)
   |
 Render web service, Singapore    (holds all keys, sees plaintext in memory)
   | TLS verify-full, pinned CA              | TLS, STARTTLS required on 587
 Supavisor pooler, Mumbai                  SMTP provider  (sees address, codes, device label)
   | Supabase-internal                       |
 Postgres, Mumbai  (ciphertext, hashes,    Person's mailbox
                    ids, timestamps)
 Supabase backups  (same contents, retained for BACKUP_RETENTION_DAYS)
```

| Boundary | What crosses it | What protects it |
| --- | --- | --- |
| B1 Browser to edge | Everything the person types, the session cookie | TLS, HSTS, CSP. |
| B2 Edge to server | The same, as plaintext inside TLS to the platform | Vendor contract only. See R4. |
| B3 Server to database | Ciphertext, hashes, SQL | TLS with a pinned CA, a least-privilege role. |
| B4 Server to SMTP | Email address, code, device label | TLS required. Neutral content. |
| B5 Owner to vendors | Keys, deploys, schema | MFA on each account (owner action). |
| B6 CI and dependencies to production | Code | Lockfile, `--ignore-scripts`, `autoDeployTrigger: checksPass`, branch protection (owner action). |

## Threats and controls

Residual ratings are a judgement: **Low**, **Med**, **High**. Evidence is in `apps/api/test/` unless the path says otherwise; `e2e/` means `apps/web/e2e/`.

### Spoofing

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| S1 | T4 guesses a sign-in or reset code | 6 digits from `randomInt`, 20 wrong guesses a day across sign-in, reset and register. See [the odds](SECURITY-EXCEPTIONS.md#six-digit-codes-the-odds-of-a-guess). Stored as HMAC with `OTP_PEPPER`. 10-minute expiry, single use, 5 attempts per code. Guesses serialise on an advisory lock. New code invalidates the old. | `otp.test.ts:66,134,151,159,170,180,192`, `hardening.test.ts:115` | Low. Each code gives 5 guesses in 100 million, and the daily cap ends at 50. |
| S2 | T3 uses the mailbox to sign in | Sign-in notice mail on every sign-in after the first. Users can list sessions and sign out everywhere. | `hardening.test.ts:234`, `sessions.test.ts:165`, `e2e/live/settings.spec.ts:85,121` | **High, accepted. See R6.** |
| S3 | T1 with a live session moves the account to their own address | Email change needs a code from both inboxes, checked together. Other devices are signed out and the old address is told. | `hardening.test.ts:37,50,63,78,87`, `otp.test.ts:303` | Low, unless T1 also has the mailbox on the same phone. |
| S4 | T4 uses a stolen cookie | HttpOnly, Secure, SameSite=Strict, `__Host-` prefix. CSP blocks injected script. | `sessions.test.ts:22`, `e2e/live/security.spec.ts:87,120`, `e2e/https/https.spec.ts:15` | Low. |
| S5 | A code for one purpose is used for another | The HMAC covers purpose, target, subject and binding. | `otp.test.ts:222,232,240,252,260,272,283`, `hardening.test.ts:96` | Low. |
| S6 | Client spoofs its address to escape rate limits | `CLIENT_IP_HEADER=cf-connecting-ip` on Render. Hop count as fallback, which ignores what a client adds to the left. IPv6 counted per /64. | `hardening.test.ts:306,314,345,357,363`, `http.test.ts:386`, `otp.test.ts:93` | Low if the [live check](DEPLOYMENT.md#step-11-check-the-client-address) passes. **Unverified live.** |
| S7 | T4 guesses a password online | Argon2id, peppered. From unknown devices, 10 failures a day per canonical address and client (/64), and 100 a day per address: at most 36,500 guesses a year. Held under a parallel burst by reserving before hashing. A known device has its own 10 an hour. Per-client limits, including 10 sign-in attempts a minute before hashing. A 10-character minimum and a blocklist. | `accounts.test.ts` "after 10 failures from one client", "after 100 failures", "holds the overall cap", `security-regressions.test.ts` "finding 3" | Low to Med. Blocklist is small. |
| S8 | T4 finds out who has an account | Unknown address, no password and wrong password: same status, headers, body and hashing work. Create account and forgot password: always 202, with address-dependent work after the response. | `accounts.test.ts` "identical", "runs a real hash", "timing", "answers before any delivery work", `live/accounts.spec.ts` "an existing address" | Low. Network timing on production not measured. |
| S9 | T4 pre-hijacks an address, registering it before the owner | Nothing is stored until a code proves the address. A code from before an account existed can't set its password. | `accounts.test.ts` "pre-hijack", "a code from before", `google.test.ts` "pre-hijack" | Low. |
| S10 | T4 forges a Google sign-in | State in a Lax cookie, single use. PKCE. Nonce. Signature against JWKS, RS256 only. `iss`, `aud`, `azp`, `exp`, `iat`, `email_verified=true`. | `google.test.ts` "state and code", "the ID token" | Low. Never met real Google. |
| S11 | T4 uses Google to take over an account by address | Sign-in never links by address: an existing address with no link for that subject is refused (`error=google_link`). Linking happens only from Settings, in a session that proved a password or code in the last 10 minutes, bound to that session. A new account from Google only for Gmail addresses or Workspace accounts (`hd`). A reset removes every link. One Google login per account. A notice goes to the address on every link and unlink. | `security-regressions.test.ts` "finding 1", `google.test.ts` "linking", "disconnecting Google" | Low. Found by the second security review; the first design linked by verified address. |
| S12 | T3 or T4 keeps access after a password is lost | Reset revokes every session. Change and set end all others. Each mails a notice. | `accounts.test.ts` "reset sets the hash", "needs the current one" | Low. |

### Tampering

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| T-1 | Someone with database access swaps ciphertext between rows or users | AES-GCM with AAD binding column, row and owner. Wrapped keys are bound to the user and version. A failure answers 500 and logs nothing useful. | `encryption.test.ts:110,119,132,144,152,165` | Low. |
| T-2 | SQL injection | The `postgres` tagged-template driver uses parameters. Strict zod validation, unknown keys refused. | `http.test.ts:345,363`, `data.test.ts:153,264` | Low. The only `unsafe` call runs migration files from the repository. |
| T-3 | Client inflates or fakes a score | The server computes score and severity, and refuses a client-supplied score. | `data.test.ts:138,147` | Low. A person can still answer however they like. |
| T-4 | CSRF | SameSite=Strict, exact `Origin`, required header. | `http.test.ts:64,70,79,84`, `e2e/live/security.spec.ts:111` | Low. |
| T-5 | Malicious deploy through a compromised dependency (T7) | `npm ci --ignore-scripts`. Lockfile. Dependabot, CodeQL, audit gates. Actions pinned to hashes. `DATABASE_MIGRATION_URL` removed from the server process. | `hardening.test.ts:568,572,581`, `.github/workflows/` | Med. Code from a dependency that runs at server start still sees every key. |
| T-6 | Migration history rewritten | Checksums recorded. A changed or missing file stops the run. | `database.test.ts:154,168,183` | Low. |

### Repudiation

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| R-1 | A person disputes giving consent | `app.consents` holds version, adult and health flags, and time. The audit log keeps a pseudonymous `consent` row. | `data.test.ts:96,110` | Med. Consent rows are deleted with the account, and only the pseudonymous audit row survives. Section 6(10) puts proof on the fiduciary. See [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md#questions-for-the-lawyer). |
| R-2 | Actions cannot be reconstructed after an incident | `app.audit_log`: pseudonymous actor and action, dated to the UTC day, kept one year. The app can write audit rows but not read them. | `erasure.test.ts:165`, `purge.test.ts:78`, `hardening.test.ts:402,412` | Med, chosen on purpose. Audit rows cannot prove which session or IP did something. Investigations will be limited. |

### Information disclosure

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| I-1 | T5 reads another user's data | Every query scoped by the session's user. Cross-user access answers 404. | `data.test.ts:278,302,313`, `erasure.test.ts:51`, `sessions.test.ts:143`, `e2e/live/authorisation.spec.ts:3` | Low. |
| I-2 | Database dump or backup is stolen (T6, T8) | Sensitive columns encrypted and padded. Keys never reach the database. | `encryption.test.ts:34,58,93`, `hardening.test.ts:253,269,283` | Low without the keys. **What is left visible:** account count, row counts per user, timestamps (including the time of each check-in), and hashes. |
| I-3 | Supabase's auto-generated API exposes tables | Private `app` schema, no access for PUBLIC, RLS with policies only for the runtime role. Owner turns the Data API off. | `database.test.ts:22,31,40,54,88` | Low once [checked live](DEPLOYMENT.md#step-9-verify-the-database-after-the-first-migration). **Unverified live.** |
| I-4 | Logs leak personal data | Allow-listed serialisers. Errors reduced to class, code and stack frames. The address is never logged, only its kind. | `logging.test.ts:17,48,61,67,91,124`, `hardening.test.ts:369`, `e2e/https/https.spec.ts:68` | Low for app logs. Platform request logs are outside the app's control. See R4. |
| I-5 | Someone learns a person has an account (T2) | The request answers 202 before any lookup, and no account row exists until the first verify. A taken address is revealed only to someone holding both codes. | `otp.test.ts:17,34,56,122,330`, `hardening.test.ts:103` | Low. |
| I-6 | Lock screen or shared inbox reveals the subject (T1) | Fixed neutral subjects and bodies. Production refuses a revealing sender name or address, and export filename is neutral. | `hardening.test.ts:504,517,530,537`, `otp.test.ts:349`, `config.test.ts:145` | Med. The owner must also keep the sending domain neutral, and the code can only check `MAIL_FROM`. DKIM and Return-Path domains are visible to anyone who opens the headers. |
| I-7 | Data stays on a shared device (T1) | Theme only in `localStorage`. Guest result in `sessionStorage`. Service worker never stores `/api`. Memory cleared on sign-out. No-store on API responses. | `e2e/resilience.spec.ts:4,65`, `e2e/live/safety.spec.ts:110`, `e2e/live/authorisation.spec.ts:43,90`, `e2e/live/guest.spec.ts:48` | Med. See R1. Downloads and printouts are the person's own, and stay on the device. |
| I-8 | Cross-origin leak, XSS, framing, third-party script | CSP without inline script, `frame-ancestors 'none'`, no CORS, COOP and CORP, no third-party hosts, no `dangerouslySetInnerHTML`. | `http.test.ts:101,125`, `e2e/live/security.spec.ts:38,120,135` | Low. |
| I-10 | The on-device safety plan copy is read from the browser's files or a phone backup (T1, T6) | AES-GCM with a random non-extractable WebCrypto key. Owner kept as a hash. Removed at sign-out, session end, deletion and another account's sign-in. Nothing in `localStorage` or `sessionStorage`. | `vault.test.ts`, `session-vault.test.ts`, `e2e/live/safety-plan.spec.ts` | Low for the files. Someone who can run the app on the unlocked phone can read it, as R1. |
| I-11 | Someone nearby sees the app open (T1) | Quick exit on every screen and in every sheet, and Escape three times: replaces the history entry with a weather search, hides the app, and clears memory and the guest check-in. Synchronous, with no request. | `quick-exit.test.ts`, `e2e/live/quick-exit.spec.ts` | Med. Earlier history entries stay, the session stays signed in, and the recent-apps screen may hold a snapshot. Help says so. |
| I-9 | Traffic between server and database is read | TLS with a pinned CA, hostname checked. Refused in production without a CA, and refused with `sslmode=disable`. | `tls.test.ts:69,73,77`, `database.test.ts:145`, `config.test.ts:123` | Low from the server to the pooler. **Unverified live.** Supabase's docs say its SSL enforcement setting governs both legs through the shared pooler, so the owner must turn it on. See [DEPLOYMENT.md](DEPLOYMENT.md#step-2-connection-strings-and-the-ca-certificate). |

### Denial of service

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| D-1 | T2 locks a person out of sign-in | Limits are per purpose, so sign-in abuse cannot stop deletion or email change for someone already signed in. Guesses at an address with no live code do not count. | `hardening.test.ts:144,179,201,214,222` | **Med, accepted. See R2.** |
| D-2 | T2 floods a person's inbox | 5 sends an hour per address and client, 20 an hour per address, enforced in Postgres. Spellings of one inbox share a budget. | `otp.test.ts:80`, `hardening.test.ts:124,137,158,325` | Med. Up to 20 unwanted, neutral mails an hour per purpose. |
| D-3 | Request floods | Per-client limits run before auth and before the database. Liveness has no limit. Render's edge filters some traffic. | `hardening.test.ts:432,442,452`, `http.test.ts:372` | Med. One small instance. See R5. |
| D-4 | Storage exhaustion | Body limit 64 KB, 2,000 journal entries, 1,000 assessments per account, automatic purge. | `http.test.ts:300`, `hardening.test.ts:469,482,490`, `purge.test.ts:23,35,58` | Low. Many accounts could still be made. |
| D-5 | The app fails while someone needs help | Help is in the first bundle and precached. Works offline after one visit. Call links appear in static HTML if the app is slow, or JavaScript is off. A failed chunk leaves Get help working. | `e2e/live/safety.spec.ts:71,92`, `e2e/resilience.spec.ts:4,40,83` | Med. A first visit with no network cannot work, and a suspended service takes the first visit with it. |
| D-6 | Master key lost | Owner keeps a copy in a separate secret store. | Process only, see [OPERATIONS.md](OPERATIONS.md#master-key-rotation) | **High impact.** All user data becomes permanently unreadable. Nothing in the code can prevent it. |

### Elevation of privilege

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| E-1 | A bug in the server is used to alter the schema or read beyond the app's needs | Runtime role has no DDL and no extra tables, cannot read audit rows. The server refuses to boot with a role that is a superuser, can create roles or databases, can bypass RLS, or owns tables. Production refuses admin usernames. | `database.test.ts:63,67,74,104,120`, `config.test.ts:138` | Low, but the role can read all ciphertext, and the server has the keys. See R3. |
| E-2 | Skipping the consent gate | Data routes need current consent. Rights routes do not, so nobody is locked out of export or deletion. | `data.test.ts:17,40,83,119` | Low. |
| E-3 | Taking over the owner's accounts (T8) | MFA, separate secret store, branch protection. | Process only. See [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) | Med to High. A single person with no second approver. |
| E-4 | Migration credential is stolen from the running server | `env -u DATABASE_MIGRATION_URL` at start, and `server.ts` deletes it too. | `hardening.test.ts:581`, [SECURITY-EXCEPTIONS.md](SECURITY-EXCEPTIONS.md) | Low. **Unverified live.** |

## Residual risks

These are real and remain after everything above. The owner must read and accept them. Item 1 of the [launch checklist](LAUNCH-CHECKLIST.md) covers the first two by name.

### R1. Shared-phone access to an unlocked session

**Scenario.** A parent, partner or colleague picks up a person's unlocked phone and opens the app. A session lasts up to 30 days idle or 90 days at most, and there is no PIN or app lock.

**What they can do.** Read every result, thought record, mood entry and the safety plan, including the numbers of people in it. Offline, they can read the device copy of the plan too. Download all of it with a single tap, because export needs only the session (`routes/me.ts`). See that an account exists, from the icon or browser history.

**What they cannot do without the mailbox.** Delete the account, or move it to another address. Often the mailbox is on the same phone, in which case nothing stops them.

**Why accepted.** A local lock is a meaningful feature that was not built. Much shorter sessions are possible, but in our judgement they would push people to sign in repeatedly, and every sign-in sends a mail to an inbox that may be shared.

**Mitigations available to the person.** Sign out, "Sign out on all devices", use the app without an account. Quick exit hides the app in the moment, but doesn't end the session.

**What would change this.** Any report of harm. An app lock or a re-check before export is the next step.

### R2. Targeted sign-in lockout for 24 hours, renewable

**Scenario.** Someone who knows a person's email address, and can send requests from several networks, spends that address's daily failure caps for devices that have never signed in to the account. Codes: each code allows 5 wrong guesses, so 4 mails reach the victim and 20 guesses spend the cap of 20 per rolling day (`otp.ts`, `OTP_MAX_FAILED_GUESSES`), shared across sign-in, reset and register codes, with at most 5 from one client, so at least 4 networks. Passwords: 100 a rolling day per address, at most 10 from one client, so at least 10 networks. From then on, on a new device, a correct code or password is refused with the usual answer.

**How fast.** Minutes, with enough networks. One network alone can't do it.

**It is renewable.** The window is rolling, so as old failures age out at 24 hours, the attacker can spend them again, at a cost of about four mails a day for codes, each of which the victim sees.

**What still works for the victim.** Every device they have signed in on before: its `__Host-device` cookie gives it its own budget, so password, code and reset all work there. Google, if connected. Existing sessions. Deletion, email change, adding a password and re-authentication for anyone already signed in, because those have their own caps. The Help page and the tools, which need no account.

**What does not.** Signing in or resetting a forgotten password on a device or browser never used for this account before. The message does not say this address is capped, because saying so would tell an attacker it worked. After two wrong codes on one screen, the app adds a general note that sign-in can be paused for up to 24 hours. That comes from what the screen saw, not from the server, so it reveals nothing about any address.

**Why accepted.** Without the cap, online guessing has no ceiling. The cap protects health data, and the lockout costs only access, which recovers.

**Owner response.** [Clear the cap by hand](OPERATIONS.md#a-person-cannot-sign-in) after confirming the person controls the mailbox. No tooling exists for this beyond the snippet there.

### R3. Master-key compromise

**Scenario.** `ENCRYPTION_KEYS` leaks, through Render's dashboard, a Render insider, the owner's laptop or secret store, or code execution on the server. Combined with database access, or a backup, it decrypts everything for every user.

**Rotation does not undo it.** `rotate-keys` only rewraps data keys. The data keys themselves do not change, and no script exists to change them. Anyone who kept a copy of the wrapped keys and the old master key can still read the data, including all later entries under the same data key. Backups keep the old wrap until they age out.

**Why accepted.** A server that must read data must hold a key. Encryption that only the person's device could undo was not built.

**Reduced by.** Least-privilege roles, MFA, a separate secret store, removal of the migration credential from the server process.

### R4. Render in Singapore, and its edge, see plaintext

**Scenario.** All decryption happens in the server process. For the moments it is working, the server holds plaintext answers, journal text, email addresses and data keys in memory, in Singapore, outside India. Requests also pass through Cloudflare's global network and Render's load balancers ([Render](https://render.com/articles/how-render-handles-ddos-attacks)). Render's documentation does not say where TLS ends, so assume those parties can see requests in the clear, including the session cookie.

**Who could read it.** Render staff, a Render or Cloudflare compromise, or a legal order served on either. Render lists AWS, GCP, Cloudflare and ClickHouse as subprocessors ([Render trust centre](https://render.com/trust)). Any IP address may appear in platform-level logs that the app cannot control.

**Disclosure.** The privacy notice says the Singapore server processes data in readable form. **It does not name Cloudflare.** That is listed as a mismatch in [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md#where-the-app-text-and-the-code-disagree).

**Why accepted.** Render has no region in India ([Blueprint spec](https://render.com/docs/blueprint-spec) lists oregon, ohio, virginia, frankfurt and singapore). Singapore is the closest. Whether this is acceptable is a question for the lawyer.

**What would change this.** A restriction on transfers, or a host in India with equivalent security.

### R5. In-memory rate limits, per instance

**Scenario.** Route limits live in each process's memory, and reset on restart. A deploy resets them, and with N instances an attacker gets N times the limit.

**What still holds.** The send quotas, failed-guess cap and per-code attempts are in Postgres, and are unaffected.

**What does not.** Per-route throttles, and the budget that protects the service as a whole.

**Why accepted.** One instance today. `render.yaml` sets no scaling. See [scaling](OPERATIONS.md#scaling-beyond-one-instance) before changing that.

**A related cost.** Many people in India share one address through carrier NAT, so per-client limits are generous by design, which weakens them against a single attacker. Also, if the client-address check fails on Render, everyone shares a bucket, and one person can throttle all sign-ins. That is why the check is mandatory.

### R6. Email is the only identity factor

**Scenario.** Anyone who can read a person's mail can sign in as them with a code, or reset their password, read everything, export it, and delete it. A password doesn't protect against this: email stays a sufficient way in. Inboxes are often shared, or open on a family computer. There is no second factor, and no recovery path if the person loses the mailbox.

**Detection.** The sign-in notice goes to the same mailbox, so an attacker controlling the mailbox can delete it. It also cannot tell a new device from a returning one, so people receive it on every sign-in, and may stop reading it.

**Why accepted.** Second factors and passkeys are not in this release, and phone OTP needs India's DLT SMS registration. The notice and session list are the compensating controls.

**A related risk.** The SMTP provider sees codes in plaintext for as long as it keeps message content, so a compromise there is also a way in. The 10-minute expiry narrows this.

### R7. Others worth knowing

- **Password hashes are now a target.** A database dump alone isn't enough to attack them, because of the pepper. A dump plus `PASSWORD_PEPPER` allows offline guessing, slowed by Argon2id.
- **A hashing flood can shed sign-ins from new devices.** Sign-in attempts from unknown devices share an instance-wide token bucket and two hash slots; past them, a 429. A third slot is kept for known devices, so their owners still get in.
- **Choosing Google tells Google.** It learns the person uses this service. Only for people who choose it, and stated on the screen and in the notice. Whoever controls a Google account connected from Settings can get in, until it is disconnected or the password is reset.
- **Timestamps are plaintext.** The database reveals when a person checked in, and how often, even without keys.
- **Backups keep erased data** for `BACKUP_RETENTION_DAYS` after deletion. The notice says so. A restore can bring back an account that the person deleted. See [the restore runbook](OPERATIONS.md#restoring-production).
- **Single operator.** One person holds everything, with nobody to notice a mistake. Illness or absence delays incident response and helpline checks.
- **No monitoring of content.** Nobody sees what a person writes. That is a privacy feature and a [clinical limit](CLINICAL-SAFETY.md#self-harm-messaging).
- **Compelled disclosure.** The operator can decrypt, so can be ordered to. The lawyer should advise.

## When to review this

Before launch, after any incident, when a vendor or region changes, when adding anything that stores new data, and at least once a year.
