import React, { useEffect } from "react";
import type { ScoreResult } from "../types/assessment";
import { calculateSeverity } from "../data/questions";
import { ScoreGauge } from "./ScoreGauge";
import confetti from "canvas-confetti";
import { ArrowRight, Brain, CheckCircle2, Clock, Printer, RotateCcw, UserCheck, Wind } from "lucide-react";

interface Props { result: ScoreResult; onRetake: () => void; onGoToCoping: () => void; }

const dimensionStyle: Record<string, { text: string; track: string }> = {
  Cognitive: { text: "text-violet-300", track: "bg-violet-400" },
  Emotional: { text: "text-rose-300", track: "bg-rose-400" },
  Physical: { text: "text-cyan-300", track: "bg-cyan-400" },
  Behavioral: { text: "text-amber-300", track: "bg-amber-400" },
};

export const ResultsDashboard: React.FC<Props> = ({ result, onRetake, onGoToCoping }) => {
  const severity = calculateSeverity(result.totalScore, result.maxPossibleScore);

  useEffect(() => {
    if (result.level === "Minimal") {
      confetti({ particleCount: 55, spread: 70, origin: { y: 0.6 }, colors: ["#10b981", "#06b6d4", "#8b5cf6"] });
    }
  }, [result.level]);

  return (
    <div className="results-page max-w-6xl mx-auto w-full fade-in-up pb-12">
      <header className="results-intro">
        <div className="flex items-center gap-2 text-xs text-slate-400"><Clock size={14} className="text-violet-400" /><span>Saved {new Date(result.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
        <h1>Your screening results</h1>
        <p>A private snapshot for {result.userProfile.name}. Take one small next step when you feel ready.</p>
      </header>

      <section className="results-score-card" aria-labelledby="score-heading">
        <div className="results-score-content">
          <div>
            <p className="results-kicker">GAD-7 screening score</p>
            <h2 id="score-heading" className="text-2xl font-bold font-heading text-slate-50 mt-1">{severity.level} anxiety</h2>
            <p className="text-sm text-slate-300 leading-relaxed mt-3 max-w-md">{severity.summary}</p>
          </div>
          <div className="results-gauge-wrap"><ScoreGauge score={result.totalScore} maxScore={result.maxPossibleScore} severity={severity} /></div>
        </div>
        <div className="results-score-footer"><span>This is a screening result, not a diagnosis.</span><span className="hidden sm:inline">Consider a clinician if symptoms feel hard to manage.</span></div>
      </section>

      <section className="results-next-step" aria-labelledby="next-step-heading">
        <div><p className="results-kicker text-emerald-300">A helpful next step</p><h2 id="next-step-heading">Take two minutes to reset</h2><p>Try a guided breathing exercise or a quiet soundscape whenever you need a pause.</p></div>
        <button onClick={onGoToCoping} className="btn-violet results-primary-action" id="results-goto-toolkit"><Wind size={17} /><span>Open relief toolkit</span><ArrowRight size={17} /></button>
      </section>

      <div className="results-content-grid">
        <section className="results-section" aria-labelledby="recommendations-heading">
          <div className="results-section-heading"><div className="results-section-icon results-section-icon-green"><CheckCircle2 size={18} /></div><div><p className="results-kicker">For today</p><h2 id="recommendations-heading">A few supportive actions</h2></div></div>
          <ol className="results-recommendations">{severity.recommendations.slice(0, 3).map((recommendation, index) => <li key={recommendation}><span>{index + 1}</span><p>{recommendation}</p></li>)}</ol>
        </section>

        <section className="results-section" aria-labelledby="dimensions-heading">
          <div className="results-section-heading"><div className="results-section-icon"><Brain size={18} /></div><div><p className="results-kicker">Your pattern</p><h2 id="dimensions-heading">Symptom dimensions</h2></div></div>
          <div className="results-dimensions">{result.categoryBreakdown.map((dimension) => { const style = dimensionStyle[dimension.category] ?? dimensionStyle.Cognitive; return <div key={dimension.category} className="results-dimension-row"><div className="flex items-baseline justify-between gap-3"><span className={style.text}>{dimension.category}</span><span>{dimension.score}/{dimension.maxScore}</span></div><div className="results-dimension-track"><div className={style.track} style={{ width: `${dimension.percentage}%` }} /></div></div>; })}</div>
        </section>
      </div>

      <section className="results-section results-context" aria-labelledby="context-heading">
        <div className="results-section-heading"><div className="results-section-icon results-section-icon-cyan"><UserCheck size={18} /></div><div><p className="results-kicker">Personal context</p><h2 id="context-heading">What may be contributing</h2></div></div>
        <p className="results-context-copy">{result.demographicInsight}</p>
        {result.userProfile.stressDrivers.length > 0 && <div className="results-tags" aria-label="Selected stress drivers">{result.userProfile.stressDrivers.map((driver) => <span key={driver}>{driver}</span>)}</div>}
      </section>

      <div className="results-utility-actions no-print"><button onClick={onRetake} className="btn-ghost"><RotateCcw size={15} /> Retake screening</button><button onClick={() => window.print()} className="btn-ghost"><Printer size={15} /> Print results</button></div>
    </div>
  );
};
