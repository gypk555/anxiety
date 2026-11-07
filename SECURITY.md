# Security policy

AnxioCare holds identifiable mental health data about adults in India. If you think you have found a way to reach that data, we want to hear from you.

## How to report a vulnerability

**Email: `[OWNER: fill in a monitored security contact address before launch]`**

The repository holds no security contact, because the operator's contact details live in deployment config (`GRIEVANCE_EMAIL`), not in code. The owner must replace the placeholder above, and should also turn on [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository) in the repository's Settings, under Security. See [LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md).

Please include:

- what you found, and how to reproduce it
- the impact you think it has
- the account you used, so that we can tell your test traffic from an attack
- how you would like to be credited, if at all

Do not open a public GitHub issue for a security problem. Do not put another person's data in your report. If you came across any, tell us that you did, and tell us where, without copying it.

If you are in distress and came here looking for help, the app's Get help page lists helplines, and in an emergency you can call 112. This address is not monitored for crisis support.

## Response targets

These are targets, not promises. AnxioCare is run by one person.

| Step | Target |
| --- | --- |
| Acknowledge your report | 3 working days |
| First assessment and severity | 7 days |
| Fix or mitigate a critical issue (other people's data reachable) | as soon as possible, and within 7 days |
| Fix or mitigate a high issue | 30 days |
| Fix or mitigate anything else | 90 days |
| Tell you the outcome | when the fix ships |

If your report shows that personal data was actually exposed, the owner follows the [data breach runbook](docs/OPERATIONS.md#data-breach-response), and that runbook's legal clocks take priority over this table.

## Scope

**In scope**

- The production web app and API at the origin shown in the app's About page, including the `/api/v1/*` routes and the service worker.
- The source code in this repository, including `render.yaml`, the migrations and the GitHub Actions workflows.
- Mistakes in how the app uses Supabase, Render or the mail provider, such as the database schema being reachable through Supabase's REST API.

**Out of scope**

- The infrastructure of Supabase, Render, Cloudflare or the mail provider itself. Report those to the vendor.
- Denial of service, load testing, and spending someone else's sign-in limits. The [threat model](docs/THREAT-MODEL.md) already records the sign-in lockout as an accepted risk.
- Social engineering of the owner, of users, or of any vendor.
- Calls or messages to the helplines. They are real crisis services run by other people.
- Reports from automated scanners with no demonstrated impact, and missing headers that have no practical effect.
- Attacks that need an unlocked device or an already compromised mailbox. These are documented residual risks, though better ideas are welcome.

## Rules for testing

- Use only accounts that you created, with email addresses that you control.
- Never read, change, keep or delete data belonging to anyone else. If you reach any, stop at the smallest proof that you could, and report it.
- Do not run automated tools against production that send mail. Every sign-in request can email a real person.
- Give us the chance to fix the problem before you publish anything. We will agree a date with you, and we suggest 90 days.

## Safe harbour

If you follow the rules above in good faith, we will treat your work as authorised research, we will not pursue or report you for it, and we will say so if anyone asks.

We cannot bind third parties or government authorities, and this statement does not authorise anything against vendors' systems. **This wording has not had legal review. Indian law on unauthorised access (including the Information Technology Act, 2000) may limit what the owner can promise. It is on the list of [questions for the lawyer](docs/PRIVACY-COMPLIANCE.md#questions-for-the-lawyer).**

## Summary of controls

The evidence for each one, and what each one does not cover, is in the [threat model](docs/THREAT-MODEL.md).

| Area | Control |
| --- | --- |
| Sign-in | Password, Google, or an emailed code. Passwords are Argon2id with a pepper, in a bounded queue. 6-digit codes from a secure random source, stored only as an HMAC, 10-minute expiry, single use, 5 attempts per code. Google is server-side with PKCE and a checked signature, with no Google script in the browser. Nothing is stored about an account until its address is proven. |
| Sign-in limits | In Postgres: 5 sends an hour per address and client, 20 an hour per address, 20 failed code guesses per rolling day per address (one budget across sign-in, reset and register; 5 per client), 10 failed passwords a day per address and client and 100 per address; a device that has signed in before has its own budgets instead (device cookies). In memory, per client: route limits. |
| Enumeration | The code request always answers 202, before any address-dependent work happens. |
| Sessions | 256-bit opaque token in a `__Host-session` cookie (HttpOnly, Secure, SameSite=Strict). Only its SHA-256 is stored. 30-day idle limit, 90-day absolute limit. Users can list and revoke sessions. |
| CSRF | SameSite=Strict, exact `Origin` check against `PUBLIC_ORIGIN`, and a required custom header on every request that is not GET or HEAD. |
| Authorisation | Every data query is scoped to the session's user. Another user's record answers 404. Data routes answer 403 until the current consent version is accepted. |
| Encryption at rest | AES-256-GCM in the application, with a per-user data key wrapped by a versioned master key. Ciphertext is bound to its column, row and owner, and padded so that length reveals nothing useful. |
| Database | Private `app` schema. Row level security on every table, with policies only for the runtime role. A least-privilege runtime role that the server checks at boot. TLS with a pinned CA. |
| HTTP | Strict CSP with no inline script, HSTS, `no-referrer`, COOP and CORP, no CORS, `no-store` and `no-transform` on API responses, which are never compressed, 64 KB body limit, strict input validation that rejects unknown keys. |
| Logs | Allow-listed fields only. No email addresses, IP addresses, cookies, bodies or query strings. Audit rows are pseudonymous and dated to the day. |
| Client | Only the theme in `localStorage`. The guest result is in `sessionStorage`. The service worker never stores `/api`. No third-party scripts, fonts, analytics or trackers. |
| Mail | Neutral subjects, bodies and sender. Production refuses a sender that reveals the subject. |
| Supply chain | Lockfile, `npm ci --ignore-scripts` on deploy, Dependabot, CodeQL, CI audit gates, GitHub Actions pinned to commit hashes. Accepted findings are listed in [SECURITY-EXCEPTIONS.md](docs/SECURITY-EXCEPTIONS.md). |

**Known limits, in short:** the server in Singapore sees plaintext while it works, whoever holds the master key can read everything, an unlocked phone with a live session gives access to that person's data, and an attacker can delay a person's sign-in. All of these are explained in the [threat model](docs/THREAT-MODEL.md#residual-risks).

**Status:** the code has been tested against a local Postgres and has not yet run on Supabase or Render. See the [deployment guide](docs/DEPLOYMENT.md) for what must be checked on a live service.
