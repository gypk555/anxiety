import React, { useEffect } from "react";
import type { ScoreResult } from "../types/assessment";
import { calculateSeverity } from "../data/questions";
import { ScoreGauge } from "./ScoreGauge";
import confetti from "canvas-confetti";
import {
  Brain, UserCheck, CheckCircle, RotateCcw,
  ArrowRight, Printer, Award, Clock,
  TrendingDown, TrendingUp, Minus, Wind,
} from "lucide-react";

interface Props {
  result:       ScoreResult;
  onRetake:     () => void;
  onGoToCoping: () => void;
}

const catColors: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  Cognitive:  { bar: "bg-purple-400", text: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/22" },
  Emotional:  { bar: "bg-rose-400",   text: "text-rose-300",   bg: "bg-rose-500/10",   border: "border-rose-500/22"   },
  Physical:   { bar: "bg-cyan-400",   text: "text-cyan-300",   bg: "bg-cyan-500/10",   border: "border-cyan-500/22"   },
  Behavioral: { bar: "bg-amber-400",  text: "text-amber-300",  bg: "bg-amber-500/10",  border: "border-amber-500/22"  },
};

const severityMeta: Record<string, { label: string }> = {
  Minimal:  { label: "You're doing great" },
  Mild:     { label: "Some tension detected" },
  Moderate: { label: "Attention recommended" },
  Severe:   { label: "Support advised" },
};

const barColor = (pct: number) =>
  pct < 33 ? "bg-emerald-400" : pct < 66 ? "bg-amber-400" : "bg-rose-500";

const pctLabel = (pct: number) =>
  pct < 33
    ? "Minimal impact in this dimension."
    : pct < 66
      ? "Moderate symptoms — monitoring recommended."
      : "Elevated frequency — targeted relief advised.";

export const ResultsDashboard: React.FC<Props> = ({ result, onRetake, onGoToCoping }) => {
  const severity = calculateSeverity(result.totalScore, result.maxPossibleScore);
  const smeta    = severityMeta[severity.level] ?? severityMeta.Minimal;

  useEffect(() => {
    if (result.level === "Minimal" || result.level === "Mild") {
      confetti({
        particleCount: 90,
        spread: 90,
        origin: { y: 0.55 },
        colors: ["#10b981", "#06b6d4", "#8b5cf6", "#a78bfa"],
      });
    }
  }, [result]);

  const score    = result.totalScore;
  const maxScore = result.maxPossibleScore;
  const pct      = Math.round((score / maxScore) * 100);

  const TrendIcon  = pct < 40 ? TrendingDown : pct < 70 ? Minus : TrendingUp;
  const trendColor = pct < 40 ? "text-emerald-400" : pct < 70 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6 fade-in-up pb-12">

      {/* ── PAGE HEADER ── */}
      <div className="premium-card p-5 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-400">
            <Award size={14} className="text-violet-400 shrink-0" />
            <span>Assessment logged for</span>
            <span className="text-slate-100 font-semibold">{result.userProfile.name}</span>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span className="hidden sm:inline">{result.userProfile.occupation}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading text-gradient-violet leading-tight">
            Anxiety Level Diagnosis &amp; Insights
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock size={12} />
            <span>
              Recorded {new Date(result.timestamp).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              &nbsp;at {new Date(result.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 no-print shrink-0">
          <button onClick={() => window.print()} className="btn-ghost text-xs px-4 py-2.5">
            <Printer size={15} />
            <span>Print PDF</span>
          </button>
          <button onClick={onRetake} className="btn-ghost text-xs px-4 py-2.5">
            <RotateCcw size={15} />
            <span>Retake</span>
          </button>
          <button onClick={onGoToCoping} className="btn-violet text-xs px-5 py-2.5" id="results-goto-toolkit">
            <span>Relief Toolkit</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* ── TOP ROW: Gauge | Synthesis | Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">

        {/* Gauge card */}
        <div
          className="premium-card p-6 border-violet-500/20 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: "linear-gradient(160deg,rgba(109,40,217,0.18) 0%,rgba(10,14,38,0.92) 100%)" }}
        >
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Anxiety Score Index</p>
          <ScoreGauge score={score} maxScore={maxScore} severity={severity} />
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TrendIcon size={16} className={trendColor} />
            <span className={trendColor}>{smeta.label}</span>
          </div>
          <p className="text-xs text-slate-500">{severity.rangeText}</p>
        </div>

        {/* Clinical Synthesis */}
        <div className="premium-card p-6 sm:p-7 space-y-5">
          <div className="space-y-2">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest block">Clinical Assessment Synthesis</span>
            <p className="text-slate-200 text-sm sm:text-base leading-relaxed">{severity.summary}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${
              result.assessmentType === "GAD7"
                ? "bg-violet-500/12 border-violet-500/30 text-violet-300"
                : "bg-cyan-500/12 border-cyan-500/30 text-cyan-300"
            }`}>
              {result.assessmentType === "GAD7" ? "GAD-7 Standard (7 Questions)" : "Extended Assessment (14 Questions)"}
            </span>
          </div>
        </div>

        {/* Recommendations */}
        <div className="premium-card p-6 sm:p-7 space-y-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Actionable Recommendations</span>
          <ul className="space-y-3">
            {severity.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── SYMPTOM BREAKDOWN ── */}
      <div className="premium-card p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/28 flex items-center justify-center shrink-0">
            <Brain size={20} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">Symptom Dimension Analysis</h3>
            <p className="text-xs text-slate-500">Score breakdown across Cognitive, Emotional, Physical &amp; Behavioral dimensions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {result.categoryBreakdown.map((cat) => {
            const c = catColors[cat.category] ?? catColors.Cognitive;
            return (
              <div key={cat.category} className={`p-5 rounded-2xl border ${c.bg} ${c.border} space-y-3.5`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${c.text}`}>{cat.category}</span>
                  <span className={`text-sm font-extrabold font-heading ${c.text}`}>{cat.percentage}%</span>
                </div>
                <div className="h-2.5 w-full bg-slate-950/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor(cat.percentage)} rounded-full transition-all duration-700`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{cat.score}/{cat.maxScore} pts</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{pctLabel(cat.percentage)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── DEMOGRAPHIC CONTEXT ── */}
      <div className="premium-card p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/28 flex items-center justify-center shrink-0">
            <UserCheck size={20} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">Demographic &amp; Stress Factor Benchmarks</h3>
            <p className="text-xs text-slate-500">Personalized insight based on occupation, age group, and reported stress drivers</p>
          </div>
        </div>

        <p className="text-slate-300 text-sm sm:text-base leading-relaxed">{result.demographicInsight}</p>

        {result.userProfile.stressDrivers.length > 0 && (
          <div className="pt-2 space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Selected Stress Drivers</span>
            <div className="flex flex-wrap gap-2">
              {result.userProfile.stressDrivers.map((d) => (
                <span
                  key={d}
                  className="text-xs px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-300 font-medium"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM CTA ── */}
      <div
        className="premium-card p-6 sm:p-8 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-6 no-print"
        style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.12) 0%,rgba(10,14,38,0.90) 100%)" }}
      >
        <div className="space-y-1 text-center sm:text-left">
          <p className="text-sm font-bold text-emerald-300">Ready to manage your anxiety?</p>
          <p className="text-xs text-slate-400">Access breathing exercises and calming soundscapes to help lower your score.</p>
        </div>
        <button onClick={onGoToCoping} className="btn-violet w-full sm:w-auto px-8 py-3.5 shadow-lg shadow-violet-500/25">
          <Wind size={16} />
          <span>Open Relief Toolkit</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};
