import React, { useState } from "react";
import {
  PhoneCall, HeartHandshake, Lightbulb, BookOpen,
  AlertTriangle, ArrowRight, Eye, Hand, Ear, Wind, Coffee,
  ExternalLink, MessageSquare, Globe,
} from "lucide-react";

export const CrisisResources: React.FC = () => {
  const [anxiousThought,  setAnxiousThought]  = useState("");
  const [reframedThought, setReframedThought]  = useState("");

  const handleReframe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!anxiousThought.trim()) return;
    setReframedThought(
      `"While I feel anxious about '${anxiousThought.trim()}', I recognise that thoughts are not facts. ` +
      `I am equipped to handle challenges one step at a time, and I choose to focus on what I can control right now."`
    );
  };

  const helplines = [
    {
      name: "988 Suicide & Crisis Lifeline",
      region: "US & Canada",
      desc: "Free, confidential 24/7 support for anyone in suicidal crisis or emotional distress.",
      contact: "Call / Text: 988",
      badge: "24/7 Free",
      color: "text-rose-300",
      bg: "bg-rose-950/50",
      border: "border-rose-500/30",
      hoverBorder: "hover:border-rose-400/55",
      badgeBg: "bg-rose-500/18 border-rose-500/30 text-rose-300",
      icon: PhoneCall,
      iconBg: "bg-rose-500/18 border-rose-500/30",
      iconColor: "text-rose-400",
    },
    {
      name: "Crisis Text Line",
      region: "US · UK · Canada · Ireland",
      desc: "Connect with a trained crisis counsellor via text message — no phone call required.",
      contact: "Text HOME to 741741",
      badge: "Free & Private",
      color: "text-violet-300",
      bg: "bg-violet-950/50",
      border: "border-violet-500/30",
      hoverBorder: "hover:border-violet-400/55",
      badgeBg: "bg-violet-500/18 border-violet-500/30 text-violet-300",
      icon: MessageSquare,
      iconBg: "bg-violet-500/18 border-violet-500/30",
      iconColor: "text-violet-400",
    },
    {
      name: "iCall Mental Health Helpline",
      region: "India",
      desc: "Telephone and online counselling for psychological support and mental health needs.",
      contact: "Call: 9152987821",
      badge: "Mon–Sat 8am–10pm",
      color: "text-cyan-300",
      bg: "bg-cyan-950/50",
      border: "border-cyan-500/30",
      hoverBorder: "hover:border-cyan-400/55",
      badgeBg: "bg-cyan-500/18 border-cyan-500/30 text-cyan-300",
      icon: Globe,
      iconBg: "bg-cyan-500/18 border-cyan-500/30",
      iconColor: "text-cyan-400",
    },
    {
      name: "Samaritans",
      region: "UK & Ireland",
      desc: "Non-judgmental emotional support for people who are struggling to cope, 24 hours a day.",
      contact: "Call: 116 123",
      badge: "24/7 Confidential",
      color: "text-emerald-300",
      bg: "bg-emerald-950/50",
      border: "border-emerald-500/30",
      hoverBorder: "hover:border-emerald-400/55",
      badgeBg: "bg-emerald-500/18 border-emerald-500/30 text-emerald-300",
      icon: PhoneCall,
      iconBg: "bg-emerald-500/18 border-emerald-500/30",
      iconColor: "text-emerald-400",
    },
  ];

  const groundingSteps = [
    { num: 5, label: "See",   example: "A lamp, plant, pen…",   icon: Eye,       color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/28" },
    { num: 4, label: "Touch", example: "Desk, fabric, cup…",   icon: Hand,      color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/28"    },
    { num: 3, label: "Hear",  example: "Wind, hum, rain…",     icon: Ear,       color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/28"  },
    { num: 2, label: "Smell", example: "Coffee, air, tea…",    icon: Wind,      color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/28"   },
    { num: 1, label: "Taste", example: "Water, mint, gum…",    icon: Coffee,    color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/28"    },
  ];

  return (
    <div className="crisis-page max-w-5xl mx-auto space-y-7 fade-in-up pb-12">

      {/* ── DISCLAIMER ── */}
      <div className="flex items-start gap-4 p-5 rounded-2xl bg-amber-500/08 border border-amber-500/22 shadow-sm">
        <AlertTriangle size={22} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-amber-200 text-sm">Medical Disclaimer &amp; Purpose Notice</h4>
          <p className="text-amber-300/80 text-xs sm:text-sm leading-relaxed">
            AnxioCare is a self-assessment and mental wellness prototype for educational and screening purposes only.
            It is <strong>not</strong> a substitute for professional clinical diagnosis, psychiatric advice, or emergency treatment.
            If you are in immediate danger, please call your local emergency services.
          </p>
        </div>
      </div>

      {/* ── CRISIS HELPLINES ── */}
      <div className="glass-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-500/18 border border-rose-500/28 flex items-center justify-center shrink-0">
            <PhoneCall className="text-rose-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-heading text-slate-100">
              Immediate Crisis Support &amp; Helplines
            </h2>
            <p className="text-xs text-slate-500">Free, confidential support available worldwide</p>
          </div>
        </div>

        <div className="crisis-card-grid grid grid-cols-1 sm:grid-cols-2 gap-4">
          {helplines.map((h) => {
            const Icon = h.icon;
            return (
              <div
                key={h.name}
                className={`p-5 rounded-2xl border transition-all ${h.bg} ${h.border} ${h.hoverBorder} group`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border ${h.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon size={17} className={h.iconColor} />
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm leading-tight ${h.color}`}>{h.name}</h3>
                      <span className="text-[11px] text-slate-500">{h.region}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold shrink-0 ${h.badgeBg}`}>
                    {h.badge}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-3">{h.desc}</p>

                {/* Contact */}
                <div className={`inline-flex items-center gap-2 font-extrabold font-heading text-sm sm:text-base ${h.color}`}>
                  <ExternalLink size={14} className="shrink-0" />
                  {h.contact}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 5-4-3-2-1 GROUNDING ── */}
      <div className="glass-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/18 border border-emerald-500/28 flex items-center justify-center shrink-0">
            <HeartHandshake className="text-emerald-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-heading text-slate-100">
              5-4-3-2-1 Sensory Grounding Technique
            </h2>
            <p className="text-xs text-slate-500">Anchors your focus to the present moment to interrupt panic spirals</p>
          </div>
        </div>

        {/* Steps — horizontal scroll on small, full grid on larger */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          {groundingSteps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.num}
                className={`p-3 sm:p-4 rounded-2xl border ${s.bg} ${s.border} flex flex-col items-center text-center gap-2 transition-all hover:scale-[1.04] cursor-default last:col-span-2 sm:last:col-span-1`}
              >
                <span className={`text-2xl sm:text-4xl font-extrabold font-heading ${s.color}`}>{s.num}</span>
                <Icon size={16} className={`${s.color} shrink-0`} />
                <span className={`text-[11px] sm:text-xs font-bold ${s.color} block leading-tight`}>{s.label}</span>
                <span className="text-[10px] sm:text-[11px] text-slate-500 leading-tight hidden sm:block">{s.example}</span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 text-center">
          Name each item aloud or mentally. Take a slow, deliberate breath between each step.
        </p>
      </div>

      {/* ── CBT THOUGHT REFRAMING ── */}
      <div className="glass-panel p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/18 border border-amber-500/28 flex items-center justify-center shrink-0">
            <Lightbulb className="text-amber-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-heading text-slate-100">
              CBT Thought Re-framing Assistant
            </h2>
            <p className="text-xs text-slate-500">Transform anxious thoughts into balanced, grounded perspectives</p>
          </div>
        </div>

        <form onSubmit={handleReframe} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider" htmlFor="cbt-input">
              Enter an intrusive anxious thought:
            </label>
            <textarea
              id="cbt-input"
              placeholder="e.g. What if I fail my presentation tomorrow? I can't stop worrying about it…"
              value={anxiousThought}
              onChange={(e) => setAnxiousThought(e.target.value)}
              className="custom-textarea"
              rows={3}
            />
          </div>
          <button type="submit" className="btn-secondary px-6 py-3 w-full sm:w-auto" id="cbt-reframe-btn">
            <BookOpen size={16} />
            <span>Generate Balanced Reframe</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {reframedThought && (
          <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/32 fade-in space-y-2">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">✨ Cognitive Reframe:</span>
            <p className="text-emerald-200 text-sm sm:text-base italic leading-relaxed">{reframedThought}</p>
          </div>
        )}
      </div>

      {/* ── SELF CARE TIPS ── */}
      <div className="glass-panel p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/18 border border-cyan-500/28 flex items-center justify-center shrink-0">
            <BookOpen className="text-cyan-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold font-heading text-slate-100">
              Evidence-Based Self-Care Strategies
            </h2>
            <p className="text-xs text-slate-500">Research-backed approaches for managing day-to-day anxiety</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { tip: "Limit caffeine and alcohol — both amplify anxiety symptoms and disrupt sleep architecture.", icon: "☕" },
            { tip: "Maintain consistent sleep and wake times to regulate the stress hormone cortisol.", icon: "🌙" },
            { tip: "Regular aerobic exercise (even 20 min/day) significantly reduces anxiety severity.", icon: "🏃" },
            { tip: "Social connection is a powerful buffer — reach out to a trusted friend or family member.", icon: "🤝" },
            { tip: "Limit news and social media consumption during high-anxiety periods.", icon: "📵" },
            { tip: "Journalling for 10 minutes a day reduces rumination and clarifies anxious thoughts.", icon: "📓" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800/60 hover:border-slate-700/70 transition-all"
            >
              <span className="text-xl shrink-0">{item.icon}</span>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{item.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
