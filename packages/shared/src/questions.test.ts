import { describe, expect, it } from 'vitest';
import {
  GAD7_ITEMS,
  GAD7_OPTIONS,
  GAD7_STEM,
  GAD7_QUESTIONS,
  QUESTION_TYPES,
  QUESTIONS,
  REFLECTION_LENGTH,
  REFLECTION_NOTE_MAX,
  REFLECTION_OPTIONS,
  REFLECTION_QUESTIONS,
  REFLECTION_THEMES,
  gad7QuestionId,
  pickReflection,
  questionById,
  reflectionCreateBody,
  reflectionResponse,
  summarizeReflection,
  type ReflectionAnswer,
} from './index.ts';

describe('the question catalogue', () => {
  it('names the two types for people', () => {
    expect(QUESTION_TYPES).toEqual({ gad7: 'Anxiety check (GAD-7)', reflection: 'Reflection' });
  });

  it('holds the GAD-7 byte for byte as it was, in its order, as GAD7-1 to GAD7-7', async () => {
    // The sha256 of the stem, items and options as published before reflections existed. Never change this number.
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([GAD7_STEM, GAD7_ITEMS, GAD7_OPTIONS])));
    const digest = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(digest).toBe('4ed30dd34dab5af1c7d4b510f3eb97cc3e14637c09ed6c05ef0ef2694dd37e1b');
    expect(GAD7_QUESTIONS.map((q) => [q.id, q.position, q.text])).toEqual(GAD7_ITEMS.map((text, i) => [`GAD7-${i + 1}`, i + 1, text]));
    expect(GAD7_QUESTIONS.every((q) => q.type === 'gad7' && q.theme === null && q.answerSet === 'gad7_frequency' && q.active && !q.bringsHelp)).toBe(true);
    expect(gad7QuestionId(0)).toBe('GAD7-1');
    expect(gad7QuestionId(6)).toBe('GAD7-7');
  });

  it('has exactly 100 reflections, 20 for each of the five themes, with REF-001 to REF-100', () => {
    expect(REFLECTION_QUESTIONS).toHaveLength(100);
    expect(REFLECTION_THEMES.map((t) => t.id)).toEqual(['worry', 'body', 'situations', 'coping', 'connection']);
    for (const theme of REFLECTION_THEMES) {
      expect(REFLECTION_QUESTIONS.filter((q) => q.theme === theme.id), theme.id).toHaveLength(20);
    }
    expect(REFLECTION_QUESTIONS.map((q) => q.id)).toEqual(Array.from({ length: 100 }, (_, i) => `REF-${String(i + 1).padStart(3, '0')}`));
  });

  it('has unique ids and unique wording across the whole catalogue', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.text.toLowerCase())).size).toBe(QUESTIONS.length);
    expect(QUESTIONS).toHaveLength(107);
    expect(questionById('REF-017')?.theme).toBe('worry');
    expect(questionById('GAD7-3')?.text).toBe(GAD7_ITEMS[2]);
    expect(questionById('REF-101')).toBeUndefined();
  });

  it('keeps every reflection short, plain, about today or lately, and on the amount scale', () => {
    for (const q of REFLECTION_QUESTIONS) {
      expect(q.text.length, q.id).toBeLessThanOrEqual(90);
      expect(q.text, q.id).toMatch(/\b(today|lately)\b/);
      expect(q.text, q.id).toMatch(/^[A-Z][^?]*\?$/);
      expect(q.text, q.id).toMatch(/\byou(r)?\b/i);
      expect(q.answerSet, q.id).toBe('reflection_amount');
      expect(q.position, q.id).toBeNull();
      expect(q.active, q.id).toBe(true);
      // Plain ASCII: no curly quotes or dashes that read differently on old phones.
      expect(q.text, q.id).toMatch(/^[\x20-\x7e]+$/);
    }
    expect(REFLECTION_OPTIONS).toEqual([
      { value: 0, label: 'Not at all' },
      { value: 1, label: 'A little' },
      { value: 2, label: 'Quite a bit' },
      { value: 3, label: 'A lot' },
    ]);
  });

  it('never touches what needs a clinical pathway, never labels, and never assumes drinking or dating', () => {
    // Stems match the start of a word ("suicid" catches suicidal); whole words match only themselves ("dead", not "deadline").
    const stems = [
      'suicid', 'kill', 'dying', 'self-harm', 'harm', 'hurt', 'alcohol', 'drunk', 'liquor', 'smok', 'cigarette', 'tobacco',
      'drug', 'medicine', 'medication', 'abus', 'violen', 'unsafe', 'dating', 'boyfriend', 'girlfriend', 'sexual',
      'anxious', 'anxiety', 'depress', 'panic', 'disorder', 'symptom', 'diagnos', 'trauma', 'insomnia', 'phobi', 'mental', 'illness',
      // Words of the GAD-7 itself: a reflection must never read as a second copy of it.
      'nervous', 'on edge', 'irritab', 'annoy', 'restless', 'relax', 'awful', 'sit still', 'stop worrying', 'control', 'different things',
    ];
    const words = ['die', 'died', 'death', 'dead', 'cut', 'end it', 'live', 'life', 'beer', 'wine', 'daru', 'weed', 'pill', 'pills', 'hit', 'beat', 'date', 'sex', 'ocd', 'ptsd'];
    const patterns = [...stems.map((w) => [w, new RegExp(`\\b${w}`, 'i')] as const), ...words.map((w) => [w, new RegExp(`\\b${w}\\b`, 'i')] as const)];
    for (const q of REFLECTION_QUESTIONS) {
      for (const [word, pattern] of patterns) {
        expect(pattern.test(q.text), `${q.id} contains "${word}": ${q.text}`).toBe(false);
      }
    }
  });

  it('records which way each theme reads: strain for worry, body and situations, support for coping and connection', () => {
    for (const q of REFLECTION_QUESTIONS) {
      expect(q.polarity, q.id).toBe(q.theme === 'coping' || q.theme === 'connection' ? 'support' : 'strain');
    }
  });

  it('brings Get help forward on about eight strain questions, and never on a support one', () => {
    const help = REFLECTION_QUESTIONS.filter((q) => q.bringsHelp);
    expect(help.length).toBeGreaterThanOrEqual(6);
    expect(help.length).toBeLessThanOrEqual(10);
    expect(help.every((q) => q.polarity === 'strain')).toBe(true);
    const texts = help.map((q) => q.text).join(' ');
    expect(texts).toMatch(/hopeless/);
    expect(texts).toMatch(/too much/);
    expect(texts).toMatch(/cope/);
  });
});

/** A predictable stand-in for crypto.getRandomValues: walks through 0, 1, 2 ... modulo the range. */
const counter = () => {
  let n = 0;
  return (max: number) => n++ % max;
};

describe('picking a reflection', () => {
  it('picks five different questions, one from each theme, in theme order', () => {
    for (let i = 0; i < 50; i += 1) {
      const picked = pickReflection();
      expect(picked).toHaveLength(REFLECTION_LENGTH);
      expect(new Set(picked.map((q) => q.id)).size).toBe(5);
      expect(picked.map((q) => q.theme)).toEqual(['worry', 'body', 'situations', 'coping', 'connection']);
    }
  });

  it('uses the random source it is given, and by default a secure one that varies', () => {
    const fixed = pickReflection([], () => 0);
    expect(fixed.map((q) => q.id)).toEqual(['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081']);
    const seen = new Set(Array.from({ length: 40 }, () => pickReflection()[0]!.id));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('leaves out every question from the recent reflections', () => {
    const recent = ['REF-001', 'REF-002', 'REF-021', 'REF-041', 'REF-061', 'REF-081'];
    for (let i = 0; i < 200; i += 1) {
      const ids = pickReflection(recent).map((q) => q.id);
      for (const id of recent) expect(ids).not.toContain(id);
    }
    expect(pickReflection(recent, () => 0).map((q) => q.id)).toEqual(['REF-003', 'REF-022', 'REF-042', 'REF-062', 'REF-082']);
  });

  it('three recent reflections never leave a theme empty; if every question of a theme was recent, it still asks one', () => {
    const allWorry = REFLECTION_QUESTIONS.filter((q) => q.theme === 'worry').map((q) => q.id);
    const picked = pickReflection(allWorry, counter());
    expect(picked).toHaveLength(5);
    expect(picked[0]!.theme).toBe('worry');
  });

  it('only uses active questions', () => {
    const bank = REFLECTION_QUESTIONS.map((q) => (q.id === 'REF-001' || q.id === 'REF-021' ? { ...q, active: false } : q));
    for (let i = 0; i < 200; i += 1) {
      const ids = pickReflection([], undefined, bank).map((q) => q.id);
      expect(ids).not.toContain('REF-001');
      expect(ids).not.toContain('REF-021');
    }
  });
});

describe('the reflection contract', () => {
  const id = '3f2b8c1e-5d4a-4f6b-9c7e-1a2b3c4d5e6f';
  const answers = (over: Partial<ReflectionAnswer>[] = []): ReflectionAnswer[] =>
    ['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081'].map((q, i) => ({ q, a: 1, ...over[i] }));

  it('takes five distinct question ids with answers 0 to 3, and an optional note of up to 280 characters', () => {
    expect(reflectionCreateBody.safeParse({ clientRequestId: id, answers: answers() }).success).toBe(true);
    expect(reflectionCreateBody.safeParse({ clientRequestId: id, answers: answers(), note: 'x'.repeat(REFLECTION_NOTE_MAX) }).success).toBe(true);
    expect(reflectionCreateBody.parse({ clientRequestId: id, answers: answers(), note: '  kept  ' }).note).toBe('kept');
    for (const bad of [
      { clientRequestId: id, answers: answers().slice(0, 4) },
      { clientRequestId: id, answers: [...answers(), { q: 'REF-090', a: 1 }] },
      { clientRequestId: id, answers: answers([{ q: 'REF-021' }]) },
      { clientRequestId: id, answers: answers([{ a: 4 }]) },
      { clientRequestId: id, answers: answers([{ a: -1 }]) },
      { clientRequestId: id, answers: answers([{ a: 1.5 }]) },
      { clientRequestId: id, answers: answers([{ q: 'GAD7-1' }]) },
      { clientRequestId: id, answers: answers([{ q: '<script>' }]) },
      { clientRequestId: id, answers: answers(), note: 'x'.repeat(REFLECTION_NOTE_MAX + 1) },
      { clientRequestId: id, answers: answers(), score: 3 },
      { clientRequestId: id, answers: answers().map((a) => ({ ...a, text: 'question text' })) },
      { answers: answers() },
    ]) {
      expect(reflectionCreateBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 120)).toBe(false);
    }
  });

  it('never echoes what was sent in its messages', () => {
    const r = reflectionCreateBody.safeParse({ clientRequestId: id, answers: answers([{ q: 'SECRET-ID' }]) });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues.map((i) => i.message))).not.toContain('SECRET-ID');
  });

  it('answers with ids and numbers, never question text', () => {
    const saved = { id, takenAt: '2026-11-11T10:00:00.000Z', answers: answers() };
    expect(reflectionResponse.strict().safeParse(saved).success).toBe(true);
    expect(reflectionResponse.strict().safeParse({ ...saved, note: 'a note' }).success).toBe(true);
    expect(reflectionResponse.strict().safeParse({ ...saved, text: 'x' }).success).toBe(false);
  });
});

describe('the reflection summary', () => {
  const at = (pairs: [string, number][]) => pairs.map(([q, a]) => ({ q, a }));

  it('names the strain themes answered 2 or more, and the support that helped', () => {
    const s = summarizeReflection(at([['REF-001', 2], ['REF-021', 3], ['REF-041', 1], ['REF-061', 2], ['REF-081', 0]]));
    expect(s.strainThemes).toEqual(['worry', 'body']);
    expect(s.supportThemes).toEqual(['coping']);
    expect(s.bringsHelp).toBe(false);
    expect(s.lines).toEqual(['Worry and how your body felt came up today.', 'Things you did for yourself helped.']);
  });

  it('reads support the right way round: a high answer there is good, a low one is not strain', () => {
    const s = summarizeReflection(at([['REF-001', 0], ['REF-021', 0], ['REF-041', 0], ['REF-061', 0], ['REF-081', 3]]));
    expect(s.strainThemes).toEqual([]);
    expect(s.supportThemes).toEqual(['connection']);
    expect(s.lines).toEqual(['The people around you helped.']);
  });

  it('says something neutral when nothing stands out', () => {
    const s = summarizeReflection(at([['REF-001', 1], ['REF-021', 0], ['REF-041', 1], ['REF-061', 1], ['REF-081', 1]]));
    expect(s.lines).toEqual(['Nothing stood out strongly today.']);
  });

  it('lists three themes in plain words', () => {
    const s = summarizeReflection(at([['REF-001', 2], ['REF-021', 2], ['REF-041', 3], ['REF-061', 3], ['REF-081', 2]]));
    expect(s.lines).toEqual([
      'Worry, how your body felt and things going on around you came up today.',
      'Things you did for yourself and the people around you helped.',
    ]);
  });

  it('brings Get help forward when a brings_help question is answered 2 or more, and only then', () => {
    const help = REFLECTION_QUESTIONS.find((q) => q.bringsHelp)!;
    expect(summarizeReflection(at([[help.id, 2]])).bringsHelp).toBe(true);
    expect(summarizeReflection(at([[help.id, 3]])).bringsHelp).toBe(true);
    expect(summarizeReflection(at([[help.id, 1]])).bringsHelp).toBe(false);
  });

  it('ignores ids it does not know, rather than guessing', () => {
    expect(summarizeReflection(at([['REF-999', 3]])).lines).toEqual(['Nothing stood out strongly today.']);
  });
});
