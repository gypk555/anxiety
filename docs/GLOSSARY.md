# Glossary

**AAD (additional authenticated data).** Text mixed into an encryption so that decryption fails if it does not match. Here it is `field:rowId:userId`, which stops an attacker with database access from moving ciphertext to another row or another person.

**AES-256-GCM.** The encryption used for sensitive columns. It also detects tampering.

**Audit log.** `app.audit_log`. Records that an action happened (for example `login`), on which day, by a keyed hash of the user id. It holds no answers or writing.

**Blind index.** A keyed hash of a value, here the email address. The database can match equal values without being able to read them.

**BYPASSRLS.** A Postgres role attribute that ignores row-level security. The runtime role must not have it, and the server refuses to start if it does.

**Canonical address.** An email address reduced for quota counting: lower case, no `+tag`, and for Gmail no dots. Used only for limits, never for identity or delivery.

**Device cookie.** `__Host-device`, a random token a browser keeps for a year after signing in. Only an HMAC of it is stored. A browser holding one for an account has its own failure budget, so nobody else's wrong guesses can lock it out. It never signs anyone in.

**CBT thought record.** A cognitive behavioural therapy exercise: write down a situation and a thought, weigh the evidence, then find a more balanced view. The Journal is built on it.

**Consent version.** `CONSENT_VERSION` in `packages/shared`. Raising it makes everyone accept the privacy notice again before saving more.

**CSP (Content Security Policy).** A response header telling the browser where scripts, styles and other files may come from. Here: only this origin, and no inline script.

**CSRF (cross-site request forgery).** Another site tricking a browser into sending a request with its cookies. Blocked here by SameSite=Strict, an exact `Origin` check and a required custom header.

**Cursor.** A marker for "the next page" in a list, returned as `nextCursor`. Treat it as opaque.

**DEK (data encryption key).** A random 256-bit key, one per user, that encrypts that person's columns. It is stored only in wrapped form.

**Difficulty item.** The extra question after the GAD-7 about how hard the problems made daily life. It is not part of the score. It is asked only when some symptom was reported.

**DPDP Act.** India's Digital Personal Data Protection Act, 2023. See [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md).

**Data fiduciary.** The DPDP Act's term for whoever decides why and how personal data is used. Here, the operator.

**Enumeration.** Finding out whether an address has an account by watching how the app responds. The sign-in path is built so that responses and timing do not reveal it.

**GAD-7.** Generalized Anxiety Disorder 7-item scale (Spitzer, Kroenke, Williams, Löwe, 2006). Seven questions, each scored 0 to 3, total 0 to 21. Bands: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe. A score of 10 or more is the published point for further evaluation. It is a screening tool, not a diagnosis.

**Grievance contact.** The address people can use to complain to the operator. Set by `GRIEVANCE_EMAIL`.

**Guest.** Someone using the app with no account. Their check-in stays in the browser tab.

**Haldi, madder, kantha.** Names in the design. Haldi is turmeric yellow, madder is a red-pink dye, and kantha is the Bengali running-stitch quilt the visual style comes from.

**Helmet.** The Fastify plugin that sets security headers.

**HMAC.** A keyed hash. Without the key you cannot compute it or check a guess. Used for codes, blind indexes, quota keys and audit actors.

**HSTS.** A header telling browsers to use HTTPS only for this site.

**Idempotent.** Safe to repeat. `POST /assessments` with the same `clientRequestId` returns the first row rather than saving twice.

**Keyset pagination.** Paging by "after this timestamp and id" rather than by page number, so no row is skipped or repeated when the list changes.

**Master key.** A key from `ENCRYPTION_KEYS` that wraps each user's DEK. It is held only in the server's environment.

**OTP (one-time password).** Here, the 6-digit code emailed for creating an account, sign-in, password reset, adding a password, email change or deletion. It is single use and lasts 10 minutes.

**Padding.** Adding bytes before encrypting so that ciphertext length does not reveal the content's length.

**Pepper.** A secret mixed into a hash, held outside the database. `OTP_PEPPER` is the one for codes.

**Pino.** The logging library. Logs are allow-listed, so only named fields appear.

**Precache.** Files the service worker stores at install so that they work offline.

**PWA (progressive web app).** A website that can be installed to the home screen and can work offline.

**Re-authentication.** Proving a password or an email code again in a signed-in session. Connecting or disconnecting Google needs one within 10 minutes.

**RFC 9457.** The standard format for API error documents (`application/problem+json`).

**RLS (row-level security).** Postgres rules for which rows a role may see. Here it keeps other database roles out. It does not separate one person from another: queries do that. See [decision 005](decisions/005-rls-role-scoped-policies.md).

**Runtime role.** `anxiocare_runtime`, the database role the server connects with. It can use only the grants it needs, and cannot change the schema.

**SameSite=Strict.** A cookie setting: the browser sends the cookie only on requests that started from this site.

**Screening.** Checking whether someone may need further evaluation. It is not a diagnosis, and the app never says diagnosis.

**Service worker.** A browser script that can answer requests. Here it serves the app's own files offline. It is told never to touch `/api`.

**Session pooler (Supavisor).** Supabase's connection pooler. The session mode gives the app one server connection for the life of each client connection.

**SPA (single-page app).** A web app where one HTML file loads and the browser handles later page changes.

**Supabase.** The planned Postgres host. Used as plain Postgres, with no Supabase client in the browser.

**Tele-MANAS.** The Government of India's mental health helpline: 14416.

**verify-full.** A TLS mode that checks both the certificate chain and the host name.

**Wrapped key.** A key encrypted by another key. A user's `wrapped_dek` is their DEK encrypted by a master key.

**Zod.** The validation library used for config, request bodies and response parsing.
