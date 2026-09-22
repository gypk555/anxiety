import React, { useState } from "react";
import { PhoneCall, HeartHandshake, Lightbulb, BookOpen, AlertTriangle, ArrowRight, Eye, Hand, Ear, Wind, Coffee } from "lucide-react";

export const CrisisResources: React.FC = () => {
  const [anxiousThought, setAnxiousThought] = useState("");
  const [reframedThought, setReframedThought] = useState("");

  const handleReframe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!anxiousThought.trim()) return;
    setReframedThought(
      `"While I feel anxious about '${anxiousThought.trim()}', I recognize that thoughts are not facts. I am equipped to handle challenges one step at a time, and I choose to focus on what I can control right now."`
    );
  };

  const groundingSteps = [
    { num: 5, label: "Things You", action: "See", example: "A lamp, plant, pen…", icon: Eye, color: "text-emerald-400", bg: "bg-emerald-500/12 border-emerald-500/30" },
    { num: 4, label: "Things You", action: "Touch", example: "Desk, fabric, cup…", icon: Hand, color: "text-cyan-400", bg: "bg-cyan-500/12 border-cyan-500/30" },
    { num: 3, label: "Things You", action: "Hear", example: "Wind, hum, rain…", icon: Ear, color: "text-purple-400", bg: "bg-purple-500/12 border-purple-500/30" },
    { num: 2, label: "Things You", action: "Smell", example: "Coffee, air, tea…", icon: Wind, color: "text-amber-400", bg: "bg-amber-500/12 border-amber-500/30" },
    { num: 1, label: "Thing You", action: "Taste", example: "Water, mint, tea…", icon: Coffee, color: "text-rose-400", bg: "bg-rose-500/12 border-rose-500/30" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 fade-in-up pb-12">
      {/* Disclaimer */}
      <div className="flex items-start gap-3.5 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 shadow-sm">
        <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-200 text-sm mb-1">Medical Disclaimer & Purpose Notice</h4>
          <p className="text-amber-300/80 text-xs sm:text-sm leading-relaxed">
            AnxioCare is a self-assessment and mental wellness prototype for educational and screening purposes only. It is <strong>not</strong> a substitute for professional clinical diagnosis, psychiatric advice, or emergency treatment.
          </p>
        </div>
      </div>

      {/* Crisis Helplines */}
      <div className="glass-panel p-6 sm:p-8 border-rose-500/25 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
            <PhoneCall className="text-rose-400" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">Immediate Crisis Support & Helplines</h3>
            <p className="text-xs text-slate-400">Free, confidential support available 24/7</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 space-y-3 hover:border-rose-400/50 transition-all">
            <div className="flex items-start justify-between">
              <h4 className="font-bold text-rose-200 text-base">988 Suicide & Crisis Lifeline</h4>
              <span className="text-xs text-slate-400 font-medium">US & Canada</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Free, confidential 24/7 support for anyone in suicidal crisis or emotional distress.</p>
            <div className="flex items-center justify-between pt-2">
              <span className="text-base font-extrabold text-rose-300 font-heading">📞 Call / Text: 988</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">24/7 Service</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-violet-950/40 border border-violet-500/30 space-y-3 hover:border-violet-400/50 transition-all">
            <div className="flex items-start justify-between">
              <h4 className="font-bold text-violet-200 text-base">Crisis Text Line</h4>
              <span className="text-xs text-slate-400 font-medium">24/7 Service</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Connect with a trained crisis counselor via text message — no call required.</p>
            <div className="flex items-center justify-between pt-2">
              <span className="text-base font-extrabold text-violet-300 font-heading">💬 Text HOME to 741741</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">Free & Private</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5-4-3-2-1 Grounding */}
      <div className="glass-panel p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <HeartHandshake className="text-emerald-400" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">5-4-3-2-1 Sensory Grounding Technique</h3>
            <p className="text-xs text-slate-400">Anchors your focus to the present moment to interrupt panic spirals</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {groundingSteps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.num} className={`p-4 rounded-2xl border ${s.bg} flex flex-col items-center text-center space-y-2.5 transition-all hover:scale-[1.03]`}>
                <span className={`text-3xl font-extrabold font-heading ${s.color}`}>{s.num}</span>
                <div>
                  <Icon size={18} className={`${s.color} mx-auto mb-1`} />
                  <span className="text-xs font-semibold text-slate-200 block leading-tight">{s.label} <br/><span className={s.color}>{s.action}</span></span>
                </div>
                <span className="text-[11px] text-slate-400 leading-tight">{s.example}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 text-center pt-2">Name each item aloud or mentally. Take a slow, deliberate breath between each step.</p>
      </div>

      {/* CBT Thought Reframing */}
      <div className="glass-panel p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Lightbulb className="text-amber-400" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100">CBT Thought Re-framing Assistant</h3>
            <p className="text-xs text-slate-400">Transform intrusive anxious thoughts into balanced, grounded perspectives</p>
          </div>
        </div>

        <form onSubmit={handleReframe} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Enter an intrusive anxious thought:
            </label>
            <input
              type="text"
              placeholder="e.g. What if I fail my presentation tomorrow?"
              value={anxiousThought}
              onChange={(e) => setAnxiousThought(e.target.value)}
              className="glass-input !px-4 !py-3"
            />
          </div>
          <button type="submit" className="btn-secondary px-6 py-3">
            <BookOpen size={16} />
            <span>Generate Balanced Reframe</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {reframedThought && (
          <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/35 fade-in space-y-2">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">✨ Cognitive Reframe:</span>
            <p className="text-emerald-200 text-sm sm:text-base italic leading-relaxed">{reframedThought}</p>
          </div>
        )}
      </div>
    </div>
  );
};
