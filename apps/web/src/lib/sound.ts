/**
 * Soundscapes, generated live with Web Audio. No files to download, nothing to cache,
 * no change to the CSP. Everything fades in and out so nothing startles.
 */
export type SoundId = 'rain' | 'sea' | 'fan' | 'tanpura';

export const SOUNDS: readonly { id: SoundId; name: string; description: string }[] = [
  { id: 'rain', name: 'Monsoon rain', description: 'Steady rain, heard from indoors' },
  { id: 'sea', name: 'Sea at night', description: 'Slow waves, about one every ten seconds' },
  { id: 'fan', name: 'Ceiling fan', description: 'A low, even hum and whirr' },
  { id: 'tanpura', name: 'Tanpura', description: 'A soft drone, Pa Sa Sa Sa, over and over' },
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let teardown: (() => void) | null = null;
let volume = 0.7;
let hasRun = false;
let interrupted = false;
const interruptionListeners = new Set<(interrupted: boolean) => void>();

function setInterrupted(value: boolean) {
  if (interrupted === value) return;
  interrupted = value;
  interruptionListeners.forEach((listen) => listen(value));
}

/** Tells a screen that the browser took the audio away (a call, usually) or gave it back, so its label stays true. */
export function onSoundInterrupted(listen: (interrupted: boolean) => void): () => void {
  interruptionListeners.add(listen);
  return () => interruptionListeners.delete(listen);
}

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new Ctor();
    ctx = context;
    hasRun = false;
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    context.onstatechange = () => {
      if (ctx !== context) return;
      if (context.state === 'running') {
        hasRun = true;
        setInterrupted(false);
      } else if (hasRun && teardown) {
        setInterrupted(true);
      }
    };
  }
  return { ctx, master: master! };
}

function closeContext() {
  const context = ctx;
  ctx = null;
  master = null;
  setInterrupted(false);
  if (context) {
    context.onstatechange = null;
    void context.close().catch(() => {});
  }
}

function noise(context: AudioContext, colour: 'white' | 'pink' | 'brown', seconds = 6): AudioBufferSourceNode {
  const length = seconds * context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (colour === 'white') data[i] = white * 0.5;
    else if (colour === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      b0 = 0.997 * b0 + 0.029 * white;
      b1 = 0.985 * b1 + 0.033 * white;
      b2 = 0.95 * b2 + 0.097 * white;
      data[i] = (b0 + b1 + b2 + 0.019 * white) * 1.2;
    }
  }
  // Cross-fade the loop point to avoid a click.
  const fade = Math.min(2048, Math.floor(length / 4));
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i]! * t + data[length - fade + i]! * (1 - t);
  }
  const source = context.createBufferSource();
  source.buffer = new AudioBuffer({ length: length - fade, sampleRate: context.sampleRate });
  source.buffer.copyToChannel(data.subarray(0, length - fade), 0);
  source.loop = true;
  return source;
}

function filter(context: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7) {
  const f = context.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

function gain(context: AudioContext, value: number) {
  const g = context.createGain();
  g.gain.value = value;
  return g;
}

function buildNoiseScape(context: AudioContext, out: AudioNode, id: Exclude<SoundId, 'tanpura'>): () => void {
  const nodes: (AudioScheduledSourceNode)[] = [];
  if (id === 'rain') {
    const a = noise(context, 'white');
    a.connect(filter(context, 'highpass', 900)).connect(filter(context, 'lowpass', 7500)).connect(gain(context, 0.22)).connect(out);
    const b = noise(context, 'pink');
    b.connect(filter(context, 'lowpass', 900)).connect(gain(context, 0.5)).connect(out);
    nodes.push(a, b);
  } else if (id === 'sea') {
    const a = noise(context, 'brown');
    const swell = gain(context, 0.45);
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.1;
    lfo.connect(gain(context, 0.35)).connect(swell.gain);
    a.connect(filter(context, 'lowpass', 1100)).connect(swell).connect(out);
    const hiss = noise(context, 'white');
    const hissGain = gain(context, 0.015);
    lfo.connect(gain(context, 0.015)).connect(hissGain.gain);
    hiss.connect(filter(context, 'highpass', 2500)).connect(hissGain).connect(out);
    nodes.push(a, hiss, lfo);
  } else {
    const a = noise(context, 'brown');
    const whirr = gain(context, 0.7);
    const lfo = context.createOscillator();
    lfo.frequency.value = 5.5;
    lfo.connect(gain(context, 0.06)).connect(whirr.gain);
    a.connect(filter(context, 'lowpass', 520)).connect(whirr).connect(out);
    const hum = context.createOscillator();
    hum.frequency.value = 50;
    hum.connect(gain(context, 0.02)).connect(out);
    nodes.push(a, lfo, hum);
  }
  nodes.forEach((n) => n.start());
  return () => nodes.forEach((n) => n.stop());
}

function buildTanpura(context: AudioContext, out: AudioNode): () => void {
  const SA = 130.81;
  const strings = [SA * 0.75, SA * 2, SA * 2, SA]; // Pa, Sa, Sa, low Sa
  const partials = new Float32Array([0, 1, 0.7, 0.55, 0.45, 0.35, 0.28, 0.2, 0.14, 0.1, 0.08, 0.05]);
  const wave = context.createPeriodicWave(partials, new Float32Array(partials.length));
  const bus = filter(context, 'lowpass', 1800);
  bus.connect(out);

  const pluck = (frequency: number, when: number) => {
    const osc = context.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = frequency;
    const env = context.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(0.1, when + 0.04);
    env.gain.exponentialRampToValueAtTime(0.001, when + 6);
    osc.connect(env).connect(bus);
    osc.start(when);
    osc.stop(when + 6.1);
  };

  let index = 0;
  const STEP = 1.5;
  let nextAt = context.currentTime + 0.05;
  const schedule = () => {
    while (nextAt < context.currentTime + 2) {
      pluck(strings[index % strings.length]!, nextAt);
      index++;
      nextAt += STEP;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 500);
  return () => window.clearInterval(timer);
}

export function playSound(id: SoundId): void {
  const { ctx: context, master: out } = audio();
  void context.resume().catch(() => {});
  teardown?.();
  const bus = context.createGain();
  bus.connect(out);
  const stopSource = id === 'tanpura' ? buildTanpura(context, bus) : buildNoiseScape(context, bus, id);
  out.gain.cancelScheduledValues(context.currentTime);
  out.gain.setTargetAtTime(volume, context.currentTime, 0.6);
  teardown = () => {
    stopSource();
    bus.disconnect();
  };
}

export function stopSound(): void {
  if (!ctx || !master || !teardown) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  const done = teardown;
  teardown = null;
  window.setTimeout(() => {
    done();
    // Unless another sound started during the fade, nothing needs the context, and phones hold audio hardware for it.
    if (!teardown) closeContext();
  }, 900);
}

export function setSoundVolume(value: number): void {
  volume = value;
  if (ctx && master && teardown) master.gain.setTargetAtTime(value, ctx.currentTime, 0.1);
}

export const getSoundVolume = () => volume;
