# 004. Application-layer encryption with per-user keys

Status: accepted, 2026-11-06. Decided by: the builder.

## Context

The database is run by a third party, and holds identifiable health data. Backups and dumps exist outside the app's control. Disk encryption doesn't help against someone with database access.

## Decision

Email, name, device label, assessment payload and journal payload are AES-256-GCM encrypted by the API before they reach the database.

- Each user has a random data key, wrapped by a versioned master key held in the environment.
- AAD binds each ciphertext to its column, row and owner.
- Values are padded to fixed sizes or size steps.
- Lookups use an HMAC blind index under a separate key.

Details: [encryption](../modules/encryption.md).

## Alternatives

- **Disk or database encryption only.** Anyone able to query sees plaintext.
- **Column encryption inside Postgres (pgcrypto).** Keys or plaintext would reach the database.
- **End-to-end encryption with keys on the device.** Protects against the server too, but a lost phone would lose data, there's no password to derive a key from, and the server couldn't compute the score. Too much risk for this audience.
- **One key for all users.** Simpler, but deleting a person wouldn't destroy a key, and rotating would touch all data.

## Consequences

- A database dump alone can't read this data. A dump plus `ENCRYPTION_KEYS` can.
- Losing `ENCRYPTION_KEYS` loses all user data permanently. It needs a copy in a separate store.
- No SQL search or sorting on encrypted fields. Everything sorts by plaintext timestamps, which do show when someone was active.
- Master keys can rotate without re-encrypting data, using `npm run rotate-keys -w @anxiocare/api`.
- The server still sees plaintext while working. This isn't end-to-end, and the Privacy notice says so.
