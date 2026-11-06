import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { BREATH_PATTERNS, PHASE_WORD, cycleSeconds, cyclesForMinutes, isExpanded, phaseAt, type BreathPattern } from '@/lib/breathing';
import type { SoundId } from '@/lib/sound';
import { SOUNDS, playSound, stopSound } from '@/lib/sound';
import { PageTitle } from '@/ui/PageTitle';
import { Knot, StitchRing } from '@/ui/Rings';

const LEAD_IN_MS = 3000;
const LENGTHS = [1, 3, 5] as const;
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * Ring layers. "calm" is the scale when empty, "full" the scale at the top of a breath.
 * Outer rings travel further than inner ones, so a breath spreads outward like a
 * ripple through cloth instead of the whole picture simply zooming.
 */
const LAYERS = [
  { r: 49, calm: 0.57, full: 1, dash: 5.6, gap: 3.6, spin: 'breath-spin-rev', delay: 90, opacity: [0.4, 0.85] },
  { r: 49, calm: 0.52, full: 0.83, dash: 6.4, gap: 4, spin: 'breath-spin', delay: 60, opacity: [0.55, 0.95] },
  { r: 49, calm: 0.47, full: 0.66, dash: 7.6, gap: 4.6, spin: 'breath-spin-rev', delay: 30, opacity: [0.75, 1] },
] as const;

function Stage({ word, expanded, seconds, count, small }: { word: string; expanded: boolean; seconds: number; count: number | null; small?: boolean }) {
  const duration = `${seconds}s`;
  return (
    <div className={`breath-stage mx-auto ${small ? 'breath-stage-small' : ''}`}>
      {LAYERS.map((layer, i) => (
        <div
          key={i}
          className="breath-layer"
          style={{
            transform: `scale(${expanded ? layer.full : layer.calm})`,
            opacity: expanded ? layer.opacity[1] : layer.opacity[0],
            transitionDuration: duration,
            transitionDelay: `${layer.delay}ms`,
          }}
        >
          <svg viewBox="0 0 100 100" className={layer.spin} aria-hidden="true" focusable="false">
            <StitchRing r={layer.r} width={0.9 / layer.full} dash={layer.dash} gap={layer.gap} />
          </svg>
        </div>
      ))}
      <div
        className="breath-layer"
        style={{ transform: `scale(${expanded ? 1 : 0.8})`, transitionDuration: duration }}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <Knot r={26} plain />
        </svg>
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center text-on-haldi">
          <p className="font-display text-[clamp(1.125rem,5.6vw,1.375rem)] font-semibold leading-none" aria-hidden="true">{word}</p>
          {count !== null && <p className="mt-1 text-lg font-medium tabular-nums leading-none" aria-hidden="true">{count}</p>}
        </div>
      </div>
    </div>
  );
}

type Mode = 'setup' | 'running' | 'done';

export default function Breathe() {
  const [pattern, setPattern] = useState<BreathPattern>(BREATH_PATTERNS[0]!);
  const [minutes, setMinutes] = useState<number>(3);
  const [haptic, setHaptic] = useState(false);
  const [sound, setSound] = useState<SoundId | null>(null);
  const [mode, setMode] = useState<Mode>('setup');

  const begin = () => {
    if (sound) playSound(sound);
    setMode('running');
  };
  const end = useCallback((next: Mode) => {
    stopSound();
    setMode(next);
  }, []);
  useEffect(() => () => stopSound(), []);
  // A sound nobody can see to stop ends with the screen, and returns with it if the session is still going.
  useEffect(() => {
    if (mode !== 'running' || !sound) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopSound();
      else playSound(sound);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [mode, sound]);

  if (mode === 'running') {
    return <Session pattern={pattern} minutes={minutes} haptic={haptic} onEnd={end} />;
  }
  if (mode === 'done') {
    return (
      <div className="flex flex-1 flex-col">
        <PageTitle className="pt-8 text-2xl" title="Breathing finished">Take a moment before you move on</PageTitle>
        <p className="mt-3 text-ink-soft">Notice your shoulders, your jaw, your hands. There's no need to feel any particular way.</p>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          <button type="button" className="btn btn-primary" onClick={begin}>Go again</button>
          <Link className="btn btn-secondary" to="/tools/ground">Try grounding</Link>
          <Link className="btn btn-ghost" to="/tools">Back to tools</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-1">
        <Link to="/tools" aria-label="Back to tools" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full">
          <ArrowLeft aria-hidden="true" className="size-6" />
        </Link>
        <PageTitle className="pt-1.5 text-xl" title="Breathe">Breathe with the circle</PageTitle>
      </div>

      <div className="my-auto py-3 [@media(max-height:620px)]:hidden">
        <Stage small word="" expanded={false} seconds={0} count={null} />
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Rhythm</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {BREATH_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={pattern.id === p.id}
                onClick={() => setPattern(p)}
                className="chip justify-center rounded-xl px-1 text-center leading-tight"
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-ink-soft" aria-live="polite">{pattern.summary}.</p>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">How long</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {LENGTHS.map((m) => (
              <button key={m} type="button" className="chip justify-center rounded-xl px-1" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-4">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="shrink-0 font-medium">Sound</span>
            <select
              className="field min-h-11 min-w-0 py-1 text-sm"
              value={sound ?? ''}
              onChange={(e) => setSound((e.target.value || null) as SoundId | null)}
            >
              <option value="">None</option>
              {SOUNDS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {canVibrate && (
            <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={haptic} onChange={(e) => setHaptic(e.target.checked)} />
              Vibrate
            </label>
          )}
        </div>

        <p className="text-sm text-ink-soft">If you feel dizzy or short of breath, stop and breathe normally.</p>
      </div>

      <div className="sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] mt-3 bg-ground pt-1">
        <button type="button" className="btn btn-primary w-full" onClick={begin}>Begin</button>
      </div>
    </div>
  );
}

function Session({ pattern, minutes, haptic, onEnd }: {
  pattern: BreathPattern;
  minutes: number;
  haptic: boolean;
  onEnd: (next: Mode) => void;
}) {
  const startedAt = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  const totalMs = cyclesForMinutes(pattern, minutes) * cycleSeconds(pattern) * 1000;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setElapsed(performance.now() - startedAt.current);
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the screen awake for the length of the session, where the browser allows it. The browser drops
  // the lock when the page is hidden, so it is asked for again on return. Hidden time isn't breathing time.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    let hiddenAt: number | null = null;
    const acquire = () => {
      navigator.wakeLock?.request('screen').then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = performance.now();
        return;
      }
      if (hiddenAt !== null) startedAt.current += performance.now() - hiddenAt;
      hiddenAt = null;
      acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release();
    };
  }, []);

  const inLeadIn = elapsed < LEAD_IN_MS;
  const breathing = phaseAt(pattern, Math.max(0, elapsed - LEAD_IN_MS));
  const finished = elapsed - LEAD_IN_MS >= totalMs;
  const key = inLeadIn ? 'lead' : `${breathing.cycle}-${breathing.index}`;

  useEffect(() => {
    if (haptic && !inLeadIn) navigator.vibrate?.(35);
  }, [key, haptic, inLeadIn]);

  useEffect(() => {
    if (finished) onEnd('done');
  }, [finished, onEnd]);

  const word = inLeadIn ? 'Settle in' : PHASE_WORD[breathing.phase.kind];

  return (
    <div className="flex flex-1 flex-col items-center">
      <PageTitle className="sr-only" title="Breathing">Breathing session</PageTitle>
      <p className="sr-only" role="status" aria-live="polite">{word}</p>
      <div className="flex w-full flex-1 items-center">
        <Stage
          word={word}
          expanded={!inLeadIn && isExpanded(breathing.phase.kind)}
          seconds={inLeadIn ? 1 : breathing.phase.seconds}
          count={inLeadIn ? null : breathing.secondsLeft}
        />
      </div>
      <p className="mb-3 text-center text-sm text-ink-soft">Dizzy or short of breath? Stop and breathe normally.</p>
      <button type="button" className="btn btn-secondary w-full" onClick={() => onEnd('setup')}>Stop</button>
    </div>
  );
}
