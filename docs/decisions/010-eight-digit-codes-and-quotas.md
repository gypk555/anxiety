# 010. Eight-digit codes and quotas

Status: accepted, 2026-11-06. Decided by: the builder.

## Context

A sign-in code is a short secret, guessable if tries aren't limited. Rate limits by client address are weak here: IPv6 gives each subscriber many addresses, and many people in India share one carrier NAT address, so address limits must stay generous. In-memory limits also multiply with instances and reset on restart.

Anyone can type someone else's address, so limits must not let a stranger easily lock a person out, or flood their inbox.

## Decision

- 8 digits from a CSPRNG, stored as an HMAC under a pepper. 10 minutes. Single use. A new code retires the old one.
- 5 tries per code.
- In Postgres, per purpose, under an advisory lock so parallel requests can't pass them:
  - 5 sends an hour per canonical address and client
  - 20 sends an hour per canonical address
  - 50 failed guesses a rolling 24 hours per canonical address
- Only a guess at a live code counts as a failure.
- Per-client route limits on top. IPv6 counts by /64.
- Quotas count the canonical address (lower case, no `+tag`, Gmail without dots). Identity and delivery don't use it.

## Alternatives

- **6 digits.** The usual choice, and 100 times easier to guess. A phone keyboard and paste make 8 about as easy.
- **Client-address limits only.** Defeated by address rotation, and hits shared NATs.
- **Lock the account on failures.** Lets a stranger lock anyone out. There is also no account to lock without revealing that one exists.
- **A CAPTCHA.** A third party in the client, and a burden on someone in distress.

## Consequences

- An attacker gets at most 50 failed guesses a day, per address and purpose, against 100 million possible codes.
- The limits hold across instances and restarts.
- Limits per purpose mean sign-in spam can't block deletion or email change.
- Accepted cost: anyone can spend an address's 20 sign-in codes an hour, or with ten mails its 50 failed guesses, delaying that person's sign-in. Existing sessions keep working.
- A quota refusal is silent by design, to keep the request endpoint uniform. A person just doesn't get a mail.
