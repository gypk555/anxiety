# Deployment

From nothing to live, in order. This is for the owner, working alone. Expect about a day of work, plus waiting for DNS and for email approval.

**This path has never been run.** The app has only run against a local Postgres. Steps marked **first-run check** confirm something that could not be tested from here. If one fails, stop and read the troubleshooting notes. Do not weaken a check to make it pass.

Dashboards change their labels. If a button has moved, follow the linked vendor document, and let the idea guide you. All of this was checked against vendor docs on 2026-11-06. The order of everything you must do, including non-technical items, is in the [launch checklist](LAUNCH-CHECKLIST.md).

For what the commands do, see [`apps/api/README.md`](../apps/api/README.md). For the schema, see [DATABASE.md](DATABASE.md).

## Before you start

You need:

- The code on GitHub's `main` branch. `render.yaml` deploys from `main`, and **today the code is uncommitted on `production-rebuild`**. See [Commit and merge](#step-0-commit-and-merge).
- Node 24 or newer locally, and `npm`. CI and Render use the version in `.node-version` (26).
- `psql` for the TLS check. On a Mac: `brew install libpq`.
- A password manager, to act as the **secret store**. Keep it separate from your Render account. Losing `ENCRYPTION_KEYS` loses all user data forever.
- A domain for the app, and a **separate, neutral domain for mail**. See [step 5](#step-5-set-up-mail).
- A card. Supabase Pro and a Render paid instance are both needed. See [costs](OPERATIONS.md#costs).
- Multi-factor authentication turned on for GitHub, Supabase, Render, your mail provider, your domain registrar and the mailbox they all send to.

## Step 0: commit and merge

The repository is [public](https://github.com/gypk555/anxiety) at the time of writing. Everything you commit can be read by anyone.

```sh
git status                         # Read it. No .env file, no keys, no real addresses.
git add -A
git diff --cached --stat | less    # Read it again.
git commit -m "Production rebuild"
git push -u origin production-rebuild
```

Open a pull request into `main`. GitHub Actions runs CI and CodeQL for the first time. **Both must pass, and the `e2e` job can take up to 45 minutes.** If something fails, fix it on the branch. See the [testing docs](testing/) for how the tests work.

Before merging, turn on secret scanning and push protection: repository **Settings**, **Advanced Security** (or **Code security**), and enable both.

Merge into `main`.

## Step 1: create the Supabase project

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and create an organisation. Choose the **Pro** plan. [Free projects have no automatic backups and pause after a week of inactivity](https://supabase.com/pricing), so they aren't acceptable here.
2. **New project.**
   - **Name:** something neutral, like `prod-db`.
   - **Database password:** use **Generate a password**. Save it in the secret store as "Supabase postgres password". Choosing letters and digits only saves percent-encoding later.
   - **Region:** **South Asia (Mumbai)**, `ap-south-1` ([region list](https://supabase.com/docs/guides/platform/regions)).
3. Wait for it to finish, and note the **project ref**, the random part of the URL `supabase.com/dashboard/project/<project-ref>`.
4. Turn the REST API off, because nothing uses it. Open the **Data API** integration, and turn off **Enable Data API**. Supabase says that with it off, "none of the auto-generated REST endpoints respond, regardless of grants or RLS" ([docs](https://supabase.com/docs/guides/api/securing-your-api)). If you see this choice while creating the project, turn it off there.

## Step 2: connection strings and the CA certificate

1. Click **Connect** at the top of the project. Choose **Session pooler**. Copy the host, which looks like `aws-<index>-ap-south-1.pooler.supabase.com`. The `<index>` can't be guessed ([docs](https://supabase.com/docs/guides/database/connecting-to-postgres)), so use yours, even though `.env.example` shows `aws-0`.
   - Use **port 5432**, session mode. Port 6543, transaction mode, is not supported by this app.
   - The direct connection is IPv6 unless you buy an add-on, so use the pooler.
2. Write the two URLs into the secret store. Percent-encode any reserved characters in a password.

   ```
   DATABASE_MIGRATION_URL=postgres://postgres.<project-ref>:<postgres password>@<pooler host>:5432/postgres
   DATABASE_URL=postgres://anxiocare_runtime.<project-ref>:<runtime password>@<pooler host>:5432/postgres
   ```

   The runtime password comes in step 3.
3. **Project Settings**, **Database**, **SSL Configuration**: **download the certificate**. ([docs](https://supabase.com/docs/guides/platform/ssl-enforcement))
4. On the same page, turn on **Enforce SSL on incoming connections**. It causes a short restart, so do this now rather than later. Supabase's docs say this setting governs both legs of the shared pooler: client to pooler, and pooler to Postgres.
5. Turn the certificate into one line, for Render:

   ```sh
   base64 -i ~/Downloads/<certificate file> | tr -d '\n'
   ```

   Save the output as `DATABASE_CA_CERT`.
6. **First-run check: the certificate must verify through the pooler.** People have reported certificate errors in this setup ([example](https://github.com/powersync-ja/self-host-demo/issues/38)), and Supabase's docs use this exact mode, so test it before Render does:

   ```sh
   psql "host=<pooler host> port=5432 dbname=postgres user=postgres.<project-ref> sslmode=verify-full sslrootcert=$HOME/Downloads/<certificate file>"
   ```

   You should get a prompt, and `\conninfo` should mention SSL. **If you get a certificate error, do not turn verification off.** Download the certificate again, then ask Supabase support which CA signs the pooler. **Could not be confirmed from here:** whether the CA in the dashboard signs the pooler's certificate for every project. The app has no setting to skip verification, and it should not gain one.

## Step 3: set up the database

**`db:setup` and `db:verify` have never met a real Supabase project.** They are tested only against embedded Postgres, set up to resemble it: a non-superuser admin role and TLS with a pinned certificate. Read what they print. If anything looks wrong, stop.

On your own computer, in the repository:

```sh
npm ci
cp .env.setup.example .env.setup
```

Git ignores `.env.setup`. Open it in an editor, on your machine:

- `ADMIN_DATABASE_URL`: the migration URL from step 2, with your database password.
- `DATABASE_CA_PATH`: the certificate you downloaded in step 2.

Your secrets stay on your machine. Never paste them into a chat, an issue or a ticket, including to an assistant helping you.

Then:

```sh
npm run db:setup
```

It connects with TLS verified against your certificate, generates the app secrets once into `.env.secrets`, which git also ignores and which it keeps readable by you alone (mode `0600`, fixed on every run if a copy was made looser), creates or updates the `anxiocare_runtime` role, runs the migrations, and runs the verification. It's safe to run again: it never overwrites a secret, and only adds a name that's missing. It never prints your connection password. It also leaves the generated values out of the terminal, so they can't end up in scrollback or a pasted log, and says where they are. `--show-secrets` prints them if you need that.

- **Copy `.env.secrets` into the secret store now, and keep a second copy of `ENCRYPTION_KEYS` and `PASSWORD_PEPPER`.** Losing `ENCRYPTION_KEYS` makes all user data unreadable. Losing `PASSWORD_PEPPER` makes everyone reset their password.
- The role's password goes to Postgres as a SCRAM verifier, so the plain password isn't in the SQL editor history or the server's statement log.

**If you'd rather do this by hand:** `npm run generate-secrets -w @anxiocare/api` prints the same secrets once, and SQL to run in the SQL editor, which then holds that password in its history.

**A first-run check: the runtime role.** If `db:setup` stops at the role with a permissions error, tell Supabase's support you are creating a login role as `postgres`. Do not give the runtime role more power to get past it.

## Step 4: check the database

```sh
npm run db:verify
```

A read-only report. Every line must say `PASS`: TLS verified, Postgres version, schema `app` exists, nothing of ours in `public`, RLS on all tables, policies limited to the runtime role, runtime role attributes and grants, migrations applied with checksums, and `anon` and `authenticated` denied. A `FAIL` has a `Fix:` line under it. Run it again at any time. It changes nothing.

## Step 5: set up mail

Sign-in depends on this. Nothing works without it.

### Choose a neutral sender domain

Mail appears on lock screens and in shared inboxes, so the sender must not give away what the app is.

**Production refuses to start** if the sender name or address matches this pattern, anywhere, in any case (`apps/api/src/config.ts`):

```
anxi | mental | health | therap | depress | wellness | wellbeing | psych | counsel | stress | panic
```

So `no-reply@anxiocare.in` is refused, because of `anxi`. Buy a separate domain that says nothing, such as `no-reply@acct-mail.example`. The code only checks `MAIL_FROM`, so it's up to you to make sure that the DKIM and Return-Path domains are neutral too, since anyone who opens the headers can see them.

The display name defaults to `Account Team`, and can be set with `MAIL_FROM_NAME`.

### Choose a provider

Any SMTP provider that supports TLS and DKIM will work. Compare on:

- **Where mail is processed**, because it sees addresses and codes in plaintext. An India region helps your cross-border position.
- **A data processing agreement** you can accept.
- **How long it keeps message content, and whether you can turn that off.** Sign-in codes in a provider's logs are a risk. Find out.
- Transactional reputation, and price.

**Amazon SES** is the example below, because it has a Mumbai region and a low price ([pricing](https://aws.amazon.com/ses/pricing/): $0.10 per 1,000 emails, à la carte). This has not been tested with the app. Other providers will work in the same way, and none has been assessed here.

### Set up Amazon SES

1. In the AWS console, switch the region to **Asia Pacific (Mumbai)**. Open **Amazon SES**.
2. **Identities**, **Create identity**, **Domain**. Enter your neutral domain. Under **Advanced DKIM settings**, use **Easy DKIM**.
3. Add the three CNAME records it shows to your domain's DNS. Wait for the status to read **Verified**.
4. In the identity, set a **custom MAIL FROM domain**, such as `bounce.<neutral domain>`, using the MX and SPF TXT records it shows. This is what aligns SPF for DMARC.
5. **SMTP settings**: note the endpoint, which should have the form `email-smtp.ap-south-1.amazonaws.com`. **Use the value on that page.** Note the port, and choose **587**.
6. **Create SMTP credentials.** AWS creates an IAM user, and gives you a username and password. Save them as `SMTP_USER` and `SMTP_PASS`. These are not your AWS keys.
7. New accounts are in a **sandbox**, where you can only mail verified addresses. **Account dashboard**, **Request production access.** Describe it honestly as transactional sign-in codes and security notices, and state that you handle bounces. This can take a day. Until then, verify your own address so you can test.

See the [SES documentation](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/resources.html) for regions and endpoints. **The Mumbai SMTP hostname could not be confirmed from AWS's documentation here**, only the pattern.

### SPF, DKIM and DMARC

All three matter. Without them, mail lands in spam, and a person can't sign in.

| Record | What it does | Where it comes from |
| --- | --- | --- |
| **SPF** | Says who may send for the domain. | A TXT record such as `v=spf1 include:amazonses.com ~all`, on the MAIL FROM subdomain, as shown by SES. Use only your provider's value. |
| **DKIM** | Signs each mail. | CNAME or TXT records, from your provider. |
| **DMARC** | Says what to do if those fail, and sends you reports. | You add it. |

Add this DMARC record yourself:

```
Name:  _dmarc.<neutral domain>
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:<a mailbox you read>
```

Start at `p=none`. After two weeks of clean reports, move to `p=quarantine`, and then `p=reject`. See [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489).

Also set `MAIL_PROVIDER` to the provider's name, such as `Amazon Web Services`. It appears in the privacy notice. Left blank, it reads "our email provider".

**Cannot use a free Render instance.** Render blocks outbound SMTP ports 25, 465 and 587 on free web services ([changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)). A paid instance is required, and `render.yaml` asks for one. Port 25 may be blocked anyway. Use 587 or 465.

## Step 5a: optional, Google sign-in

Skip this and the button stays hidden. You can add it later. Choosing Google tells Google a person uses this service, which is why it's only ever their choice, and the screen and notice say so. **This has never run against real Google.** Tests use a fake provider.

1. At [console.cloud.google.com](https://console.cloud.google.com), create a project of its own for this service.
2. **Google Auth Platform**, **Branding**: fill in the OAuth consent screen. The app name people see there will appear on their screen, so think about who may be looking at it. **Audience:** External, then publish it. ([docs](https://support.google.com/cloud/answer/10311615))
3. **Data access:** add only the `openid` and `.../auth/userinfo.email` scopes. No others, so Google doesn't send a name or photo.
4. **Clients:** create an OAuth client of type **Web application**. Add this **Authorized redirect URI**, exactly, and no others: `https://<your origin>/api/v1/auth/google/callback`. `npm run doctor` prints the exact one. When you change `PUBLIC_ORIGIN` in step 10, add the new one, and remove the old one.
5. Keep the **client ID** and **client secret** in the secret store, as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set both, or neither. The server refuses one without the other.

## Step 6: create the Render service

1. Sign in at [dashboard.render.com](https://dashboard.render.com), and connect your GitHub account, granting access to this repository.
2. **New**, **Blueprint**. Choose the repository and the `main` branch. Render reads `render.yaml`.
3. **First-run check, and the cost.** `render.yaml` says `plan: starter`, Render's cheapest paid instance. It's chosen because pre-deploy commands need a paid instance, and a free one sleeps when idle, which would stop the purge and make Help slow to load. **Budget about $7 a month for this one instance.** That figure is from memory of Render's price list: on 2026-11-06 an automated read of [its pricing page](https://render.com/pricing) showed no instance prices, so confirm it there before you rely on it. You pay it even with no users, and Supabase Pro is a separate cost. Render's price list still shows Starter (0.5 CPU, 512 MB), but the current [Blueprint reference](https://render.com/docs/blueprint-spec) lists plan IDs such as `0.5c-512mb`, and doesn't mention `starter`. If Render refuses the file, that line needs to change to `0.5c-512mb`. Pre-deploy commands need a paid instance.
4. Render prompts for each `sync: false` value. **It asks only this once** ([docs](https://render.com/docs/blueprint-spec)). You can add or change values later, under the service's **Environment**.

### Every environment variable

Values marked **render.yaml** are set for you. Validation is in `apps/api/src/config.ts`. The server refuses to start on anything invalid, and names the variable, never its value.

| Variable | Required | Value | Where it comes from |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | **render.yaml** |
| `CLIENT_IP_HEADER` | On Render | `cf-connecting-ip` | **render.yaml**. Checked in [step 11](#step-11-check-the-client-address). |
| `TRUST_PROXY_HOPS` | No, default 1 | `1` | **render.yaml** |
| `MAIL_TRANSPORT` | Yes | `smtp` | **render.yaml**. `file:` is refused in production. |
| `BACKUP_RETENTION_DAYS` | No, default 7 | `7` | **render.yaml**. **Stated to people in the privacy notice.** Must match your Supabase plan: Pro 7, Team 14, Enterprise up to 30 ([docs](https://supabase.com/docs/guides/platform/backups)). If you add PITR, match its retention instead. |
| `PUBLIC_ORIGIN` | Yes | `https://<service>.onrender.com` for now. Exact origin. No path, no trailing slash. | Render shows the URL once the service exists. Service name `anxiocare` gives `https://anxiocare.onrender.com`, unless taken. Guess now, and correct it in step 10. |
| `DATABASE_URL` | Yes | Runtime URL | Step 2. Production refuses `postgres` or `supabase_admin` as user. |
| `DATABASE_MIGRATION_URL` | For migrate | Migration URL | Step 2. Must differ from `DATABASE_URL`. The start command removes it from the server. See [SECURITY-EXCEPTIONS.md](SECURITY-EXCEPTIONS.md). |
| `DATABASE_CA_CERT` | In production | One-line base64 | Step 2. |
| `ENCRYPTION_KEYS` | Yes | `v1:<base64>` | Step 3. |
| `ENCRYPTION_ACTIVE_KEY` | Yes | `v1` | Step 3. |
| `EMAIL_INDEX_KEY` | Yes | base64 | Step 3. Cannot be rotated later without a tool that doesn't exist yet. Also keys Google subject hashes. |
| `OTP_PEPPER` | Yes | base64 | Step 3. |
| `AUDIT_KEY` | Yes | base64 | Step 3. |
| `PASSWORD_PEPPER` | Yes | base64 | Step 3. Changing it later invalidates every password, and people then need "Forgot your password?". |
| `GOOGLE_CLIENT_ID` | No | From Google | Step 5a. Set with the secret, or leave both empty to hide the button. |
| `GOOGLE_CLIENT_SECRET` | No | From Google | Step 5a. |
| `MAIL_FROM` | Yes | `no-reply@<neutral domain>` | Step 5. |
| `MAIL_PROVIDER` | No | Provider's name | Step 5. Shown in the privacy notice. |
| `SMTP_HOST` | Yes for smtp | Host | Step 5. |
| `SMTP_PORT` | No, default 587 | `587` | 587 uses required STARTTLS, 465 implicit TLS. |
| `SMTP_USER` | In production | Username | Step 5. |
| `SMTP_PASS` | In production | Password | Step 5. |
| `OPERATOR_NAME` | Yes | Your legal name or entity | Your decision, with the lawyer. **Shown publicly as the data fiduciary.** |
| `GRIEVANCE_EMAIL` | Yes | A monitored address | Yours. Shown publicly. It may be on any domain. |

Optional. Not in `render.yaml`. Add under **Environment** only if needed:

| Variable | Default | When |
| --- | --- | --- |
| `MAIL_FROM_NAME` | `Account Team` | Different neutral name. |
| `DATA_LOCATION` | `Mumbai, India` | Only if you deploy elsewhere. Stated in the notice. |
| `SERVER_LOCATION` | `Singapore` | Same. |
| `LOG_LEVEL` | `info` | Don't raise it in production. |
| `PASSWORD_ARGON2_MEMORY_KIB` | 19456 | To raise hashing cost. Refused below OWASP's minimum and above 65536. Stored hashes upgrade at each person's next sign-in. Up to three hashes run at once (one kept for known devices), so the ceiling means at most 192 MiB of hashing on a 512 MB instance. |
| `PASSWORD_ARGON2_PASSES` | 2 | The same. |
| `DATABASE_POOL_MAX` | 5 | See [scaling](OPERATIONS.md#scaling-beyond-one-instance). |
| `HOST` | `0.0.0.0` | Leave it. |
| `PORT` | 8787 | Render sets this. Leave it. |
| `WEB_DIST` | `apps/web/dist` | Leave it. |

`DEV_ORIGINS` and `GOOGLE_OIDC_BASE_URL` are refused in production. Never set them.

### Check the whole environment first

Before you press **Apply**, put the production values in a file git ignores, such as `.env.production.local`, and on your own computer run:

```sh
npm run doctor -- --file=.env.production.local
```

It checks everything without starting the server, sends no mail and changes nothing: the config against production's rules, the database connection and role, SMTP connect and sign-in, Google's shape, and the public origin. Each failure says how to fix it, and no secret value is printed. **It has never met real Supabase, real SMTP or real Google.** `PUBLIC_ORIGIN` isn't known until the service exists, so run it again once it does.

5. **Apply.** The first deploy runs:
   - **Build:** `npm ci --include=dev --ignore-scripts && npm run build`
   - **Pre-deploy:** `npm run migrate`
   - **Start:** `env -u DATABASE_MIGRATION_URL npm start`

**First-run check.** The build log should show the Node version from `.node-version`. Render reads it ([docs](https://render.com/docs/node-version)). **Node 26 availability on Render was not confirmed.** The deploy will fail clearly if it's missing, in which case set `.node-version` to the newest version that Render offers (24 or above), with CI in step.

`autoDeployTrigger: checksPass` means later pushes to `main` deploy only after all CI checks succeed, and if no checks are found, [no deploy happens](https://render.com/docs/deploys). If the very first deploy doesn't start, use **Manual Deploy**.

## Step 7: migrate

This happens in pre-deploy. In the deploy's log, look for:

```
Applied: 001_init.sql, 002_accounts.sql
```

If you ran `npm run db:setup` first, as above, it says `No pending migrations`, as does every later deploy. If a pre-deploy fails, [the deploy stops, and the old version keeps running](https://render.com/docs/deploys).

To run it from your own computer instead:

```sh
NODE_ENV=production DATABASE_MIGRATION_URL='<migration url>' DATABASE_CA_CERT='<base64>' npm run migrate
```

## Step 8: read the start-up log

Open **Logs**. Good signs: a listening line, and `purge_completed` about a minute after start.

| You see | It means | Do |
| --- | --- | --- |
| `Invalid configuration:` and a list | A variable is missing or invalid. It names which. | Fix it under **Environment**. |
| `the sender name and address must not reveal the nature of the service` | Your sender matches the pattern above. | Change `MAIL_FROM` or the name. |
| `must use the least-privilege runtime role` | `DATABASE_URL` uses an admin user, or the role is too powerful. | Use `anxiocare_runtime.<project-ref>`. |
| `database_check_failed` | The server cannot reach the database, or a query failed. Check password, host, port, username format and CA. | See below. |
| `SELF_SIGNED_CERT_IN_CHAIN`, `DEPTH_ZERO_SELF_SIGNED_CERT` | CA does not match. | Repeat the `psql` test in step 2. |
| `ERR_TLS_CERT_ALTNAME_INVALID` | Hostname doesn't match. | Use the host from **Connect**, not an IP address. |
| Fails with a role or tenant error on the pooler | Username format. | It must be `anxiocare_runtime.<project-ref>`. **A custom role through the pooler, while documented by Supabase, has not been tested live.** |

Then check the health routes:

```sh
curl -s https://<service>.onrender.com/healthz    # {"status":"ok"}
curl -s https://<service>.onrender.com/readyz     # {"status":"ok"}, or 503 if the database is unreachable
```

## Step 9: verify the database after the first migration

Do not skip this. It confirms that the REST API can't reach health data. `npm run db:verify` from step 4 covers the first three queries here. Run it again now, and in the SQL editor:

```sql
-- 1. Our tables are in app, and none are in public.
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname IN ('app', 'public') ORDER BY 1, 2;
-- Expect 12 rows in app, with rowsecurity true. Nothing of ours in public.

-- 2. Supabase's API roles cannot use the schema.
SELECT r, has_schema_privilege(r, 'app', 'USAGE') AS can_use
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
-- Expect false for all three.

-- 3. The runtime role passes, and owns nothing.
SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'app';
-- Expect an owner other than anxiocare_runtime.

-- 4. No data is readable as plain text. Run after a test account exists.
SELECT email_ct, dek_key_version, consent_version FROM app.users LIMIT 3;
-- Expect bytes for email_ct, not an address.
```

From a terminal, use your project URL, and the **publishable** (or `anon`) key from **Project Settings**, **API Keys**:

```sh
curl -si "https://<project-ref>.supabase.co/rest/v1/users" -H "apikey: <publishable key>" | head -20
curl -si "https://<project-ref>.supabase.co/rest/v1/users" -H "apikey: <publishable key>" -H "Accept-Profile: app" | head -20
```

**Neither may return data.** With the Data API off, expect an error status. With it on, the second should give a [`PGRST106`](https://docs.postgrest.org/en/stable/references/api/schemas.html) error. **The exact response with the Data API off was not confirmed.** Any JSON array or row is a serious problem: stop, and do not launch.

Also check **Data API** settings, if the page is available: `app` must never be in **Exposed schemas**.

Optional: Supabase offers network restrictions for the database, in its settings, though how they apply to the shared pooler was not confirmed here. You could limit connections to the CIDR ranges shown in Render, under your service's **Connect**, **Outbound** tab ([docs](https://render.com/docs/outbound-ip-addresses)). Those ranges are shared by everyone in the region, so this helps only a little, and you would need to add your own address for maintenance.

## Step 10: custom domain and PUBLIC_ORIGIN

1. Choose the domain. **HSTS is sent with `includeSubDomains` for a year** (`app.ts`). Browsers will then refuse plain HTTP for that host and every subdomain under it. If that matters for other services on the same domain, use a subdomain, such as `app.example.in`.
2. Render, service **Settings**, **Custom Domains**, **Add Custom Domain**. [Docs](https://render.com/docs/custom-domains). Adding `www` also adds the root and redirects one to the other, and vice versa.
3. Add the DNS records that Render shows. **Remove any AAAA records.** If you have CAA records, allow Let's Encrypt and Google Trust Services.
4. If your DNS is on Cloudflare, use **DNS only (grey cloud)**. A second Cloudflare layer could change what `cf-connecting-ip` holds, and **that case hasn't been tested**.
5. Click **Verify**. Wait for the certificate. A short-lived 502 can be normal.
6. **Change `PUBLIC_ORIGIN`** to the final address that people will use, exactly, such as `https://app.example.in`. It must be the one that the other redirects to. Save and deploy.
   - If this doesn't match the address in the browser, every sign-in fails with `403 csrf_failed`.
7. Service **Settings**, **Render Subdomain**: disable it, so that the `onrender.com` address answers 404. Otherwise a second address serves a site where sign-in can't work. This requires a custom domain.

## Step 11: check the client address

Rate limits depend on this. **Not yet verified on a live Render service.** Full reasoning is in [`apps/api/README.md`](../apps/api/README.md#client-address-on-render).

```sh
URL=https://<your domain>/api/v1/meta
r() { curl -s -o /dev/null -D - "$@" "$URL" | grep -i '^x-ratelimit-remaining'; }
r; r                                 # Falls by one: you have a bucket.
r -H 'X-Forwarded-For: 203.0.113.9'  # Falls by one again: forging this gets no new bucket.
r -H 'CF-Connecting-IP: 203.0.113.9' # Falls by one again, or Cloudflare refuses it. A jump back up means forgery works: fix before launch.
```

Then run `r` from another network, such as a phone hotspot. It must start near the full 600, showing that the two of you don't share a bucket.

Finally, search the Render logs for `client ip resolved`. Expect `public IPv4 via header` or `public IPv6 via header`. If you see `private/proxy` or `via hops` on real traffic, the header isn't arriving, and everyone may be sharing a bucket. **Do not launch until that's understood.**

## Step 12: post-deploy smoke test

Use a real phone, on mobile data, with a real address you own. The full test is in [MANUAL-TEST-CASES.md](testing/MANUAL-TEST-CASES.md), which must also pass before launch. This is the short version.

1. **Headers.**

   ```sh
   curl -sI https://<your domain>/ | grep -iE 'content-security-policy|strict-transport|referrer-policy|x-content-type|cache-control'
   curl -s https://<your domain>/api/v1/meta
   ```

   Check the operator name, grievance address, backup days, locations and mail provider.
2. **Help first.** Open the app. Tap **Get help**. Tap a call button and confirm the dialler opens with the number (then hang up). Turn on flight mode, reload Help, and confirm that it still works.
3. **Guest.** Do a check-in. See the result, the screening wording and the self-harm line.
4. **Create an account.** Use your address, with a password, and let your password manager save it. The code should arrive within a minute. **Open the mail, and view the source or original message. Look for SPF, DKIM and DMARC: pass.** Check the sender and the subject give nothing away. Check it isn't in spam, on Gmail at least.
5. **Consent.** Read it. The boxes start unticked. Accept. Save a check-in, and add a thought record.
6. **Privacy notice.** Open it. Confirm that operator, grievance contact, locations, provider and backup days are right. **It must be the version that your lawyer approved.**
7. **Second device.** Sign in on another browser with your password. Then try **Email me a code instead**, **Forgot your password?** and, if you turned it on, **Continue with Google**. Check that you get the sign-in notice mail, and that both sessions are listed. End one.
8. **Database.** Run `SELECT count(*) FROM app.users;` and the raw query from step 9. It should show no address in plain text.
9. **Download.** Settings, download data. Open the JSON, and check it's yours.
10. **Logs.** Search Render's logs for your email address. **There must be no results.** Search for `background_task_failed`, `request_failed`, `decrypt_failed`. There should be none.
11. **Delete.** Settings, delete account, using the mailed code. Check `SELECT count(*) FROM app.users;` went down.
12. **Readiness.** `/readyz` still answers ok.

Keep one **canary account** afterwards, with a known check-in, for testing restores. See [OPERATIONS.md](OPERATIONS.md#test-a-restore).

## Step 13: turn on GitHub branch protection

[Available on public repositories on GitHub Free](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). If the repository ever goes private on a free plan, this may stop working, along with CodeQL.

Repository **Settings**, **Branches**, **Add branch protection rule** (or a ruleset). For `main`:

- [x] Require a pull request before merging. You can't approve your own PR, so leave the approvals count at 0 unless you have a second person.
- [x] Require status checks to pass before merging. Search for and add `verify`, `e2e`, and `analyze`. Each appears only after it has run once, which is why step 0 comes first.
- [x] Require branches to be up to date before merging.
- [x] Do not allow bypassing the above settings.
- [ ] Allow force pushes: **off**.
- [ ] Allow deletions: **off**.

Also confirm these are on: **Dependabot alerts** and **security updates**, **secret scanning**, **push protection**, and **private vulnerability reporting** ([SECURITY.md](../SECURITY.md)).

## Rollback

**To undo a bad deploy:** Render dashboard, service, **Events** or **Deploys**, find the last good deploy, and choose **Rollback**. ([docs](https://render.com/docs/rollbacks))

Know what that does:

- **Auto-deploy is turned off** by a dashboard rollback. Fix the problem, then turn it back on in **Settings**, or new merges won't ship.
- **Environment variables go back to the target deploy's values.** If you rotated a key, or changed `PUBLIC_ORIGIN`, since then, the old values return. **Rolling back past a master-key rotation breaks everything**: the old deploy doesn't have the new key, and every read answers 500. Fix `ENCRYPTION_KEYS` right after, or don't go back that far.
- **The database does not roll back.** Migrations go forward only.
- **Rollback and migrations.** Render's docs don't say whether a rollback re-runs the pre-deploy command. If it does, and a newer migration has been applied, `npm run migrate` stops with `applied migration ... is missing from disk`. The deploy fails, and the current version keeps serving. In that case, don't edit the history. Write a new forward migration, or fix forward.
- Old code on a newer schema may fail. So keep migrations backward compatible with the previous release wherever you can.
- You can only roll back to a build that Render still keeps. It keeps a limited number by plan.

**To undo a data problem:** see [restoring production](OPERATIONS.md#restoring-production). This is far more disruptive, and has consequences for erased accounts.

**Never** edit an applied migration file. The checksum check will block every future deploy.

## Sources

Checked 2026-11-06: [Render Blueprint spec](https://render.com/docs/blueprint-spec), [deploys](https://render.com/docs/deploys), [rollbacks](https://render.com/docs/rollbacks), [custom domains](https://render.com/docs/custom-domains), [Node version](https://render.com/docs/node-version), [outbound IPs](https://render.com/docs/outbound-ip-addresses), [free tier SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports). [Supabase connecting](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement), [securing the API](https://supabase.com/docs/guides/api/securing-your-api), [regions](https://supabase.com/docs/guides/platform/regions), [pricing](https://supabase.com/pricing), [backups](https://supabase.com/docs/guides/platform/backups). [Amazon SES pricing](https://aws.amazon.com/ses/pricing/), [regions](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/resources.html). [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). [PostgREST schemas](https://docs.postgrest.org/en/stable/references/api/schemas.html).

**Could not confirm:** Supabase dashboard labels beyond those quoted in its docs, the Starter price, `plan: starter` being accepted, Node 26 on Render, the Mumbai SMTP host, the REST response with the Data API off, whether a Render rollback runs pre-deploy, and every **first-run check** above.
