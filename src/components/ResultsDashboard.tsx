import React, { useEffect } from "react";
import type { ScoreResult } from "../types/assessment";
import { calculateSeverity } from "../data/questions";
import { ScoreGauge } from "./ScoreGauge";
import confetti from "canvas-confetti";
import {
  Brain, UserCheck, CheckCircle, RotateCcw,
  ArrowRight, Printer, Award, Clock
} from "lucide-react";

interface Props {
  result: ScoreResult;
  onRetake: () => void;
  onGoToCoping: () => void;
}

export const ResultsDashboard: React.FC<Props> = ({ result, onRetake, onGoToCoping }) => {
  const severity = calculateSeverity(result.totalScore, result.maxPossibleScore);

  useEffect(() => {
    if (result.level === "Minimal" || result.level === "Mild") {
      confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 }, colors: ["#10b981", "#06b6d4", "#8b5cf6"] });
    }
  }, [result]);

  const catColors: Record<string, { bar: string; text: string; bg: string }> = {
    Cognitive:  { bar: "bg-purple-400", text: "text-purple-300",  bg: "bg-purple-500/12 border-purple-500/25" },
    Emotional:  { bar: "bg-rose-400",   text: "text-rose-300",    bg: "bg-rose-500/12 border-rose-500/25" },
    Physical:   { bar: "bg-cyan-400",   text: "text-cyan-300",    bg: "bg-cyan-500/12 border-cyan-500/25" },
    Behavioral: { bar: "bg-amber-400",  text: "text-amber-300",   bg: "bg-amber-500/12 border-amber-500/25" },
  };

  const barColor = (pct: number) =>
    pct < 33 ? "bg-emerald-400" : pct < 66 ? "bg-amber-400" : "bg-rose-500";

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6 fade-in-up pb-12">

      {/* Header card */}
      <div className="premium-card p-6 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
            <Award size={15} className="text-violet-400" />
            <span>Assessment Logged for</span>
            <span className="text-slate-100 font-semibold">{result.userProfile.name}</span>
            <span className="text-slate-600">·</span>
            <span>{result.userProfile.occupation}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading text-gradient-violet">
            Anxiety Level Diagnosis & Insights
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-0.5">
            <Clock size={13} />
            <span>Recorded on {new Date(result.timestamp).toLocaleDateString()} at {new Date(result.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 no-print shrink-0">
          <button onClick={() => window.print()} className="btn-ghost text-xs px-4 py-2.5">
            <Printer size={16} />
            <span>Print PDF</span>
          </button>
          <button onClick={onRetake} className="btn-ghost text-xs px-4 py-2.5">
            <RotateCcw size={16} />
            <span>Retake</span>
          </button>
          <button onClick={onGoToCoping} className="btn-violet text-xs px-5 py-2.5">
            <span>Relief Toolkit</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Score Gauge + Clinical Synthesis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gauge card */}
        <div className="premium-card p-6 border-violet-500/25 flex flex-col items-center justify-center text-center space-y-2"
          style={{ background: "linear-gradient(160deg, rgba(109,40,217,0.16) 0%, rgba(14,20,48,0.85) 100%)" }}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Anxiety Score Index</p>
          <ScoreGauge score={result.totalScore} maxScore={result.maxPossibleScore} severity={severity} />
          <p className="text-xs text-slate-400 font-medium pt-1">{severity.rangeText}</p>
        </div>

        {/* Clinical Synthesis & Action Plan */}
        <div className="premium-card p-6 sm:p-7 lg:col-span-2 space-y-5">
          <div className="space-y-2">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest block">Clinical Assessment Synthesis</span>
            <p className="text-slate-200 text-sm sm:text-base leading-relaxed">{severity.summary}</p>
          </div>

          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest block">Actionable Clinical Recommendations</span>
            <ul className="space-y-2.5">
              {severity.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
                  <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Symptom Dimension Breakdown Grid */}
      <div className="premium-card p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
            <Brain size={20} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">Symptom Dimension Analysis</h3>
            <p className="text-xs text-slate-400">Detailed score breakdown across Cognitive, Emotional, Physical, and Behavioral dimensions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {result.categoryBreakdown.map((cat) => {
            const c = catColors[cat.category] ?? catColors.Cognitive;
            return (
              <div key={cat.category} className={`p-5 rounded-2xl border ${c.bg} space-y-3`}>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className={`font-bold ${c.text}`}>{cat.category} Symptoms</span>
                  <span className="text-slate-400 font-semibold">{cat.score} / {cat.maxScore} pts · <span className="text-slate-200">{cat.percentage}%</span></span>
                </div>
                <div className="h-2.5 w-full bg-slate-950/80 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full ${barColor(cat.percentage)} rounded-full transition-all duration-700`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {cat.percentage < 33 ? "Minimal impact reported in this dimension." : cat.percentage < 66 ? "Moderate symptoms present — monitoring recommended." : "Elevated symptom frequency — targeted relief tools advised."}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Demographic Context & Benchmarks */}
      <div className="premium-card p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <UserCheck size={20} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">Demographic & Stress Factor Benchmarks</h3>
            <p className="text-xs text-slate-400">Personalized insight based on occupation, age group, and reported stress drivers</p>
          </div>
        </div>

        <p className="text-slate-300 text-sm sm:text-base leading-relaxed pl-1">{result.demographicInsight}</p>

        {result.userProfile.stressDrivers.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-slate-400 font-medium shrink-0">Selected stress drivers:</span>
            {result.userProfile.stressDrivers.map((d) => (
              <span key={d} className="text-xs px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-300 font-medium">
                {d}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
