import { vi } from 'vitest';

/** Enough of Web Audio to run lib/sound.ts in jsdom, and to see what it did to the context and its sources. */
export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** Off for a browser that hasn't started the audio yet, as before a first user gesture. */
  static resumes = true;
  state: AudioContextState = 'suspended';
  sampleRate = 8000;
  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
  sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  closed = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  /** The browser interrupting or giving back audio, as a phone call would. */
  setState(state: AudioContextState) {
    this.state = state;
    this.onstatechange?.();
  }

  resume = vi.fn(async () => {
    if (this.closed) throw new DOMException('closed', 'InvalidStateError');
    if (FakeAudioContext.resumes) this.setState('running');
  });

  close = vi.fn(async () => {
    this.closed += 1;
    if (this.closed > 1) throw new DOMException('already closed', 'InvalidStateError');
    this.setState('closed');
  });

  #node() {
    const node = {
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      frequency: { value: 0 },
      Q: { value: 0 },
      type: '',
      buffer: null as unknown,
      loop: false,
      connect: vi.fn((target: unknown) => target),
      disconnect: vi.fn(),
      setPeriodicWave: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(() => {
        if (this.closed) throw new DOMException('closed', 'InvalidStateError');
      }),
    };
    return node;
  }

  #source() {
    const node = this.#node();
    this.sources.push(node);
    return node;
  }

  createGain = () => this.#node();
  createBiquadFilter = () => this.#node();
  createOscillator = () => this.#source();
  createBufferSource = () => this.#source();
  createPeriodicWave = () => ({});
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
}

class FakeAudioBuffer {
  copyToChannel = vi.fn();
}

export function installFakeAudio() {
  FakeAudioContext.instances = [];
  FakeAudioContext.resumes = true;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioBuffer', FakeAudioBuffer);
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true, writable: true });
}

export function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
