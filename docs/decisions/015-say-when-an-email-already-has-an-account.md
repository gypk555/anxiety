# 015. Say when an email already has an account

Status: accepted, 2026-11-12. Decided by: the owner.

## Context

Create account used to answer every address the same way: the code page, and, for an address that already had an account, an "account exists" email instead of a code. That hid whether an address was registered. But it cost a mail every time, and confused people who had forgotten they had an account: they waited for a code that never came.

## Decision

The owner chose cost and clarity over hiding whether an email is registered.

- `POST /auth/register/request` answers 409 `account_exists` for an address with an account, and sends no email at all. A new address behaves as before.
- Create account shows "There's already an account for this email." in place, with **Sign in**, **Continue with Google** and **Reset password**, each keeping the email or `next`.
- Every limit stays, counted the same way for both kinds of address. Past the send quota both get the same quiet 202, so the answer can't be used to check addresses in bulk beyond it. The address is not logged.
- Sign-in and forgot password still don't reveal whether an address has an account. Nothing reveals whether Google is connected to it: the existing `google_link` message covers that case.
- The privacy notice says so. `CONSENT_VERSION` moved to `2026-11-14`.

## Consequences

- Anyone can learn whether an address has an account, a few at a time. Having an account here hints at mental health care. Recorded as residual risk R8 in [THREAT-MODEL.md](../THREAT-MODEL.md), and as a lawyer question in [PRIVACY-COMPLIANCE.md](../PRIVACY-COMPLIANCE.md#questions-for-the-lawyer).
- The `account_exists_notice` email is gone.
