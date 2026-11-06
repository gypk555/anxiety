import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from '@anxiocare/shared';

/** Thrown for any ciphertext that fails to authenticate. Deliberately carries no detail. */
export class DecryptError extends Error {
  constructor() {
    super('decrypt_failed');
    this.name = 'DecryptError';
  }
}

const FORMAT_V1 = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** AES-256-GCM with a fresh random nonce. Layout: format(1) | nonce(12) | ciphertext | tag(16). */
export function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_V1]), nonce, body, cipher.getAuthTag()]);
}

export function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  try {
    if (blob.length < 1 + NONCE_BYTES + TAG_BYTES || blob[0] !== FORMAT_V1) throw new DecryptError();
    const nonce = blob.subarray(1, 1 + NONCE_BYTES);
    const tag = blob.subarray(blob.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(blob.subarray(1 + NONCE_BYTES, blob.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new DecryptError();
  }
}

/**
 * Size steps for padding, by field. Length is the one thing AES-GCM does not hide: without this a
 * severity label, or how much someone wrote, can be read from a database dump. Each step is larger than
 * any value the field can hold, except the journal, whose steps deliberately leave only a coarse size.
 */
const PAD_STEP: Readonly<Record<string, number>> = {
  'assessments.payload': 256,
  'journal_entries.payload': 4096,
  'users.email': 512,
  'users.display_name': 256,
  'sessions.device_label': 64,
};
const DEFAULT_PAD_STEP = 256;
const LENGTH_PREFIX_BYTES = 4;

function pad(plaintext: Buffer, field: string): Buffer {
  const step = PAD_STEP[field] ?? DEFAULT_PAD_STEP;
  const used = LENGTH_PREFIX_BYTES + plaintext.length;
  const padded = Buffer.alloc(Math.ceil(used / step) * step);
  padded.writeUInt32BE(plaintext.length, 0);
  plaintext.copy(padded, LENGTH_PREFIX_BYTES);
  return padded;
}

function unpad(padded: Buffer): Buffer {
  if (padded.length < LENGTH_PREFIX_BYTES) throw new DecryptError();
  const length = padded.readUInt32BE(0);
  if (length > padded.length - LENGTH_PREFIX_BYTES) throw new DecryptError();
  return padded.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length);
}

/** Binds a ciphertext to its column, row and owner so rows cannot be swapped. */
export const aad = (field: string, rowId: string, userId: string) => `${field}:${rowId}:${userId}`;

export function sealText(dek: Buffer, text: string, field: string, rowId: string, userId: string): Buffer {
  return seal(dek, pad(Buffer.from(text, 'utf8'), field), aad(field, rowId, userId));
}

export function openText(dek: Buffer, blob: Buffer, field: string, rowId: string, userId: string): string {
  return unpad(open(dek, blob, aad(field, rowId, userId))).toString('utf8');
}

export function sealJson(dek: Buffer, value: unknown, field: string, rowId: string, userId: string): Buffer {
  return sealText(dek, JSON.stringify(value), field, rowId, userId);
}

export function openJson<T>(dek: Buffer, blob: Buffer, field: string, rowId: string, userId: string): T {
  const text = openText(dek, blob, field, rowId, userId);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DecryptError();
  }
}

export interface WrappedKey {
  wrapped: Buffer;
  version: string;
}

/** Versioned master keys that wrap each user's data key. */
export class KeyRing {
  readonly #keys: ReadonlyMap<string, Buffer>;
  readonly activeVersion: string;

  constructor(keys: ReadonlyMap<string, Buffer>, activeVersion: string) {
    if (!keys.has(activeVersion)) throw new Error('active key version is not in the key ring');
    this.#keys = keys;
    this.activeVersion = activeVersion;
  }

  #aad(userId: string, version: string) {
    return `users.wrapped_dek:${userId}:${version}`;
  }

  generateDataKey(): Buffer {
    return randomBytes(32);
  }

  wrap(dek: Buffer, userId: string): WrappedKey {
    const version = this.activeVersion;
    return { version, wrapped: seal(this.#keys.get(version)!, dek, this.#aad(userId, version)) };
  }

  unwrap(wrapped: Buffer, version: string, userId: string): Buffer {
    const key = this.#keys.get(version);
    if (!key) throw new DecryptError();
    return open(key, wrapped, this.#aad(userId, version));
  }
}

export interface Keys {
  ring: KeyRing;
  emailIndexKey: Buffer;
  otpPepper: Buffer;
  auditKey: Buffer;
}

export const hmac = (key: Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();
export const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest();

export const emailBlindIndex = (keys: Keys, normalisedEmail: string) => hmac(keys.emailIndexKey, `email:${normalisedEmail}`);
/** The quota key. Separate from the blind index, because it joins addresses that are different accounts. */
export const emailQuotaIndex = (keys: Keys, canonicalEmail: string) => hmac(keys.emailIndexKey, `email-quota:${canonicalEmail}`);
export const auditActor = (keys: Keys, userId: string) => hmac(keys.auditKey, `actor:${userId}`);

export function otpHmac(
  keys: Keys,
  input: { purpose: string; emailHash: Buffer; subjectUserId: string | null; binding?: Buffer | null; code: string },
): Buffer {
  const binding = input.binding?.toString('hex') ?? '';
  const target = `${input.purpose}\0${input.emailHash.toString('hex')}\0${input.subjectUserId ?? ''}\0${binding}\0${input.code}`;
  return hmac(keys.otpPepper, target);
}

export const constantTimeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

export const generateSessionToken = () => randomBytes(32).toString('base64url');
