import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stopSound } from '@/lib/sound';
import { FakeAudioContext, installFakeAudio, setVisibility } from '@/test/fake-audio';
import { renderRoutes } from '@/test/render';
import Sounds from './Sounds';

const current = () => FakeAudioContext.instances.at(-1)!;
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 950));
});

describe('Sounds screen', () => {
  const errors: unknown[] = [];
  const onError = (e: PromiseRejectionEvent | ErrorEvent) => errors.push(e);

  beforeEach(() => {
    errors.length = 0;
    installFakeAudio();
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args));
  });
  afterEach(async () => {
    stopSound();
    await settle();
    setVisibility('visible');
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onError);
    vi.unstubAllGlobals();
  });

  const open = () => renderRoutes([{ path: '/', element: <Sounds /> }], '/');
  const rain = () => screen.getByRole('button', { name: /Monsoon rain/ });

  it('tap starts and tap stops, and the context is closed', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Monsoon rain/ }));
    expect(rain()).toHaveAttribute('aria-pressed', 'true');
    expect(rain()).toHaveTextContent('Playing. Tap to stop.');
    await userEvent.click(rain());
    expect(rain()).toHaveAttribute('aria-pressed', 'false');
    await settle();
    expect(current().close).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it('hiding the tab stops the sound, closes the context and clears the label', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Monsoon rain/ }));
    act(() => setVisibility('hidden'));
    expect(rain()).toHaveAttribute('aria-pressed', 'false');
    await settle();
    expect(current().close).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it('leaving the screen stops the sound and closes the context', async () => {
    const { unmount } = open();
    await userEvent.click(await screen.findByRole('button', { name: /Sea at night/ }));
    unmount();
    await settle();
    expect(current().close).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it('says so when the phone takes the audio away, and a tap plays it again', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Monsoon rain/ }));
    act(() => current().setState('interrupted' as AudioContextState));
    expect(rain()).toHaveTextContent('Paused by your phone. Tap to play again.');
    expect(rain()).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(rain());
    expect(rain()).toHaveTextContent('Playing. Tap to stop.');
    expect(rain()).toHaveAttribute('aria-pressed', 'true');
  });

  it('tells people what ends a sound', async () => {
    open();
    expect(await screen.findByText(/They stop when you leave this screen or your phone locks\./)).toBeInTheDocument();
  });
});
