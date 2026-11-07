# Privacy compliance

> **This is not legal advice, and it must be reviewed by an Indian lawyer before launch.** It was written from the code and from public sources by someone who is not a lawyer, to help the owner brief one. Where it says "done", it means the app behaves that way, not that the behaviour satisfies the law.

Checked on 2026-11-06. Sources are listed at the end. Law and vendor terms change, so re-check before relying on anything here.

## The five things to take to the lawyer first

1. **Rule 8(3) may conflict with instant deletion.** The Rules require keeping personal data, traffic data and logs for at least a year, and their own example says this applies "even if X deletes her account". AnxioCare hard-deletes health data at once, and promises people that it does. [Details](#retention-and-rule-83).
2. **What applies on launch day is not yet the DPDP Act.** Its main duties start around May 2027. Until then the SPDI Rules 2011 appear to apply, and CERT-In's 6-hour incident reporting and 180-day log rule are already in force. [Details](#what-applies-when).
3. **Medical device status.** CDSCO's 2026 guidance on medical device software reportedly excludes screening from its wellness carve-out. The app calls itself a screening tool and names anxiety. [Questions](#medical-device-telemedicine-and-mental-health-law).
4. **The notice is English only.** The Act gives people the option of the notice and the consent request in any language of the Eighth Schedule to the Constitution. [Details](#obligations).
5. **Retention has no end.** An account that has stopped being used stays until the person deletes it. [Details](#retention-and-rule-83).

## What applies when

| Date | What happens | Confidence |
| --- | --- | --- |
| 13 Nov 2025 | DPDP Rules 2025 notified, G.S.R. 846(E). Rules 1, 2 and 17 to 21 in force at once. | Confirmed from a copy of the Gazette text. The Gazette PDF was read on dpdpa.com, because MeitY's site refused automated access. |
| About 13 Nov 2026 | Rule 4 (consent managers) and section 6(9) in force. Does not bind AnxioCare directly. | Rule 1(3) confirmed. The exact day depends on the publication date. Sources say 13 or 14. |
| **About 13 May 2027** | Rules 3, 5 to 16, 22 and 23 in force, and sections 3 to 17 of the Act, including section 5 notice, section 6 consent, section 8 duties, section 9 children, sections 11 to 14 rights, section 16 transfers. Section 44(2) also commences, which is reported to remove section 43A of the IT Act. | Rule 1(4) confirmed from the Gazette text. Act tranches from a reproduction of G.S.R. 843(E) on dpdpa.com. **Not confirmed from MeitY directly. Sources differ between 12, 13 and 14 May.** |
| Unconfirmed | MeitY floated cutting the 18 months to 12 in January 2026 (reported as aimed at Significant Data Fiduciaries in some accounts). A September 2026 law-firm note found no amending notification. If that has changed, the duties could start around now. | **Could not confirm from a primary source.** Ask the lawyer. |
| Today, until then | SPDI Rules 2011 under section 43A of the IT Act. These list "physical, physiological and mental health condition" as sensitive data, require consent in writing or electronic form, a privacy policy, and a Grievance Officer who is named on the site and answers within one month. They expect security practices with an annual audit. | Text read from a copy of the Rules hosted by PRS India. **Whether and how they apply to this operator is for the lawyer.** |
| Today, already in force | CERT-In Directions of 28 April 2022: report listed incidents, including data breaches and data leaks, within 6 hours of noticing them, and keep ICT system logs for 180 days within Indian jurisdiction. They cover "any service provider, intermediary, data center, body corporate and government organisation". | From law-firm summaries. **The CERT-In PDF could not be fetched.** Render logs last 7 to 30 days, outside India, so this is an open gap if the Directions apply. |

The Data Protection Board exists in law, but a September 2026 note reports no Chairperson or Members appointed. **No filing channel for breach reports could be confirmed.**

## Obligations

Status meanings: **Done** means the app already behaves this way. **Owner action** means only the owner can do it. **Needs lawyer** means someone qualified has to decide. References are to the Act (s.) and the Rules (r.).

| Obligation | Source | What the app does | Status |
| --- | --- | --- | --- |
| **Notice** before consent, stating data and purpose | s.5(1), r.3 | `Consent.tsx` lists the data and the purpose before the tick boxes. `Legal.tsx` has the full notice. | Done. Needs lawyer for the wording. |
| Notice understandable on its own, itemised, plain language | r.3(a), (b) | The consent screen itemises data and links to the notice. | Done. Needs lawyer. |
| Notice gives the link and means to withdraw, exercise rights and complain to the Board | r.3(c), s.5(1) | The consent screen names Settings for rights. The privacy notice mentions the Board, with no link or address for it. | Needs lawyer. No Board address could be confirmed. |
| **Notice and consent request in English or an Eighth Schedule language, at the person's option** | s.5(3), s.6(3) | English only. | **Gap. Needs lawyer**, then translation by the owner. |
| Contact details in the consent request | s.6(3) | The consent screen links to the notice, where they appear. They are not on the consent screen itself, and need network. | Needs lawyer. |
| **Consent** free, specific, informed, unconditional, unambiguous, with clear action | s.6(1) | Two unticked boxes, one for 18+, one for health data. "Not now, sign me out" is offered. The app works without an account. The server requires both and the current version. | Done. Needs lawyer. |
| Proof of consent | s.6(10) | `app.consents` holds version and time. Deleted with the account. An audit `consent` row survives, pseudonymously. | **Needs lawyer**: can that row prove it after deletion? |
| **Withdrawal** as easy as giving consent | s.6(4), r.3(c)(i) | Withdrawal is by deleting the account, in Settings, with a code mailed to the person. There is no withdrawal without deletion. | **Needs lawyer**: consent takes two ticks, while withdrawal needs an emailed code and removes everything. |
| Stop processing after withdrawal, processors too | s.6(6), s.8(7) | Rows removed at once. Backups age out. Mail logs at the provider are not reachable by the app. | Done for the database. Owner action for the provider's retention. |
| **Erasure** when consent is withdrawn or the purpose ends | s.8(7), s.12 | `/me/delete/confirm`. Cascades, then codes and failed-guess rows, tested in `erasure.test.ts:103`. | Done. See the conflict [below](#retention-and-rule-83). |
| Correction and completion | s.12 | Name and email in Settings. Journal entries editable. Assessments can only be deleted, not edited. | Done. Needs lawyer on assessments. |
| Access: summary of data and processing, and who it is shared with | s.11 | Export JSON, tested in `erasure.test.ts:29`. Processors are named in the notice, not the export. | Done. Needs lawyer: is this enough for s.11(1)(b)? |
| Publish how to make rights requests, and what identifier is needed | r.14(1) | Notice says Settings. It does not say a request by email must come from the account's address. | Owner action, with the lawyer. |
| **Grievance** redressal, with a published period of up to 90 days | s.8(10), s.13, r.14(3) | Notice: contact from `GRIEVANCE_EMAIL`, "We aim to respond within 7 days". Process in [OPERATIONS.md](OPERATIONS.md#rights-requests-and-grievances). | Owner action: set up and monitor the mailbox. Needs lawyer: may also need a named Grievance Officer under SPDI. |
| Publish contact of a person who can answer, and mention it in every rights response | s.8(9), r.9 | `OPERATOR_NAME`, `GRIEVANCE_EMAIL` shown through `GET /api/v1/meta`. Offline the page says it cannot load them. | Owner action. Templates must include it. |
| Nomination | s.14, r.14(4) | Notice: "Contact us". No feature. Manual process in OPERATIONS. | Owner action. Needs lawyer: what proof to require, given this is mental health data. |
| **Breach notification** to each affected person, without delay | s.8(6), r.7(1) | A runbook, templates and a tool, `apps/api/scripts/notify-all.ts`, which mails every account. Tested against a capture mailer only. | **Owner action**: try it with the real provider before launch. It mails everyone, so a breach affecting only some needs more. See [how to reach people](OPERATIONS.md#how-to-reach-people). |
| Breach notification to the Board: without delay, then a detailed report within 72 hours | s.8(6), r.7(2) | Template in OPERATIONS. | Owner action. **Needs lawyer**: how to file. |
| **Security safeguards**: encryption, access control, logs and review, backups, processor contract terms | s.8(5), r.6(1) | See [SECURITY.md](../SECURITY.md). Backups need the Supabase paid plan. | Done for code. Owner action for backups, contracts, access. |
| **Keep logs and personal data one year** | r.6(1)(e), r.8(3) | Audit rows for one year. Nothing else. | **Conflict. Needs lawyer.** See below. |
| Processor under a valid contract | s.8(2), r.6(1)(f) | None yet. | Owner action: accept Render's and Supabase's DPAs, and the SMTP provider's. |
| Accuracy where data is used for decisions | s.8(3) | The person's own data, for their own view. | Done. Likely low relevance. |
| **Children**: verifiable parental consent, no tracking, no detrimental processing | s.9, r.10 | Under-18s are not served. Accounts require an 18+ self-declaration. No age check beyond that. **Guest mode has no age question**, and stores nothing on the server. | **Needs lawyer**: is a self-declaration enough, given the Fourth Schedule's reference to confirming a person is not a child? |
| Persons with disabilities who have a lawful guardian | s.9(1), r.11 | Not handled. | Needs lawyer. Relevant to a mental health app. |
| **Cross-border** transfer | s.16, r.15 | Database in Mumbai, by default. Server in Singapore. The edge and the mail provider vary. No transfer restriction known today. Notice discloses Singapore and names Cloudflare, worldwide. | Done for disclosure. Needs lawyer, and re-check for restricted countries. |
| **Significant Data Fiduciary** duties | s.10, r.13 | None. | See [below](#significant-data-fiduciary). |
| Data principals' duties, such as not impersonating | s.15 | Terms mention using it only for oneself. | Done. |
| Consent manager route | s.6(7) to (9) | Not supported. | Needs lawyer. Likely optional. |
| Purge of unconsented accounts | Own promise | Hourly purge, so 24 to about 25 hours after creation. The consent screen and notice say "after 24 hours". | Done while the server is up. |

## Retention and Rule 8(3)

The Act requires erasure once consent is withdrawn or the purpose ends (s.8(7)), unless another law requires retention. The Rules add:

> "...a Data Fiduciary shall retain, in respect of any processing of personal data undertaken by it or on its behalf by a Data Processor, such personal data, associated traffic data and other logs of the processing for a minimum period of one year from the date of such processing, for the purposes as specified in the Seventh Schedule, after which the Data Fiduciary shall cause such personal data and logs to be erased..." (r.8(3))

Its illustration says a platform "must retain the order details, personal data, and logs of the processing ... for at least one year from the date of the transaction, even if X deletes her account", and that a cloud processor must do the same. Rule 6(1)(e) separately asks for "such logs and personal data" to be kept for one year, for detecting and investigating unauthorised access. **This research item was previously unconfirmed. It is confirmed from the Gazette text.**

AnxioCare does the opposite on purpose:

| What | Happens now | Rule 8(3) reading, if it applies in full |
| --- | --- | --- |
| Assessments, journal, profile | Hard-deleted at once on request. | Might have to be kept for a year. |
| Audit log | One year, pseudonymous, dated to the day. | Probably part of the answer, but contains no personal data in the ordinary sense, and no traffic data. |
| Traffic data | Not kept by the app. IP addresses are deliberately never stored. | Might have to be kept for a year. |
| Render logs | 7 to 30 days by workspace plan. | Shorter than a year, and outside the app's control. |
| Backups | `BACKUP_RETENTION_DAYS` (7 on Supabase Pro). | Shorter than a year. |

The owner must not change this alone. Keeping encrypted health data for a year after someone was told it was deleted is a serious step, and may be wrong. Keeping it deleted may be a breach once the Rules apply. Possible outcomes include a lawyer's view that the Seventh Schedule purposes do not require it here, or a hold of encrypted data under a separate key, with an honest change to the notice and to the words "at once". **Do not decide this from this document.**

**Inactive accounts.** Rule 8(1) and the Third Schedule's three-year period apply only to large e-commerce, gaming and social media entities, which AnxioCare is not. Section 8(7) and (8) still ask when a purpose stops being served. The app has no inactivity purge, and the purge test deliberately keeps accounts whose consent has merely gone out of date (`purge.test.ts:71`). **Decide a retention period with the lawyer.** It would be a code change, with a 48-hour warning if r.8(2) is followed.

## Significant Data Fiduciary

The Government can notify a fiduciary or class as "significant", considering volume and sensitivity of data, risk to rights, and other factors (s.10). None appears to be notified by name or class as of this check, though **that could not be confirmed from a primary source**. AnxioCare is small, but its data is sensitive, so ask the lawyer to keep watch. Notification would mean a Data Protection Officer based in India, an independent auditor, a yearly impact assessment and audit (r.13(1) and (2)), and possibly localisation of specified data and its traffic data (r.13(4)). That last would rule out a server in Singapore.

## Data inventory

"Encrypted" means AES-256-GCM in the application, under a per-user data key. Source: `apps/api/migrations/001_init.sql`, `apps/web/src`, `apps/api/src/logger.ts`.

| Data | Location | Form | Purpose | Kept for | Removed by |
| --- | --- | --- | --- | --- | --- |
| Email address | `users.email_ct` | Encrypted | Sign-in, notices | Life of account | Deletion, or purge if never consented |
| Email blind index | `users.email_hash`, `otp_codes.email_hash` | Keyed HMAC | Lookup | Life of account, or of the code row | Same, and purge |
| Quota hash of canonical address | `otp_codes.quota_hash`, `otp_failures.quota_hash` | Keyed HMAC | Limits | Codes: about an hour after sending, at most 1 hour 5 minutes. Failures: 24 to about 25 hours. | Purge, deletion |
| Client hash | `otp_codes.source_hash`, `otp_failures.source_hash`, `login_failures.source_hash` | Keyed HMAC of quota hash and client address | Per-client quota and failure caps | As the row | Purge |
| Password hash | `users.password_hash` | Argon2id, peppered with a key the database never sees | Sign-in | Life of account, or until changed | Person, deletion |
| Google identity | `user_identities.subject_hmac` | Keyed HMAC of Google's subject. Name, photo and the subject itself are not stored | Sign-in, only for people who choose Google. Linked to an existing account only from Settings, never by matching the address | Until disconnected, or a password reset | Person, deletion, purge if never consented |
| Failed password attempt | `login_failures` | Keyed hash of the canonical address, in its own HMAC domain so it can't be joined with the code tables, whether or not it has an account; a keyed client hash or a device id; and a time | Failure caps | 24 hours, then purge | Purge, deletion |
| Device cookie | `__Host-device` cookie in the browser; `device_tokens` | A random token in the browser. Only a keyed HMAC of it is stored, with the account id and an expiry | Security only: lets a browser that has signed in before keep signing in when others spend the address's failure caps. Strictly necessary, so no consent banner | 365 days, renewed at each sign-in there | Password reset (all of the account's), deletion, purge when expired |
| Re-authentication time | `sessions.reauth_at` | A time | Connecting or disconnecting Google needs a password or code within 10 minutes | Life of the session | As the session |
| Used Google state | `oauth_state_uses` | SHA-256 of a random value, and an expiry | Stops replay | 10 minutes, then purge. Not linked to a person | Purge |
| Password, in transit | Browser memory, then server memory | Plaintext for the moment it is in use. Never stored, logged, or in the URL, `sessionStorage`, `localStorage` or history | Sign-in | Until the screen closes, or the request ends | Automatic |
| Display name, optional | `users.display_name_ct` | Encrypted | Greeting | Life of account | Person, deletion |
| Wrapped data key | `users.wrapped_dek`, `dek_key_version` | Encrypted under master key | Encryption | Life of account | Deletion |
| Consent state | `users.consent_version`, `consent_at`, `consents.*` | Plaintext flags and dates | Lawful basis | Life of account | Deletion |
| GAD-7 answers, difficulty, score, severity | `assessments.payload_ct` | Encrypted, padded | Show history | Until deleted | Person, deletion |
| When each check-in was taken | `assessments.taken_at`, `created_at` | **Plaintext** | Sorting | Until deleted | Person, deletion |
| Thought records | `journal_entries.payload_ct` | Encrypted, padded in 4 KB steps | Show back | Until deleted | Person, deletion |
| Journal times | `journal_entries.created_at`, `updated_at` | **Plaintext** | Sorting | Until deleted | Person, deletion |
| Session token hash | `sessions.token_hash` | SHA-256 | Authentication | 30 days idle, 90 days at most, then purge within the hour | Sign-out, purge, deletion |
| Device label | `sessions.device_label_ct` | Encrypted, coarse ("Safari on iPhone") | Session list | As the session | As the session |
| Session times | `sessions.created_at`, `last_seen_at`, `absolute_expires_at` | **Plaintext**. `last_seen_at` is updated about every 5 minutes at most. | Limits | As the session | As the session |
| OTP code | `otp_codes.code_hmac` | Keyed HMAC | Sign-in | 10-minute life, then row as above | Purge |
| Failed guess | `otp_failures` | Hash and time | Daily cap | As above | Purge, deletion |
| Audit event | `audit_log` | Pseudonymous actor HMAC, action, UTC day | Security | 1 year, then purge | Purge. **Not removed on deletion, by design.** |
| App logs | Render | Method, route template, status, duration, request id, error class and frames | Operations | 7, 14 or 30 days by Render plan | Render |
| Platform request logs | Render, Cloudflare | **Outside the app's control.** Render offers HTTP request logs on Pro and above, with fields including path and host. Whether client addresses are kept was not confirmed. | Vendor's own | Vendor's terms | Vendor |
| Client address | Server memory, in the rate limiter | Plaintext in memory, up to 20,000 keys, 1 to 60 minute windows | Rate limit | Until window ends or restart | Automatic |
| Plaintext of everything above | Server memory | While a request runs | Serving it | Moments | Automatic |
| Backups | Supabase, Mumbai | Same as the database | Recovery | `BACKUP_RETENTION_DAYS`, default 7 | Age-out |
| Sign-in codes, notices, address | SMTP provider | **Plaintext** | Delivery | Provider's terms. **Owner to find out.** | Provider |
| Theme | Browser `localStorage` | Plaintext | Preference | Until changed | Person |
| Guest answers | Browser `sessionStorage` | Plaintext | Result without an account | Until the tab closes | Automatic |
| Signed-in data | Browser memory | Plaintext | Display | Until reload or sign-out | Automatic |
| Downloaded export, printout | Person's device | Plaintext | Person's own copy | Person decides | Person |

**Not collected:** age, gender, occupation, phone number, location, raw User-Agent, IP address in the database, analytics.

## Processors

| Processor | Role | Data seen | Location | Contract | Status |
| --- | --- | --- | --- | --- | --- |
| **Supabase** (Postgres) | Database and backups | Ciphertext, hashes, ids, timestamps. No keys. | South Asia (Mumbai), `ap-south-1`. Listed in [regions](https://supabase.com/docs/guides/platform/regions). | [DPA](https://supabase.com/legal/dpa). Several versions exist. Check the contracting entity and which one applies. | Owner action |
| **Render** | Runs the server | **Plaintext in memory, all keys.** | Singapore. Region cannot be changed afterwards. | [DPA](https://render.com/dpa), [subprocessors and certifications](https://render.com/trust). Render lists ISO 27001 and SOC 2 Type 2. | Owner action |
| **Cloudflare** (through Render) | Edge network | **Assume traffic in the clear.** Render does not document where TLS ends. | Global. | Through Render, which lists it as a subprocessor. | Named in the notice. Lawyer to review the wording. |
| AWS, GCP, ClickHouse (through Render) | Render's subprocessors | Per Render. | Render lists them as United States. | Through Render. | Lawyer to review |
| **SMTP provider** (owner's choice) | Sends mail | **Email address, plaintext codes, device label.** | Depends. Amazon SES in Mumbai is one way to keep it in India. | Provider's DPA. | Owner action: choose, set `MAIL_PROVIDER` |
| **Google** | Sign-in, **only for people who choose "Continue with Google"**, and only if the owner turns it on | Learns the person uses this service, which account they used, and the time. Returns a verified address. Scopes are `openid email` only, so no name or photo. | Global. | Google's API terms. | Owner action: create the OAuth client and consent screen, and have the lawyer review. Named in the notice, and on the screen. |
| **GitHub** | Source code, CI | No user data. CI uses made-up accounts. | Global. | Standard terms. | Not a processor of user data |
| **Meta (WhatsApp)**, helpline sites | Only if a person taps the link | Whatever the person sends. | Not ours. | None. Independent. | The notice should mention it. |

## Where the app text and the code disagree

These still need a copy change, in whatever form the lawyer agrees. The privacy notice has to be true on launch day. Fixed on 2026-11-06, in code, and no longer listed here: the timing of code rows and unconsented accounts, naming Cloudflare, and the About page's "published wording".

| Where | What it says | What really happens | Suggested fix |
| --- | --- | --- | --- |
| `Legal.tsx` "What we store" | "For about an hour after we send you a code" the keyed hash is kept. | True of the live database, while the server is up. A copy can last in backups for `BACKUP_RETENTION_DAYS`. | Consider saying so. |
| `Legal.tsx` | "Your network address itself is not stored." | True of the app's database. Render and Cloudflare may log addresses. | Narrow the wording. |
| `Legal.tsx` | "Without an account ... nothing about you reaches our servers." | Answers do not. But requests reach the server with an address, and the rate limiter holds it in memory. | Narrow the wording. |
| `Legal.tsx` | "Download everything we hold about you." | Export omits code rows, failed guesses, failed passwords, the password hash, Google's subject HMAC and audit rows, which are not directly linked to the person. | Narrow the wording. |
| `mail.ts` `emailChangedNotice` | "reply to the operator through the contact details in the app" | The sender may not take replies. | "contact the operator". |
| `Consent.tsx` | "Encrypted backups age out within our backup retention period." | Correct, but it does not give a number, unlike the notice. | Optional. |
| `.env.example`, `render.yaml` | `BACKUP_RETENTION_DAYS` 7. | True only on Supabase Pro without PITR changes. Enabling PITR stops daily backups, and PITR retention is 7, 14 or 28 days. Update the variable if the plan changes. | Keep in step. |

## Medical device, telemedicine and mental health law

**Asked, not answered.** These are questions for the lawyer. Nothing here asserts an answer.

1. **Medical Devices Rules 2017.** Is AnxioCare "software as a medical device"? A law-firm summary (5 Aug 2026) of CDSCO's final guidance on medical device software says "General Wellness Software" must not refer to diseases, disorders or pathological conditions, and that software for purposes such as screening is not treated as wellness software. The app says "anxiety" and "screening", gives a severity range, and suggests seeing a professional from a score of 10. An older academic review says standalone apps fell outside CDSCO, and predates this guidance. **The guidance itself was not read.** If it applies, what class, and what would need to change? Would different wording ("self-check") honestly change the answer, or merely disguise it?
2. **Telemedicine Practice Guidelines 2020.** No practitioner is involved. Does anything in the app, or the "Print for a doctor" view, touch these? **No source was checked on their scope.**
3. **Mental Healthcare Act 2017.** Is the app a "mental health establishment" or does it provide "mental healthcare"? Do its confidentiality provisions apply? **No source was checked.**
4. **Clinical Establishments Act 2010.** Does it apply? (The Rules' Fourth Schedule references it.)
5. **Consumer Protection Act 2019.** Is a free service covered? Are "free" and "private" safe claims? Do the disclaimers hold?
6. **Duty of care.** Any duty arises if someone in distress relies on the app, or it fails. Are the limitation clauses in the Terms effective?
7. **Advertising.** Any rule on how the app may be described, for example under the Drugs and Magic Remedies (Objectionable Advertisements) Act 1954 if the app is promoted.
8. **Liability and entity.** Should the operator be a company, LLP or individual? `OPERATOR_NAME` is shown publicly as the data fiduciary.

## Questions for the lawyer

In addition to those above:

1. Which law binds this operator on launch day, and from May 2027? Has the 18-month period changed?
2. Rule 8(3) and r.6(1)(e): must health data, traffic data or logs be kept for a year after deletion? What must the notice then say?
3. Are CERT-In's 6-hour rule and 180-day-in-India log rule binding on an individual or small operator? If so, how to comply when logs are at Render, for 7 to 30 days, outside India?
4. Is the current Board filing route known? If the Board has no members, where does a breach report go?
5. Does consent screen wording satisfy s.6? Is it a problem that the only way to withdraw is to delete, and that it needs an emailed code?
6. Must the notice and consent be translated, and into which languages first?
7. Is an 18+ self-declaration enough? What about guest mode, where a child can take the check-in and nothing is stored?
8. How to handle persons with a guardian, and nominees, including proof, and what a nominee may see?
9. Is sending data to Singapore, and through Cloudflare, adequately disclosed, and does the notice need to name each subprocessor?
10. Are Render's, Supabase's and the mail provider's standard DPAs adequate (r.6(1)(f)), and do they extend to r.8(3)?
11. Does the operator need a named Grievance Officer now under SPDI?
12. Can the consent proof be deleted along with the account (s.6(10)), and are pseudonymous audit rows personal data?
13. What retention period suits inactive accounts?
14. How to answer a lawful demand for data, given the operator can decrypt?
15. Review `Legal.tsx` in full, along with the mismatches above and the [breach templates](OPERATIONS.md#templates).
16. Review the safe harbour wording in [SECURITY.md](../SECURITY.md).

## Sources

Primary or copies of primary:

- Digital Personal Data Protection Rules, 2025, G.S.R. 846(E), Gazette of India, 13 Nov 2025. Text read from [dpdpa.com's copy of the Gazette English text](https://www.dpdpa.com/DPDP_Rules_2025_English_only.pdf). Listed at [India Code](https://indiacode.gov.in/items/fe07b131-481d-4cc9-bdb5-7bd218ced646). MeitY's copy refused automated access. A corrigendum, G.S.R. 892(E), is reported at [dpdp.myndsolution.com](https://dpdp.myndsolution.com/wiki/rules/rule-1-short-title-and-commencement/) and was not read.
- Digital Personal Data Protection Act, 2023. Read through [dpdpa.com's reproduction](https://dpdpa.com/dpdpa2023/chapter-2/section8.html) of sections [5](https://dpdpa.com/dpdpa2023/chapter-2/section5.html), [6](https://dpdpa.com/dpdpa2023/chapter-2/section6.html), [8](https://dpdpa.com/dpdpa2023/chapter-2/section8.html), [9](https://dpdpa.com/dpdpa2023/chapter-2/section9.html), [11](https://dpdpa.com/dpdpa2023/chapter-3/section11.html), [16](https://dpdpa.com/dpdpa2023/chapter-4/section16.html) and [the Schedule](https://dpdpa.com/theschedule.html). Sections 10, 12, 13, 14 and 15 are summarised from memory of the Act's structure, and **should be checked against the official text**. MeitY's copy could not be fetched. Note that dpdpa.com also carries commentary that does not always match the statute.
- Penalties, from [the Schedule](https://dpdpa.com/theschedule.html): up to ₹250 crore for security safeguards, ₹200 crore for breach notice, ₹200 crore for children's data, ₹150 crore for Significant Data Fiduciary duties, ₹50 crore otherwise.
- Commencement of the Act, G.S.R. 843(E): [dpdpa.com timeline](https://dpdpa.com/dpdpa_enforcement_timeline.html).
- SPDI Rules 2011: [PRS India copy](https://prsindia.org/files/bills_acts/bills_parliament/2011/IT_Rules_2011.pdf).

Secondary, treat with care:

- 12-month proposal and Board status: [Mirvo Legal, as at September 2026](https://www.mirvolegal.com/insights/dpdp-rules-2025-compliance-timeline/), [Business Standard](https://www.business-standard.com/technology/tech-news/meity-may-cut-compliance-timeline-for-key-dpdp-rules-to-12-months-126012201293_1.html), [Chambers](https://chambers.com/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs).
- CERT-In Directions: [Legal 500 summary](https://www.legal500.com/intelligence/india/media-telecoms-it-entertainment/6-hours-to-report-cyber-incidents-to-cert-in). Original at [cert-in.org.in](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf), which timed out.
- CDSCO guidance: [Legal 500 summary, August 2026](https://www.legal500.com/intelligence/india/food-drugs-healthcare-life-sciences/cdsco-publishes-guidance-on-medical-device-software-under-mdr-2017). Older view: [BJPsych International](https://www.cambridge.org/core/product/4B61B12BA5F14790CEC6214D2FAAD52E/core-reader).

Vendors: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Supabase DPA](https://supabase.com/legal/dpa), [Render DPA](https://render.com/dpa), [Render trust](https://render.com/trust), [Render DDoS article, on Cloudflare](https://render.com/articles/how-render-handles-ddos-attacks), [Render logging](https://render.com/docs/logging).

**Could not confirm:** MeitY's own texts, the CERT-In PDF, the corrigendum's full content, whether the 12-month change was made, the Board's filing channel, whether any Significant Data Fiduciary has been notified, the final CDSCO text, and anything on the Telemedicine Guidelines or Mental Healthcare Act.
