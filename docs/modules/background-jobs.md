# Background jobs

## Purpose

Two jobs, both in the server process with no queue or worker:

1. **Deferred tasks**: work that must happen after the response, so it can't affect response timing.
2. **Hourly purge**, with a five-minute sweep of dead sign-in codes: delete what has passed its retention.

## User-facing behaviour

None directly. People see the outcome: mail arrives just after a 202, and the privacy notice's retention periods hold. See the known limits for the exact timing.

## How it works

**Deferred tasks.** `Background.run(log, name, task)` starts the task on `setImmediate` and tracks it in a set. Failures are logged as `background_task_failed` with the task name and a reduced error. `drain()` waits for all of them. The app's `onClose` hook calls it, so a graceful shutdown finishes pending mail.

| Task name | Started by | Does |
| --- | --- | --- |
| `otp_delivery` | `POST /auth/otp/request`, `/me/email/request`, `/me/delete/request` | Issues and mails codes |
| `signin_notice` | `POST /auth/otp/verify`, not a first sign-in | Mails the notice |
| `email_change_notice` | `POST /me/email/verify` | Mails the old address |

**Purge.** `schedulePurge` runs `runPurge` 60 seconds after boot, then every hour, and `purgeOtpCodes` every 5 minutes. Timers are `unref`'d, and shutdown cancels them. The purge is idempotent, so several instances are harmless. It runs as the runtime role.

| What | Removed when |
| --- | --- |
| `sessions` | Past the absolute limit, or `last_seen_at` 30 or more days old |
| `users` with `consent_version` null | `created_at` 24 or more hours old, along with `otp_codes` for that address |
| `otp_codes` | Consumed or expired, and created 1 or more hours ago. The hourly quota counts them until then |
| `otp_failures` | 24 or more hours old |
| `login_failures` | 24 or more hours old |
| `device_tokens` | Past `expires_at` (365 days after the last sign-in on that browser) |
| `oauth_state_uses` | Past `expires_at`, 10 minutes after use |
| `audit_log` | 1 or more years old |

Result logged as `purge_completed`, with counts for sessions, OTP codes, unconsented users and audit rows. A failure logs `purge_failed`, or `otp_sweep_failed` for the sweep. The next tick tries again. The sweep logs nothing when it works, because it runs so often.

`npm run purge -w @anxiocare/api` runs it once and prints JSON. It needs the full environment. It's for cron or manual use, and nothing schedules it externally.

**Shutdown.** On SIGTERM or SIGINT, `server.ts` cancels the purge, closes the app (draining background work), and closes the database, with a 15-second hard limit.

## Key files

- [apps/api/src/background.ts](../../apps/api/src/background.ts)
- [apps/api/src/purge.ts](../../apps/api/src/purge.ts)
- [apps/api/src/server.ts](../../apps/api/src/server.ts)
- [apps/api/scripts/purge.ts](../../apps/api/scripts/purge.ts)

## Data and API used

Tables: `sessions`, `users`, `otp_codes`, `otp_failures`, `login_failures`, `device_tokens`, `oauth_state_uses`, `audit_log`. A purged account takes its Google identity with it, by cascade. No endpoints of its own.

## Security/privacy notes

- Deferring the work is what makes sign-in responses identical. A test holds a mail provider stuck and shows the 202 still returns.
- Purge logs only counts.
- The runtime role has `SELECT (created_at)` and `DELETE` on `audit_log`, for the age check. It can't read audit content back.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Crash or forced kill with tasks pending | They are lost, with no trace beyond any log line |
| Shutdown exceeds 15 seconds | Process exits with code 1 |
| Database down at purge time | Logged. Next try in an hour, or 5 minutes for code rows, or 60 seconds after a restart |
| Frequent restarts | Purge runs 60 seconds after each. Harmless |
| A process is never up for 24 hours | The 60-second tick still runs after each boot |

## Tests that cover it

- [apps/api/test/purge.test.ts](../../apps/api/test/purge.test.ts)
- [apps/api/test/otp.test.ts](../../apps/api/test/otp.test.ts) (`responds before any delivery work`)
- [apps/api/test/logging.test.ts](../../apps/api/test/logging.test.ts) (mail failure)

## Known limits

- **Effective retention is a little longer than the threshold**, and only while the server is up. An unconsented account lasts 24 to about 25 hours, which the app calls "after 24 hours". A dead OTP row lasts 1 hour to 1 hour 5 minutes from being sent, which the app calls "about an hour". It can't go sooner: the hourly send quota counts it until then.
- Expired sessions are unusable immediately, even if their rows wait for the purge.
- No retries, no persistence, no dead-letter record.
- Timers rely on the process staying up. There is no external scheduler, and no alert if the purge keeps failing. See [OPERATIONS.md](../OPERATIONS.md).
