# Encryption

## Purpose

Make a copy of the database, on its own, useless for reading anyone's email or health data. Why at the application layer: [decision 004](../decisions/004-application-layer-encryption.md).

This is not end-to-end encryption. The server decrypts data to use it, and it holds the keys. It protects against database-only exposure, not against someone with the server's environment.

## User-facing behaviour

None directly. The Privacy notice and consent screen say data is encrypted before it reaches the database, with a key unique to the person. The Privacy notice also says it passes through the server in readable form while being used.

## How it works

**Key layers.**

```text
ENCRYPTION_KEYS (env, versioned master keys)
   └── wraps each user's data key: users.wrapped_dek, users.dek_key_version
          └── encrypts that user's columns: email_ct, display_name_ct, device_label_ct, payload_ct
```

A new user gets a fresh random 32-byte data key in `findOrCreateUser`. It is wrapped under the active master key. `dekFor` unwraps it when needed.

**Sealing.** `seal` uses AES-256-GCM with a random 12-byte nonce. The stored layout is `format(1) | nonce(12) | ciphertext | tag(16)`. The format byte is 1.

**Binding.** Each ciphertext has AAD `field:rowId:userId`, for example `journal_entries.payload:<row>:<user>`. A wrapped key has AAD `users.wrapped_dek:<user>:<version>`. Moving a blob to another row, column or person makes decryption fail, even under the same key.

**Padding.** `sealText` adds a 4-byte length, then pads to a multiple of a step, because GCM does not hide length.

| Field | Step | Effect |
| --- | --- | --- |
| `assessments.payload` | 256 | All severities have the same size |
| `journal_entries.payload` | 4096 | Only a coarse size shows |
| `users.email` | 512 | Fixed |
| `users.display_name` | 256 | Fixed |
| `sessions.device_label` | 64 | Fixed |

**Other keys.** Each must be different, or config refuses to start.

| Key | Used for | Rotating it means |
| --- | --- | --- |
| `EMAIL_INDEX_KEY` | Email blind index and quota key | Cannot be rotated without re-hashing, and the plain addresses are encrypted |
| `OTP_PEPPER` | Code HMACs and `source_hash` | Live codes stop working |
| `AUDIT_KEY` | Audit actor | New rows can't be matched with old ones |

Config also rejects a key that isn't 32 bytes of base64 or looks typed-in (fewer than 16 distinct byte values).

**Rotating the master key.** `rotateKeys` rewraps every data key under the active master key. Only `wrapped_dek` and `dek_key_version` change, so no data is re-encrypted. It moves rows one at a time, guarded on the current version, so it can be re-run.

1. Set `ENCRYPTION_KEYS="v1:<old>,v2:<new>"` and `ENCRYPTION_ACTIVE_KEY=v2`, then deploy.
2. Run `npm run rotate-keys -w @anxiocare/api` with the same environment.
3. Remove `v1`, then deploy.

Generate new values with `npm run generate-secrets -w @anxiocare/api`.

## Key files

- [apps/api/src/crypto.ts](../../apps/api/src/crypto.ts)
- [apps/api/src/users.ts](../../apps/api/src/users.ts) (`dekFor`, `findOrCreateUser`)
- [apps/api/src/rotate.ts](../../apps/api/src/rotate.ts)
- [apps/api/scripts/rotate-keys.ts](../../apps/api/scripts/rotate-keys.ts)
- [apps/api/scripts/generate-secrets.ts](../../apps/api/scripts/generate-secrets.ts)
- [apps/api/src/config.ts](../../apps/api/src/config.ts) (key validation)

## Data and API used

All `_ct` columns and `wrapped_dek`. Column-by-column table: [DATABASE.md](../DATABASE.md#tables). Env: `ENCRYPTION_KEYS`, `ENCRYPTION_ACTIVE_KEY`, `EMAIL_INDEX_KEY`, `OTP_PEPPER`, `AUDIT_KEY`. No endpoints of its own.

## Security/privacy notes

- **Losing `ENCRYPTION_KEYS` makes all user data permanently unreadable.** Keep a copy in a separate secret store. Losing `EMAIL_INDEX_KEY` cuts people off from their data: their address would no longer match, and signing in would make a new, empty account.
- `ENCRYPTION_KEYS` plus the database reads everything. Keep them apart.
- Erasure removes `wrapped_dek` with the row, so any stray copy of that person's ciphertext becomes unreadable. A backup still holds both the wrapped key and the ciphertext until it ages out.
- Plaintext by design: ids, timestamps, hashes, counters and labels. A test pins this list.
- A decrypt failure logs only `decrypt_failed` and answers a generic 500.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Tampered or swapped ciphertext | `DecryptError`, 500 `internal_error`, logged with no detail |
| A row's master key version is not in the ring | Same |
| `ENCRYPTION_ACTIVE_KEY` not in the ring | Config refuses to start |
| Same key used for two jobs | Config refuses to start |
| Rotation interrupted | Re-run. Finished rows are skipped |
| Rotation finds a row it can't unwrap | Stops, printing `Rotation failed (DecryptError)` |

## Tests that cover it

- [apps/api/test/encryption.test.ts](../../apps/api/test/encryption.test.ts) (raw SELECT, AAD, rotation)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (ciphertext length)
- [apps/api/test/config.test.ts](../../apps/api/test/config.test.ts) (key rules)

## Known limits

- Timing is visible: `taken_at`, `created_at`, `last_seen_at` and row counts are plaintext.
- Journal length shows in 4 KB steps.
- A data key is rewrapped but never itself replaced.
- `EMAIL_INDEX_KEY` has no rotation path.
- Rotation has been run only on local Postgres, not on Supabase.
- Keys live in environment variables, with no KMS or HSM.
