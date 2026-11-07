import { CSRF_HEADER, CSRF_HEADER_VALUE, meResponse } from '@anxiocare/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, ME, problem } from '@/test/render';
import { ApiError, errorMessage, NetworkError, request, requestFile } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('file downloads', () => {
  const answer = (headers: Record<string, string>) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"a":1}', { status: 200, headers })));

  it('uses the name the server sends, and its exact body', async () => {
    answer({ 'content-disposition': 'attachment; filename="account-data-2026-11-06.json"' });
    await expect(requestFile('/me/export')).resolves.toEqual({ filename: 'account-data-2026-11-06.json', text: '{"a":1}' });
  });

  it('falls back to a neutral name for a missing or unsafe one', async () => {
    for (const header of [{}, { 'content-disposition': 'attachment; filename="../../evil.sh"' }]) {
      answer(header as Record<string, string>);
      expect((await requestFile('/me/export')).filename).toBe('account-data.json');
    }
  });

  it('raises the same errors as any other request', async () => {
    mockFetch({ 'GET /me/export': problem(401, 'unauthenticated') });
    await expect(requestFile('/me/export')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('conflict wording', () => {
  it('prefers what the server says about this conflict', () => {
    const detail = "You've reached the limit of 2,000 thought records.";
    const body = { type: 'about:blank', title: 'Conflict', status: 409, code: 'conflict', detail };
    expect(errorMessage(new ApiError(409, 'conflict', body))).toBe(detail);
    expect(errorMessage(new ApiError(409, 'conflict', null))).toMatch(/already been done/);
  });
});

describe('api client', () => {
  it('sends the CSRF header on every non-GET request, and only those', async () => {
    const { calls } = mockFetch({ 'POST /x': { status: 204 }, 'GET /y': { body: {} } });
    await request('POST', '/x', { body: { a: 1 } });
    await request('GET', '/y');
    expect(calls[0]!.headers[CSRF_HEADER]).toBe(CSRF_HEADER_VALUE);
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(calls[1]!.headers[CSRF_HEADER]).toBeUndefined();
  });

  it('turns an RFC 9457 problem into an ApiError with its code', async () => {
    mockFetch({ 'POST /auth/otp/verify': problem(400, 'invalid_code') });
    const error = await request('POST', '/auth/otp/verify', { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('invalid_code');
    expect((error as ApiError).status).toBe(400);
  });

  it('survives an error response that is not a problem document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    const error = (await request('GET', '/x').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('internal_error');
  });

  it('maps a bare status to a known code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const error = (await request('GET', '/x').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('rate_limited');
  });

  it('reports an unreachable server as a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(request('GET', '/x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('validates a response against the shared schema', async () => {
    mockFetch({ 'GET /me': { body: ME } });
    await expect(request('GET', '/me', { schema: meResponse })).resolves.toMatchObject({ email: ME.email });
    mockFetch({ 'GET /me': { body: { id: 'not-a-uuid' } } });
    await expect(request('GET', '/me', { schema: meResponse })).rejects.toThrow();
  });

  it('treats 202 and 204 as success with no body', async () => {
    mockFetch({ 'POST /a': { status: 202 }, 'DELETE /b': { status: 204 } });
    await expect(request('POST', '/a')).resolves.toBeUndefined();
    await expect(request('DELETE', '/b')).resolves.toBeUndefined();
  });

  it('never shows raw server text for internal errors, and gives direction for known ones', () => {
    const internal = new ApiError(500, 'internal_error', { type: 'x', title: 'pg: connection refused', status: 500, code: 'internal_error' });
    expect(errorMessage(internal)).not.toMatch(/pg:/);
    expect(errorMessage(new ApiError(400, 'invalid_code', null))).toMatch(/send a new code/);
    expect(errorMessage(new ApiError(429, 'rate_limited', null))).toMatch(/wait a few minutes/i);
    expect(errorMessage(new NetworkError())).toMatch(/connection/);
  });
});
