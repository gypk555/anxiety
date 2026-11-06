# 009. Guest check-in

Status: accepted, 2026-11-06. Decided by: the builder. The owner chose accounts with server storage. Letting people use the app without one was the builder's call.

## Context

Asking for an email before helping a person loses them, and can feel unsafe for someone anxious about privacy. Storing health data also needs explicit consent, which shouldn't be a price of entry.

## Decision

The check-in, result, tools, Help and legal pages work with no account. Guest answers stay in `sessionStorage` and aren't sent anywhere. After signing in, a person can choose to save a result up to 24 hours old. An account adds saving: trends, journal, settings.

## Alternatives

- **Account required.** Simpler code, more friction, and more data than is needed.
- **Guest data in `localStorage`.** Survives closing the tab, but it stays on a possibly shared phone with no way to know.
- **Anonymous server-side storage.** Sensitive data on the server with no one to give it back to.

## Consequences

- A shared phone keeps a result only until the tab closes.
- People can lose a result by closing the tab. The screen says this.
- Two paths to maintain: a browser-scored guest result, and a server-scored saved one. Both use the same `shared` code.
- Saving carries the original `clientRequestId` and `takenAt`, so it's idempotent and correctly dated. The 24-hour rule limits back-dating.
- Signed-out page loads still call `GET /me`, so the host sees a visit, though no check-in data.
- Age is stated, not checked, for guests. Accounts confirm 18+ at consent.
