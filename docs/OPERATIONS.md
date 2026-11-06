# Operations

Runbooks for running AnxioCare alone. Before launch, read this once from top to bottom. During an incident, jump to [incident response](#incident-response).

Related: [DEPLOYMENT.md](DEPLOYMENT.md), [THREAT-MODEL.md](THREAT-MODEL.md), [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md), [CLINICAL-SAFETY.md](CLINICAL-SAFETY.md), [`apps/api/README.md`](../apps/api/README.md).

**Commands.** Run `npm run ... -w @anxiocare/api` in Render's **Shell** page, which is [available on paid web services](https://render.com/docs/ssh). Render's page doesn't say that the shell has the service's environment, so check first: `printenv ENCRYPTION_ACTIVE_KEY` should print a version such as `v1`. If it doesn't, run it from your own computer with the values in a `.env.ops` file, which is gitignored: `set -a; . ./.env.ops; set +a`. Delete that file afterwards.

**SQL.** "SQL editor" means Supabase's, which runs as `postgres`, the table owner, and so sees through row level security. Don't paste email addresses into it, because it keeps a history. Use hashes.

## Routine schedule

| How often | Task |
| --- | --- |
| Each day, to start with | Check the [log signals](#logs). Read the grievance and security mailboxes. |
| Weekly | Review Dependabot pull requests. Confirm that `purge_completed` appears. |
| Monthly | Read [SECURITY-EXCEPTIONS.md](SECURITY-EXCEPTIONS.md) against `npm audit`. Check DMARC reports and bounces. |
| Quarterly (Feb, May, Aug, Nov) | [Call every helpline](CLINICAL-SAFETY.md#helpline-verification). [Test a restore](#test-a-restore). Check who has access to each vendor account. Re-check the law's status ([tracker](PRIVACY-COMPLIANCE.md#what-applies-when)). |
| Yearly | Review the threat model, clinician sign-off and legal notice. Consider master key rotation. |

## Monitoring and health checks

The app has **no third-party analytics, error trackers or browser scripts**, and it must stay that way. Do not add Sentry, Google Analytics or similar. Monitoring is from the outside, and from logs.

| Endpoint | What it says | Uses |
| --- | --- | --- |
| `GET /healthz` | Process is up. No database. No rate limit. Answers `{"status":"ok"}`. | Render's health check, from `render.yaml`. |
| `GET /readyz` | `SELECT 1` worked. `{"status":"ok"}` or 503 `{"status":"unavailable"}`. | **Point your external uptime check here.** |
| `GET /api/v1/meta` | Public config, no secrets. | Confirm settings by eye. |

**Note that Render's check doesn't touch the database.** A database outage leaves the service "live" in Render's eyes. So:

- Set up one external uptime check, pinging `/readyz` every few minutes, with an alert to your phone. A hosted monitor sees only the status of a URL with no user data, so it isn't a tracker. It is a new vendor all the same, so choose one and record it. None has been assessed here.
- Turn on deploy and failure email notifications in Render's settings.
- Supabase's dashboard shows database CPU, memory, disk and connections. Look weekly at first. Pro has a [compute credit](https://supabase.com/pricing) that covers a Micro instance only, so a larger database costs more.

## Logs

**Where.** Render, the service, **Logs**. Search with text and `level` filters. [Retention by workspace plan](https://render.com/docs/logging): Hobby 7 days, Pro 14, Scale and Enterprise 30. Older logs are gone, even after an upgrade. Log streaming to another vendor would make it a new processor, so talk to the lawyer first. The [legal position on log retention](PRIVACY-COMPLIANCE.md#retention-and-rule-83) is open.

**What logs contain.** Method, route template, status, duration, request id, error class and code, stack frames. **Never** email addresses, IPs, cookies, bodies or query strings (`apps/api/src/logger.ts`, proved by `logging.test.ts`). Keep `LOG_LEVEL=info`.

A person reporting a problem can give you the `requestId` from an error. Search for it. The logs will show the route and status, not who they are. That's by design, and it makes investigations harder.

| Search for | Meaning | Do |
| --- | --- | --- |
| `background_task_failed` with `task: otp_delivery` | **Sign-in mail isn't sending.** The person still saw a normal 202, and will never get a code. | Check the error `code`. Check SMTP credentials, sender verification, provider status and sending limits. [Mail failure](#mail-failure). |
| `background_task_failed` with `signin_notice` or `email_change_notice` | A security notice failed. | Same. |
| `request_failed` | A 500. Class and frames only. | A pattern means a bug. |
| `decrypt_failed` | Ciphertext didn't authenticate: wrong key, or tampering. | **A key mismatch, or an incident.** If rising, go to [incident response](#incident-response). |
| `readiness_check_failed` | The database isn't reachable. | Check Supabase status. |
| `purge_completed` | Hourly job ran. Shows `{sessions, otpCodes, unconsentedUsers, auditRows}`. | Should appear about every hour, and 60 seconds after any start. |
| `purge_failed`, `otp_sweep_failed` | The hourly job, or the five-minute code sweep, failed. | Run the purge by hand, read the error. The notice's promises depend on these. |
| `client ip resolved: ...` | Once per kind, per process. Expect `public ... via header`. | `private/proxy` or `via hops` on real traffic: see [DEPLOYMENT.md](DEPLOYMENT.md#step-11-check-the-client-address). |
| `database_check_failed`, `DATABASE_URL must use...`, `Invalid configuration` | The server refused to start. | [DEPLOYMENT.md](DEPLOYMENT.md#step-8-read-the-start-up-log). |
| `fatal` | Process stopped on an uncaught error. | Render restarts it. Look for a loop. |
| Many `status: 429` | Abuse, or a shared address hitting a limit. | See if `via hops` appears. |
| Many `status: 403` with `csrf_failed` | `PUBLIC_ORIGIN` probably doesn't match. | Compare it with the address in the browser. |

## Purge job

**What it does** (`apps/api/src/purge.ts`). Removes: sessions past 30 days idle or 90 days total; accounts with no consent after 24 hours, along with their codes; code rows that are dead and over an hour old; failed guesses over 24 hours old; audit rows over a year old. It keeps accounts whose consent merely went out of date.

**When.** Inside the server process, 60 seconds after every start, and every hour while it runs. Dead code rows also get their own sweep every 5 minutes, because the hourly quota needs each row for an hour after it was sent, and an hourly job alone could then leave it for up to two. There is no separate cron. It is safe to run on several instances, or repeatedly.

**What that gives.** While the server is up: unconsented accounts go 24 to about 25 hours after they were created, consumed and expired code rows about an hour after they were sent (at most 1 hour 5 minutes), and failed guesses at 24 to about 25 hours. Backups can hold a copy for longer: see [privacy compliance](PRIVACY-COMPLIANCE.md#data-inventory).

**By hand.**

```sh
npm run purge -w @anxiocare/api
```

It prints a JSON count, such as `{"sessions":0,"otpCodes":3,"unconsentedUsers":0,"auditRows":0}`.


## Master key rotation

**Why rotate.** Yearly hygiene, after someone with access leaves, or when you suspect a leak.

**What it does.** Rewraps each user's data key under a new master key. It doesn't re-encrypt the data, and it doesn't change the data keys. **If a key really leaked, rotation is not enough.** See [compromise](#if-a-master-key-may-have-leaked).

**Procedure.**

1. Generate a new key, on your own computer:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Save it in the secret store, as `v2`, **before doing anything else**.
2. Render, **Environment**. Set, and save with a deploy:

   ```
   ENCRYPTION_KEYS=v1:<old>,v2:<new>
   ENCRYPTION_ACTIVE_KEY=v2
   ```

   Wait until the deploy is live.
3. In Render's Shell:

   ```sh
   npm run rotate-keys -w @anxiocare/api
   ```

   It prints `Rewrapped N data keys under v2`. It is safe to run again, and it resumes where it stopped.
4. Check in the SQL editor:

   ```sql
   SELECT dek_key_version, count(*) FROM app.users GROUP BY 1;
   ```

   **Every row must say `v2`.** If not, run step 3 again. An old instance could still have been creating accounts under v1 during the switch.
5. Sign in with the canary account, and open a saved result.
6. Remove the old key: `ENCRYPTION_KEYS=v2:<new>`. Deploy. Check the canary again.
7. **Keep `v1` in the secret store** for at least `BACKUP_RETENTION_DAYS`, plus the age of any export you've kept, because backups still hold data keys wrapped under `v1`. To restore one of them, `v1` must be back in `ENCRYPTION_KEYS`. After that, delete it. Note the date.

**Traps.**

- Don't remove `v1` until step 4 shows zero `v1` rows. Otherwise those people get 500s, and if you've also lost the key, they lose their data.
- A Render rollback restores old environment values. See [DEPLOYMENT.md](DEPLOYMENT.md#rollback).
- The script reports `Rotation failed (DecryptError)` if a key doesn't match. Check for a typo in `ENCRYPTION_KEYS`, and that the version it names is correct.

### If a master key may have leaked

This is a [data breach response](#data-breach-response) first. Then:

1. Rotate as above, immediately, and remove the old key.
2. Understand what rotation did. Someone holding the old key **and** a copy of the old `wrapped_dek` values can still get every data key, and read current and future data encrypted under those keys, if they can get the ciphertext again. **No tool exists to replace the data keys.** It would need a script that decrypts and re-encrypts every row for every user. Ask a developer to write and test one, then run it, if you judge that the attacker may also have database access.
3. Rotate the database passwords, and everything else in the [table below](#secret-rotation).
4. Check access logs on Render, Supabase and GitHub, for who else was there.

## Secret rotation

| Secret | How | Effect |
| --- | --- | --- |
| Runtime DB password (`DATABASE_URL`) | Generate one: `openssl rand -hex 32`. SQL editor: `ALTER ROLE anxiocare_runtime PASSWORD '<new>';`. Update `DATABASE_URL` right away, and deploy. **Don't use `generate-secrets` for this.** It also prints new keys, which you must not apply. | New connections fail during the gap. |
| Migration password (`DATABASE_MIGRATION_URL`) | Supabase, **Database Settings**, reset the database password. Update the URL. | The next migrate uses it. |
| `SMTP_PASS` | Make new credentials at the provider. Update `SMTP_USER` and `SMTP_PASS`. Deploy. Delete the old ones. | None if done in that order. |
| `OTP_PEPPER` | New value from `node -e` above. Deploy. | Live codes stop working, so people request new ones. Per-client quota counts restart. |
| `AUDIT_KEY` | New value. Deploy. | New audit rows can't be linked with the old. [Re-erasing after a restore](#restoring-production) can't match rows from before the change, so keep the old key for a year. |
| `EMAIL_INDEX_KEY` | **Do not change it.** No tool exists. Changing it makes every lookup miss, so every returning person would get a new empty account, with their data stranded. It would need a script that decrypts each address and re-computes `email_hash` and live rows. | Leaked alone, it lets someone with a database copy test guessed addresses. |
| `ENCRYPTION_KEYS` | [Above](#master-key-rotation). | |
| `DATABASE_CA_CERT` | When Supabase changes its CA. Download again, encode, update. | Without this the app can't connect. |
| GitHub, Render, Supabase, DNS, mail logins | Change the password, and revoke sessions and tokens. | |

Note each rotation (date, what and why, not the value), in your private log.

## Backups

**What exists.** Supabase Pro makes [daily backups, kept for 7 days](https://supabase.com/docs/guides/platform/backups). Team: 14. Enterprise: up to 30. Free has none. PITR is an add-on, from [about $100 a month per 7 days](https://supabase.com/pricing), which limits data loss to about two minutes, and replaces daily backups.

**What backups contain.** The same as the database: ciphertext, hashes, ids, timestamps. **Not the keys.** A backup without `ENCRYPTION_KEYS` is useless, so keep the keys separately, and never put them together with a backup.

**`BACKUP_RETENTION_DAYS`.** The server tells people, in the privacy notice and the delete screen, that backups age out within this many days. `render.yaml` sets 7. It must match your actual plan. **If you change plan or add PITR, change this variable the same day.** An increase in retention is a change to what people were told, so talk to the lawyer, and see the [consent procedure](#consent-version-bump).

**Is 7 days enough?** It means a silent corruption found on day 8 is unrecoverable. Decide consciously, and know that a longer period keeps erased data longer.

**Are your own dumps OK?** You could also take a logical dump (`supabase db dump`). It's a copy of every user's encrypted data, outside Supabase, that won't age out unless you delete it. **Your privacy notice doesn't cover it.** Delete it after use, and don't keep a regular off-site dump without changing the notice and asking the lawyer.

## Test a restore

A backup you have never restored is a hope. Do this **before launch**, then quarterly. Allow an hour or two. It costs a little, because a new project is billed while it exists.

**Before launch, and until there are real users,** create a canary account in production, with a known check-in and thought record.

1. In Supabase, open **Database**, **Backups**, and the **Restore to a New Project** tab. Choose yesterday's backup, read the cost, confirm. [Docs](https://supabase.com/docs/guides/platform/clone-project): for paid plans, with physical backups, same region as the source. **This feature was described in docs as restricted in some versions. If it isn't available, ask Supabase support, or use `supabase db dump` as a fallback, with a new Mumbai project.** Note how long it took. That's your real recovery time.
2. **This new project holds everyone's encrypted data. Treat it like production.** Don't share access. Don't leave it running.
3. Connect to it. In its SQL editor, set a new password, because [custom role passwords may not be kept](https://supabase.com/docs/guides/platform/backups):

   ```sql
   ALTER ROLE anxiocare_runtime PASSWORD '<openssl rand -hex 32>';
   SELECT count(*) FROM app.users;
   SELECT count(*) FROM app.assessments;
   ```

   Compare the counts with production. They should be close, and allow for a day of change.
4. Download the new project's CA certificate. Copy its session pooler host.
5. On your own computer, in the repository, build and start the real app against the restored database, with **file mail, so that nobody receives real email**. Create `.env.restore` (gitignored):

   ```sh
   NODE_ENV=development
   PUBLIC_ORIGIN=http://localhost:8787
   DATABASE_URL=postgres://anxiocare_runtime.<new-ref>:<new password>@<new pooler host>:5432/postgres
   DATABASE_CA_CERT=<base64 of the new CA>
   ENCRYPTION_KEYS=<production value>
   ENCRYPTION_ACTIVE_KEY=<production value>
   EMAIL_INDEX_KEY=<production value>
   OTP_PEPPER=<production value>
   AUDIT_KEY=<production value>
   MAIL_TRANSPORT=file:./restore-test-mail.jsonl
   MAIL_FROM=no-reply@example.com
   OPERATOR_NAME=Restore test
   GRIEVANCE_EMAIL=test@example.com
   ```

   Then:

   ```sh
   npm ci && npm run build
   set -a; . ./.env.restore; set +a
   npm start
   ```

   In development mode, the code is printed to the console.
6. Open `http://localhost:8787`, and sign in with **the canary address only**. Use the printed code. **Confirm that the known check-in and thought record decrypt and display.** That is the real test: database, keys and app all work together. Do not sign in as anyone else.
7. Clean up, right away:
   - Stop the server.
   - Delete `.env.restore` and `restore-test-mail.jsonl`.
   - **Delete the temporary Supabase project.**
8. Record the date, the backup used, the time taken, the counts, whether the canary was readable, and that the project was deleted.

**A fail on step 6 is a serious finding.** It may mean that the keys in your secret store are wrong. Fix this before anything else.

## Restoring production

Only if data is truly lost or corrupted. It replaces the live database. **It loses everything since the backup, and it brings back accounts that people have deleted.** This is a likely [incident](#incident-response).

1. Suspend the service, or accept errors. Tell people if you can.
2. **Before restoring, if the old database is still readable, save the list of people who erased their accounts since the backup date.** It's pseudonymous:

   ```sql
   SELECT encode(actor_hmac, 'hex') FROM app.audit_log
   WHERE action = 'account_delete' AND created_at >= '<backup date>';
   ```

   Save the output as `deleted-actors.txt`, one per line. Audit times are to the day, so include the backup's whole day.
3. Supabase: **Database**, **Backups**, choose the backup, **Restore**. The [project is unavailable during the restore](https://supabase.com/docs/guides/platform/backups), for longer with larger databases.
4. **Reset the runtime password.** Daily backups don't store custom role passwords:

   ```sql
   ALTER ROLE anxiocare_runtime PASSWORD '<the password in DATABASE_URL>';
   ```

5. Check the keys match. If you rotated after the backup, older key versions must be back in `ENCRYPTION_KEYS`. Run `rotate-keys` once it's all up.
6. Start the service. Check `/readyz` and the canary.
7. **Re-erase.** Save `SELECT id FROM app.users;` as `user-ids.txt`. In Render's Shell (or with `AUDIT_KEY` set locally), find restored accounts that had been deleted:

   ```sh
   node -e "
   const c=require('node:crypto'),fs=require('node:fs');
   const key=Buffer.from(process.env.AUDIT_KEY,'base64');
   const lines=f=>fs.readFileSync(f,'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
   const gone=new Set(lines('deleted-actors.txt'));
   for(const id of lines('user-ids.txt'))
     if(gone.has(c.createHmac('sha256',key).update('actor:'+id,'utf8').digest('hex')))console.log(id);
   "
   ```

   Then, for each id printed:

   ```sql
   DELETE FROM app.users WHERE id = '<id>';
   ```

   This doesn't work across an `AUDIT_KEY` change, and it can't cover deletions that the failed database no longer shows. Any such gap must be recorded and put to the lawyer.
8. Sessions created since the backup are gone, so people sign in again. Sessions and codes in the backup may still be valid.

## Incident response

An incident is anything that could expose data, cause wrong or missing help, or stop the service for long.

**Priorities, in order:** 1. People's safety. 2. Stop data leaking. 3. Preserve evidence. 4. Tell those who must be told. 5. Restore service.

| Severity | Examples | Respond |
| --- | --- | --- |
| **Critical** | Data exposed or suspected. Key leaked. Cross-user access. Help page down or number wrong. | At once. Stop other work. |
| **High** | Sign-in down for everyone. Database unreachable. Mail failing. | Within hours. |
| **Medium** | Partial errors. A vendor outage with a workaround. | Within a day. |
| **Low** | One report with no pattern. | Next working day. |

**Steps.**

1. **Start a private timeline**, in a file outside the repository. Note the time you became aware (this starts the [legal clocks](#data-breach-response)), and what you know. Keep adding to it. Never put user data in it.
2. **Decide if it may be a data breach.** Treat "maybe" as "yes". Go to [data breach response](#data-breach-response) in parallel with what follows.
3. **Contain.**

   | Situation | Action |
   | --- | --- |
   | A bad deploy | [Roll back](DEPLOYMENT.md#rollback). |
   | App leaking data, can't be fixed quickly | Suspend the service in Render's **Settings**. **Help will still work offline for people who've visited before, but no one new can reach it.** Weigh that. |
   | Sessions may be stolen | SQL editor: `DELETE FROM app.sessions;` signs everybody out. |
   | A credential leaked | [Rotate it](#secret-rotation). Master key: [see above](#if-a-master-key-may-have-leaked). |
   | Vendor account compromised | Change the password, revoke tokens, check that account's activity log, and contact the vendor. |
   | Malicious dependency | Roll back, turn off auto-deploy in **Settings**, then rotate everything that the server could read. |
   | Wrong helpline number | Fix `helplines.ts`, merge and deploy. **Remove first, verify after.** |

4. **Preserve evidence.** Copy relevant logs out of Render before they age out, because retention is short. Export Render events, Supabase logs and GitHub's audit log. Don't delete the temporary objects an attacker used. Store it all privately, and consider that it may hold personal data.
5. **Fix** the cause. Add a test.
6. **Recover.** Verify with the [smoke test](DEPLOYMENT.md#step-12-post-deploy-smoke-test).
7. **Review** within a week: what happened, why, what changes. Update the threat model.

### A person cannot sign in

The likely causes are that the mail isn't arriving (spam, provider trouble, sending limits, `background_task_failed` in the logs) or the [failed-guess cap](THREAT-MODEL.md#r2-targeted-sign-in-lockout-for-24-hours-renewable). The cap looks the same as a wrong code. It clears by itself as guesses pass 24 hours old, unless someone keeps at it.

**To clear the cap,** first confirm that the person controls the address, by having them email you from it, and that this was not requested by whoever is attacking them.

1. Work out the canonical address: lower case, with any `+tag` removed. For Gmail and Googlemail, also remove dots and use `gmail.com`. So `A.Bc+x@googlemail.com` becomes `abc@gmail.com`.
2. In Render's Shell, compute the hash. Note the `email-quota:` prefix:

   ```sh
   node -e "const c=require('node:crypto');console.log(c.createHmac('sha256',Buffer.from(process.env.EMAIL_INDEX_KEY,'base64')).update(process.argv[1],'utf8').digest('hex'))" 'email-quota:abc@gmail.com'
   ```

3. In the SQL editor:

   ```sql
   DELETE FROM app.otp_failures WHERE purpose = 'login' AND quota_hash = decode('<hex>', 'hex');
   ```

4. Tell the person, and suggest they sign in right away. Tell them that someone may be targeting their address, and that they should secure the mailbox. Keep your message neutral about the service.

### Mail failure

Nobody can sign in, and the app gives no sign of it. Active sessions continue working.

Check, in order: provider's status page; `SMTP_*` values; port (Render blocks some on free instances); whether SES has left the sandbox; a suspension for bounces or complaints; SPF, DKIM or DMARC changes; the `code` in `background_task_failed`. Have a second provider's account ready if you can. Switching is only a matter of environment variables, and of `MAIL_PROVIDER`, which is what people are told in the notice.

### Database or vendor outage

The server stays up, and `/readyz` answers 503. Help, tools and guest check-ins keep working, because they're in the bundle. Check [Supabase status](https://status.supabase.com) and [Render status](https://status.render.com).

## Data breach response

> **Not legal advice.** The clocks below come from the sources in [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md#what-applies-when). Which of them apply to you today is for your lawyer to say, **before launch**, so that you aren't working it out during a breach. Choose the lawyer now, and have a way to reach them quickly.

A personal data breach under the Act covers unauthorised processing, or accidental disclosure, loss of access, alteration, or destruction of personal data. It isn't limited to a confirmed hack.

### Timeline

| By | What | Source | Status |
| --- | --- | --- | --- |
| **T0** | You become aware. Write down the time. | Clocks run from awareness. | |
| **As fast as you can** | Contain. Call the lawyer. | | |
| **T0 + 6 hours** | Report to CERT-In. The list includes data breaches and data leaks. Reported phone 1800-11-4949. Check [cert-in.org.in](https://www.cert-in.org.in/) for the current form and email. | CERT-In Directions, 28 Apr 2022. | **In force today. Whether it binds you: ask the lawyer.** |
| **Without delay** | Tell the Board: nature, extent, timing, location, likely impact. | r.7(2)(a). | From about May 2027. |
| **Without delay** | Tell each affected person. | r.7(1). | From about May 2027. **Do it from day one anyway**, on the lawyer's advice. They are the ones at risk. |
| **T0 + 72 hours** | Detailed report to the Board. Longer only if the Board allows, on written request. | r.7(2)(b). | From about May 2027. |
| After | Keep the file. | r.6, r.8(3). | |

**How to file with the Board:** no working channel could be confirmed. A law firm's note of September 2026 reports no Board members appointed. `[OWNER: ask the lawyer, and write the filing route here]`.

**Penalties**, per [the Schedule](https://dpdpa.com/theschedule.html), may reach ₹250 crore for failing on safeguards, and ₹200 crore for failing to notify.

There's **no threshold**. Rule 7 says "any personal data breach", and each affected person is to be told, not just those at high risk.

### What to work out

Fill this in, and update it. It feeds the reports.

- What happened, and when did it start and stop?
- How did you find out?
- **Which data?** Was it ciphertext only, or could the attacker also have had keys? Was it from the server (plaintext in memory), a backup, a mail provider, or logs?
- Which people? How many? If you can't narrow it, assume all.
- What can the attacker do with it? **Consider the harm of a person's mental health status being known.**
- Who else needs to know? Vendors.
- What did you do? What will you do?

Ciphertext without keys is a far smaller event than ciphertext with keys. Write down your reasoning, but let the lawyer decide what follows.

### How to reach people

**Use `apps/api/scripts/notify-all.ts`.** Addresses are encrypted with each user's key, so this tool loads each account, decrypts the address in memory only, and hands it to the mailer `MAIL_TRANSPORT` configures. It has been tested against the test harness and a capture mailer. **It has not been run against a real mail provider,** so try it before you need it, on the empty or canary-only production database. Check your provider's sending limits and warm-up in advance.

Run it from a trusted machine, with the production environment (`DATABASE_URL`, `DATABASE_CA_CERT`, `ENCRYPTION_KEYS`, `MAIL_*` and the rest) set, and under your supervision:

```sh
# 1. Write the notice to a local file, from the template below. It isn't stored or logged anywhere.
# 2. Look before sending. This prints only the recipient count, and sends nothing. It's the default.
npm run notify-all -w @anxiocare/api -- --subject "Important notice about your account" --body-file notice.txt

# 3. Send. Nothing is sent without --send.
npm run notify-all -w @anxiocare/api -- --subject "Important notice about your account" --body-file notice.txt --send --per-minute 60
```

| Behaviour | Detail |
| --- | --- |
| Who | Every row in `app.users`, consented or not. To reach only some people, stop and get help: this tool mails everyone. |
| Subject | One line. **Refused if it names the service or its subject matter**, because lock screens show it. The body is yours to keep neutral on its first screen. |
| Rate | `--per-minute`, default 60. Set it under your provider's limit. |
| Logs | Counts only. Never an address, the subject or the body, and never a provider's error text, because those quote addresses. |
| Stopping | After 10 failures in a row it stops, on the assumption that the provider is down. |
| Resuming | Each accepted send appends the person's user id, and nothing else, to a local file: `.notify-progress-<hash>` in the current directory, or `--progress-file`. Mode 600, and ignored by git. **Run the same command again** to carry on. The hash covers the subject and the body, so a different notice can't skip anyone. |
| Finishing | The progress file is removed once everyone has been reached. If anyone failed, it stays, and the exit code is 1. |
| Duplicates | A crash between the provider accepting a mail and the id being written can send that one person a second copy. That's on purpose: in a breach, a duplicate beats a miss. |
| Exit codes | 0 done, 1 not everyone reached or a failure, 2 refused its arguments. |

The provider keeps its own copy of each message and address, on its own terms: see [processors](PRIVACY-COMPLIANCE.md#processors).

Rule 7(1) allows "her user account or any mode of communication registered by her". Email is the only such mode. **The mail must stay neutral on the outside**: subject and sender can be read on lock screens and shared inboxes.

### Templates

**For lawyer review before use. Fill in every bracket, and don't send anything unverified.** Don't minimise, speculate or blame.

#### Notice to each affected person (r.7(1))

```
Subject: Important notice about your account

We are writing to tell you about a security incident affecting your account with
[OPERATOR_NAME].

What happened
On [date], we found that [plain description of what happened]. It began on
[date or "we do not yet know"] and ended on [date or "is under investigation"].
It affected [plain description: for example, "encrypted copies of account data"].

What this means for you
[Plain and specific, including what is unknown. For example: "Someone may have been
able to see your email address and what you saved in this app." Keep the
sensitivity of the data in mind, without naming the subject in this email.]

What we have done
[Measures taken, and being taken.]

What you can do
- Open the app, go to Settings, and choose "Sign out on all devices".
- Change the password of this email account, because sign-in codes are sent here.
- Be careful of messages that mention this incident or ask you for details. We will
  never ask you for a sign-in code.
- [Anything specific.]
- You can delete your account at any time in Settings.

If this worries you, or if you need to talk to someone, the Get help page in the app
lists free helplines.

Questions
[Name or role], [GRIEVANCE_EMAIL]. We will reply as quickly as we can.
You can also complain to the Data Protection Board of India. [How, once known.]

[OPERATOR_NAME]
```

Keep the first screen of the message free of health terms. Have a clinician look at the wording, because this message may reach someone who's already struggling.

#### First intimation to the Board (r.7(2)(a))

```
To: Data Protection Board of India [route to be confirmed]
From: [OPERATOR_NAME], Data Fiduciary, [address], [GRIEVANCE_EMAIL], [phone]
Date and time: [IST]

Intimation of personal data breach under rule 7(2)(a), DPDP Rules 2025

Service: AnxioCare, [origin]
Became aware: [date, time IST]

Description, as now known:
  Nature: [what happened]
  Extent: [data categories; number of Data Principals, or "under assessment"]
  Timing: [when it started, when it ended, or "ongoing"]
  Location: [systems, vendor, country. Database in Mumbai; server in Singapore.]
  Likely impact: [what this could mean for Data Principals. The data includes health
  information about mental health. State whether it was encrypted, and whether keys
  were affected.]

Containment so far: [steps]

A detailed report will follow within seventy-two hours of awareness, per rule 7(2)(b).
Contact: [name, email, phone]
```

#### Detailed report to the Board (r.7(2)(b))

```
To: Data Protection Board of India [route to be confirmed]
Reference: [first intimation, date and time]

(i) Updated and detailed description
[Nature, extent, timing, location, likely impact, updated. Categories of data. Count of
Data Principals. Encryption status. Key status.]

(ii) Broad facts: events, circumstances and reasons
[Timeline. Root cause, or status of the investigation.]

(iii) Measures implemented or proposed to mitigate risk
[List.]

(iv) Findings regarding the person who caused the breach
[Known, unknown or under investigation.]

(v) Remedial measures to prevent recurrence
[List.]

(vi) Report on intimations to affected Data Principals
[Date sent. Number sent. Number failed. How. Copy of the notice attached.]

Other reports made: [CERT-In, date and reference.]

Signed: [name, role]
```

#### CERT-In

Use the current form on [cert-in.org.in](https://www.cert-in.org.in/). Say only what you know, and mark what's unconfirmed. Do not include user data.

## Rights requests and grievances

Most rights are self-service, in Settings. Anything by email goes through this process. The notice says "We aim to respond within 7 days". The [Rules](PRIVACY-COMPLIANCE.md#obligations) allow up to 90 days once in force, and the SPDI Rules mention one month. Keep to 7 days.

**Identity.** Only act on a request from the account's address. If it comes from elsewhere, ask the person to write from that address, or to sign in. Don't ask for ID. Don't ask why. Never ask for health information.

**Every reply must include** the [contact information](PRIVACY-COMPLIANCE.md#obligations) (`OPERATOR_NAME`, `GRIEVANCE_EMAIL`), per r.9, and how to complain to the Board.

**Don't read people's data.** You can technically decrypt it. Don't do it to answer a request, and never without their knowledge.

| Request | What to do |
| --- | --- |
| See my data | Settings, **Download my data**. |
| Who has my data | Privacy notice, "Who else is involved". Add Cloudflare if the notice hasn't been updated. |
| Correct | Settings for name or email. A thought record can be edited. A check-in can only be deleted, and retaken. |
| Delete, or withdraw consent | Settings, **Delete my account**. If they can't sign in, use the process below. |
| Can't sign in | [A person cannot sign in](#a-person-cannot-sign-in). |
| Lost access to the mailbox | **There's no recovery path.** Do not hand an account to someone because they say it's theirs. Discuss it with the lawyer. A delete request can't be verified either. |
| Nominee, or a request on behalf of someone who has died or can't act | Not built. Record it, take advice, and **do not release mental health data on an informal request.** Ask the lawyer what proof to accept. |
| Grievance | Acknowledge within 2 days. Answer within 7. Mention the right to go to the Board. |
| A person who may be in crisis | **Answer the same hour if you can**, with helplines and 112. Don't try to counsel. Ask your clinician reviewer in advance what they advise you to say. |
| Police or legal demand | Don't respond alone. Call the lawyer. |

### Deleting an account by hand

Use it only when the person has proved control of the address, and can't use Settings. It mirrors `routes/me.ts`.

1. In Render's Shell, compute both hashes. The blind index uses the address in lower case. The quota hash uses the [canonical](#a-person-cannot-sign-in) form.

   ```sh
   H='const c=require("node:crypto");console.log(c.createHmac("sha256",Buffer.from(process.env.EMAIL_INDEX_KEY,"base64")).update(process.argv[1],"utf8").digest("hex"))'
   node -e "$H" 'email:a.bc+x@gmail.com'
   node -e "$H" 'email-quota:abc@gmail.com'
   ```

2. In the SQL editor:

   ```sql
   BEGIN;
   DELETE FROM app.users WHERE email_hash = decode('<email hex>', 'hex');   -- Should say DELETE 1.
   DELETE FROM app.otp_codes WHERE email_hash = decode('<email hex>', 'hex');
   DELETE FROM app.otp_failures WHERE quota_hash = decode('<quota hex>', 'hex');
   COMMIT;
   ```

   `DELETE 0` means that no account has that address. Don't confirm or deny to anyone but the verified owner.

   Before running the first delete, note the id, for re-erasure, if you ever restore: use `SELECT id` with the same condition. This route doesn't write an `account_delete` audit row, so such a deletion can't be found later by the [re-erasure step](#restoring-production).

3. Tell the person that it's done, and about backup age-out. Log it.

### Private log

For each request or grievance, note: date in, type, date answered, outcome. No health data, no message content. **How long to keep the log, and whether the address may be included, is for the lawyer.** Keep it outside the repository.

## Dependency updates

- **Dependabot** opens npm and GitHub Actions pull requests weekly (`.github/dependabot.yml`), with minor and patch npm updates grouped.
- CI must pass. With branch protection on, that's enforced. Merge one at a time, and take major versions on their own.
- Read the changelog for anything that touches `fastify`, `@fastify/*`, `postgres`, `nodemailer`, `zod` or `pino`. These are close to security-critical behaviour.
- `vite-plugin-pwa` or `workbox-build` moving off the listed versions means you should remove that section of [SECURITY-EXCEPTIONS.md](SECURITY-EXCEPTIONS.md).
- GitHub Actions are pinned to commit hashes with a version comment. Dependabot updates both.
- **Node.** `.node-version` sets CI and Render. Update it in a pull request, keeping it at 24 or above (`engines`), and watch the first deploy. The API runs `.ts` scripts directly, so it depends on Node's built-in type stripping.
- **A critical advisory in a shipped package** (`npm audit --omit=dev` fails): update it at once, or remove the use. CI blocks all merges until this is settled.
- Render deploys `main` only after checks pass (`autoDeployTrigger: checksPass`).

## Consent version bump

When the privacy notice or terms change **materially**, people must accept them again. The lawyer decides what's material. Examples: new data, new purpose, new processor or location, a longer backup period.

1. Edit the copy in `apps/web/src/routes/Legal.tsx`, and `Consent.tsx` if needed.
2. In `packages/shared/src/schemas.ts`, set `CONSENT_VERSION` to the date of the new text, as `YYYY-MM-DD`. It also appears as "Version dated" on the legal pages. **Rewrite `CONSENT_CHANGES` beside it in plain words: that's what the prompt shows under "What changed".** A test fails until its `version` matches.
3. Update the fixtures that hard-code the old value: `apps/web/e2e/fixtures.ts` and `apps/web/src/test/render.tsx`.
4. Have the lawyer review the final text.
5. `npm test` and `npm run test:e2e`. Open a pull request.
6. After the deploy:
   - Everyone gets the consent screen on their next visit, from Home or any account screen. It says what changed and that their data is kept.
   - Data routes answer 403 `consent_required` until they accept. `POST /me/consent` only accepts the current version.
   - Export, deletion, sign-out and the device list **still work without accepting**, as they must. Settings keeps them on screen, and the prompt links there.
   - Accounts with old consent stay. They aren't purged, and they keep their data while not accepting. Decide with the lawyer whether that needs a time limit.
   - The old notice's text exists only in git history, so tag or note the commit, to be able to show what someone agreed to.
7. Consider telling people by neutral email if the change matters to them.

## Helpline re-verification

Quarterly. The full procedure, including what to say and how to update `HELPLINES_CHECK_METHOD` and `HELPLINES_CHECKED_ON`, is in [CLINICAL-SAFETY.md](CLINICAL-SAFETY.md#helpline-verification). Put it in your calendar now: first week of February, May, August and November.

## Scaling beyond one instance

`render.yaml` runs one instance on the smallest paid plan. If a single instance is the limit:

**Try a larger instance first.** It's a one-line change (`plan`, in `render.yaml`), and causes no behaviour change. Standard is [$25 a month](https://render.com/pricing).

**Before adding a second instance,** these matter:

| What | Behaviour with N instances | Do |
| --- | --- | --- |
| **Per-client rate limits** | **In each process's memory.** An attacker gets N times the limit, and restarts reset them. | Move `@fastify/rate-limit` to a shared store such as Redis. This needs code, and a new processor to disclose. See [`apps/api/README.md`](../apps/api/README.md#rate-limiting-and-several-instances). |
| Send quotas, failed-guess cap, attempts per code | In Postgres. Unaffected. | Nothing. |
| Purge job | Runs on each instance. Idempotent. | Nothing. |
| `client ip resolved` log | Once per process. | Nothing. |
| Database connections | `DATABASE_POOL_MAX` (5) per instance. The role's limit is 40. Also the pooler's limit, and your compute size. | Keep N × pool under the limit. Remember Micro's limits. |
| Sessions | In Postgres. | Nothing. |
| Render plan | Scaling may require a higher plan. | Check. |

Don't use transaction-mode pooling to save connections. [`apps/api/README.md`](../apps/api/README.md#deploying) says that it isn't supported.

Keep per-IP limits generous, because of carrier NAT in India. Rely on the database limits for per-account protection.

## Costs

Approximate, in US dollars, at the time of writing. Prices change, so check each page.

| Item | Cost a month | Source |
| --- | --- | --- |
| Render, Starter instance (0.5 CPU, 512 MB) | $7 | [Render pricing](https://render.com/pricing) |
| Render workspace | Hobby $0, or Pro $25. Hobby keeps logs for 7 days, Pro for 14. | [Pricing](https://render.com/pricing), [logging](https://render.com/docs/logging) |
| Supabase Pro | $25, with a credit that covers one Micro compute instance | [Supabase pricing](https://supabase.com/pricing) |
| Amazon SES | $0.10 per 1,000 mails, so about $1 for 10,000 | [SES pricing](https://aws.amazon.com/ses/pricing/) |
| **Running total** | **About $33, or about $58 on Render Pro** | |
| Optional: PITR | From about $100 | [Supabase pricing](https://supabase.com/pricing) |
| Optional: Render Standard instance | $25 instead of $7 | [Render pricing](https://render.com/pricing) |
| Two domains, per year | Check your registrar. Not sourced here. | |
| Uptime monitor | Often free at this scale. Not sourced here. | |
| A restore test | A few hours of a second project. Shown on the restore screen. | [Supabase](https://supabase.com/docs/guides/platform/clone-project) |
| Lawyer, clinician, translation | One-off. Get quotes. **Not estimated here, and likely the largest cost.** | |

Render's Hobby workspace is described as "for individuals building personal projects and prototypes". For a service holding health data, consider Pro, and read the terms. Bandwidth overage wasn't checked, and a first visit precaches about 60 files.

## Sources

Checked 2026-11-06. [Render shell](https://render.com/docs/ssh), [logging](https://render.com/docs/logging), [pricing](https://render.com/pricing), [rollbacks](https://render.com/docs/rollbacks). [Supabase backups](https://supabase.com/docs/guides/platform/backups), [restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [pricing](https://supabase.com/pricing). [SES pricing](https://aws.amazon.com/ses/pricing/). Legal sources are listed in [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md#sources).

**Could not confirm:** that Render's Shell carries the service's environment, the CERT-In form and email, the Board's filing route, the exact restore-to-new-project availability on your plan, and whether `status.supabase.com` and `status.render.com` are unchanged.
