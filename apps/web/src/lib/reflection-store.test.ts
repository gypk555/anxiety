import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFLECTION_LENGTH, type Me } from '@anxiocare/shared';
import { ME } from '@/test/render';
import { ApiError } from './api';
import { clearGuestData } from './guest';
import { hasHeldWork } from './held';
import { clearClientData, handleApiError, meKey, queryClient, reconcileHeld, setNavigator } from './queries';
import {
  clearReflectionResult,
  completeReflection,
  loadRecentReflections,
  loadReflection,
  loadReflectionResult,
  nextUnansweredReflection,
  rememberReflection,
  STEPS,
  saveReflection,
  saveReflectionResult,
  startReflection,
} from './reflection-store';

const IDS = ['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081'];

beforeEach(() => {
  setNavigator(vi.fn());
  sessionStorage.clear();
});
afterEach(() => {
  clearClientData();
});

describe('a reflection in this tab', () => {
  it('asks as many questions as the shared contract says', () => {
    expect(STEPS).toBe(REFLECTION_LENGTH);
  });


  it('starts with its five questions, resumes from sessionStorage, and writes nothing to localStorage', () => {
    const started = startReflection(IDS);
    expect(started.questionIds).toEqual(IDS);
    expect(started.answers).toEqual([null, null, null, null, null]);
    saveReflection({ ...started, answers: [1, 2, null, null, null], note: 'a note' });
    const loaded = loadReflection()!;
    expect(loaded.clientRequestId).toBe(started.clientRequestId);
    expect(nextUnansweredReflection(loaded)).toBe(2);
    expect(loaded.note).toBe('a note');
    expect(localStorage.length).toBe(0);
  });

  it('keeps the note in memory only: sessionStorage, which a browser restores with a reopened tab, never holds it', () => {
    const started = startReflection(IDS);
    saveReflection({ ...started, answers: [1, null, null, null, null], note: 'SECRET-NOTE in progress' });
    saveReflectionResult({ clientRequestId: crypto.randomUUID(), answers: IDS.map((q) => ({ q, a: 1 })), note: 'SECRET-NOTE in result', takenAt: new Date().toISOString() });
    const stored = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.getItem(sessionStorage.key(i)!)).join(' ');
    expect(stored).toContain('REF-001');
    expect(stored).not.toContain('SECRET-NOTE');
    expect(loadReflection()!.note).toBe('SECRET-NOTE in progress');
    expect(loadReflectionResult()!.note).toBe('SECRET-NOTE in result');
    clearGuestData();
    saveReflection(startReflection(IDS));
    expect(loadReflection()!.note).toBe('');
  });

  it('ignores corrupt or tampered storage instead of crashing', () => {
    sessionStorage.setItem('anxiocare.reflection.v1', '{not json');
    expect(loadReflection()).toBeNull();
    sessionStorage.setItem('anxiocare.reflection.v1', JSON.stringify({ clientRequestId: 'x', questionIds: ['<b>'], answers: [9] }));
    expect(loadReflection()).toBeNull();
    sessionStorage.setItem('anxiocare.reflection-result.v1', JSON.stringify({ answers: [{ q: 'REF-001', a: 7 }] }));
    expect(loadReflectionResult()).toBeNull();
  });

  it('completes only when all five are answered, holding ids and numbers, and the note only if there is one', () => {
    const started = startReflection(IDS);
    expect(completeReflection({ ...started, answers: [1, 1, 1, 1, null] })).toBeNull();
    const now = new Date('2026-11-11T10:00:00.000Z');
    const done = completeReflection({ ...started, answers: [0, 1, 2, 3, 0], note: '  ' }, now)!;
    expect(done).toEqual({
      clientRequestId: started.clientRequestId,
      answers: IDS.map((q, i) => ({ q, a: [0, 1, 2, 3, 0][i] })),
      takenAt: now.toISOString(),
    });
    expect(completeReflection({ ...started, answers: [0, 1, 2, 3, 0], note: ' kept ' }, now)!.note).toBe('kept');
  });

  it('remembers the questions of the last three reflections only', () => {
    rememberReflection(['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081']);
    rememberReflection(['REF-002', 'REF-022', 'REF-042', 'REF-062', 'REF-082']);
    rememberReflection(['REF-003', 'REF-023', 'REF-043', 'REF-063', 'REF-083']);
    rememberReflection(['REF-004', 'REF-024', 'REF-044', 'REF-064', 'REF-084']);
    const recent = loadRecentReflections();
    expect(recent).toHaveLength(3);
    expect(recent.flat()).not.toContain('REF-001');
    expect(recent.flat()).toContain('REF-004');
  });

  it('is cleared with the rest of the guest data, on sign-out and by quick exit', () => {
    saveReflection(startReflection(IDS));
    saveReflectionResult({ clientRequestId: crypto.randomUUID(), answers: IDS.map((q) => ({ q, a: 1 })), takenAt: new Date().toISOString() });
    rememberReflection(IDS);
    clearGuestData();
    expect(loadReflection()).toBeNull();
    expect(loadReflectionResult()).toBeNull();
    expect(loadRecentReflections()).toEqual([]);
  });

  it('is held for its owner when a session ends underneath them, and only they get it back', () => {
    const USER_A = ME as Me;
    const USER_B = { ...ME, id: '22222222-2222-4222-8222-222222222222' } as Me;
    queryClient.setQueryData(meKey, USER_A);
    const progress = startReflection(IDS);
    saveReflection({ ...progress, answers: [1, null, null, null, null] });
    saveReflectionResult({ clientRequestId: crypto.randomUUID(), answers: IDS.map((q) => ({ q, a: 2 })), note: 'held note', takenAt: new Date().toISOString() });
    handleApiError(new ApiError(401, 'unauthenticated', null));
    expect(hasHeldWork()).toBe(true);
    expect(loadReflection()).toBeNull();
    expect(loadReflectionResult()).toBeNull();
    rememberReflection(IDS);
    reconcileHeld(USER_A);
    expect(loadReflection()!.answers[0]).toBe(1);
    expect(loadReflectionResult()!.note).toBe('held note');

    clearReflectionResult();
    queryClient.setQueryData(meKey, USER_A);
    handleApiError(new ApiError(401, 'unauthenticated', null));
    reconcileHeld(USER_B);
    expect(loadReflection()).toBeNull();
    expect(loadReflectionResult()).toBeNull();
  });

  it("keeps the tab's recent questions across a session end for the same account, and only for it", () => {
    const USER_A = ME as Me;
    const USER_B = { ...ME, id: '22222222-2222-4222-8222-222222222222' } as Me;
    queryClient.setQueryData(meKey, USER_A);
    rememberReflection(IDS);
    handleApiError(new ApiError(401, 'unauthenticated', null));
    expect(loadRecentReflections()).toEqual([]);
    reconcileHeld(USER_A);
    expect(loadRecentReflections()).toEqual([IDS]);

    queryClient.setQueryData(meKey, USER_A);
    handleApiError(new ApiError(401, 'unauthenticated', null));
    reconcileHeld(USER_B);
    expect(loadRecentReflections()).toEqual([]);
  });
});
