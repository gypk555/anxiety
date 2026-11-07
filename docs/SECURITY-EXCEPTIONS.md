# Security exceptions

Risks accepted on purpose, with what would change the answer. CI's "Audit build tooling" step refers to this file.

## Build-only `npm audit` findings

`npm audit --omit=dev` is clean, and CI fails on any finding there. `npm audit` reports 6 findings, 2 low and 4 moderate, all from one chain:

`vite-plugin-pwa` > `workbox-build` > `@rollup/plugin-node-resolve` > `deepmerge`, and `workbox-build` > `glob` > `minimatch`.

| Package | Severity | Advisory | Why it is not reachable |
| --- | --- | --- | --- |
| `deepmerge` | low | [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | Prototype poisoning needs attacker-controlled objects. It only merges our own Rollup options, once, at build time. |
| `@rollup/plugin-node-resolve` | low | via `deepmerge` | As above. It has no advisory of its own. |
| `glob` | moderate | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | Needs a caller using AbortSignal to cut off a traversal. It walks our own `dist` during the build, and no untrusted path reaches it. |
| `minimatch` | moderate | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Denial of service from an attacker's pattern. The patterns are the fixed `globPatterns` in `apps/web/vite.config.ts`. |
| `workbox-build` | moderate | via `glob`, `@rollup/plugin-node-resolve` | Runs only inside `vite build`, on our own files. |
| `vite-plugin-pwa` | moderate | via `workbox-build` | Build tool. None of its code ships except the generated service worker, whose runtime parts come from `workbox-window` and the bundled Workbox, not from these packages. |

**Not fixed because** the only fix offered is a downgrade to `vite-plugin-pwa@1.1.0`, a breaking change that moves backwards.

**What to watch**
- A `vite-plugin-pwa` or `workbox-build` release that moves off these versions: Dependabot will open it. Take it, and remove this section.
- Any of these findings reaching high or critical: `npm audit --audit-level=high` then fails CI, and this exception no longer applies.
- Any of these packages appearing in `npm audit --omit=dev`: that means it now ships, and this reasoning is void.
- `apps/web/vite.config.ts` or the build starting to read paths, patterns or objects from outside the repository.

## Sign-in lockout of a new device

Someone who knows a person's email address, and can send requests from several networks, can stop them signing in on a **new** device for up to 24 hours, and can renew it. A device that has signed in to the account before can't be locked out this way. Full scenario: [threat model R2](THREAT-MODEL.md#r2-targeted-sign-in-lockout-for-24-hours-renewable).

**How.** Without a valid device cookie for the account, failures are counted per address and client (IPv6 by /64), and per address from anywhere, over a rolling day. Passwords: 10 per client, 100 overall (`LOGIN_MAX_FAILURES_PER_SOURCE`, `LOGIN_MAX_FAILURES` in `apps/api/src/routes/accounts.ts`). Codes for `login`, `register` and `password_reset`, one shared budget: 5 per client, 20 overall (`OTP_MAX_FAILED_GUESSES_PER_SOURCE`, `OTP_MAX_FAILED_GUESSES` in `apps/api/src/otp.ts`). Over a cap, nothing is evaluated, so even the right password or code gets the usual refusal. So one network alone can't do it: it takes at least 10 networks for passwords and at least 4 for codes.

**Reduced.** Device cookies (`apps/api/src/devices.ts`): after any successful sign-in, the browser keeps a `__Host-device` cookie for a year, and a request carrying a valid one for that account spends only that device's own budget (10 wrong passwords an hour, 20 wrong codes a day). So the owner keeps signing in, by password, code or reset, on any device they've used before. Only guesses at live codes count, so nobody can spend the code cap without mail reaching the owner. Signed-in purposes have their own caps, so deletion, email change, adding a password and re-authentication still work for anyone signed in. Existing sessions, Help and the tools are unaffected. After two wrong codes on one screen, the app explains in general terms that this can happen, without saying whether it has. The owner can [clear the caps by hand](OPERATIONS.md#a-person-cannot-sign-in) after confirming who someone is.

**Also: hashing floods.** Sign-in attempts from unknown devices draw on an instance-wide token bucket and three hash slots, one of them kept for known devices. Under a flood, a new device's sign-in can get a 429 and has to try again; a known device gets the kept slot.

**Accepted.** A person under a distributed, targeted attack can't sign in on a device they've never used before until the window passes, or until the owner clears it. That includes resetting a forgotten password from a new device. The message doesn't say the address is capped, because that would tell an attacker it worked.

**Why that is acceptable.** Raising the caps for unknown devices would raise the odds of a guessed code or password, against health data. The lockout costs only access, it spares known devices, and it recovers. This is the owner's decision to make before launch: see the [launch checklist](LAUNCH-CHECKLIST.md#1-decide-if-you-accept-the-risks).

**What would change this.** Any report of it being used against a real person. Then consider a second factor for a capped address, such as a signed link in the mail, rather than a higher cap. **Not verified** on a real system.

## Six-digit codes: the odds of a guess

The owner chose 6 digits. Codes also gate password reset, so a guessed code is an account takeover route, and creating an account for an unused address is a pre-hijack route.

**The number.** 20 guesses a day against a million possible codes, for 365 days, is about **0.73% a year** (20 × 365 / 10⁶), for one targeted address, against a sustained attack from unknown devices by someone who sends a code every few hours for a year. Someone who also holds a device cookie for the account, such as on a shared computer, gets up to the same again per device, because a known device has its own budget of 20 a day. The same cap with 8 digits would be about 0.007%. At 100 a day, 6 digits would be about 3.6%.

**How it stays at that number.** `login`, `register` and `password_reset`, which need no session and each hand over an account, share one budget of 20. A budget each would let an attacker guess at sign-in and reset codes side by side and double the odds. The brief for the second security review asked for an overall cap of 100 a day for codes as well as passwords, to make lockouts harder; it was kept at 20 for codes, because 100 would raise these odds about five-fold. See [decision 012](decisions/012-passwords-google-and-six-digit-codes.md).

**Reduced.** 5 attempts per code. A new code retires the old one. Only guesses at live codes count. Sending a code spends a quota of 5 an hour per client and 20 an hour per address, and each one reaches the owner's inbox: an attack this long means about 1,500 unsolicited mails a year. A successful reset revokes every session and device, disconnects Google, and mails neutral notices.

**Accepted.** The risk above, on top of [the lockout of a new device](#sign-in-lockout-of-a-new-device) that the cap itself creates.

**What would change this.** Any sign of targeted guessing in the logs. Then lengthen the codes, or lower the cap, and add a second factor.

## Passwords: the odds of a guess

From unknown devices, at most 100 wrong passwords a day reach one address, so at most **36,500 guesses a year** (it was 87,600 at 10 an hour). A password among the 36,500 likeliest choices that pass the policy could fall within a year; one chosen from 10⁸ equally likely choices has about 0.04%. A known device adds 10 an hour of its own, which only someone holding that browser can spend. **Reduced** by Argon2id, a pepper, the blocklist and a 10-character minimum.

## Common-password list is hand-picked

`packages/shared/src/common-passwords.ts` is a curated list of a few hundred passwords, plus rules for repeats, sequences and common words with digits around them. It isn't a breach corpus, and no third party is asked, on purpose. So it stops the obvious, and little else.

**Reduced.** Argon2id, a pepper, failure caps (10 a day per address and client, 100 a day per address, from unknown devices), and a 10-character minimum.

**What would change this.** A real breach corpus bundled locally, if its size can be justified in the client's sign-in chunk, or checked on the server alone.

## `DATABASE_MIGRATION_URL` on Render

Render's pre-deploy step shares the service's environment, so the migration role's URL is stored with the service.

**Reduced**: `render.yaml` starts the server with `env -u DATABASE_MIGRATION_URL npm start`, so the serving process never receives it, and
a code-execution bug in the server cannot read it from `process.env` or `/proc/self/environ`. `server.ts` also deletes it, as a second check for hosts
that start it differently.

**Accepted**: anyone with a shell on the instance through Render's dashboard, or with access to the service's settings, can read it.

**Why that is acceptable**: those same people can already read `ENCRYPTION_KEYS` and `DATABASE_URL`, which reach all user data. The migration role adds
schema changes and audit-log access, not data that was otherwise out of reach.

**Not verified** on a live Render service. **What would change this**: more people gaining Render access than should be able to alter the schema. Then
remove the variable and `preDeployCommand` from Render, and run `npm run migrate` from a protected GitHub Actions environment, before deploying.
