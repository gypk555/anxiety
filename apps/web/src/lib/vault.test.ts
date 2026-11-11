import 'fake-indexeddb/auto';
import { emptySafetyPlan, type SafetyPlan } from '@anxiocare/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { clearAccountCopy, deleteDevicePlan, forgetOtherAccounts, loadDevicePlan, readVaultRaw, saveDevicePlan, VAULT_DB, wipeVault } from './vault';

const PLAN: SafetyPlan = {
  ...emptySafetyPlan(),
  warningSigns: ['MarkerWarningSign'],
  helpContacts: [{ name: 'MarkerContactName', phone: '+91 98765 43210' }],
  reasonsToLive: ['MarkerReason'],
};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

afterEach(async () => {
  await wipeVault();
});

/** Everything the vault holds, as a reader of the browser's storage would see it. */
async function everythingStored(): Promise<string> {
  const rows = await readVaultRaw();
  return JSON.stringify(rows, (_k, v: unknown) => {
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
      const bytes = new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer);
      return new TextDecoder('latin1').decode(bytes);
    }
    return v;
  });
}

describe('device copy of the safety plan', () => {
  it('round-trips a guest plan and an account plan separately', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    await saveDevicePlan({ kind: 'account', userId: A }, { ...PLAN, reasonsToLive: ['Other'] });
    expect((await loadDevicePlan({ kind: 'guest' }))?.plan).toEqual(PLAN);
    expect((await loadDevicePlan({ kind: 'account', userId: A }))?.plan.reasonsToLive).toEqual(['Other']);
  });

  it('holds nothing readable: no plan text, names, numbers or user id in IndexedDB, localStorage or sessionStorage', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    await saveDevicePlan({ kind: 'account', userId: A }, PLAN);
    const stored = await everythingStored();
    for (const marker of ['MarkerWarningSign', 'MarkerContactName', '98765', 'MarkerReason', A, 'warningSigns']) {
      expect([marker, stored.includes(marker)]).toEqual([marker, false]);
    }
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('uses a random AES-GCM key that cannot be exported', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    const rows = await readVaultRaw();
    const key = rows['device-key'] as CryptoKey;
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('a fresh nonce each save, so the same plan never looks the same twice', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    const first = await everythingStored();
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    expect(await everythingStored()).not.toBe(first);
  });

  it("an account copy opens only for its owner, and another account's sign-in removes it", async () => {
    await saveDevicePlan({ kind: 'account', userId: A }, PLAN);
    expect(await loadDevicePlan({ kind: 'account', userId: B })).toBeNull();
    // Offline, with nobody known: the last signed-in person's copy, which sign-out would have removed.
    expect((await loadDevicePlan({ kind: 'account' }))?.plan).toEqual(PLAN);
    await forgetOtherAccounts(A);
    expect(await loadDevicePlan({ kind: 'account', userId: A })).not.toBeNull();
    await forgetOtherAccounts(B);
    expect(await loadDevicePlan({ kind: 'account' })).toBeNull();
    expect(await everythingStored()).not.toContain('"plan:account"');
  });

  it('sign-out clears the account copy and keeps a guest plan the person made on purpose', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    await saveDevicePlan({ kind: 'account', userId: A }, PLAN);
    await clearAccountCopy();
    expect(await loadDevicePlan({ kind: 'account' })).toBeNull();
    expect(await loadDevicePlan({ kind: 'guest' })).not.toBeNull();
  });

  it('a guest can delete their device copy', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    await deleteDevicePlan({ kind: 'guest' });
    expect(await loadDevicePlan({ kind: 'guest' })).toBeNull();
  });

  it('a damaged or swapped record is treated as absent, never shown half-read', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    await saveDevicePlan({ kind: 'account', userId: A }, { ...PLAN, reasonsToLive: ['Account'] });
    const db: IDBDatabase = await new Promise((resolve) => {
      const r = indexedDB.open(VAULT_DB);
      r.onsuccess = () => resolve(r.result);
    });
    const guest = await new Promise<{ iv: Uint8Array; ct: ArrayBuffer }>((resolve) => {
      const r = db.transaction('kv').objectStore('kv').get('plan:guest');
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').get('plan:account').onsuccess = (e) => {
        const account = (e.target as IDBRequest).result;
        tx.objectStore('kv').put({ ...account, iv: guest.iv, ct: guest.ct }, 'plan:account');
      };
      tx.oncomplete = resolve;
    });
    db.close();
    expect(await loadDevicePlan({ kind: 'account', userId: A })).toBeNull();
  });
});

describe('the device key', () => {
  it('is made once even when two first saves race, so both copies stay readable', async () => {
    await Promise.all([saveDevicePlan({ kind: 'guest' }, PLAN), saveDevicePlan({ kind: 'account', userId: A }, PLAN)]);
    expect(await loadDevicePlan({ kind: 'guest' })).not.toBeNull();
    expect(await loadDevicePlan({ kind: 'account', userId: A })).not.toBeNull();
  });
});
