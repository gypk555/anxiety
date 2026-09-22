import React from "react";
import type { UserProfile, ScoreResult } from "../types/assessment";
import {
  Brain, ShieldCheck, Activity, Wind, ArrowRight,
  Sparkles, Zap, Lock, FileSpreadsheet, TrendingUp, Heart,
  CheckCircle2,
} from "lucide-react";

interface Props {
  onStartAssessment: () => void;
  onLoadDemoResult:  (demoResult: ScoreResult) => void;
  onExploreToolkit:  () => void;
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
      icon: Activity, title: "Clinical Assessment",
      desc: "7 standardized GAD-7 questions measuring worry, restlessness, irritability, and panic over the last 2 weeks.",
      color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/25", hover: "hover:border-violet-400/50",
      step: "01",
    },
    {
      icon: Brain, title: "Dynamic Score Index",
      desc: "Instant gauge score — Minimal, Mild, Moderate, or Severe — with breakdowns across Cognitive, Somatic & Behavioral dimensions.",
      color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/25", hover: "hover:border-cyan-400/50",
      step: "02",
    },
    {
      icon: Wind, title: "Mindful Relief Tools",
      desc: "Interactive 4-7-8 breathing guide, Web Audio ambient soundscapes, and 5-4-3-2-1 sensory grounding exercises.",
      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", hover: "hover:border-emerald-400/50",
      step: "03",
    },
  ];

  const stats = [
    { value: "GAD-7",    label: "Clinical Standard",  icon: ShieldCheck, color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20" },
    { value: "~2 Min",   label: "Quick Screening",    icon: TrendingUp,  color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20" },
    { value: "Private",  label: "Local Storage Only", icon: Lock,        color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { value: "PDF",      label: "Health Reports",     icon: FileSpreadsheet, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  ];

  const bullets = [
    "No sign-up or account required",
    "Data never leaves your device",
    "Clinically validated GAD-7 standard",
  ];

  return (
    <div className="max-w-7xl mx-auto w-full space-y-14 sm:space-y-20 fade-in-up py-4 sm:py-8">

      {/* ── HERO — two-column on large screens ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

        {/* Left: copy + CTAs */}
        <div className="space-y-7">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/22 text-violet-300 text-xs font-semibold uppercase tracking-widest shadow-sm">
            <Sparkles size={13} className="text-violet-400" />
            <span>Clinically Validated · GAD-7 Screening Engine</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold font-heading text-slate-50 leading-[1.1] tracking-tight">
            Understand<br className="hidden sm:block" /> Your Mind.{" "}
            <span className="text-gradient-violet">Measure &amp; Calm Anxiety.</span>
          </h1>

          {/* Sub-copy */}
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-xl">
            Take a 2-minute clinical self-assessment to discover your anxiety severity,
            get personalized insights based on your profile, and unlock interactive relaxation tools.
          </p>

          {/* Bullet trust points */}
          <ul className="space-y-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-sm text-slate-400">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                {b}
              </li>
            ))}
          </ul>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              onClick={onStartAssessment}
              className="btn-violet px-8 py-4 text-base shadow-xl shadow-violet-500/25"
              id="hero-start-assessment"
            >
              <span>Start Free Assessment</span>
              <ArrowRight size={18} />
            </button>
            <button
              onClick={handleQuickDemo}
              className="btn-ghost px-6 py-4 text-sm"
              id="hero-demo-mode"
            >
              <Zap size={16} className="text-amber-400" />
              <span>Load Demo Mode</span>
            </button>
            <button
              onClick={onExploreToolkit}
              className="btn-ghost px-6 py-4 text-sm"
              id="hero-explore-toolkit"
            >
              <Wind size={16} className="text-cyan-400" />
              <span>Relief Toolkit</span>
            </button>
          </div>
        </div>

        {/* Right: animated orb + stat pills */}
        <div className="relative flex items-center justify-center lg:justify-end">
          {/* Ambient glow background */}
          <div className="absolute inset-0 rounded-full blur-3xl bg-violet-500/10 scale-75 pointer-events-none" />

          {/* Orb container */}
          <div className="hero-orb relative w-72 h-72 sm:w-80 sm:h-80 lg:w-96 lg:h-96">
            {/* Pulse rings */}
            <div className="pulse-ring absolute inset-8 rounded-full border border-violet-500/25" />
            <div className="pulse-ring-delay absolute inset-8 rounded-full border border-violet-500/20" />

            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border border-violet-500/15 bg-gradient-to-br from-violet-900/20 via-indigo-900/15 to-cyan-900/10" />

            {/* Middle ring */}
            <div className="absolute inset-6 rounded-full border border-violet-500/20 bg-gradient-to-br from-violet-900/25 via-slate-950/80 to-indigo-900/20 backdrop-blur-sm" />

            {/* Core */}
            <div className="absolute inset-14 rounded-full bg-gradient-to-br from-violet-600/80 via-indigo-600/70 to-cyan-500/60 flex items-center justify-center shadow-2xl shadow-violet-500/40">
              <Brain size={52} className="text-white drop-shadow-lg" />
            </div>

            {/* Floating stat badges */}
            <div className="absolute -top-2 -right-4 sm:-right-8 bg-slate-900/90 border border-slate-700/60 rounded-2xl px-3 py-2 shadow-lg backdrop-blur-sm">
              <span className="text-xs font-bold text-violet-300 block">GAD-7 Score</span>
              <span className="text-xl font-extrabold font-heading text-white">11<span className="text-sm text-slate-400">/21</span></span>
            </div>

            <div className="absolute -bottom-2 -left-4 sm:-left-8 bg-slate-900/90 border border-slate-700/60 rounded-2xl px-3 py-2 shadow-lg backdrop-blur-sm">
              <span className="text-xs font-bold text-cyan-300 block">Severity</span>
              <span className="text-base font-extrabold font-heading text-amber-300">Moderate</span>
            </div>

            <div className="absolute top-1/2 -left-6 sm:-left-12 -translate-y-1/2 bg-slate-900/90 border border-slate-700/60 rounded-2xl px-3 py-2 shadow-lg backdrop-blur-sm">
              <span className="text-xs font-bold text-emerald-300 block">Privacy</span>
              <span className="text-base font-extrabold font-heading text-white">100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS ROW ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`stat-card flex flex-col sm:flex-row items-center sm:items-start gap-3 border ${s.bg}`}>
              <div className={`w-10 h-10 rounded-xl ${s.bg} border flex items-center justify-center shrink-0`}>
                <Icon size={20} className={s.color} />
              </div>
              <div className="text-center sm:text-left">
                <span className={`text-xl font-extrabold font-heading ${s.color} block leading-tight`}>{s.value}</span>
                <span className="text-xs text-slate-400 font-medium">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FEATURE CARDS ─── */}
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-100">
            How AnxioCare Works
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            Three integrated modules to assess, understand, and manage your mental wellness.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={`premium-card premium-card-interactive p-6 sm:p-8 space-y-4 border ${f.border} ${f.hover} transition-all group`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-2xl ${f.bg} border ${f.border} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <Icon size={24} className={f.color} />
                  </div>
                  <span className="text-4xl font-extrabold font-heading text-slate-800 select-none">{f.step}</span>
                </div>
                <h3 className="text-lg font-bold font-heading text-slate-100">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── DEMO BANNER ─── */}
      <div
        className="premium-card p-7 sm:p-10 border border-violet-500/25 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(109,40,217,0.20) 0%, rgba(14,20,48,0.88) 45%, rgba(49,46,129,0.18) 100%)" }}
      >
        {/* Background decoration */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-violet-500/08 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-indigo-500/08 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-7">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <Heart size={16} className="text-rose-400" />
              <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Live Demo Available</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-heading text-slate-100">
              See the full assessment experience right now.
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Instantly preview diagnostic reports, score breakdown charts, demographic insights,
              and relaxation tools — no registration required.
            </p>
          </div>
          <button
            onClick={handleQuickDemo}
            className="btn-violet shrink-0 w-full lg:w-auto px-8 py-4 text-base shadow-xl shadow-violet-500/30"
            id="demo-banner-launch"
          >
            <Zap size={18} />
            <span>Launch Demo View</span>
          </button>
        </div>
      </div>
    </div>
  );
};
