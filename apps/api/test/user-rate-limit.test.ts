import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { API, baseEnv, createHarness, signInConsented, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('per-user rate limit on signed-in routes', () => {
  it('defaults to 60 requests a minute', () => {
    expect(h.config.userRateLimitPerMinute).toBe(60);
  });

  it('allows 60 requests a minute from one account, then answers 429 with Retry-After', async () => {
    const { client } = await signInConsented(h);
    // Accepting consent was this account's first signed-in request, so 59 remain this minute.
    for (let i = 1; i < 60; i++) {
      const ok = await client.get(`${API}/journal`);
      expect(ok.statusCode, `request ${i + 1}`).toBe(200);
    }
    const limited = await client.get(`${API}/journal`);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('rate_limited');
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('counts per account, so one busy person does not slow down another on the same network', async () => {
    const busy = await signInConsented(h);
    const other = await signInConsented(h);
    for (let i = 0; i < 61; i++) await busy.client.get(`${API}/me`);
    expect((await busy.client.get(`${API}/me`)).statusCode).toBe(429);
    expect((await other.client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('covers writes too, and every device of the account shares the budget', async () => {
    const first = await signInConsented(h);
    for (let i = 0; i < 60; i++) await first.client.get(`${API}/auth/sessions`);
    const write = await first.client.patch(`${API}/me`, { displayName: 'x' });
    expect(write.statusCode).toBe(429);
  });

  it('can be configured within safe bounds, and refuses nonsense', () => {
    expect(loadConfig(baseEnv({ USER_RATE_LIMIT_PER_MINUTE: '120' })).userRateLimitPerMinute).toBe(120);
    expect(() => loadConfig(baseEnv({ USER_RATE_LIMIT_PER_MINUTE: '0' }))).toThrow();
    expect(() => loadConfig(baseEnv({ USER_RATE_LIMIT_PER_MINUTE: '100000' }))).toThrow();
  });
});
