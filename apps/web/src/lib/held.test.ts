import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@anxiocare/shared';
import { mockFetch, ME } from '@/test/render';
import { ApiError } from './api';
import { emptyDraft, getDraft, NEW_DRAFT, setDraft } from './drafts';
import { loadCheckin, loadGuestResult, newRequestId, saveCheckin, saveGuestResult } from './guest';
import { hasHeldWork } from './held';
import { clearClientData, fetchMe, handleApiError, meKey, queryClient, reconcileHeld, setNavigator } from './queries';

const USER_A = ME as Me;
const USER_B = { ...ME, id: '22222222-2222-4222-8222-222222222222' } as Me;
const TEXT = 'Words someone just wrote';
const result = () => ({ clientRequestId: newRequestId(), answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 1, takenAt: new Date().toISOString() });

function signedInWithWork() {
  queryClient.setQueryData(meKey, USER_A);
  setDraft(NEW_DRAFT, { values: { ...emptyDraft(), situation: TEXT }, dirty: true });
  saveGuestResult(result());
  saveCheckin({ clientRequestId: newRequestId(), answers: [1, null, null, null, null, null, null], difficulty: null });
}

const sessionEnds = () => handleApiError(new ApiError(401, 'unauthenticated', null));

beforeEach(() => {
  setNavigator(vi.fn());
  clearClientData();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearClientData();
});

describe('work held across a session ending', () => {
  it('leaves nothing reachable while signed out', () => {
    signedInWithWork();
    sessionEnds();
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
    expect(loadGuestResult()).toBeNull();
    expect(loadCheckin()).toBeNull();
    expect(hasHeldWork()).toBe(true);
  });

  it('never writes it to storage', () => {
    signedInWithWork();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    sessionEnds();
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(TEXT);
  });

  it('gives it back when the same person signs in', () => {
    signedInWithWork();
    sessionEnds();
    reconcileHeld(USER_A);
    expect(getDraft(NEW_DRAFT)?.values.situation).toBe(TEXT);
    expect(getDraft(NEW_DRAFT)?.dirty).toBe(true);
    expect(loadGuestResult()?.answers).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(loadCheckin()?.answers[0]).toBe(1);
    expect(hasHeldWork()).toBe(false);
  });

  it('wipes it when someone else signs in, for good', () => {
    signedInWithWork();
    sessionEnds();
    reconcileHeld(USER_B);
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
    expect(loadGuestResult()).toBeNull();
    expect(hasHeldWork()).toBe(false);
    reconcileHeld(USER_A);
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
  });

  it('survives several requests failing together', () => {
    signedInWithWork();
    sessionEnds();
    sessionEnds();
    sessionEnds();
    reconcileHeld(USER_A);
    expect(getDraft(NEW_DRAFT)?.values.situation).toBe(TEXT);
  });

  it('is also held when /me is what discovers the ended session', async () => {
    signedInWithWork();
    mockFetch({});
    await expect(fetchMe()).resolves.toBeNull();
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
    expect(hasHeldWork()).toBe(true);
  });

  it('is reconciled when /me finds a signed-in person', async () => {
    signedInWithWork();
    sessionEnds();
    mockFetch({ 'GET /me': { body: USER_B } });
    await fetchMe();
    expect(hasHeldWork()).toBe(false);
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
  });

  it('does not overwrite what a person did after being signed out', () => {
    signedInWithWork();
    sessionEnds();
    const newer = result();
    saveGuestResult(newer);
    setDraft(NEW_DRAFT, { values: { ...emptyDraft(), situation: 'Newer words' }, dirty: true });
    reconcileHeld(USER_A);
    expect(loadGuestResult()?.clientRequestId).toBe(newer.clientRequestId);
    expect(getDraft(NEW_DRAFT)?.values.situation).toBe('Newer words');
  });

  it('is dropped by a deliberate sign-out', () => {
    signedInWithWork();
    sessionEnds();
    clearClientData();
    expect(hasHeldWork()).toBe(false);
    reconcileHeld(USER_A);
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
  });

  it('holds nothing when there was no signed-in person', () => {
    saveGuestResult(result());
    sessionEnds();
    expect(hasHeldWork()).toBe(false);
  });
});
