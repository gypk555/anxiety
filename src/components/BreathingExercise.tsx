import React, { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Wind, Heart, Sparkles } from "lucide-react";

export const BreathingExercise: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale");
  const [timer, setTimer] = useState(4);
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev > 1) return prev - 1;
          if (phase === "Inhale") { setPhase("Hold"); return 7; }
          if (phase === "Hold")   { setPhase("Exhale"); return 8; }
          setPhase("Inhale"); setCycleCount((c) => c + 1); return 4;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, phase]);

  const handleReset = () => { setIsActive(false); setPhase("Inhale"); setTimer(4); setCycleCount(0); };

  const phaseConfig = {
    Inhale: { gradient: "from-cyan-500 via-teal-400 to-cyan-300", glow: "rgba(6,182,212,0.45)", ring: "#06b6d4", label: "Breathe in slowly through your nose…", bg: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300" },
    Hold:   { gradient: "from-violet-500 via-purple-500 to-indigo-400", glow: "rgba(139,92,246,0.45)", ring: "#8b5cf6", label: "Hold your breath gently…", bg: "bg-violet-500/15 border-violet-500/30 text-violet-300" },
    Exhale: { gradient: "from-emerald-500 via-green-400 to-teal-400", glow: "rgba(16,185,129,0.45)", ring: "#10b981", label: "Exhale completely through your mouth…", bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
  };

  const cfg = phaseConfig[phase];
  const phaseDurations = { Inhale: 4, Hold: 7, Exhale: 8 };
  const progress = ((phaseDurations[phase] - timer) / phaseDurations[phase]) * 100;

  const circleScale = isActive
    ? phase === "Inhale" ? "scale-125" : phase === "Hold" ? "scale-125" : "scale-90"
    : "scale-100";
  const circleTransition = isActive
    ? phase === "Inhale" ? "transition-transform duration-[4000ms] ease-in"
    : phase === "Hold"   ? "transition-transform duration-[1000ms] ease-linear"
    : "transition-transform duration-[8000ms] ease-out"
    : "transition-transform duration-300";

  return (
    <div className="glass-panel p-6 sm:p-10 max-w-3xl mx-auto border-cyan-500/20 fade-in-up space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold uppercase tracking-wider">
          <Wind size={14} /> 4-7-8 Parasympathetic Relaxation
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold font-heading text-slate-100">Guided Breathing Companion</h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          Slows heart rate, resets vagus nerve tone, and calms acute anxiety spikes.
        </p>
      </div>

      {/* Breathing Sphere */}
      <div className="relative w-72 h-72 flex items-center justify-center mx-auto my-4">
        {/* Glow */}
        <div
          className={`absolute inset-0 rounded-full blur-3xl opacity-30 ${circleTransition} ${circleScale}`}
          style={{ background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)` }}
        />
        {/* Ring */}
        <div
          className={`absolute inset-4 rounded-full border-2 opacity-40 ${circleTransition} ${circleScale}`}
          style={{ borderColor: cfg.ring }}
        />
        {/* Main Circle */}
        <div
          className={`relative w-52 h-52 rounded-full bg-gradient-to-br ${cfg.gradient} flex flex-col items-center justify-center text-white shadow-2xl ${circleTransition} ${circleScale}`}
          style={{ boxShadow: `0 0 45px ${cfg.glow}` }}
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-80 mb-1">{phase}</span>
          <span className="text-6xl font-extrabold font-heading leading-none">{timer}<span className="text-2xl ml-0.5">s</span></span>
          <span className="text-xs opacity-75 mt-1 font-medium">cycle {cycleCount}</span>
        </div>

        {/* Circular Progress Indicator */}
        {isActive && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 288 288">
            <circle cx="144" cy="144" r="132" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle
              cx="144" cy="144" r="132" fill="none"
              stroke={cfg.ring} strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 132}`}
              strokeDashoffset={`${2 * Math.PI * 132 * (1 - progress / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
        )}
      </div>

      {/* Instruction Badge & Phase Dots */}
      <div className="text-center space-y-3">
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs sm:text-sm font-semibold ${cfg.bg}`}>
          <Heart size={14} />
          {isActive ? cfg.label : "Click Start to begin guided breathing session"}
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
          {(["Inhale", "Hold", "Exhale"] as const).map((p) => (
            <span key={p} className={`flex items-center gap-1.5 transition-all ${phase === p && isActive ? "text-slate-100 font-semibold" : "opacity-70"}`}>
              <span className={`w-2 h-2 rounded-full transition-all ${phase === p && isActive ? "bg-violet-400 scale-125" : "bg-slate-700"}`} />
              {p} ({p === "Inhale" ? "4s" : p === "Hold" ? "7s" : "8s"})
            </span>
          ))}
        </div>
      </div>

      {cycleCount > 0 && (
        <div className="text-center">
          <span className="text-xs px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold inline-flex items-center gap-1.5">
            <Sparkles size={13} /> {cycleCount} {cycleCount === 1 ? "cycle" : "cycles"} completed
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 pt-2">
        <button onClick={() => setIsActive(!isActive)} className={`btn-primary px-8 py-3.5 text-sm ${isActive ? "!bg-amber-600 !shadow-amber-600/30 hover:!bg-amber-700" : ""}`}>
          {isActive ? <Pause size={18} /> : <Play size={18} />}
          <span>{isActive ? "Pause Session" : "Start Session"}</span>
        </button>
        <button onClick={handleReset} className="btn-secondary px-6 py-3.5 text-sm">
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>
      </div>

      {/* Advice banner */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center">
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-slate-200 font-semibold">Clinical Tip:</span> Complete 3 to 4 full cycles for maximum relaxation effect. Best practiced sitting comfortably with eyes gently closed.
        </p>
      </div>
    </div>
  );
};
