import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Argon2Params {
  memory: number;
  passes: number;
  parallelism: number;
}

/** OWASP's minimum for Argon2id. Config refuses anything lower. */
export const ARGON2_FLOOR: Argon2Params = { memory: 19_456, passes: 2, parallelism: 1 };

const SALT_BYTES = 16;
const TAG_BYTES = 32;
const VERSION = 19;
/**
 * Each hash holds `memory` KiB, so these bound memory on a 512 MB instance under a login flood: three at once, at the
 * 64 MiB ceiling config allows, is 192 MiB. Two are for anyone. The third is kept for requests from a known device, so
 * people who have signed in on this browser before still get through while strangers flood the queue.
 */
const GENERAL_SLOTS = 2;
const RESERVED_SLOTS = 1;
const MAX_RUNNING = GENERAL_SLOTS + RESERVED_SLOTS;
export const ARGON2_MAX_RUNNING = MAX_RUNNING;
/** The most memory one hash may take. Config refuses more. */
export const ARGON2_MAX_MEMORY_KIB = 65_536;
const MAX_QUEUED = 16;
/** Sign-in attempts a minute from one client (IPv6 by /64), checked before anything is hashed or counted. */
export const LOGIN_PER_SOURCE_PER_MINUTE = 10;
/** A token bucket for the whole instance, for attempts from unknown devices. Near what two slots can hash on a small instance. */
const BUCKET_CAPACITY = 30;
const BUCKET_REFILL_PER_SECOND = 20;
const SOURCES_TRACKED = 50_000;

export class PasswordsBusyError extends Error {
  constructor() {
    super('password hashing is at capacity');
    this.name = 'PasswordsBusyError';
  }
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface ParsedHash extends Argon2Params {
  salt: Buffer;
  tag: Buffer;
}

function parsePhc(phc: string): ParsedHash | null {
  const match = PHC.exec(phc);
  if (!match) return null;
  const [memory, passes, parallelism] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const salt = Buffer.from(match[4]!, 'base64');
  const tag = Buffer.from(match[5]!, 'base64');
  if (!memory || !passes || !parallelism || salt.length < 8 || tag.length < 16) return null;
  return { memory, passes, parallelism, salt, tag };
}

const b64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');

function derive(message: Buffer, secret: Buffer, salt: Buffer, params: Argon2Params, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      // The pepper is Argon2's own keyed-hashing input (RFC 9106 section 3.1, "secret K"), not a separate pre-hash.
      { message, secret, nonce: salt, parallelism: params.parallelism, tagLength, memory: params.memory, passes: params.passes },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    );
  });
}

/**
 * Argon2id through node:crypto, keyed with the pepper as Argon2's secret input. A dump of the table is not enough to attack the hashes
 * without the pepper. Every hash and check holds a slot, and only a few run at once, because each one takes real
 * memory. What will not fit in the queue is refused at once, with no address-dependent difference. Sign-in attempts
 * are admitted first (see `admit`), so a flood is shed before it reaches the queue.
 */
export class Passwords {
  readonly #pepper: Buffer;
  readonly #params: Argon2Params;
  #running = 0;
  #peak = 0;
  #verifications = 0;
  readonly #waiting: (() => void)[] = [];
  readonly #waitingKnown: (() => void)[] = [];
  #dummy: Promise<string> | null = null;
  #tokens = BUCKET_CAPACITY;
  #refilledAt = Date.now();
  readonly #recent = new Map<string, number[]>();

  constructor(pepper: Buffer, params: Argon2Params) {
    this.#pepper = pepper;
    this.#params = params;
  }

  get stats() {
    return {
      peak: this.#peak,
      limit: MAX_RUNNING,
      generalLimit: GENERAL_SLOTS,
      queueLimit: MAX_QUEUED,
      queued: this.#waiting.length + this.#waitingKnown.length,
      verifications: this.#verifications,
    };
  }

  resetPeak(): void {
    this.#peak = this.#running;
  }

  /**
   * Whether a sign-in attempt may go on to be counted and hashed. Per client first, then, for an unknown device, the
   * instance-wide bucket. In memory and per instance, like the route limits. Nothing here depends on the address.
   */
  admit(source: string, knownDevice: boolean): boolean {
    const now = Date.now();
    // A clock that stepped back makes later entries look like the future: they are dropped rather than held forever.
    const window = (this.#recent.get(source) ?? []).filter((t) => t > now - 60_000 && t <= now);
    if (window.length >= LOGIN_PER_SOURCE_PER_MINUTE) {
      this.#recent.set(source, window);
      return false;
    }
    if (!knownDevice) {
      this.#tokens = Math.min(BUCKET_CAPACITY, this.#tokens + (Math.max(0, now - this.#refilledAt) / 1000) * BUCKET_REFILL_PER_SECOND);
      this.#refilledAt = now;
      if (this.#tokens < 1) return false;
      this.#tokens -= 1;
    }
    window.push(now);
    this.#recent.delete(source);
    this.#recent.set(source, window);
    // Oldest first, so a flood of made-up sources forgets the stalest, not the busiest.
    if (this.#recent.size > SOURCES_TRACKED) this.#recent.delete(this.#recent.keys().next().value!);
    return true;
  }

  #message(password: string): Buffer {
    // The same password on any device: a phone keyboard and a laptop can compose the same character differently.
    return Buffer.from(password.normalize('NFKC'), 'utf8');
  }

  async #acquire(known: boolean): Promise<void> {
    const free = known ? this.#running < MAX_RUNNING && this.#waitingKnown.length === 0 : this.#running < GENERAL_SLOTS && this.#waiting.length === 0;
    if (free) {
      this.#running += 1;
    } else {
      const queue = known ? this.#waitingKnown : this.#waiting;
      if (queue.length >= MAX_QUEUED) throw new PasswordsBusyError();
      // #pump counts the slot in before it wakes a waiter, so nothing can overtake it.
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    this.#peak = Math.max(this.#peak, this.#running);
  }

  #release(): void {
    this.#running -= 1;
    this.#pump();
  }

  /** Known devices first, into any slot; everyone else only into the general ones. */
  #pump(): void {
    for (;;) {
      if (this.#waitingKnown.length > 0 && this.#running < MAX_RUNNING) {
        this.#running += 1;
        this.#waitingKnown.shift()!();
      } else if (this.#waiting.length > 0 && this.#running < GENERAL_SLOTS) {
        this.#running += 1;
        this.#waiting.shift()!();
      } else {
        return;
      }
    }
  }

  /** Holds a slot across `work`, for a check that must not spend a code and then find it cannot hash. */
  async withSlot<T>(work: (hash: (password: string) => Promise<string>) => Promise<T>, known = false): Promise<T> {
    await this.#acquire(known);
    try {
      return await work((password) => this.#hash(password));
    } finally {
      this.#release();
    }
  }

  hash(password: string, known = false): Promise<string> {
    return this.withSlot((hash) => hash(password), known);
  }

  async #hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await derive(this.#message(password), this.#pepper, salt, this.#params, TAG_BYTES);
    const { memory, passes, parallelism } = this.#params;
    return `$argon2id$v=${VERSION}$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(tag)}`;
  }

  /**
   * Checks a password against a stored hash. With no stored hash it does the same work against a dummy, so that
   * an unknown address and an account with no password take as long as a wrong password.
   */
  async verify(password: string, stored: string | null, known = false): Promise<boolean> {
    await this.#acquire(known);
    try {
      this.#verifications += 1;
      const parsed = stored ? parsePhc(stored) : null;
      const target = parsed ?? parsePhc(await this.#dummyHash())!;
      const tag = await derive(this.#message(password), this.#pepper, target.salt, target, target.tag.length);
      return parsed !== null && timingSafeEqual(tag, target.tag);
    } finally {
      this.#release();
    }
  }

  /** At server start, so the first unknown address is not slower than the rest. */
  async ready(): Promise<void> {
    await this.#dummyHash();
  }

  #dummyHash(): Promise<string> {
    this.#dummy ??= this.#hash(randomBytes(32).toString('base64'));
    return this.#dummy;
  }

  /** True when a stored hash is weaker than the current parameters. It lives in the string, so it can be raised at any time. */
  needsRehash(stored: string): boolean {
    const parsed = parsePhc(stored);
    if (!parsed) return false;
    const { memory, passes, parallelism } = this.#params;
    return parsed.memory < memory || parsed.passes < passes || parsed.parallelism < parallelism;
  }
}
