import { describe, expect, it } from 'vitest';
import { GAD7_ITEMS, GAD7_OPTIONS, SEVERITY_BANDS, scoreGad7, severityFor } from './gad7.ts';
import { assessmentCreateBody, CONSENT_CHANGES, CONSENT_VERSION, journalBody, meResponse } from './schemas.ts';
import { HELPLINES, HELPLINES_CHECK_METHOD, HELPLINES_CHECKED_ON, helplinesCheckNote } from './helplines.ts';

describe('GAD-7', () => {
  it('has the seven published items with exact wording', () => {
    expect(GAD7_ITEMS).toHaveLength(7);
    expect(GAD7_ITEMS[2]).toBe('Worrying too much about different things');
    expect(GAD7_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3]);
  });

  it('sums answers', () => {
    expect(scoreGad7([0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(scoreGad7([3, 3, 3, 3, 3, 3, 3])).toBe(21);
    expect(scoreGad7([1, 2, 0, 3, 1, 0, 2])).toBe(9);
  });

  it.each([[1, 2, 3], [4, 9, 2]])('rejects a wrong answer count', (...bad) => {
    expect(() => scoreGad7(bad)).toThrow(RangeError);
  });

  it.each([[[4, 0, 0, 0, 0, 0, 0]], [[-1, 0, 0, 0, 0, 0, 0]], [[0.5, 0, 0, 0, 0, 0, 0]]])('rejects invalid answers', (bad) => {
    expect(() => scoreGad7(bad)).toThrow(RangeError);
  });

  it.each([
    [0, 'minimal'], [4, 'minimal'], [5, 'mild'], [9, 'mild'],
    [10, 'moderate'], [14, 'moderate'], [15, 'severe'], [21, 'severe'],
  ])('maps %i to %s at the published cut points', (score, severity) => {
    expect(severityFor(score).severity).toBe(severity);
  });

  it('bands cover 0-21 with no gaps', () => {
    for (let s = 0; s <= 21; s++) expect(SEVERITY_BANDS.filter((b) => s >= b.min && s <= b.max)).toHaveLength(1);
    expect(() => severityFor(22)).toThrow(RangeError);
  });

  it('recommends a professional from the cut point of 10', () => {
    expect(severityFor(9).recommendProfessional).toBe(false);
    expect(severityFor(10).recommendProfessional).toBe(true);
  });
});

describe('schemas', () => {
  const id = '3f2b8c1e-5d4a-4f6b-9c7e-1a2b3c4d5e6f';
  it('requires difficulty when a symptom is reported, not otherwise', () => {
    const answers = [1, 0, 0, 0, 0, 0, 0];
    expect(assessmentCreateBody.safeParse({ clientRequestId: id, answers, difficulty: null }).success).toBe(false);
    expect(assessmentCreateBody.safeParse({ clientRequestId: id, answers, difficulty: 1 }).success).toBe(true);
    expect(assessmentCreateBody.safeParse({ clientRequestId: id, answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null }).success).toBe(true);
  });
  it('rejects a client-supplied score', () => {
    const r = assessmentCreateBody.safeParse({ clientRequestId: id, answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null, score: 0 });
    expect(r.success).toBe(false);
  });
  it('requires the core of a thought record', () => {
    const base = { feelings: [], intensityBefore: 5, evidenceFor: '', evidenceAgainst: '', balancedThought: '', intensityAfter: null };
    expect(journalBody.safeParse({ ...base, situation: ' ', thought: 'x' }).success).toBe(false);
    expect(journalBody.safeParse({ ...base, situation: 'x', thought: 'y' }).success).toBe(true);
  });
});

describe('helplines', () => {
  it('every helpline has a dialable number', () => {
    for (const h of HELPLINES) expect(h.tel).toMatch(/^\+?\d{3,15}$/);
  });
  it('leads with a 24-hour national service', () => {
    expect(HELPLINES[0]?.availability).toMatch(/24 hours/);
  });
  it('does not claim a phone check until someone has phoned', () => {
    // Set to 'phone' only with the call log in docs/CLINICAL-SAFETY.md filled in.
    expect(HELPLINES_CHECK_METHOD).toBe('published-sources');
    expect(HELPLINES_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(helplinesCheckNote('published-sources', '6 Nov 2026')).toBe('Helpline numbers checked against published sources on 6 Nov 2026. They have not yet been confirmed by phone.');
    expect(helplinesCheckNote('phone', '3 Dec 2026')).toBe('Helpline numbers confirmed by phone on 3 Dec 2026.');
  });
});

describe('consent changes', () => {
  it('this version adds reflections to the notice, and says so to people asked again', () => {
    expect(CONSENT_VERSION).toBe('2026-11-12');
    expect(CONSENT_CHANGES.summary.join(' ')).toMatch(/Reflection/);
    expect(CONSENT_CHANGES.summary.join(' ')).toMatch(/note you add is kept only while the app is open/);
  });
  it('the summary shown at a re-prompt is written for the current version', () => {
    expect(CONSENT_CHANGES.version, 'Bumped CONSENT_VERSION? Rewrite CONSENT_CHANGES: docs/OPERATIONS.md#consent-version-bump').toBe(CONSENT_VERSION);
    expect(CONSENT_CHANGES.summary.length).toBeGreaterThan(0);
  });
  it('the API says what was last accepted, which may be nothing', () => {
    const me = { id: 'a0000000-0000-4000-8000-000000000000', email: 'a@example.com', displayName: null, createdAt: '2026-11-06T00:00:00.000Z', consentRequired: true, consentVersion: CONSENT_VERSION };
    expect(meResponse.safeParse({ ...me, acceptedConsentVersion: null }).success).toBe(true);
    expect(meResponse.safeParse({ ...me, acceptedConsentVersion: '2000-01-01' }).success).toBe(true);
    expect(meResponse.safeParse(me).success).toBe(false);
  });
});
