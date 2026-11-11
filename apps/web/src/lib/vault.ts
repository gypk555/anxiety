import { safetyPlanBody, type SafetyPlan } from '@anxiocare/shared';

/**
 * The one thing kept on the device on purpose: an encrypted copy of a safety plan, so that it opens with no
 * connection. The key is random, made here, and non-extractable (WebCrypto `extractable: false`), so script can use
 * it but never read it out. Key and ciphertext both live in IndexedDB. Nothing here ever touches localStorage.
 *
 * What it protects against: someone reading the browser's storage files, or a backup of them. What it does not: a
 * person holding the unlocked phone, who can open the app itself. See docs/modules/safety-plan.md.
 */
export const VAULT_DB = 'anxiocare-vault';
const STORE = 'kv';
const KEY_ID = 'device-key';

export type VaultSlot = { kind: 'guest' } | { kind: 'account'; userId?: string };

interface Sealed {
  /** SHA-256 of the account id, for an account copy. Never the id itself. */
  owner?: string;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  savedAt: string;
}

const recordId = (slot: VaultSlot) => `plan:${slot.kind}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? (request.result as T) : (undefined as T));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const get = <T>(id: string) => withStore<T | undefined>('readonly', (s) => s.get(id));
const put = (id: string, value: unknown) => withStore<void>('readwrite', (s) => void s.put(value, id));
const remove = (id: string) => withStore<void>('readwrite', (s) => void s.delete(id));

/**
 * The device key, made once. Two first saves at the same moment must not each make one, or one copy would be sealed
 * under a key that is then overwritten: the new key is offered, and kept only if none exists, in one transaction.
 */
async function deviceKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(KEY_ID);
  if (existing) return existing;
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const db = await open();
  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let kept = fresh;
      const read = store.get(KEY_ID);
      read.onsuccess = () => {
        if (read.result) kept = read.result as CryptoKey;
        else store.put(fresh, KEY_ID);
      };
      tx.oncomplete = () => resolve(kept);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function ownerTag(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`anxiocare-plan-owner:${userId}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Binds the ciphertext to its slot and owner, so a guest copy can't be passed off as an account's, or one account's as another's. */
const aad = (kind: VaultSlot['kind'], owner: string | undefined) => new TextEncoder().encode(`anxiocare-plan:${kind}:${owner ?? 'guest'}`);

export async function saveDevicePlan(slot: VaultSlot, plan: SafetyPlan): Promise<void> {
  const owner = slot.kind === 'account' ? (slot.userId ? await ownerTag(slot.userId) : undefined) : undefined;
  if (slot.kind === 'account' && !owner) throw new Error('an account copy needs its owner');
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(slot.kind, owner) },
    key,
    new TextEncoder().encode(JSON.stringify(safetyPlanBody.parse(plan))),
  );
  const record: Sealed = { ...(owner ? { owner } : {}), iv, ct, savedAt: new Date().toISOString() };
  await put(recordId(slot), record);
}

/**
 * The plan, or null when there is none, it belongs to someone else, or it can't be read. An account slot without a
 * user id is the offline case, where nobody can be asked who is signed in: it is whoever signed in last, because
 * signing out and another account's sign-in both remove it.
 */
export async function loadDevicePlan(slot: VaultSlot): Promise<{ plan: SafetyPlan; savedAt: string } | null> {
  try {
    const record = await get<Sealed>(recordId(slot));
    if (!record) return null;
    if (slot.kind === 'account' && slot.userId && record.owner !== (await ownerTag(slot.userId))) return null;
    const key = await get<CryptoKey>(KEY_ID);
    if (!key) return null;
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(slot.kind, record.owner) }, key, record.ct);
    const plan = safetyPlanBody.safeParse(JSON.parse(new TextDecoder().decode(clear)));
    return plan.success ? { plan: plan.data, savedAt: record.savedAt } : null;
  } catch {
    return null;
  }
}

export async function deleteDevicePlan(slot: VaultSlot): Promise<void> {
  try {
    await remove(recordId(slot));
  } catch {
    /* Storage unavailable: there is nothing to remove. */
  }
}

/** On sign-out, session end and account deletion. A guest plan the person made on purpose stays. */
export const clearAccountCopy = () => deleteDevicePlan({ kind: 'account' });

/** When someone signs in: another account's copy must never be shown to them. */
export async function forgetOtherAccounts(userId: string): Promise<void> {
  try {
    const record = await get<Sealed>(recordId({ kind: 'account' }));
    if (record && record.owner !== (await ownerTag(userId))) await clearAccountCopy();
  } catch {
    /* Storage unavailable. */
  }
}

export async function hasGuestPlan(): Promise<boolean> {
  return (await loadDevicePlan({ kind: 'guest' })) !== null;
}

/** Removes the whole store, key included. */
export function wipeVault(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(VAULT_DB);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // Not on "blocked": the delete still happens once open connections close, and would then remove newer data.
    } catch {
      resolve();
    }
  });
}

/** For tests: every record, as stored. */
export async function readVaultRaw(): Promise<Record<string, unknown>> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const out: Record<string, unknown> = {};
      const tx = db.transaction(STORE, 'readonly');
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        out[String(c.key)] = c.value;
        c.continue();
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
