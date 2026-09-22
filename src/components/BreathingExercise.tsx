import React, { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Wind, Heart, Sparkles, Info } from "lucide-react";

type Phase = "Inhale" | "Hold" | "Exhale";

const phaseConfig: Record<Phase, {
  gradient: string; glow: string; ring: string; label: string;
  bg: string; duration: number; scaleTarget: string;
}> = {
  Inhale: {
    gradient:    "from-cyan-500 via-teal-400 to-cyan-300",
    glow:        "rgba(6,182,212,0.50)",
    ring:        "#06b6d4",
    label:       "Breathe in slowly through your nose…",
    bg:          "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
    duration:    4,
    scaleTarget: "scale-125",
  },
  Hold: {
    gradient:    "from-violet-500 via-purple-500 to-indigo-400",
    glow:        "rgba(139,92,246,0.50)",
    ring:        "#8b5cf6",
    label:       "Hold your breath gently…",
    bg:          "bg-violet-500/15 border-violet-500/30 text-violet-300",
    duration:    7,
    scaleTarget: "scale-125",
  },
  Exhale: {
    gradient:    "from-emerald-500 via-green-400 to-teal-400",
    glow:        "rgba(16,185,129,0.50)",
    ring:        "#10b981",
    label:       "Exhale fully through your mouth…",
    bg:          "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    duration:    8,
    scaleTarget: "scale-90",
  },
};

export const BreathingExercise: React.FC = () => {
  const [isActive,    setIsActive]    = useState(false);
  const [phase,       setPhase]       = useState<Phase>("Inhale");
  const [timer,       setTimer]       = useState(4);
  const [cycleCount,  setCycleCount]  = useState(0);
  const [showTip,     setShowTip]     = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev > 1) return prev - 1;
          if (phase === "Inhale") { setPhase("Hold");   return 7; }
          if (phase === "Hold")   { setPhase("Exhale"); return 8; }
          setPhase("Inhale"); setCycleCount((c) => c + 1); return 4;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, phase]);

  const handleReset = () => {
    setIsActive(false); setPhase("Inhale");
    setTimer(4);        setCycleCount(0);
  };

  const cfg      = phaseConfig[phase];
  const progress = ((cfg.duration - timer) / cfg.duration) * 100;

  // CSS transition durations based on phase
  const orbTransitionDuration = isActive
    ? phase === "Inhale"  ? "4000ms"
    : phase === "Hold"    ? "500ms"
    : "8000ms"
    : "400ms";

  const orbScale = isActive ? cfg.scaleTarget : "scale-100";

  // Circular SVG progress
  const svgR    = 148;
  const arcLen  = 2 * Math.PI * svgR;
  const dashOff = arcLen * (1 - progress / 100);

  return (
    <div className="glass-panel p-6 sm:p-10 max-w-4xl mx-auto border-cyan-500/15 fade-in-up">

      {/* ── HEADER ── */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/12 border border-cyan-500/28 text-cyan-300 text-xs font-semibold uppercase tracking-wider">
          <Wind size={13} />
          4-7-8 Parasympathetic Relaxation
        </div>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-heading text-slate-100">
          Guided Breathing Companion
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
          Slows heart rate, resets vagus nerve tone, and calms acute anxiety spikes in minutes.
        </p>
      </div>

      {/* ── MAIN AREA — orb + controls side by side on desktop ── */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16">

        {/* Orb */}
        <div className="relative shrink-0" style={{ width: 320, height: 320 }}>
          {/* Outer ambient glow */}
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-25 transition-all duration-1000"
            style={{ background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)` }}
          />

          {/* Pulse rings when active */}
          {isActive && (
            <>
              <div
                className="absolute inset-8 rounded-full border opacity-20 pulse-ring"
                style={{ borderColor: cfg.ring }}
              />
              <div
                className="absolute inset-8 rounded-full border opacity-15 pulse-ring-delay"
                style={{ borderColor: cfg.ring }}
              />
            </>
          )}

          {/* SVG circular progress */}
          {isActive && (
            <svg
              className="absolute inset-0 w-full h-full -rotate-90"
              viewBox="0 0 320 320"
            >
              <circle
                cx="160" cy="160" r={svgR}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="6"
              />
              <circle
                cx="160" cy="160" r={svgR}
                fill="none"
                stroke={cfg.ring}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={arcLen}
                strokeDashoffset={dashOff}
                className="transition-all duration-1000"
                style={{ filter: `drop-shadow(0 0 6px ${cfg.ring}80)` }}
              />
            </svg>
          )}

          {/* Orb */}
          <div
            className={`
              absolute inset-10 rounded-full
              bg-gradient-to-br ${cfg.gradient}
              flex flex-col items-center justify-center
              text-white shadow-2xl
              ${orbScale}
            `}
            style={{
              boxShadow:  `0 0 60px ${cfg.glow}`,
              transition: `transform ${orbTransitionDuration} ${
                phase === "Inhale" ? "ease-in" : phase === "Hold" ? "ease-linear" : "ease-out"
              }`,
            }}
          >
            <span className="text-xs font-bold uppercase tracking-[0.22em] opacity-80 mb-1">{phase}</span>
            <span className="text-6xl font-extrabold font-heading leading-none">
              {timer}<span className="text-2xl ml-0.5 opacity-80">s</span>
            </span>
            <span className="text-xs opacity-65 mt-1.5 font-medium">
              {cycleCount > 0 ? `cycle ${cycleCount}` : "ready"}
            </span>
          </div>
        </div>

        {/* Right panel: instruction + phase tracker + controls */}
        <div className="flex flex-col items-center lg:items-start gap-6 w-full max-w-xs lg:max-w-sm">

          {/* Phase instruction badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-semibold ${cfg.bg} transition-all duration-500`}>
            <Heart size={15} />
            <span>{isActive ? cfg.label : "Press Start to begin"}</span>
          </div>

          {/* Phase timeline */}
          <div className="w-full space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Breath Cycle</p>
            {(["Inhale", "Hold", "Exhale"] as Phase[]).map((p) => {
              const isCurrentPhase = phase === p && isActive;
              const pc = phaseConfig[p];
              return (
                <div
                  key={p}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${
                    isCurrentPhase
                      ? `${pc.bg} font-semibold`
                      : "bg-slate-900/40 border-slate-800/60 opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full transition-all ${isCurrentPhase ? "scale-125" : ""}`}
                      style={{ background: isCurrentPhase ? pc.ring : "#334155" }}
                    />
                    <span className={`text-sm ${isCurrentPhase ? "text-slate-100" : "text-slate-500"}`}>{p}</span>
                  </div>
                  <span className={`text-xs font-bold font-heading ${isCurrentPhase ? "text-slate-200" : "text-slate-600"}`}>
                    {pc.duration}s
                  </span>
                </div>
              );
            })}
          </div>

          {/* Cycle counter */}
          {cycleCount > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/12 border border-emerald-500/28 text-emerald-300 text-xs font-semibold fade-in">
              <Sparkles size={13} />
              {cycleCount} {cycleCount === 1 ? "cycle" : "cycles"} completed
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => setIsActive(!isActive)}
              className={`btn-primary flex-1 py-3.5 text-sm ${
                isActive
                  ? "!bg-amber-600 !shadow-amber-600/30 hover:!bg-amber-700 hover:!shadow-amber-600/50"
                  : ""
              }`}
              id="breathing-toggle"
            >
              {isActive ? <Pause size={18} /> : <Play size={18} />}
              <span>{isActive ? "Pause Session" : "Start Session"}</span>
            </button>
            <button onClick={handleReset} className="btn-secondary px-5 py-3.5 text-sm">
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── CLINICAL TIP ── */}
      <div className="mt-8 relative">
        <button
          onClick={() => setShowTip(!showTip)}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors mx-auto"
        >
          <Info size={14} />
          <span>{showTip ? "Hide" : "Show"} Clinical Tips</span>
        </button>
        {showTip && (
          <div className="mt-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800/70 text-center fade-in">
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-200 font-semibold">Clinical Tip:</span> Complete 3–4 full cycles for maximum effect.
              The 4-7-8 pattern activates the parasympathetic nervous system, lowering cortisol and heart rate within minutes.
              Best practiced sitting comfortably with eyes gently closed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
