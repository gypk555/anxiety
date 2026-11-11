# Launch checklist

Everything only you can do, in order. **Blocks launch: Yes** means don't let the public in until it's done. Some items wait on others, so the order matters.

The app has never run on Supabase, Render or a real mail provider. It has had no legal or clinical review. Nobody has called the helplines, and the app says so.

## 1. Decide if you accept the risks

- [ ] **Read and accept the 24-hour sign-in lockout of a new device.** Someone who knows a person's address, sending from several networks, can stop them signing in on a device they have never used for this account, for a day, and can renew it. Devices they have signed in on before keep working. On a new device the person sees only "invalid code", and after a second failure a general note that this can happen. [Threat model R2](THREAT-MODEL.md#r2-targeted-sign-in-lockout-for-24-hours-renewable), [exception](SECURITY-EXCEPTIONS.md#sign-in-lockout-of-a-new-device). **Blocks launch: Yes.**
- [ ] **Read and accept the odds on 6-digit codes**, about 0.73% a year against a sustained attack on one address from unknown devices (kept at 20 wrong codes a day, not raised to 100: see the exception). [Exception](SECURITY-EXCEPTIONS.md#six-digit-codes-the-odds-of-a-guess). **Blocks launch: Yes.**
- [ ] **Read and accept the other residual risks**: shared phones, master key, Render seeing plaintext in Singapore, in-memory limits, email as sole factor. [Threat model](THREAT-MODEL.md#residual-risks). **Blocks launch: Yes.**
- [ ] **Decide who you are, legally.** Individual, LLP or company. This is shown publicly as the data fiduciary, in `OPERATOR_NAME`. [Privacy compliance](PRIVACY-COMPLIANCE.md#medical-device-telemedicine-and-mental-health-law). **Blocks launch: Yes.**
- [ ] **Set up a grievance contact**, a mailbox you actually read, for `GRIEVANCE_EMAIL`. [Operations](OPERATIONS.md#rights-requests-and-grievances). **Blocks launch: Yes.**
- [ ] **Fill in the security contact** in [SECURITY.md](../SECURITY.md). **Blocks launch: Yes.**
- [ ] **Set up a password manager as your secret store**, and turn on multi-factor authentication for GitHub, Supabase, Render, mail, DNS, and the mailbox. [Deployment](DEPLOYMENT.md#before-you-start). **Blocks launch: Yes.**

## 2. Get the code ready

- [ ] **Commit and push branch `production-rebuild`. The code is uncommitted today.** Read `git status` first. No `.env`, no keys. The repository is public. [Deployment, step 0](DEPLOYMENT.md#step-0-commit-and-merge). **Blocks launch: Yes.**
- [ ] **Open a pull request into `main`, and see GitHub Actions' first run pass**: `verify`, `e2e` and `analyze`. They have never run on GitHub. [Deployment, step 0](DEPLOYMENT.md#step-0-commit-and-merge). **Blocks launch: Yes.**
- [ ] **Merge into `main`.** `render.yaml` deploys from `main`, and nothing else will deploy. **Blocks launch: Yes.**
- [ ] **Have the reported bugs fixed by a developer:**
  - Remaining copy mismatches. [List](PRIVACY-COMPLIANCE.md#where-the-app-text-and-the-code-disagree). **Blocks launch: Yes**, in whatever form the lawyer agrees.
- [ ] **Try the breach notification tool, `notify-all`, against your real mail provider**, on the empty or canary-only production database, because you can't otherwise tell people about a breach. It has only run against a test mailer. [Operations](OPERATIONS.md#how-to-reach-people). **Blocks launch: Strongly advised. Ask the lawyer.**
- [ ] **Enable secret scanning and push protection.** [Deployment, step 0](DEPLOYMENT.md#step-0-commit-and-merge). **Blocks launch: Yes.**

## 3. Get legal and clinical review

Start these early. They can change the code and the words.

- [ ] **Legal review by an Indian lawyer.** Give them [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md), starting with its five priorities and [question list](PRIVACY-COMPLIANCE.md#questions-for-the-lawyer), plus `Legal.tsx` as text, and the [breach templates](OPERATIONS.md#templates). **Blocks launch: Yes.**
  - [ ] Rule 8(3) one-year retention vs instant deletion: decision recorded.
  - [ ] Which law applies on launch day, and CERT-In: decision recorded.
  - [ ] Medical device, telemedicine and mental health law questions: answered.
  - [ ] Notice languages: decided, and translations ordered if needed.
  - [ ] Retention for inactive accounts: decided.
  - [ ] How to file a breach report: written into [OPERATIONS.md](OPERATIONS.md#timeline).
  - [ ] Safe harbour wording: reviewed.
- [ ] **Clinician review and signed form.** Use the [sign-off form](CLINICAL-SAFETY.md#clinician-review-sign-off). Include the [hazard log](CLINICAL-SAFETY.md#hazard-log), and the [safety plan wording](CLINICAL-SAFETY.md#safety-plan-wording), items 19 to 23. **Blocks launch: Yes.**
- [ ] **Decide whether the Stanley-Brown safety plan needs attribution or permission.** See [clinical safety](CLINICAL-SAFETY.md#safety-plan-wording). **Blocks launch: Yes.**
- [ ] **Run the real-phone quick exit and safety plan cases**, MT-QX and MT-SP in the [manual test cases](testing/MANUAL-TEST-CASES.md). **Blocks launch: Yes.**
- [ ] **Have code and copy changes from both reviews made, reviewed and merged.** If the legal notice changes, set `CONSENT_VERSION`. [Operations](OPERATIONS.md#consent-version-bump). **Blocks launch: Yes.**

## 4. Build the production setup

- [ ] **Create the Supabase project in Mumbai, on the paid Pro plan, with backups on.** Free has no backups, and it pauses. [Deployment, step 1](DEPLOYMENT.md#step-1-create-the-supabase-project). **Blocks launch: Yes.**
- [ ] **Turn off the Data API.** [Step 1](DEPLOYMENT.md#step-1-create-the-supabase-project). **Blocks launch: Yes.**
- [ ] **Get the connection strings and CA certificate. Enforce SSL. Test `psql` with `verify-full`.** [Step 2](DEPLOYMENT.md#step-2-connection-strings-and-the-ca-certificate). **Blocks launch: Yes.**
- [ ] **Run `npm run db:setup`. Save the secrets file in the secret store, and make a second safe copy of `ENCRYPTION_KEYS` and `PASSWORD_PEPPER`.** Losing the first loses all user data. Losing the second makes everyone reset their password. [Step 3](DEPLOYMENT.md#step-3-set-up-the-database). **Blocks launch: Yes.**
- [ ] **Run `npm run db:verify`, and read it.** Every line says PASS. [Step 4](DEPLOYMENT.md#step-4-check-the-database). **Blocks launch: Yes.**
- [ ] **Decide about Google sign-in. If yes, create the Google OAuth client and consent screen.** Scopes `openid` and `email` only, and the exact redirect URI from `npm run doctor`. Publish the consent screen, and read what Google requires of it. Skip this, and the button stays hidden. [Step 5a](DEPLOYMENT.md#step-5a-optional-google-sign-in). **Blocks launch: only if you want Google on day one.**
- [ ] **Run `npm run doctor` against the full production environment, before you first deploy.** [Step 6](DEPLOYMENT.md#check-the-whole-environment-first). **Blocks launch: Yes.**
- [ ] **Buy a neutral mail domain, choose an SMTP provider, and set SPF, DKIM and DMARC.** Production refuses an `anxi...` sender. Leave the sandbox. Find out how long the provider keeps messages. [Step 5](DEPLOYMENT.md#step-5-set-up-mail). **Blocks launch: Yes.**
- [ ] **Accept each vendor's data processing agreement**: [Supabase](https://supabase.com/legal/dpa), [Render](https://render.com/dpa), and your SMTP provider. Keep copies. [Processors](PRIVACY-COMPLIANCE.md#processors). **Blocks launch: Yes.**
- [ ] **Create the Render service from `render.yaml`. Set every variable, including `OPERATOR_NAME` and `GRIEVANCE_EMAIL`.** [Step 6](DEPLOYMENT.md#step-6-create-the-render-service). **Blocks launch: Yes.**
- [ ] **Confirm that the first deploy migrates, and the logs are clean.** [Steps 7 and 8](DEPLOYMENT.md#step-7-migrate). **Blocks launch: Yes.**
- [ ] **Verify the schema isn't exposed, with SQL and with `curl`.** [Step 9](DEPLOYMENT.md#step-9-verify-the-database-after-the-first-migration). **Blocks launch: Yes.**
- [ ] **Confirm that `BACKUP_RETENTION_DAYS` matches your Supabase plan.** It's stated to people. [Step 6](DEPLOYMENT.md#every-environment-variable). **Blocks launch: Yes.**
- [ ] **Set up the custom domain, update `PUBLIC_ORIGIN`, and disable the Render subdomain.** [Step 10](DEPLOYMENT.md#step-10-custom-domain-and-public_origin). **Blocks launch: Yes.**
- [ ] **Run the client address check, from two networks.** [Step 11](DEPLOYMENT.md#step-11-check-the-client-address). **Blocks launch: Yes.**
- [ ] **Turn on GitHub branch protection.** [Step 13](DEPLOYMENT.md#step-13-turn-on-github-branch-protection). **Blocks launch: Yes.**
- [ ] **Turn on private vulnerability reporting.** [SECURITY.md](../SECURITY.md). **Blocks launch: No, but quick to do.**

## 5. Prove it works

- [ ] **Call every helpline, then change what the app claims.** Tele-MANAS (both numbers), Vandrevala (phone and WhatsApp) and iCALL. Settle the iCALL hours, and whether calls are free. **Do not test-call 112.** Help and About now say the numbers were "checked against published sources", and "not yet confirmed by phone". Once you've really phoned them all, in `packages/shared/src/helplines.ts` set `HELPLINES_CHECK_METHOD` to `'phone'` and `HELPLINES_CHECKED_ON` to the date of the calls, and the words change by themselves. Don't change either before then. [Procedure](CLINICAL-SAFETY.md#procedure). **Blocks launch: Yes.**
- [ ] **Try each way in on production with a real phone: create an account, sign in with a password, an email code, forgot password and, if on, Google.** Have a password manager save and fill the password. [Manual cases MT-AUTH-11 to 22](testing/MANUAL-TEST-CASES.md#sign-in-screens-every-control-mt-auth). **Blocks launch: Yes.**
- [ ] **Run the post-deploy smoke test on a real phone.** [Step 12](DEPLOYMENT.md#step-12-post-deploy-smoke-test). **Blocks launch: Yes.**
- [ ] **Run every case in [MANUAL-TEST-CASES.md](testing/MANUAL-TEST-CASES.md)** against production. **Blocks launch: Yes.**
- [ ] **Create the canary account, and do a full restore test.** Confirm that the canary decrypts. Delete the temporary project. [Operations](OPERATIONS.md#test-a-restore). **Blocks launch: Yes.**
- [ ] **Do a master key rotation dry run,** on the empty or canary-only production database, before real users exist. [Operations](OPERATIONS.md#master-key-rotation). **Blocks launch: No, but it's far easier now than later.**
- [ ] **Search the logs for your own address.** No results. [Step 12](DEPLOYMENT.md#step-12-post-deploy-smoke-test). **Blocks launch: Yes.**

## 6. Be ready to run it

- [ ] **Set up an external uptime check on `/readyz`, and turn on Render's failure notifications.** [Operations](OPERATIONS.md#monitoring-and-health-checks). **Blocks launch: Yes.**
- [ ] **Read [incident response](OPERATIONS.md#incident-response) and [breach response](OPERATIONS.md#data-breach-response) once. Note the lawyer's phone number, and the CERT-In contact.** **Blocks launch: Yes.**
- [ ] **Put recurring reminders in your calendar:** helplines and restore test (quarterly), access review, law status. [Schedule](OPERATIONS.md#routine-schedule). **Blocks launch: Yes.**
- [ ] **Decide who covers when you're ill or away.** At the least, write down what someone should do, and how they'd reach the keys in an emergency. [Threat model](THREAT-MODEL.md#r7-others-worth-knowing). **Blocks launch: No, but do it soon.**
- [ ] **Ask your clinician what you should say if someone in crisis emails you.** [Operations](OPERATIONS.md#rights-requests-and-grievances). **Blocks launch: Yes.**

## 7. Launch, and after

- [ ] **Delete test accounts, apart from the canary.** Note that their backups age out. **Blocks launch: Yes.**
- [ ] **Launch quietly first.** Watch the [log signals](OPERATIONS.md#logs) daily for two weeks. **Blocks launch: No.**
- [ ] **Move DMARC from `p=none` towards `p=reject`** after two clean weeks. [Step 5](DEPLOYMENT.md#spf-dkim-and-dmarc). **Blocks launch: No.**
- [ ] **Before 13 May 2027 (or earlier if the law changed):** re-read [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md#what-applies-when) with the lawyer. Close anything that was deferred. **Blocks launch: No. Hard deadline.**
