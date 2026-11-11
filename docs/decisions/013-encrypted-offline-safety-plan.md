# 013. Encrypted offline copy of the safety plan

Status: accepted, 2026-11-11. Decided by: the owner (the [spec](../superpowers/specs/2026-11-11-safety-and-tracking-design.md)), built as described here.

## Context

A safety plan is for hard moments, and those can come with no signal. After it has loaded once, a signed-in person's plan must open offline. A guest must be able to keep a plan with no account at all.

Two other rules stand in the way:

- Nothing sensitive goes in `localStorage`.
- The service worker never caches `/api`.

A plan holds the person's own words about crisis, and other people's phone numbers.

## Decision

The plan is kept on the device in IndexedDB (`anxiocare-vault`), encrypted with AES-GCM 256.

- **The key** is made in the browser by `crypto.subtle.generateKey` with `extractable: false`, and stored as a `CryptoKey` in the same IndexedDB. Script on this origin can use it, but nothing can read its bytes out.
- **The records** hold a nonce, ciphertext, a timestamp and, for an account, a SHA-256 of the account id. The additional data binds each record to its slot and owner.
- **The account copy** is removed:
  - on sign-out
  - when a session ends underneath the person
  - on account deletion
  - when a different account signs in
- **The guest copy** stays until the person deletes it or moves it to an account.

Code: [vault.ts](../../apps/web/src/lib/vault.ts). Behaviour: [safety plan](../modules/safety-plan.md).

## Alternatives

- **No offline copy.** Simplest and safest for storage, but the plan would fail exactly when there's no signal. Rejected by the spec.
- **Plaintext in IndexedDB or `localStorage`.** Readable from the browser's files and backups. `localStorage` is forbidden for anything but the theme.
- **Caching `GET /safety-plan` in the service worker.** Breaks the rule that `/api` is never cached, and would hold plaintext.
- **A key derived from a passphrase, or sent by the server.** A passphrase is too much to ask in a crisis. A server key needs the network the copy exists to do without.

## Consequences

- Someone reading the browser's storage or a device backup sees only ciphertext. Tests dump `localStorage`, `sessionStorage` and every IndexedDB record and look for plaintext.
- It doesn't protect against someone holding the unlocked phone. They can open the app, which can use the key. The privacy notice says so.
- Safari may delete IndexedDB after 7 days without a visit, outside a home-screen app, so the copy can vanish. For a guest that means the plan is gone.
- Offline after a reload, nobody can say who is signed in, so the app shows the last signed-in account's copy. Every way of leaving an account removes it, except a session that expires while the phone stays offline.
- Quick exit leaves the copy alone, because removing it is asynchronous and quick exit must not wait.
