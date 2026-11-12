import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setVisibility } from '@/test/fake-audio';
import { renderRoutes } from '@/test/render';
import Breathe from './Breathe';

const sound = vi.hoisted(() => ({ playSound: vi.fn(), stopSound: vi.fn() }));
vi.mock('@/lib/sound', async (original) => ({ ...(await original<typeof import('@/lib/sound')>()), ...sound }));

const FIVE_MINUTES = 5 * 60 * 1000;

function fakeWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const sentinel = { release: vi.fn(async () => {}) };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, sentinels };
}

describe('Breathe', () => {
  beforeEach(() => {
    sound.playSound.mockClear();
    sound.stopSound.mockClear();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'], shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'wakeLock');
    setVisibility('visible');
  });

  const user = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const open = () => renderRoutes([{ path: '/', element: <Breathe /> }, { path: '*', element: <p>elsewhere</p> }], '/');
  const advance = (ms: number) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

  it('counts breaths quietly, announced politely, with no score', async () => {
    const u = user();
    open();
    await u.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.queryByText(/^Breath \d+$/)).not.toBeInTheDocument(); // not during the lead-in
    await advance(3200);
    expect(screen.getByText('Breath 1')).toBeInTheDocument();
    // Slow exhale is a 10-second cycle.
    await advance(10_000);
    expect(screen.getByText('Breath 2')).toBeInTheDocument();
    await advance(10_000);
    const counter = screen.getByText('Breath 3');
    expect(counter.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    expect(document.body.textContent).not.toMatch(/score|well done|streak/i);
  });

  it('Go again brings back the sound that was chosen', async () => {
    const u = user();
    open();
    await u.selectOptions(screen.getByLabelText('Sound'), 'rain');
    await u.click(screen.getByRole('button', { name: '1 min' }));
    await u.click(screen.getByRole('button', { name: 'Begin' }));
    expect(sound.playSound).toHaveBeenCalledTimes(1);
    await advance(FIVE_MINUTES);
    await screen.findByRole('button', { name: 'Go again' });
    sound.playSound.mockClear();
    await u.click(screen.getByRole('button', { name: 'Go again' }));
    expect(sound.playSound).toHaveBeenCalledExactlyOnceWith('rain');
  });

  it('asks for the wake lock again when the phone is unlocked, and lets it go at the end', async () => {
    const lock = fakeWakeLock();
    const u = user();
    const { unmount } = open();
    await u.click(screen.getByRole('button', { name: 'Begin' }));
    await advance(10);
    expect(lock.request).toHaveBeenCalledTimes(1);

    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await advance(10);
    expect(lock.request).toHaveBeenCalledTimes(2);

    unmount();
    await advance(10);
    expect(lock.sentinels.at(-1)!.release).toHaveBeenCalled();
  });

  it('time away from the screen does not count towards the session', async () => {
    const u = user();
    open();
    await u.click(screen.getByRole('button', { name: '1 min' }));
    await u.click(screen.getByRole('button', { name: 'Begin' }));
    await advance(1000);
    act(() => setVisibility('hidden'));
    await advance(FIVE_MINUTES);
    act(() => setVisibility('visible'));
    await advance(300);
    expect(screen.queryByRole('button', { name: 'Go again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('the sound stops while the screen is hidden, and returns with it', async () => {
    const u = user();
    open();
    await u.selectOptions(screen.getByLabelText('Sound'), 'sea');
    await u.click(screen.getByRole('button', { name: 'Begin' }));
    sound.stopSound.mockClear();
    sound.playSound.mockClear();
    act(() => setVisibility('hidden'));
    expect(sound.stopSound).toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(sound.playSound).toHaveBeenCalledExactlyOnceWith('sea');
  });

  it('with no sound chosen, nothing plays when the screen comes back', async () => {
    const u = user();
    open();
    await u.click(screen.getByRole('button', { name: 'Begin' }));
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(sound.playSound).not.toHaveBeenCalled();
  });
});
