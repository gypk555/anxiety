# 001. Email codes instead of passwords

Status: accepted, 2026-11-06. Decided by: the builder. The owner chose accounts; how people sign in was left to the builder.

## Context

The app stores mental health data under accounts. A password store is a high-value target, passwords get reused, and resetting one needs email anyway. People may arrive in distress, so sign-in should ask as little as possible.

## Decision

Sign-in uses an 8-digit code emailed to the address, with no password anywhere. Sign-up and sign-in are the same flow. The same mechanism confirms account deletion and email change.

## Alternatives

- **Passwords.** A store to protect, reset flows, and reuse risk.
- **Phone OTP.** Common in India, but sending SMS commercially there needs DLT registration, which is a business process. Deferred, not ruled out.
- **Magic links.** Opening a link in a different browser or an in-app mail viewer breaks the session, which is a real problem on phones. A code can be typed anywhere.
- **Social login.** Tells a large third party that a person uses a mental health app, and adds a third party to the client.

## Consequences

- No password to steal, and nothing to reset.
- Whoever controls the inbox controls the account. Settings' sign-in notice and the two-inbox email change reduce this, but don't remove it.
- Sign-in depends on mail delivery. Nothing has been sent through a real provider yet.
- Mail must be neutral, since lock screens show it. See [email](../modules/email.md).
- Guessing limits have to be designed. See [decision 010](010-eight-digit-codes-and-quotas.md).
