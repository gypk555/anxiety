import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allDrafts, emptyDraft, setDraft } from './drafts';
import { saveCheckin, saveGuestResult, startCheckin } from './guest';
import { hasHeldWork, holdWork } from './held';
import { escapeExitListener, isExiting, QUICK_EXIT_URL, quickExit, resetQuickExitForTests } from './quick-exit';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"><form><input id="name" value="secret name"><textarea id="t">secret words</textarea></form></div>';
  (document.getElementById('name') as HTMLInputElement).value = 'typed by the person';
});
afterEach(() => resetQuickExitForTests());

describe('quick exit', () => {
  it('replaces the current history entry with a neutral page, before anything else', () => {
    const order: string[] = [];
    const client = new QueryClient();
    client.setQueryData(['journal'], { items: ['private'] });
    const go = vi.fn((url: string) => order.push(`go ${url} cache=${client.getQueryCache().getAll().length}`));
    quickExit({ go, client });
    expect(go).toHaveBeenCalledTimes(1);
    expect(QUICK_EXIT_URL).toBe('https://www.google.com/search?q=weather+today');
    expect(order[0]).toMatch(/^go https:\/\/www\.google\.com\/search\?q=weather\+today/);
  });

  it('then clears the query cache, drafts, held work, the guest check-in and any form text, and hides the app', () => {
    const client = new QueryClient();
    client.setQueryData(['journal'], { items: ['private'] });
    client.setQueryData(['me'], { id: 'someone' });
    setDraft('new', { values: { ...emptyDraft(), situation: 'draft text' }, dirty: true });
    saveGuestResult({ clientRequestId: '55555555-5555-4555-8555-555555555555', answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 1, takenAt: new Date().toISOString() });
    holdWork('someone');
    setDraft('new', { values: { ...emptyDraft(), situation: 'draft text' }, dirty: true });
    saveCheckin(startCheckin());

    quickExit({ go: () => {}, client });

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(allDrafts()).toEqual([]);
    expect(hasHeldWork()).toBe(false);
    expect(sessionStorage.length).toBe(0);
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('');
    expect(document.getElementById('root')!.hidden).toBe(true);
    expect(isExiting()).toBe(true);
  });

  it('asks nothing of the network and never waits: it is synchronous', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = quickExit({ go: () => {}, client: new QueryClient() });
    expect(result).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still clears everything if navigation throws, for example offline in a WebView', () => {
    const client = new QueryClient();
    client.setQueryData(['x'], 1);
    expect(() => quickExit({ go: () => { throw new Error('blocked'); }, client })).not.toThrow();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('Escape three times', () => {
  const press = (listener: (e: KeyboardEvent) => void, target: EventTarget = document.body, key = 'Escape') => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    Object.defineProperty(event, 'target', { value: target });
    listener(event);
  };

  it('within 1.5 seconds exits', () => {
    let t = 0;
    const exit = vi.fn();
    const listener = escapeExitListener(exit, () => t);
    press(listener);
    t = 700;
    press(listener);
    expect(exit).not.toHaveBeenCalled();
    t = 1400;
    press(listener);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('spread over more than 1.5 seconds does nothing', () => {
    let t = 0;
    const exit = vi.fn();
    const listener = escapeExitListener(exit, () => t);
    press(listener);
    t = 900;
    press(listener);
    t = 1600;
    press(listener);
    expect(exit).not.toHaveBeenCalled();
    t = 2000;
    press(listener);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('does not fire while typing in a field, and other keys break the run', () => {
    let t = 0;
    const exit = vi.fn();
    const listener = escapeExitListener(exit, () => t);
    const input = document.getElementById('name')!;
    const textarea = document.getElementById('t')!;
    for (const target of [input, textarea, input]) {
      t += 100;
      press(listener, target);
    }
    expect(exit).not.toHaveBeenCalled();
    press(listener);
    t += 100;
    press(listener, document.body, 'a');
    t += 100;
    press(listener);
    t += 100;
    press(listener);
    expect(exit).not.toHaveBeenCalled();
  });

  it('counts presses on buttons, sheets and other non-text controls', () => {
    document.body.insertAdjacentHTML('beforeend', '<dialog open><button id="b">Close</button></dialog><input type="checkbox" id="c">');
    let t = 0;
    const exit = vi.fn();
    const listener = escapeExitListener(exit, () => t);
    press(listener, document.getElementById('b')!);
    t = 100;
    press(listener, document.getElementById('c')!);
    t = 200;
    press(listener, document.body);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
