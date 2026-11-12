# AnxioCare API

Fastify 5, TypeScript, Postgres. Serves `/api/v1/*` and the built SPA from one origin. The contract lives in
`packages/shared`; the requirements in `docs/superpowers/specs/2026-11-06-production-rebuild-design.md`.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm run dev -w @anxiocare/api` | Embedded Postgres, migrations, runtime role, file mail, port 8787. No setup. |
| `DEV_FRESH=1 npm run dev -w @anxiocare/api` | The same, wiping data and keys first. |
| `DEV_USE_BUILD=1 npm run dev -w @anxiocare/api` | The same, but runs `dist/server.js` (build first). It serves `apps/web/dist`, so use this for e2e. |
| `npm test -w @anxiocare/api` | Integration tests against real Postgres. |
| `npm run build -w @anxiocare/api` / `npm start -w @anxiocare/api` | Bundle to `dist/server.js` / run it. |
| `npm run migrate -w @anxiocare/api` | Apply migrations with `DATABASE_MIGRATION_URL`. |
| `npm run purge -w @anxiocare/api` | One purge run. The server also does this hourly. |
| `npm run notify-all -w @anxiocare/api -- --subject ... --body-file ...` | Breach notice to every account. Prints the count unless given `--send`. [How to use it](../../docs/OPERATIONS.md#how-to-reach-people). |
| `npm run rotate-keys -w @anxiocare/api` | Rewrap all data keys under the active master key. |
| `npm run generate-secrets -w @anxiocare/api` | Print new keys and the runtime-role SQL. |
| `npm run db:setup` | From `.env.setup`: secrets once, the runtime role, migrations, then verification. Idempotent. Never prints the admin password or, unless asked, the generated secrets. |
| `npm run db:verify` | Read-only pass or fail report on the database named in `.env.setup`. |
| `npm run doctor` | Checks a full production environment without starting the server: config, database and role, SMTP sign-in, Google shape, public origin. Sends nothing. |
| `node scripts/fake-oidc.ts [port]` | Test only: a local OpenID provider that behaves as Google does. |

Dev overrides, including optional Google through a fake provider (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OIDC_BASE_URL`): `PORT`, `DEV_PG_PORT` (54329), `DEV_PG_DIR`, `MAIL_TRANSPORT`, `PUBLIC_ORIGIN`, `DEV_ORIGINS`.
The dev CSRF allow-list covers ports 8787, 5173 and 4173 on `localhost` and `127.0.0.1`.

## Reading codes in development and e2e

`npm run dev` writes mail to `<repo>/.e2e-outbox/mail.jsonl`, or to the path in `MAIL_TRANSPORT=file:<path>`.
Each line is one JSON object, appended in send order, and the file is never truncated:

```json
{"at":"2026-11-06T12:00:00.000Z","from":"Accounts <no-reply@localhost.example>","to":"a@example.com","subject":"Your sign-in code","text":"...","purpose":"login","code":"123456"}
```

`purpose` is `login`, `register`, `password_reset`, `password_set`, `email_change` (to the new address), `email_change_current` (to the current address), `account_delete`, `reauth`,
`email_changed_notice`, `new_signin_notice`, `password_changed_notice`, `google_linked_notice` or `google_unlinked_notice` (`code` is `null` for the notices). `code` is plain digits; the mail's `text` prints them
grouped, `123 456`. Take the last line matching `to` and `purpose`. Delivery happens just after the 202, so poll for a line. In
development, codes are also printed to the console. Each purpose allows an address 5 codes an hour per client and 20 overall, so give
each e2e test its own address, or `DEV_FRESH=1` between runs.

## API notes not captured in `shared`

- Requests that are not GET or HEAD need an `Origin` matching `PUBLIC_ORIGIN` and the header `x-anxiocare-csrf: 1`.
- `202` with an empty body: `POST /auth/otp/request`, `/me/email/request`, `/me/delete/request`.
- `204`: logout, logout-all, session and data deletes, `/me/delete/confirm`.
- `GET /auth/sessions` returns `{ "items": SessionInfo[] }`, not paginated.
- `POST /assessments` returns 201 for a new row and 200 with the original row on replay.
- `GET /meta` returns `metaResponse` from `shared`: operator and consent details, plus `backupRetentionDays`, `dataLocation`, `serverLocation` and `mailProvider`.
- `GET /me/export` returns `{ exportedAt, account, signInMethods, consents, assessments, journal, moods, safetyPlan, sessions }`.
- `PUT /moods/:day` and `PUT /safety-plan` are upserts, and answer 200 either way. A day that isn't a real `YYYY-MM-DD` is `400 validation_failed`, not 404.
- A verify failure is `400 invalid_code`. A taken address at email verify is `409 conflict`, only after both correct codes.
- `POST /me/email/verify` takes `{ newEmail, currentCode, code }`: `currentCode` from the current inbox, `code` from the new one.
- Past 2,000 journal entries or 1,000 assessments, a create is `409 conflict` with words for people in `detail`.
- A `takenAt` up to 60 seconds ahead is treated as now, because phone clocks drift. Later than that is rejected. No future time is ever stored.

## Security decisions worth knowing

- **OTP**: 6 digits, 5 attempts per code. Guesses for an address serialise on an advisory lock, in one transaction with their counters.
  The code HMAC covers purpose, target hash, subject user, binding and code, and lookups filter on the first three too.
- **Failed-guess cap**: 20 wrong guesses at live codes per rolling 24 hours, per address, from devices not known for the account, and at most 5 of them per address and client. A known device (below) has its own 20. `login`, `register` and `password_reset` share one budget, because each hands over an account and a budget each would double an attacker's odds. Each signed-in purpose has its own, so anonymous guessing cannot block a signed-in person's deletion or password. Over it, verify answers `invalid_code` without evaluating. Guesses with no live code do not count, so spending the cap requires four mails to reach the address.
- **Passwords**: Argon2id through `node:crypto`, peppered with an HMAC under `PASSWORD_PEPPER`, in a PHC string, rehashed at sign-in when `PASSWORD_ARGON2_*` have been raised. Three hashes run at once, one kept for known devices, with 16 queued for each, then 429; `PASSWORD_ARGON2_MEMORY_KIB` is at most 65536. Before counting or hashing, a sign-in attempt passes `Passwords.admit`: 10 a minute per client (/64), and, for an unknown device, an instance-wide token bucket (30, 20 a second). Both are in memory, per instance. Each check then reserves a row in `login_failures`, so the caps hold under a parallel burst: from an unknown device 10 a day per address and client and 100 a day per address; from a known device 10 an hour. Change, set and reset write in one transaction that locks the user row, and change and set give 401 if their session ended or the hash moved meanwhile. Unknown address, no password and wrong password do the same work and get the same answer, a 400, because the web client treats any 401 as a lost session.
- **Device cookies** (`src/devices.ts`): every sign-in sets `__Host-device`, a random token stored only as an HMAC. A request with one valid for the account spends only that device's failure budgets, so nobody can lock out a browser its owner already uses. A reset revokes them all.
- **Nothing is stored before a code is verified**, so there is no such thing as an unverified account, and nothing to pre-hijack. Create account for an address with an account mails a notice, under the same send quota, in place of the code.
- **Google**: sign-in finds an account by subject only and never links by address; linking is only from Settings (`POST /me/identities/google/connect`), after a password or code in the last 10 minutes, and a reset removes every link. See `src/routes/google.ts`, `src/google.ts` and [decision 012](../../docs/decisions/012-passwords-google-and-six-digit-codes.md). `GOOGLE_OIDC_BASE_URL` points it at the fake provider in `scripts/fake-oidc.ts`, and production refuses it.
- **Send quotas**, per purpose: 5 an hour per address and client, 20 an hour per address. Quotas count the canonical address
  (lower case, no `+tag`; for Gmail no dots and one domain). Delivery goes to the address as typed, and identity stays on the
  normalised address, because elsewhere those can be different mailboxes. The client is kept only inside a keyed hash, until a sweep removes the dead row about an hour after it was sent (at least an hour, for the quota, and at most 1 hour 5 minutes while the server is up).
- **Enumeration**: nothing on the login request path touches an account; the row is created at the first successful verify.
  All address-dependent work happens after the response.
- **Runtime role** has no `BYPASSRLS`. RLS policies name this role only, so every other role sees nothing, and table grants confine it.
  The server refuses to boot if it is a superuser, can create roles or databases, can bypass RLS, or owns tables.
  **Not verified against a live Supabase project.**
- **Compression**: `apps/web/scripts/precompress.mjs` writes `.br` and `.gz` beside each text file at build, and `@fastify/static` serves them with `Vary: accept-encoding`. They are the same bytes for everyone, and hold no user data. Nothing compresses API responses, whose lengths could leak what's in them (BREACH), and `no-transform` asks the edge not to either. **Not verified that Render's edge honours it**: MT-DEP-19.
- **Cookie lifetime** is the 90-day absolute limit. The server enforces the 30-day idle limit, so no response needs to re-set the cookie.
- **Numeric `trustProxy`** fails closed in this Fastify version, so a hop-counting function is used.
- **Email change** needs a code from each inbox, checked as one decision: a session alone must not be able to move an account, because a
  phone can be borrowed. The current-address code is bound to the requested new address. Success signs out other devices and notifies the old
  address, neutrally.
- **Sign-in notice**: every sign-in after an account's first mails its owner the device label and how to sign out everywhere. New
  sessions cannot be told from old devices, because nothing identifying a device is stored, so a returning device also gets one.
- **Padding**: every sealed text is padded inside `crypto.ts` before AES-GCM, to a fixed size (mood entries pad to 2 KB, so all are one size) or in steps (journal 4 KB, safety plan 16 KB), so that a database dump
  cannot read a severity or a length.
- **Audit times** are to the UTC day, enforced by a `CHECK`, so audit rows cannot be joined to session times.
- **Erasure**: rows go at once. Encrypted backups keep a copy until they age out, `BACKUP_RETENTION_DAYS` later, and a backup plus the master
  key can still decrypt it until then. The app says so.

## Rate limiting and several instances

Limits are per client (IPv4 address, or IPv6 /64), held in each process's memory, and reset on restart. With N instances
an attacker effectively gets N times the limit. What must hold regardless lives in Postgres and does not have this
weakness: the send quotas, the failed-guess cap and 5 attempts per code. Before running several instances, move
`@fastify/rate-limit` to a shared store such as Redis. Many users in India share an address through carrier NAT, so
keep per-IP limits generous and rely on the database limits for per-account protection.

Known costs, accepted: many clients can spend an address's 20 sign-in codes an hour, or (with four mails, which the owner sees) its 20 failed
sign-in guesses for a day, delaying that person's sign-in. Their active sessions, and their email-change and deletion codes, are unaffected.

## Client address on Render

Render's reference docs do not describe this. What the evidence supports:

- Render's own [PocketBase guide](https://render.com/articles/host-pocketbase-on-render) says Cloudflare writes `CF-Connecting-IP` on every request
  reaching a web service and overwrites what the caller sent, and warns against the left of `X-Forwarded-For`.
  Its [DDoS article](https://render.com/articles/how-render-handles-ddos-attacks) says all inbound traffic passes through Cloudflare.
- People report seeing `X-Forwarded-For: <client>, <Cloudflare edge>, 10.x` ([arcjet#3899](https://github.com/arcjet/arcjet-js/issues/3899)), and that a
  client's own value stays on the left ([feedback board](https://feedback.render.com/features/p/send-the-correct-xforwardedfor)). So no hop count works:
  counting from the right lands on a Cloudflare edge or a 10.x proxy, which many people share and which throttles sign-in
  for all of them, and counting to the left end lets a client choose its own address.

So `render.yaml` sets `CLIENT_IP_HEADER=cf-connecting-ip`. If the header is missing or malformed, the hop count is the fallback. **This has not been
verified against a live Render service.** Check it once after the first deploy:

```sh
URL=https://<your-service>.onrender.com/api/v1/meta
r() { curl -s -o /dev/null -D - "$@" "$URL" | grep -i '^x-ratelimit-remaining'; }
r; r                                 # Falls by one: you have a bucket.
r -H 'X-Forwarded-For: 203.0.113.9'  # Falls by one again: forging this gets no new bucket.
r -H 'CF-Connecting-IP: 203.0.113.9' # Falls by one again, or Cloudflare refuses it. A jump back up means forgery works: fix before launch.
```

Then run `r` from another network, such as a phone hotspot. It must start near the full 600, showing that the two of you do not share a bucket.
Finally, search the Render logs for `client ip resolved`. The address is never logged, only its kind, once per kind and per process, ignoring health
checks. Expect `public IPv4 via header` or `public IPv6 via header`. `private/proxy` or `via hops` on real traffic means the header is not arriving,
and everyone may be sharing a bucket: do not launch until that is understood.

## Deploying

1. Create the Supabase project (Mumbai) and download its CA certificate.
2. `npm run db:setup`, from `.env.setup` (see `.env.setup.example`). It keeps the generated secrets in a gitignored file. Store them in Render
   and a separate secret store: losing `ENCRYPTION_KEYS` loses all user data. Full steps: `docs/DEPLOYMENT.md`.
3. In Render, create the service from `render.yaml` and fill in the `sync: false` values. See `.env.example`.
4. `DATABASE_URL` uses the Supavisor **session** pooler with `anxiocare_runtime.<project-ref>`. Transaction mode is not supported.
5. Render's pre-deploy step shares the service's environment, so `DATABASE_MIGRATION_URL` is present there. The start command removes it for the
   server. See `docs/SECURITY-EXCEPTIONS.md` for what remains.
6. Run the client-address check above, and confirm `BACKUP_RETENTION_DAYS` against your Supabase plan, since the app states it to people.
7. Enable GitHub secret scanning and push protection on the repository. Never commit `.env`.

## Rotating the master key

1. Add a key and activate it: `ENCRYPTION_KEYS="v1:<old>,v2:<new>"`, `ENCRYPTION_ACTIVE_KEY=v2`. Deploy.
2. `npm run rotate-keys -w @anxiocare/api` with the same environment. Safe to re-run.
3. Remove `v1`. Deploy.
