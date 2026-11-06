# Email

## Purpose

Deliver sign-in, email-change and deletion codes, and two security notices, in wording that reveals nothing about the subject, because lock screens and shared inboxes expose mail.

**Not verified:** no real SMTP provider has been used. Tests use a capturing mailer, and the HTTPS e2e stack uses a local STARTTLS stub.

## User-facing behaviour

| Purpose | Subject | Goes to | Has a code |
| --- | --- | --- | --- |
| `login` | Your sign-in code | The typed address | Yes |
| `email_change` | Your verification code for your new address | New address | Yes |
| `email_change_current` | Your verification code for your current address | Current address | Yes |
| `account_delete` | Your confirmation code | Current address | Yes |
| `email_changed_notice` | Your email address was changed | Old address | No |
| `new_signin_notice` | New sign-in to your account | Current address | No |

Code mails print the code grouped, like `1234 5678`, and say it expires in 10 minutes. Mail is plain text.

If mail doesn't arrive, the person sees no error. The screens say to check spam, check the address, and try again later.

## How it works

`createMailer` picks a transport from `MAIL_TRANSPORT`.

**`smtp`.** Nodemailer. Port 465 uses implicit TLS, any other port requires STARTTLS. TLS 1.2 minimum, certificates verified. Credentials from `SMTP_USER` and `SMTP_PASS`.

**`file:<path>`.** Development and e2e only. Appends one JSON object per line with mode 600:

```json
{"at":"ISO","from":"...","to":"...","subject":"...","text":"...","purpose":"login","code":"12345678"}
```

`code` is null for notices. With `NODE_ENV=development`, codes are also printed to the console. `npm run dev:api` writes to `.e2e-outbox/mail.jsonl` by default. The file is never truncated, so take the last line matching `to` and `purpose`.

**Sender.** `parseSender` takes the name from `MAIL_FROM_NAME`, then `MAIL_FROM`'s own display name, then "Account Team". In production, config refuses a sender name or address matching `anxi|mental|health|therap|depress|wellness|wellbeing|psych|counsel|stress|panic`. So the sending domain can't name the service either.

**Sending.** All mail goes through [`Background`](background-jobs.md), after the response.

## Key files

- [apps/api/src/mail.ts](../../apps/api/src/mail.ts)
- [apps/api/src/otp.ts](../../apps/api/src/otp.ts) (`deliverOtp`)
- [apps/api/src/config.ts](../../apps/api/src/config.ts) (`parseSender`, mail rules)
- [apps/api/src/device.ts](../../apps/api/src/device.ts) (the label in the sign-in notice)
- [packages/shared/src/schemas.ts](../../packages/shared/src/schemas.ts) (`formatOtp`)

## Data and API used

No table of its own. Triggered by `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /me/email/request`, `POST /me/email/verify` and `POST /me/delete/request`.

Env: `MAIL_TRANSPORT`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.

## Security/privacy notes

- Nothing in a subject or body names the product or health. A test checks every message.
- The provider sees addresses and message text, including codes. The Privacy notice names it through `MAIL_PROVIDER`.
- Addresses and provider responses never go in logs. A send failure logs only the error's class, code and stack frames.
- The file transport is refused in production twice: at config, and again in `createMailer`.
- Set up SPF and DKIM on the sending domain. See [DEPLOYMENT.md](../DEPLOYMENT.md).

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Provider down or rejects | Logged as `background_task_failed`. No retry and no queue. The person sees no code and can resend later. |
| Process dies after the 202 | That mail is lost. |
| `/me/email/request`: the first send fails | The second isn't attempted. |
| A send quota is reached | Nothing is issued or sent. |
| The app restarts before the change notice goes out | The notice is lost. The change still happened. |

## Tests that cover it

- [apps/api/test/otp.test.ts](../../apps/api/test/otp.test.ts) (`Mail content`)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (`nothing names the service`, sign-in notice)
- [apps/api/test/logging.test.ts](../../apps/api/test/logging.test.ts) (mail failure log)
- [apps/api/test/purge.test.ts](../../apps/api/test/purge.test.ts) (`file mail transport`)
- [apps/api/test/config.test.ts](../../apps/api/test/config.test.ts) (production refusals)
- [apps/web/e2e/https/https.spec.ts](../../apps/web/e2e/https/https.spec.ts) (STARTTLS stub)

## Known limits

- `scripts/notify-all.ts` sends one operator-written notice to every account, with the purpose `operator_notice`. It refuses a subject that names the service or its subject matter, but the body is the operator's to keep neutral. See [OPERATIONS.md](../OPERATIONS.md#how-to-reach-people).
- Fire-and-forget: no retries, no bounce handling, no delivery visibility.
- `MAIL_PROVIDER` defaults to "our email provider", which the owner should replace before launch.
- Text only and English only.
- The email-changed notice tells a person to use the app's contact details if it wasn't them, and that's a manual process.
