import React, { useState, useEffect, useRef } from "react";
import { Volume2, VolumeX, Pause, CloudRain, Waves, Sparkles, Music, Play } from "lucide-react";

interface SoundTrack {
  id:          string;
  name:        string;
  type:        "rain" | "ocean" | "binaural";
  description: string;
  icon:        React.ElementType;
  color:       string;
  textColor:   string;
  bg:          string;
  border:      string;
  glowColor:   string;
}

const TRACKS: SoundTrack[] = [
  {
    id: "rain", name: "Gentle Rainfall", type: "rain",
    description: "Soft rhythmic raindrops to mute background distractions and soothe the mind.",
    icon: CloudRain, color: "text-cyan-300", textColor: "#67e8f9",
    bg: "bg-cyan-500/15", border: "border-cyan-500/38", glowColor: "rgba(6,182,212,0.35)",
  },
  {
    id: "ocean", name: "Ocean Waves", type: "ocean",
    description: "Slow rhythmic tide swells tuned to calm heart rate and regulate breathing.",
    icon: Waves, color: "text-blue-300", textColor: "#93c5fd",
    bg: "bg-blue-500/15", border: "border-blue-500/38", glowColor: "rgba(59,130,246,0.35)",
  },
  {
    id: "binaural", name: "432Hz Theta Calm", type: "binaural",
    description: "Synthesized harmonic frequencies promoting deep meditative relaxation state.",
    icon: Sparkles, color: "text-purple-300", textColor: "#d8b4fe",
    bg: "bg-purple-500/15", border: "border-purple-500/38", glowColor: "rgba(139,92,246,0.35)",
  },
];

// ── Visualizer bars ────────────────────────────────────────────
const VisualizerBars: React.FC<{ color: string; playing: boolean }> = ({ color, playing }) => {
  const barClasses = ["animate-bar-1","animate-bar-2","animate-bar-3","animate-bar-4","animate-bar-5"];
  if (!playing) {
    return (
      <div className="flex items-end gap-0.5 h-6">
        {[4, 8, 6, 10, 5].map((h, i) => (
          <span key={i} className="visualizer-bar w-1 rounded-sm opacity-30" style={{ height: h, background: color }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-end gap-0.5 h-6">
      {barClasses.map((cls, i) => (
        <span key={i} className={`visualizer-bar w-1 rounded-sm ${cls}`} style={{ background: color }} />
      ))}
    </div>
  );
};

export const SoundscapePlayer: React.FC = () => {
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [volume,      setVolume]      = useState(0.5);
  const [isPlaying,   setIsPlaying]   = useState(false);

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const gainNodeRef  = useRef<GainNode | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);
  const lfoRef       = useRef<OscillatorNode | null>(null);

  const stopAudio = () => {
    if (noiseNodeRef.current) {
      try { (noiseNodeRef.current as any).stop?.(); noiseNodeRef.current.disconnect(); } catch {}
      noiseNodeRef.current = null;
    }
    if (lfoRef.current) {
      try { lfoRef.current.stop(); lfoRef.current.disconnect(); } catch {}
      lfoRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close(); audioCtxRef.current = null;
    }
    setIsPlaying(false);
  };

  const startAudioTrack = (trackType: string) => {
    stopAudio();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx      = new AudioCtx();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      const bufferSize  = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output      = noiseBuffer.getChannelData(0);

      if (trackType === "rain") {
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
        for (let i=0;i<bufferSize;i++) {
          const w=Math.random()*2-1;
          b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
          b2=0.9690*b2+w*0.153852; b3=0.8665*b3+w*0.3104856;
          b4=0.55*b4+w*0.5329522; b5=-0.7616*b5-w*0.016898;
          output[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.05; b6=w*0.115926;
        }
        const src    = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.setValueAtTime(1000, ctx.currentTime);
        src.connect(filter); filter.connect(masterGain); src.start();
        noiseNodeRef.current = src;

      } else if (trackType === "ocean") {
        for (let i=0;i<bufferSize;i++) output[i] = Math.random()*2-1;
        const src    = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.setValueAtTime(300, ctx.currentTime);
        const lfo    = ctx.createOscillator(); lfo.frequency.setValueAtTime(0.12, ctx.currentTime);
        const lfoGain = ctx.createGain(); lfoGain.gain.setValueAtTime(250, ctx.currentTime);
        lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start(); lfoRef.current = lfo;
        src.connect(filter); filter.connect(masterGain); src.start();
        noiseNodeRef.current = src;

      } else if (trackType === "binaural") {
        const osc1 = ctx.createOscillator(); const osc2 = ctx.createOscillator();
        osc1.type = "sine"; osc2.type = "sine";
        osc1.frequency.setValueAtTime(216, ctx.currentTime); osc2.frequency.setValueAtTime(222, ctx.currentTime);
        const subGain = ctx.createGain(); subGain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc1.connect(subGain); osc2.connect(subGain); subGain.connect(masterGain);
        osc1.start(); osc2.start();
        noiseNodeRef.current = osc1 as any;
      }
      setIsPlaying(true);
    } catch (e) { console.error("Audio Context Error", e); }
  };

  const toggleTrack = (trackId: string, trackType: string) => {
    if (activeTrack === trackId && isPlaying) { stopAudio(); setActiveTrack(null); }
    else { setActiveTrack(trackId); startAudioTrack(trackType); }
  };

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume, audioCtxRef.current.currentTime);
    }
  }, [volume]);

  useEffect(() => { return () => { stopAudio(); }; }, []);

  const activeTrackObj = TRACKS.find((t) => t.id === activeTrack && isPlaying);

  return (
    <div className="glass-panel p-6 sm:p-10 max-w-4xl mx-auto border-purple-500/15 fade-in-up">

      {/* ── HEADER ── */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
          <Music className="text-purple-400" size={22} />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-slate-100">Ambient Soundscapes</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Real-time synthesized audio to lower physiological arousal.
          </p>
        </div>
        {/* Now playing badge */}
        {activeTrackObj && (
          <div className={`ml-auto hidden sm:flex items-center gap-3 px-4 py-2 rounded-2xl border ${activeTrackObj.bg} ${activeTrackObj.border} fade-in`}>
            <VisualizerBars color={activeTrackObj.textColor} playing />
            <span className={`text-xs font-semibold ${activeTrackObj.color}`}>Now Playing</span>
          </div>
        )}
      </div>

      {/* ── TRACK CARDS ── */}
      <div className="space-y-3">
        {TRACKS.map((t) => {
          const Icon       = t.icon;
          const isSelected = activeTrack === t.id && isPlaying;
          return (
            <div
              key={t.id}
              onClick={() => toggleTrack(t.id, t.type)}
              id={`soundscape-track-${t.id}`}
              className={`relative p-5 rounded-2xl border cursor-pointer transition-all duration-200 group overflow-hidden ${
                isSelected
                  ? `${t.bg} ${t.border} shadow-xl`
                  : "bg-slate-900/55 border-slate-800/70 hover:bg-slate-800/60 hover:border-slate-700"
              }`}
              style={isSelected ? { boxShadow: `0 8px 32px -8px ${t.glowColor}` } : {}}
            >
              {/* Background glow when selected */}
              {isSelected && (
                <div
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 10% 50%, ${t.glowColor}, transparent 70%)` }}
                />
              )}

              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {/* Icon */}
                  <div className={`p-3 rounded-xl shrink-0 transition-all ${
                    isSelected ? `${t.bg} ${t.border} border` : "bg-slate-800 border border-slate-700/60 group-hover:bg-slate-700"
                  }`}>
                    <Icon size={22} className={isSelected ? t.color : "text-slate-400"} />
                  </div>

                  {/* Text */}
                  <div className="min-w-0">
                    <h3 className={`text-base font-semibold transition-colors ${isSelected ? "text-slate-100" : "text-slate-200"}`}>
                      {t.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t.description}</p>
                  </div>
                </div>

                {/* Right: visualizer + play button */}
                <div className="flex items-center gap-3 shrink-0">
                  {isSelected && (
                    <VisualizerBars color={t.textColor} playing={isSelected} />
                  )}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all border ${
                    isSelected
                      ? `${t.bg} ${t.border} shadow-lg`
                      : "bg-slate-800 border-slate-700 group-hover:bg-slate-700 group-hover:border-slate-600"
                  }`}>
                    {isSelected
                      ? <Pause size={18} className={t.color} />
                      : <Play  size={18} className="text-slate-400 translate-x-0.5" />
                    }
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── VOLUME CONTROL ── */}
      <div className="mt-6 p-5 rounded-2xl bg-slate-900/55 border border-slate-800/70">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setVolume((v) => (v === 0 ? 0.5 : 0))}
            className="text-slate-400 hover:text-slate-200 transition-colors p-2.5 rounded-xl hover:bg-slate-800 border border-transparent hover:border-slate-700 shrink-0"
            id="soundscape-mute"
          >
            {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span className="font-medium">Master Volume</span>
              <span className="text-slate-200 font-semibold tabular-nums">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05" value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full"
              id="soundscape-volume"
              style={{
                background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── TIP ── */}
      <p className="text-center text-xs text-slate-600 mt-4">
        Use headphones for the best binaural experience. Combine with the breathing exercise for deeper relaxation.
      </p>
    </div>
  );
};
