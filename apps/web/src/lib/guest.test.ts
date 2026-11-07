import { GAD7_ITEMS, scoreGad7, severityFor } from '@anxiocare/shared';
import { describe, expect, it } from 'vitest';
import {
  clearGuestData,
  completeCheckin,
  guestResultBody,
  loadCheckin,
  loadGuestResult,
  needsDifficulty,
  newRequestId,
  nextUnanswered,
  saveCheckin,
  saveGuestResult,
  startCheckin,
} from './guest';

describe('guest persistence', () => {
  it('resumes a check-in from sessionStorage, and writes nothing to localStorage', () => {
    const started = startCheckin();
    saveCheckin({ ...started, answers: [1, 2, null, null, null, null, null] });
    const loaded = loadCheckin()!;
    expect(loaded.clientRequestId).toBe(started.clientRequestId);
    expect(nextUnanswered(loaded)).toBe(2);
    expect(localStorage.length).toBe(0);
  });

  it('ignores corrupt or tampered storage instead of crashing', () => {
    sessionStorage.setItem('anxiocare.checkin.v1', '{not json');
    expect(loadCheckin()).toBeNull();
    sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({ answers: [9, 9] }));
    expect(loadGuestResult()).toBeNull();
  });

  it('needs the difficulty item only when a symptom was reported', () => {
    expect(needsDifficulty([0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(needsDifficulty([0, 0, 1, 0, 0, 0, 0])).toBe(true);
  });

  it('does not complete with an answer or a required difficulty missing', () => {
    const id = newRequestId();
    expect(completeCheckin({ clientRequestId: id, answers: [1, null, 0, 0, 0, 0, 0], difficulty: 1 })).toBeNull();
    expect(completeCheckin({ clientRequestId: id, answers: [1, 1, 0, 0, 0, 0, 0], difficulty: null })).toBeNull();
    expect(completeCheckin({ clientRequestId: id, answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null })).not.toBeNull();
  });

  it('keeps clientRequestId and takenAt, so the later save is idempotent and dated correctly', () => {
    const id = newRequestId();
    const now = new Date('2026-11-06T10:00:00.000Z');
    const result = completeCheckin({ clientRequestId: id, answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 2 }, now)!;
    saveGuestResult(result);
    const body = guestResultBody(loadGuestResult()!);
    expect(body).toEqual({ clientRequestId: id, answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 2, takenAt: '2026-11-06T10:00:00.000Z' });
  });

  it('clears all guest data together', () => {
    startCheckin();
    saveGuestResult({ clientRequestId: newRequestId(), answers: GAD7_ITEMS.map(() => 0), difficulty: null, takenAt: new Date().toISOString() });
    clearGuestData();
    expect(loadCheckin()).toBeNull();
    expect(loadGuestResult()).toBeNull();
  });

  it('generates version 4 UUIDs even without crypto.randomUUID', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  });

  it('uses the shared scoring', () => {
    expect(severityFor(scoreGad7([3, 3, 3, 2, 2, 3, 3])).severity).toBe('severe');
  });
});
