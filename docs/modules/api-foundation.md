# API foundation

## Purpose

The parts every API request relies on: config, logging, errors, validation, rate limits, security headers, and static serving.

## User-facing behaviour

Mostly invisible. People see plain-language errors (the web client maps `code` to words), and the server refuses to start rather than run misconfigured.

## How it works

### Config

[`loadConfig`](../../apps/api/src/config.ts) validates the environment with Zod at boot. An invalid value prints variable names and rules, never values, and exits with code 1. Nothing reads a `.env` file: set real variables. `.env.example` has commented guidance, and `npm run dev:api` sets everything itself.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | | `development`, `test` or `production` |
| `HOST` | No | `0.0.0.0` | `dev:api` uses `127.0.0.1` |
| `PORT` | No | `8787` | Render sets it |
| `PUBLIC_ORIGIN` | Yes | | Exact origin, with no path or trailing slash. CSRF compares against it. https in production |
| `DEV_ORIGINS` | No | | Comma-separated extra origins. Refused in production |
| `TRUST_PROXY_HOPS` | No | `1` | 0 to 10 |
| `CLIENT_IP_HEADER` | No | | One header name. `render.yaml` sets `cf-connecting-ip` |
| `LOG_LEVEL` | No | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `silent` |
| `WEB_DIST` | No | `apps/web/dist` | Where the built web app is |
| `DATABASE_URL` | Yes | | Runtime role. Production refuses `postgres` or `supabase_admin` users, and `sslmode=disable` |
| `DATABASE_MIGRATION_URL` | Migrate only | | Must differ from `DATABASE_URL` in production. Deleted from `process.env` at boot |
| `DATABASE_CA_CERT` | In production | | PEM, or base64 of PEM |
| `DATABASE_POOL_MAX` | No | `5` | 1 to 50 |
| `ENCRYPTION_KEYS` | Yes | | `<version>:<base64 of 32 bytes>`, comma-separated |
| `ENCRYPTION_ACTIVE_KEY` | Yes | | Must be in the ring |
| `EMAIL_INDEX_KEY`, `OTP_PEPPER`, `AUDIT_KEY` | Yes | | 32 random bytes in base64, all different |
| `MAIL_TRANSPORT` | Yes | | `smtp`, or `file:<path>` (refused in production) |
| `MAIL_FROM` | Yes | | Neutral in production |
| `MAIL_FROM_NAME` | No | `Account Team` | |
| `MAIL_PROVIDER` | No | `our email provider` | Named in the privacy notice |
| `SMTP_HOST` | With `smtp` | | |
| `SMTP_PORT` | No | `587` | 465 means implicit TLS |
| `SMTP_USER`, `SMTP_PASS` | In production | | |
| `OPERATOR_NAME` | Yes | | Shown in Privacy and Terms |
| `GRIEVANCE_EMAIL` | Yes | | Shown in Privacy and Terms |
| `BACKUP_RETENTION_DAYS` | No | `7` | 0 to 365. Stated to people |
| `DATA_LOCATION` | No | `Mumbai, India` | Stated to people |
| `SERVER_LOCATION` | No | `Singapore` | Stated to people |

A blank value left in a hosting dashboard counts as unset for `CLIENT_IP_HEADER`, `MAIL_FROM_NAME`, `MAIL_PROVIDER`, `BACKUP_RETENTION_DAYS`, `DATA_LOCATION` and `SERVER_LOCATION`.

Local-only variables read by `apps/api/scripts/dev.ts`: `DEV_FRESH`, `DEV_USE_BUILD`, `DEV_PG_DIR`, `DEV_PG_PORT`.

The migration script needs only `DATABASE_MIGRATION_URL`, and `DATABASE_CA_CERT` in production. `NODE_ENV` defaults to `development` for it.

**At boot,** after config, the server deletes `DATABASE_MIGRATION_URL` from its environment, connects, and runs `assertRuntimeRole`. On a privileged role it logs fatal and exits.

### Logging

[logger.ts](../../apps/api/src/logger.ts): Pino with `base: null`, ISO time, and `req` and `res` serialisers removed. Fastify's request logging is off. The `onResponse` hook writes one line:

```json
{"level":30,"time":"ISO","reqId":"uuid","method":"GET","route":"/api/v1/meta","status":200,"durationMs":5,"msg":"request"}
```

`route` is the template, not the URL. An error is reduced by `safeError` to its class, code and stack frames, with no message line, because driver and SMTP messages can quote addresses or values.

Other lines: `client ip resolved: <kind> via <source>` (once per kind, never the address), `background_task_failed`, `purge_completed`, `purge_failed`, `otp_sweep_failed`, `decrypt_failed`, `request_failed`, `readiness_check_failed`, `shutting_down`, `fatal`.

**Never logged:** bodies, cookies, emails, IP addresses, query strings, user agents, user ids.

### Errors

[errors.ts](../../apps/api/src/errors.ts): `ApiError` carries a status, code and optional `fieldErrors` and `detail`. `problem()` builds an RFC 9457 document. The error handler in `app.ts` sends `ApiError`s as is, turns framework 4xx responses into `validation_failed`, and turns anything else into a logged 500 `internal_error`. Codes: [API](../API.md#conventions).

### Validation

[validate.ts](../../apps/api/src/validate.ts): `parse` applies a Zod schema, and a failure becomes a 400 with `fieldErrors`. An unknown key is reported against the object and never echoed. `emptyBody` rejects anything sent to a body-less POST. `idParam` turns a malformed id into a 404. `decodeCursor` restricts a cursor to dates between 2000 and 2100, so odd input is a clean 400 and not a Postgres error. `page` fetches limit + 1, to detect another page.

Other input rules in `app.ts`: 64 KB `bodyLimit`, the `text/plain` parser removed, and Fastify's default JSON parser, including prototype poisoning protection, with an empty body allowed.

### Rate limits

`@fastify/rate-limit`, in process memory with a cache of 20,000 keys. Limits and budgets: [API](../API.md#conventions).

The client key comes from [client-ip.ts](../../apps/api/src/client-ip.ts):

1. `CLIENT_IP_HEADER`, if it's set and holds a single valid address.
2. Otherwise the hop-counted address, through `trustProxy: (_, hop) => hop < TRUST_PROXY_HOPS`.

IPv4-mapped IPv6 is unwrapped. IPv6 groups by /64, because one subscriber can pick any address in a /64.

Render details and a post-deploy check are in [apps/api/README.md](../../apps/api/README.md#client-address-on-render). **Not verified on live Render.**

Files have their own larger budget, because a first visit fetches many precached files and many people in India share one carrier NAT address.

### Security headers

Set in `app.ts` on every response: strict CSP (`default-src 'none'`, self for script, style, img, font, connect, manifest and worker, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), HSTS for a year including subdomains, `Referrer-Policy: no-referrer`, COOP and CORP `same-origin`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a `Permissions-Policy` turning off accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment, USB and browsing topics. There is no CORS plugin.

### Static files

[static.ts](../../apps/api/src/static.ts) serves `WEB_DIST` with `@fastify/static`. The directory is checked per request, so a missing build isn't a boot failure.

| Request | Answer |
| --- | --- |
| A file under `/assets/` | `public, max-age=31536000, immutable` |
| Any other real file, including `index.html`, `sw.js`, the manifest | `no-cache` |
| A page navigation (`sec-fetch-mode: navigate` or `accept: text/html`) with no file | `index.html` |
| A missing script or image, or missing `/assets/*` | 404 problem document |
| `/api/*` with no route | 404 problem document, never the shell |
| Dotfiles | Ignored |

### Database and migrations

See [DATABASE.md](../DATABASE.md).

## Key files

- [apps/api/src/app.ts](../../apps/api/src/app.ts)
- [apps/api/src/server.ts](../../apps/api/src/server.ts)
- [apps/api/src/config.ts](../../apps/api/src/config.ts)
- [apps/api/src/logger.ts](../../apps/api/src/logger.ts)
- [apps/api/src/errors.ts](../../apps/api/src/errors.ts)
- [apps/api/src/validate.ts](../../apps/api/src/validate.ts)
- [apps/api/src/client-ip.ts](../../apps/api/src/client-ip.ts)
- [apps/api/src/static.ts](../../apps/api/src/static.ts)
- [apps/api/src/db.ts](../../apps/api/src/db.ts)
- [apps/api/src/routes/health.ts](../../apps/api/src/routes/health.ts)
- [apps/api/scripts/dev.ts](../../apps/api/scripts/dev.ts)
- [apps/api/scripts/build.ts](../../apps/api/scripts/build.ts)
- [render.yaml](../../render.yaml)
- [.env.example](../../.env.example)

## Data and API used

Endpoints: `GET /healthz`, `GET /readyz`, `GET /meta`, plus static files. It reads no user data.

## Security/privacy notes

- Config errors name variables, never values. Log tests assert that emails, cookies, codes, addresses and query strings don't appear.
- `onnotice` is silenced on the database connection, because server notices can quote values.
- CSRF checks run before the limiter, so a rejected request costs a header comparison and doesn't count against the budget.
- `CLIENT_IP_HEADER` is safe only behind a proxy that overwrites the header on every request. Otherwise clients can forge it.
- `TRUST_PROXY_HOPS` too low: everyone shares a bucket. Too high: clients can choose their address.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Invalid config | Prints problems, exits 1 |
| Privileged database role | Logs fatal, exits 1 |
| Database unreachable at boot | Logs `database_check_failed`, exits 1 |
| Database lost later | `/readyz` 503, `/healthz` still 200, data routes 500 |
| Uncaught exception or unhandled rejection | Logged fatal, exit 1, and the platform restarts it |
| SIGTERM | Graceful close, 15-second limit |
| Malformed URL | 400, no crash |
| Body over 64 KB | 413 `validation_failed` |
| Wrong content type | 415 `validation_failed` |
| No web build | API works, and navigations get a 404 |
| A stale local database after a migration edit | `dev:api` stops with `checksum mismatch`. Use `DEV_FRESH=1` |

## Tests that cover it

- [apps/api/test/config.test.ts](../../apps/api/test/config.test.ts)
- [apps/api/test/http.test.ts](../../apps/api/test/http.test.ts)
- [apps/api/test/logging.test.ts](../../apps/api/test/logging.test.ts)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (rate limit keys, client address, limiter order, deploy config)
- [apps/api/test/database.test.ts](../../apps/api/test/database.test.ts)
- [apps/api/test/tls.test.ts](../../apps/api/test/tls.test.ts)
- [apps/web/e2e/live/security.spec.ts](../../apps/web/e2e/live/security.spec.ts)
- [apps/web/e2e/https/https.spec.ts](../../apps/web/e2e/https/https.spec.ts)

## Known limits

- Rate limits are per process and reset on restart. Before running several instances, move them to a shared store. The quotas in Postgres aren't affected.
- No metrics or tracing, only logs. See [OPERATIONS.md](../OPERATIONS.md).
- If `scripts/dev.ts` fails during migration, it exits without stopping the embedded Postgres it started. The next `dev:api` run on the same directory stops that leftover.
- The HTTP and config behaviour has run in production mode only through the local stack in [apps/api/scripts/https-stack.ts](../../apps/api/scripts/https-stack.ts).
