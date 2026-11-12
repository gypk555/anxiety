import { describe, expect, it } from 'vitest';
import { suggestionsFor } from './suggestions';

describe('tools suggested from stress factors', () => {
  it('suggests nothing when none are set', () => {
    expect(suggestionsFor(undefined)).toEqual([]);
    expect(suggestionsFor([])).toEqual([]);
    expect(suggestionsFor(['family', 'relationships', 'health'])).toEqual([]);
  });

  it('sleep: slow-exhale breathing and sounds', () => {
    expect(suggestionsFor(['sleep']).map((s) => s.to)).toEqual(['/tools/breathe', '/tools/sounds']);
  });

  it('work, studies or money: a thought record and grounding, once each', () => {
    expect(suggestionsFor(['work']).map((s) => s.to)).toEqual(['/journal/new', '/tools/ground']);
    expect(suggestionsFor(['work', 'studies', 'money']).map((s) => s.to)).toEqual(['/journal/new', '/tools/ground']);
  });

  it('screens: a short note to take a break, with no link', () => {
    const [note] = suggestionsFor(['screens']);
    expect(note!.to).toBeUndefined();
    expect(note!.text).toMatch(/break/);
  });

  it('never compares, scores or diagnoses', () => {
    const all = suggestionsFor(['sleep', 'work', 'screens']);
    for (const s of all) expect(`${s.title} ${s.text}`).not.toMatch(/people like you|most people|average|score|risk|diagnos|disorder/i);
  });
});
