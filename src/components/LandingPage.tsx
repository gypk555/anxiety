import React from "react";
import type { UserProfile, ScoreResult } from "../types/assessment";
import {
  Brain, ShieldCheck, Activity, Wind, ArrowRight,
  Sparkles, Zap, Lock, FileSpreadsheet, TrendingUp, Heart
} from "lucide-react";

interface Props {
  onStartAssessment: () => void;
  onLoadDemoResult: (demoResult: ScoreResult) => void;
  onExploreToolkit: () => void;
}

export const LandingPage: React.FC<Props> = ({ onStartAssessment, onLoadDemoResult, onExploreToolkit }) => {
  const handleQuickDemo = () => {
    const demoProfile: UserProfile = {
      name: "Alex Morgan", age: 28, gender: "Male",
      occupation: "Software Engineer",
      stressDrivers: ["Workplace Deadlines & Heavy Workload", "Sleep Disturbance & Fatigue"],
      avatarId: "1", createdAt: new Date().toISOString(),
    };
    const demoResult: ScoreResult = {
      id: "demo_123", timestamp: new Date().toISOString(),
      totalScore: 11, maxPossibleScore: 21, level: "Moderate",
      categoryBreakdown: [
        { category: "Cognitive",  score: 4, maxScore: 9, percentage: 44 },
        { category: "Emotional",  score: 3, maxScore: 6, percentage: 50 },
        { category: "Physical",   score: 2, maxScore: 3, percentage: 66 },
        { category: "Behavioral", score: 2, maxScore: 3, percentage: 66 },
      ],
      answers: { 1: 2, 2: 2, 3: 2, 4: 1, 5: 1, 6: 1, 7: 2 },
      userProfile: demoProfile, assessmentType: "GAD7",
      demographicInsight: "Data shows that individuals working in Software Engineer roles frequently report elevated tension when balancing workplace deadlines & sleep fatigue. Focused micro-breaks can significantly lower somatic arousal.",
    };
    onLoadDemoResult(demoResult);
  };

  const features = [
    {
      icon: Activity, title: "1. Clinical Assessment",
      desc: "7 standardized GAD-7 questions measuring frequency of worry, restlessness, irritability, and panic symptoms over the last 2 weeks.",
      color: "text-violet-400", bg: "bg-violet-500/12 border-violet-500/30", hover: "hover:border-violet-500/50",
    },
    {
      icon: Brain, title: "2. Dynamic Score Index",
      desc: "Instant circular gauge score (Minimal, Mild, Moderate, Severe) with breakdowns across Cognitive, Somatic, and Behavioral dimensions.",
      color: "text-cyan-400", bg: "bg-cyan-500/12 border-cyan-500/30", hover: "hover:border-cyan-500/50",
    },
    {
      icon: Wind, title: "3. Mindful Relief Tools",
      desc: "Interactive 4-7-8 visual breathing guide, Web Audio ambient soundscapes, and 5-4-3-2-1 grounding exercises.",
      color: "text-emerald-400", bg: "bg-emerald-500/12 border-emerald-500/30", hover: "hover:border-emerald-500/50",
    },
  ];

  const stats = [
    { value: "GAD-7 Standard", label: "Clinically Validated", icon: ShieldCheck, color: "text-cyan-400" },
    { value: "2 Minutes",       label: "Quick Screening",    icon: TrendingUp,  color: "text-violet-400" },
    { value: "100% Private",    label: "Local Storage Only", icon: Lock,        color: "text-emerald-400" },
  ];

  return (
    <div className="max-w-6xl mx-auto w-full space-y-10 sm:space-y-14 fade-in-up py-4 sm:py-8">

      {/* Hero Section */}
      <div className="text-center space-y-5 sm:space-y-6 relative max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/12 border border-violet-500/25 text-violet-300 text-xs font-semibold uppercase tracking-widest shadow-sm">
          <Sparkles size={13} className="text-violet-400" />
          <span>Clinically Validated GAD-7 Screening Engine</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold font-heading text-slate-50 leading-tight tracking-tight px-2">
          Understand Your Mind.{" "}
          <span className="text-gradient-violet block sm:inline">Measure & Calm Anxiety.</span>
        </h1>

        <p className="text-slate-300 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed px-4">
          Take a 2-minute clinical self-assessment to discover your anxiety severity index, get personalized demographic insights, and unlock interactive relaxation tools.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-3 px-4">
          <button onClick={onStartAssessment} className="btn-violet px-8 py-3.5 text-base w-full sm:w-auto shadow-xl shadow-violet-500/25">
            <span>Start Free Assessment</span>
            <ArrowRight size={18} />
          </button>
          <button onClick={handleQuickDemo} className="btn-ghost px-6 py-3.5 text-sm w-full sm:w-auto">
            <Zap size={16} className="text-amber-400" />
            <span>Load Demo Mode</span>
          </button>
          <button onClick={onExploreToolkit} className="btn-ghost px-6 py-3.5 text-sm w-full sm:w-auto">
            <Wind size={16} className="text-cyan-400" />
            <span>Relief Toolkit</span>
          </button>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-xs sm:text-sm text-slate-400 font-medium">
          <div className="flex items-center gap-2"><Lock size={14} className="text-emerald-400" /><span>100% Private (Local)</span></div>
          <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-cyan-400" /><span>GAD-7 Standard</span></div>
          <div className="flex items-center gap-2"><FileSpreadsheet size={14} className="text-purple-400" /><span>PDF Health Reports</span></div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="premium-card p-5 sm:p-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mx-auto">
                <Icon size={20} className={s.color} />
              </div>
              <span className={`text-xl sm:text-2xl font-extrabold font-heading ${s.color} block`}>{s.value}</span>
              <span className="text-xs text-slate-400 font-medium">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className={`premium-card premium-card-interactive p-6 space-y-3.5 border ${f.bg} ${f.hover} transition-all`}>
              <div className={`w-12 h-12 rounded-2xl ${f.bg} border flex items-center justify-center`}>
                <Icon size={24} className={f.color} />
              </div>
              <h3 className="text-lg font-bold font-heading text-slate-100">{f.title}</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Demo View Banner */}
      <div className="premium-card p-6 sm:p-8 border border-violet-500/25 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{ background: "linear-gradient(135deg, rgba(109,40,217,0.18) 0%, rgba(14,20,48,0.85) 50%, rgba(49,46,129,0.18) 100%)" }}>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 mb-1">
            <Heart size={16} className="text-rose-400" />
            <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Live Demo Available</span>
          </div>
          <h4 className="text-xl font-bold font-heading text-slate-100">Want to see the assessment results right now?</h4>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Instantly view sample diagnostic reports, score breakdown charts, and relaxation tools without registration.
          </p>
        </div>
        <button onClick={handleQuickDemo} className="btn-violet shrink-0 w-full md:w-auto px-7 py-3.5 text-sm shadow-lg shadow-violet-500/25">
          <Zap size={16} />
          <span>Launch Demo View</span>
        </button>
      </div>
    </div>
  );
};
