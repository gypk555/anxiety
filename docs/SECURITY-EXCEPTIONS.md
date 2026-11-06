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

## 24-hour sign-in lockout

Someone who knows a person's email address can stop them signing in on a new device for up to 24 hours, and can renew it. Full scenario: [threat model R2](THREAT-MODEL.md#r2-targeted-sign-in-lockout-for-24-hours-renewable).

**How.** `OTP_MAX_FAILED_GUESSES` in `apps/api/src/otp.ts` caps wrong guesses at live codes at 50 a rolling day, per address and purpose. Over the cap, `consumeOtps` refuses without evaluating, so even the right code gets `invalid_code`. Each code allows 5 wrong guesses, so it takes 10 mails to that inbox, which the owner sees.

**Reduced.** Only guesses at live codes count, so nobody can spend the cap without mail being sent. Caps are per purpose, so deletion and email change still work for anyone signed in. Existing sessions, Help and the tools are unaffected. After two wrong codes on one screen, the app explains in general terms that this can happen, without saying whether it has. The owner can [clear the cap by hand](OPERATIONS.md#a-person-cannot-sign-in) after confirming who someone is.

**Accepted.** A person under targeted attack can't sign in on a new device until the window passes, or until the owner clears it. The message doesn't say the address is capped, because that would tell an attacker it worked. Many clients can also spend an address's 20 sign-in codes an hour.

**Why that is acceptable.** Without the cap, online guessing at an 8-digit code has no ceiling, against health data. The lockout costs only access, and it recovers. This is the owner's decision to make before launch: see the [launch checklist](LAUNCH-CHECKLIST.md#1-decide-if-you-accept-the-risks).

**What would change this.** Any report of it being used against a real person. Then consider a second factor for a capped address, such as a signed link in the mail, rather than a higher cap. **Not verified** on a real system.

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
