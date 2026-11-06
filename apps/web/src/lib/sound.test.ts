import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, installFakeAudio } from '@/test/fake-audio';
import { onSoundInterrupted, playSound, SOUNDS, stopSound } from './sound';

const FADE_MS = 1000;
const current = () => FakeAudioContext.instances.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  installFakeAudio();
});
afterEach(() => {
  stopSound();
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('soundscapes', () => {
  it.each(SOUNDS.map((s) => s.id))('%s starts, then stop tears the whole context down, once, with no errors', async (id) => {
    playSound(id);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(current().resume).toHaveBeenCalled();
    expect(current().sources.length).toBeGreaterThan(0);
    expect(current().sources.some((s) => s.start.mock.calls.length > 0)).toBe(true);

    stopSound();
    expect(current().close).not.toHaveBeenCalled(); // Fades first, so nothing clicks.
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(current().close).toHaveBeenCalledTimes(1);
    expect(current().state).toBe('closed');
  });

  it('stopping twice, or with nothing playing, is harmless', async () => {
    stopSound();
    expect(FakeAudioContext.instances).toHaveLength(0);
    playSound('rain');
    stopSound();
    stopSound();
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(current().close).toHaveBeenCalledTimes(1);
  });

  it('a stopped sound can be played again, on a fresh context', async () => {
    playSound('rain');
    stopSound();
    await vi.advanceTimersByTimeAsync(FADE_MS);
    playSound('sea');
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(current().close).not.toHaveBeenCalled();
  });

  it('playing again during the fade keeps the context, and only the old sound is torn down', async () => {
    playSound('rain');
    const context = current();
    const [oldSource] = context.sources;
    stopSound();
    playSound('fan');
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(context.close).not.toHaveBeenCalled();
    expect(oldSource!.stop).toHaveBeenCalled();
    expect(context.sources.at(-1)!.stop).not.toHaveBeenCalled();
  });

  it('switching sounds stops the first immediately', () => {
    playSound('rain');
    const count = current().sources.length;
    playSound('sea');
    for (const source of current().sources.slice(0, count)) expect(source.stop).toHaveBeenCalled();
  });

  it('the tanpura stops scheduling plucks once stopped', async () => {
    playSound('tanpura');
    const before = current().sources.length;
    stopSound();
    await vi.advanceTimersByTimeAsync(FADE_MS);
    current().currentTime = 100;
    await vi.advanceTimersByTimeAsync(5000);
    expect(current().sources.length).toBe(before);
  });
});

describe('interruptions', () => {
  it('reports when the browser takes the audio away and gives it back, not during normal start and stop', async () => {
    const heard: boolean[] = [];
    const unsubscribe = onSoundInterrupted((interrupted) => heard.push(interrupted));
    playSound('rain');
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual([]);

    current().setState('interrupted' as AudioContextState);
    current().setState('running');
    expect(heard).toEqual([true, false]);

    stopSound();
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(heard).toEqual([true, false]);
    unsubscribe();
  });

  it('a suspended context at the very start is not an interruption', async () => {
    const heard: boolean[] = [];
    const unsubscribe = onSoundInterrupted((interrupted) => heard.push(interrupted));
    FakeAudioContext.resumes = false;
    playSound('rain');
    current().setState('suspended');
    expect(heard).toEqual([]);
    unsubscribe();
  });
});
