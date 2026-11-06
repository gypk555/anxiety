import { describe, expect, it } from 'vitest';
import { BREATH_PATTERNS, cycleSeconds, cyclesForMinutes, isExpanded, phaseAt } from './breathing';
import { nextCheckInDate } from './dates';
import { safeNext } from './next-path';

describe('safeNext', () => {
  it('allows same-origin paths', () => {
    expect(safeNext('/journal/new?step=2')).toBe('/journal/new?step=2');
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined])('refuses %s', (v) => {
    expect(safeNext(v)).toBe('/');
  });
  it('never loops back into the sign-in flow', () => {
    expect(safeNext('/sign-in/code')).toBe('/');
    expect(safeNext('/consent?next=/x')).toBe('/');
  });
});

describe('breathing rhythm', () => {
  const slow = BREATH_PATTERNS[0]!;
  it('defaults to 4 in, 6 out', () => {
    expect(slow.phases.map((p) => [p.kind, p.seconds])).toEqual([['in', 4], ['out', 6]]);
  });
  it('offers box and 4-7-8', () => {
    expect(cycleSeconds(BREATH_PATTERNS[1]!)).toBe(16);
    expect(cycleSeconds(BREATH_PATTERNS[2]!)).toBe(19);
  });
  it('knows the phase and seconds left from elapsed time alone', () => {
    expect(phaseAt(slow, 0)).toMatchObject({ phase: { kind: 'in' }, secondsLeft: 4, cycle: 0 });
    expect(phaseAt(slow, 3500)).toMatchObject({ phase: { kind: 'in' }, secondsLeft: 1 });
    expect(phaseAt(slow, 4000)).toMatchObject({ phase: { kind: 'out' }, secondsLeft: 6 });
    expect(phaseAt(slow, 10_000)).toMatchObject({ phase: { kind: 'in' }, cycle: 1 });
  });
  it('stays full through hold and empty through rest', () => {
    expect(isExpanded('hold')).toBe(true);
    expect(isExpanded('rest')).toBe(false);
  });
  it('rounds a session to whole cycles', () => {
    expect(cyclesForMinutes(slow, 1)).toBe(6);
    expect(cyclesForMinutes(BREATH_PATTERNS[2]!, 1)).toBe(3);
  });
});

describe('next check-in', () => {
  it('is 14 days after the last one', () => {
    expect(nextCheckInDate('2026-11-02T10:00:00.000Z').toISOString().slice(0, 10)).toBe('2026-11-16');
  });
});
