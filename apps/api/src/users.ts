import { randomUUID } from 'node:crypto';
import { CONSENT_VERSION, profileSchema, stressFactorId, type Me, type Profile, type StressFactorId } from '@anxiocare/shared';
import { openJson, openText, sealJson, sealText, type Keys } from './crypto.ts';
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
  /** Sealed optional details. Null when none are set. */
  profile_ct: Buffer | null;
  about_seen_at: Date | null;
}

export const PROFILE_FIELD = 'users.profile';

/** Enough of a logger to say that a value was dropped. */
export interface DropLog { warn: (obj: object, msg: string) => void }

const SINGLE_FIELDS = ['avatar', 'ageRange', 'gender', 'occupation'] as const;

/**
 * The stored profile, field by field. A value no longer on its list (one removed or renamed since it was saved) is
 * dropped rather than failing the request: /me and the export must always answer. The log line has fixed words only.
 */
export function profileOf(dek: Buffer, user: Pick<UserRow, 'id' | 'profile_ct'>, log?: DropLog): Profile {
  if (!user.profile_ct) return {};
  const raw = openJson<Record<string, unknown>>(dek, user.profile_ct, PROFILE_FIELD, user.id, user.id);
  const shape = profileSchema.shape;
  const out: Record<string, unknown> = {};
  let dropped = false;
  for (const field of SINGLE_FIELDS) {
    if (raw[field] === undefined) continue;
    const parsed = shape[field].safeParse(raw[field]);
    if (parsed.success && parsed.data !== undefined) out[field] = parsed.data;
    else dropped = true;
  }
  if (raw.stressFactors !== undefined) {
    const list = Array.isArray(raw.stressFactors) ? raw.stressFactors : [];
    const kept = [...new Set(list.filter((f) => stressFactorId.safeParse(f).success))] as StressFactorId[];
    if (kept.length !== list.length || !Array.isArray(raw.stressFactors)) dropped = true;
    if (kept.length) out.stressFactors = kept;
  }
  if (Object.keys(raw).some((k) => k !== 'stressFactors' && !(SINGLE_FIELDS as readonly string[]).includes(k))) dropped = true;
  if (dropped) log?.warn({}, 'profile_value_dropped');
  return out as Profile;
}

/** Always sealed, an empty profile included, at one padded size: whether someone gave details doesn't show. */
export const sealProfile = (dek: Buffer, userId: string, profile: Profile): Buffer =>
  sealJson(dek, profile, PROFILE_FIELD, userId, userId);

export const dekFor = (keys: Keys, user: Pick<UserRow, 'id' | 'wrapped_dek' | 'dek_key_version'>) =>
  keys.ring.unwrap(user.wrapped_dek, user.dek_key_version, user.id);

export const emailOf = (keys: Keys, user: UserRow) => openText(dekFor(keys, user), user.email_ct, 'users.email', user.id, user.id);

export const hasCurrentConsent = (user: Pick<UserRow, 'consent_version'>) => user.consent_version === CONSENT_VERSION;

export function toMe(keys: Keys, user: UserRow, log?: DropLog): Me {
  const dek = dekFor(keys, user);
  return {
    id: user.id,
    email: openText(dek, user.email_ct, 'users.email', user.id, user.id),
    displayName: user.display_name_ct ? openText(dek, user.display_name_ct, 'users.display_name', user.id, user.id) : null,
    createdAt: user.created_at.toISOString(),
    consentRequired: !hasCurrentConsent(user),
    consentVersion: CONSENT_VERSION,
    acceptedConsentVersion: user.consent_version,
    profile: profileOf(dek, user, log),
    aboutSeen: user.about_seen_at !== null,
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
  input: { email: string; emailHash: Buffer; passwordHash: string; displayName: string },
): Promise<UserRow | null> {
  const id = randomUUID();
  const dek = keys.ring.generateDataKey();
  const { wrapped, version } = keys.ring.wrap(dek, id);
  const emailCt = sealText(dek, input.email, 'users.email', id, id);
  const nameCt = sealText(dek, input.displayName, 'users.display_name', id, id);
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
