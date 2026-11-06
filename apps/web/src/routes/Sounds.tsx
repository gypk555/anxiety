import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSoundVolume, onSoundInterrupted, playSound, setSoundVolume, SOUNDS, stopSound, type SoundId } from '@/lib/sound';
import { PageTitle } from '@/ui/PageTitle';

export default function Sounds() {
  const [playing, setPlaying] = useState<SoundId | null>(null);
  const [volume, setVolume] = useState(getSoundVolume());
  const supported = 'AudioContext' in window || 'webkitAudioContext' in window;

  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => () => stopSound(), []);
  useEffect(() => onSoundInterrupted(setInterrupted), []);
  // Nobody can stop a sound they can't see, so it ends with the screen.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      stopSound();
      setPlaying(null);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggle = (id: SoundId) => {
    if (playing === id && !interrupted) {
      stopSound();
      setPlaying(null);
    } else {
      playSound(id);
      setPlaying(id);
    }
    setInterrupted(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle className="pt-2 text-2xl" title="Sounds">Something steady to listen to</PageTitle>
      <p className="text-ink-soft">These are made on your phone as they play, so they use no data and work offline. They stop when you leave this screen or your phone locks.</p>
      {!supported && <p role="alert" className="patch">This browser can't play these sounds. The other tools still work.</p>}
      <ul className="flex flex-col gap-2">
        {SOUNDS.map((sound) => {
          const paused = playing === sound.id && interrupted;
          const on = playing === sound.id && !interrupted;
          return (
            <li key={sound.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!supported}
                onClick={() => toggle(sound.id)}
                className="option !min-h-[4.5rem]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-haldi text-on-haldi">
                  {on ? <Pause aria-hidden="true" className="size-5" fill="currentColor" /> : <Play aria-hidden="true" className="size-5" fill="currentColor" />}
                </span>
                <span className="flex-1">
                  <span className="block font-display text-xl font-semibold">{sound.name}</span>
                  <span className="block text-sm font-normal opacity-85">{paused ? 'Paused by your phone. Tap to play again.' : on ? 'Playing. Tap to stop.' : sound.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <label className="flex flex-col gap-1 pt-2">
        <span className="text-sm font-medium">Volume</span>
        <input
          type="range"
          className="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-valuetext={`${Math.round(volume * 100)} percent`}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setVolume(v);
            setSoundVolume(v);
          }}
        />
      </label>
    </div>
  );
}
