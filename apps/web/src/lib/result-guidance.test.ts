import { SEVERITY_BANDS } from '@anxiocare/shared';
import { describe, expect, it } from 'vitest';
import { compareWithPrevious, guidanceFor, MEANINGFUL_CHANGE, RESULT_GUIDANCE } from './result-guidance';

const all = () => Object.values(RESULT_GUIDANCE).flatMap((g) => [g.title, g.message, ...g.tips.flatMap((t) => [t.title, t.text])]);

describe('result guidance', () => {
  it('has a message and tips for every range, chosen by score', () => {
    for (const band of SEVERITY_BANDS) {
      expect(guidanceFor(band.min)).toBe(RESULT_GUIDANCE[band.severity]);
      expect(guidanceFor(band.max)).toBe(RESULT_GUIDANCE[band.severity]);
      expect(RESULT_GUIDANCE[band.severity].tips.length).toBeGreaterThan(0);
    }
  });

  it('moderate and severe say to talk to a doctor or counsellor; minimal and mild do not', () => {
    expect(guidanceFor(12).message).toMatch(/doctor or counsellor/);
    expect(guidanceFor(18).message).toMatch(/doctor or mental health professional soon/);
    expect(guidanceFor(2).message).not.toMatch(/doctor/);
    expect(guidanceFor(7).message).not.toMatch(/doctor/);
  });

  it('never diagnoses, promises, praises or calls anyone fine', () => {
    const banned = /\b(diagnos|cured?|guarantee|will get better|well done|great job|congrat|perfect|you're fine|you are fine|normal|disorder)\b/i;
    for (const text of all()) expect(text).not.toMatch(banned);
  });

  it('tips link only to tools a guest can open', () => {
    const open = ['/tools/breathe', '/tools/ground', '/tools/sounds', '/safety-plan'];
    for (const g of Object.values(RESULT_GUIDANCE)) for (const t of g.tips) if (t.to) expect(open).toContain(t.to);
  });
});

describe('compared with the previous check-in', () => {
  const on = '3 Nov';

  it('a drop of 4 or more is a real change, said calmly', () => {
    const c = compareWithPrevious(8, { score: 14, takenAt: '2026-11-03T00:00:00Z' }, on);
    expect(c.kind).toBe('lower');
    expect(c.message).toContain('from 14 on 3 Nov to 8 now');
    expect(c.message).not.toMatch(/!/);
    expect('note' in c && c.note).toBeFalsy();
  });

  it('lower but still 10 or more still points to a professional', () => {
    const c = compareWithPrevious(12, { score: 18, takenAt: '2026-11-03T00:00:00Z' }, on);
    expect(c.kind).toBe('lower');
    expect('note' in c && c.note).toMatch(/still a good next step/);
  });

  it('a rise of 4 or more is named without blame', () => {
    const c = compareWithPrevious(9, { score: 4, takenAt: '2026-11-03T00:00:00Z' }, on);
    expect(c.kind).toBe('higher');
    expect(c.message).toMatch(/isn't a failure/);
    expect('note' in c && c.note).toBeFalsy();
  });

  it('a rise that reaches 10 says to talk to someone; one already over 10 says not to wait', () => {
    const crossed = compareWithPrevious(11, { score: 6, takenAt: '2026-11-03T00:00:00Z' }, on);
    expect('note' in crossed && crossed.note).toMatch(/now reached the point/);
    const already = compareWithPrevious(17, { score: 12, takenAt: '2026-11-03T00:00:00Z' }, on);
    expect('note' in already && already.note).toMatch(/don't wait/);
  });

  it('smaller moves, either way, are ordinary ups and downs', () => {
    for (const d of [-(MEANINGFUL_CHANGE - 1), 0, MEANINGFUL_CHANGE - 1]) {
      const c = compareWithPrevious(10 + d, { score: 10, takenAt: '2026-11-03T00:00:00Z' }, on);
      expect(c.kind).toBe('same');
      expect(c.message).toMatch(/ordinary ups and downs/);
    }
  });
});
