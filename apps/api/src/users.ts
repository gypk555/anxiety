import { randomUUID } from 'node:crypto';
import { CONSENT_VERSION, type Me } from '@anxiocare/shared';
import { openText, sealText, type Keys } from './crypto.ts';
import type { Db, Sql } from './db.ts';

export interface UserRow {
  id: string;
  email_hash: Buffer;
  email_ct: Buffer;
  display_name_ct: Buffer | null;
  wrapped_dek: Buffer;
  dek_key_version: string;
  consent_version: string | null;
  created_at: Date;
  /** Argon2id PHC string. Null for an account that signs in by email code or Google only. */
  password_hash: string | null;
}

export const dekFor = (keys: Keys, user: Pick<UserRow, 'id' | 'wrapped_dek' | 'dek_key_version'>) =>
  keys.ring.unwrap(user.wrapped_dek, user.dek_key_version, user.id);

export const emailOf = (keys: Keys, user: UserRow) => openText(dekFor(keys, user), user.email_ct, 'users.email', user.id, user.id);

export const hasCurrentConsent = (user: Pick<UserRow, 'consent_version'>) => user.consent_version === CONSENT_VERSION;

export function toMe(keys: Keys, user: UserRow): Me {
  const dek = dekFor(keys, user);
  return {
    id: user.id,
    email: openText(dek, user.email_ct, 'users.email', user.id, user.id),
    displayName: user.display_name_ct ? openText(dek, user.display_name_ct, 'users.display_name', user.id, user.id) : null,
    createdAt: user.created_at.toISOString(),
    consentRequired: !hasCurrentConsent(user),
    consentVersion: CONSENT_VERSION,
    acceptedConsentVersion: user.consent_version,
  };
}

export async function loadUser(db: Db, id: string): Promise<UserRow> {
  const [user] = await db<UserRow[]>`SELECT * FROM app.users WHERE id = ${id}::uuid`;
  if (!user) throw new Error('user row vanished');
  return user;
}

/**
 * Create account, after the code proved the address. Null if the address has an account by now: it may have got
 * one another way since the code was sent, and a code that predates it must not set its password or sign in to it.
 */
export async function createUserWithPassword(
  sql: Sql,
  keys: Keys,
  input: { email: string; emailHash: Buffer; passwordHash: string; displayName: string | null },
): Promise<UserRow | null> {
  const id = randomUUID();
  const dek = keys.ring.generateDataKey();
  const { wrapped, version } = keys.ring.wrap(dek, id);
  const emailCt = sealText(dek, input.email, 'users.email', id, id);
  const nameCt = input.displayName ? sealText(dek, input.displayName, 'users.display_name', id, id) : null;
  const [created] = await sql<UserRow[]>`
    INSERT INTO app.users (id, email_hash, email_ct, display_name_ct, wrapped_dek, dek_key_version, password_hash)
    VALUES (${id}::uuid, ${input.emailHash}, ${emailCt}, ${nameCt}, ${wrapped}, ${version}, ${input.passwordHash})
    ON CONFLICT (email_hash) DO NOTHING
    RETURNING *
  `;
  return created ?? null;
}

/**
 * Email-code sign-in and Google share this path. The unique blind index settles a first-login race:
 * the loser's insert does nothing and it reads the winner's row, whose key its own copy never touched.
 */
export async function findOrCreateUser(sql: Sql, keys: Keys, email: string, emailHash: Buffer): Promise<UserRow & { firstSignIn: boolean }> {
  const id = randomUUID();
  const dek = keys.ring.generateDataKey();
  const { wrapped, version } = keys.ring.wrap(dek, id);
  const emailCt = sealText(dek, email, 'users.email', id, id);
  const [created] = await sql<UserRow[]>`
    INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version)
    VALUES (${id}::uuid, ${emailHash}, ${emailCt}, ${wrapped}, ${version})
    ON CONFLICT (email_hash) DO NOTHING
    RETURNING *
  `;
  if (created) return { ...created, firstSignIn: true };
  const [existing] = await sql<UserRow[]>`SELECT * FROM app.users WHERE email_hash = ${emailHash}`;
  if (!existing) throw new Error('user row vanished');
  return { ...existing, firstSignIn: false };
}
