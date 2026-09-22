import React, { useState } from "react";
import type { UserProfile, GenderOption } from "../types/assessment";
import { AVATAR_OPTIONS, STRESS_DRIVER_OPTIONS } from "../data/questions";
import { User, Briefcase, Calendar, Heart, ArrowRight, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";

interface Props {
  initialProfile?: UserProfile | null;
  onSave:    (profile: UserProfile) => void;
  onCancel?: () => void;
}

const STEPS = [
  { num: 1, label: "Avatar" },
  { num: 2, label: "Profile" },
  { num: 3, label: "Stress Factors" },
];

export const OnboardingPage: React.FC<Props> = ({ initialProfile, onSave, onCancel }) => {
  const [name,            setName]            = useState(initialProfile?.name       || "");
  const [age,             setAge]             = useState<number | "">(initialProfile?.age || "");
  const [gender,          setGender]          = useState<GenderOption>(initialProfile?.gender || "Prefer not to say");
  const [occupation,      setOccupation]      = useState(initialProfile?.occupation || "");
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(initialProfile?.stressDrivers || []);
  const [avatarId,        setAvatarId]        = useState(initialProfile?.avatarId   || "1");
  const [error,           setError]           = useState("");

  // Which section is "active" based on form fill (purely cosmetic step highlight)
  const filledStep = name && occupation ? 3 : name || occupation ? 2 : 1;

  const toggleDriver = (driver: string) => {
    setSelectedDrivers((prev) =>
      prev.includes(driver) ? prev.filter((d) => d !== driver) : [...prev, driver]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your full name or preferred nickname.");
      return;
    }
    if (!occupation.trim()) {
      setError("Please enter your occupation or role (e.g. Software Engineer, Student).");
      return;
    }
    setError("");
    const profile: UserProfile = {
      name: name.trim(),
      age:  age === "" ? "" : Number(age),
      gender,
      occupation: occupation.trim(),
      stressDrivers: selectedDrivers,
      avatarId,
      createdAt: initialProfile?.createdAt || new Date().toISOString(),
    };
    onSave(profile);
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 fade-in-up pb-12">

      {/* ── PAGE HEADER ── */}
      <div className="text-center space-y-4 pt-2">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-heading text-gradient-violet">
          Welcome to AnxioCare
        </h1>
        <p className="text-slate-300 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
          Complete your clinical profile to calibrate personalized anxiety benchmarks and tailored severity insights.
        </p>

        {/* Step Indicator */}
        <div className="step-indicator pt-2">
          {STEPS.map((step, idx) => {
            const isComplete = step.num < filledStep || (step.num === 3 && selectedDrivers.length > 0 && filledStep === 3);
            const isActive   = step.num === filledStep;
            return (
              <React.Fragment key={step.num}>
                {idx > 0 && (
                  <div
                    className="step-line"
                    style={{
                      background: step.num <= filledStep
                        ? "linear-gradient(90deg,#8b5cf6,#6366f1)"
                        : "rgba(255,255,255,0.1)",
                    }}
                  />
                )}
                <div
                  className="step-dot"
                  style={{
                    background: isComplete
                      ? "linear-gradient(135deg,#8b5cf6,#6366f1)"
                      : isActive
                        ? "rgba(139,92,246,0.18)"
                        : "rgba(255,255,255,0.05)",
                    borderColor: isComplete || isActive ? "#8b5cf6" : "rgba(255,255,255,0.12)",
                    color: isComplete ? "#fff" : isActive ? "#a78bfa" : "#475569",
                  }}
                >
                  {isComplete ? <CheckCircle2 size={14} /> : step.num}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex justify-center gap-8 text-xs text-slate-500 mt-1">
          {STEPS.map((s) => <span key={s.num}>{s.label}</span>)}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/12 border border-rose-500/30 text-rose-300 text-sm text-center font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── SECTION 1: Avatar ── */}
        <div className="premium-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 font-bold text-xs flex items-center justify-center border border-violet-500/30">1</span>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 font-heading uppercase tracking-wider">Select Avatar Persona</h2>
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">Choose your profile accent</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {AVATAR_OPTIONS.map((av) => (
              <button
                type="button"
                key={av.id}
                onClick={() => setAvatarId(av.id)}
                className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2 min-h-[80px] ${
                  avatarId === av.id
                    ? "bg-violet-600/25 border-violet-400 scale-[1.04] shadow-lg shadow-violet-500/20"
                    : "bg-slate-900/60 border-slate-800/70 hover:bg-slate-800/60 hover:border-slate-700"
                }`}
              >
                <span className="text-3xl">{av.emoji}</span>
                <span className="text-xs font-semibold text-slate-200 truncate w-full text-center">{av.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── SECTION 2: Demographic Info ── */}
        <div className="premium-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 font-bold text-xs flex items-center justify-center border border-violet-500/30">2</span>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 font-heading uppercase tracking-wider">Demographic Information</h2>
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">Calibrates screening benchmarks</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider" htmlFor="ob-name">
                Full Name / Nickname <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                <input
                  id="ob-name"
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="custom-input pl-10"
                  required
                />
              </div>
            </div>

            {/* Occupation */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider" htmlFor="ob-occupation">
                Occupation / Role <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                <input
                  id="ob-occupation"
                  type="text"
                  placeholder="e.g. Software Engineer"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="custom-input pl-10"
                  required
                />
              </div>
            </div>

            {/* Age */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider" htmlFor="ob-age">Age (Years)</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                <input
                  id="ob-age"
                  type="number"
                  min={12}
                  max={120}
                  placeholder="e.g. 28"
                  value={age}
                  onChange={(e) => setAge(e.target.value ? Number(e.target.value) : "")}
                  className="custom-input pl-10"
                />
              </div>
            </div>

            {/* Gender */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider" htmlFor="ob-gender">Gender Identity</label>
              <div className="relative">
                <Heart className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                <select
                  id="ob-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderOption)}
                  className="custom-input pl-10"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Stress Drivers ── */}
        <div className="premium-card p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 font-bold text-xs flex items-center justify-center border border-violet-500/30">3</span>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 font-heading uppercase tracking-wider">Primary Stress Drivers</h2>
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">Select all that apply</span>
          </div>
          <span className="text-xs text-slate-500 sm:hidden block -mt-2">Select all that apply</span>

          <div className="flex flex-wrap gap-2.5">
            {STRESS_DRIVER_OPTIONS.map((driver) => {
              const isSelected = selectedDrivers.includes(driver);
              return (
                <button
                  type="button"
                  key={driver}
                  onClick={() => toggleDriver(driver)}
                  className={`text-xs sm:text-sm px-4 py-2.5 rounded-xl border transition-all min-h-[40px] ${
                    isSelected
                      ? "bg-violet-600/28 border-violet-400 text-violet-200 font-semibold shadow-md shadow-violet-500/12"
                      : "bg-slate-900/60 border-slate-800/70 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                  }`}
                >
                  {isSelected ? "✓ " : ""}{driver}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="premium-card p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5 text-sm text-slate-400">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
            <span>100% Private &amp; Stored Locally in Your Browser</span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-ghost px-6 py-3 text-sm flex-1 sm:flex-initial"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
            )}
            <button
              type="submit"
              className="btn-violet px-8 py-3.5 text-sm flex-1 sm:flex-initial shadow-xl shadow-violet-500/25"
              id="onboarding-submit"
            >
              <span>Begin Screening</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
