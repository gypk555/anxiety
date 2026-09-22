import React, { useState } from "react";
import type { UserProfile, GenderOption } from "../types/assessment";
import { AVATAR_OPTIONS, STRESS_DRIVER_OPTIONS } from "../data/questions";
import { User, Briefcase, Calendar, Heart, ArrowRight, ShieldCheck, Sparkles, ArrowLeft } from "lucide-react";

interface Props {
  initialProfile?: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onCancel?: () => void;
}

export const OnboardingPage: React.FC<Props> = ({ initialProfile, onSave, onCancel }) => {
  const [name, setName] = useState(initialProfile?.name || "");
  const [age, setAge] = useState<number | "">(initialProfile?.age || "");
  const [gender, setGender] = useState<GenderOption>(initialProfile?.gender || "Prefer not to say");
  const [occupation, setOccupation] = useState(initialProfile?.occupation || "");
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(initialProfile?.stressDrivers || []);
  const [avatarId, setAvatarId] = useState(initialProfile?.avatarId || "1");
  const [error, setError] = useState("");

  const toggleDriver = (driver: string) => {
    if (selectedDrivers.includes(driver)) {
      setSelectedDrivers(selectedDrivers.filter((d) => d !== driver));
    } else {
      setSelectedDrivers([...selectedDrivers, driver]);
    }
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
      age: age === "" ? "" : Number(age),
      gender,
      occupation: occupation.trim(),
      stressDrivers: selectedDrivers,
      avatarId,
      createdAt: initialProfile?.createdAt || new Date().toISOString(),
    };

    onSave(profile);
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-6 sm:py-10">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 sm:gap-10 fade-in-up pb-16">
        
        {/* Top Header Card */}
        <div
          className="premium-card text-center relative overflow-hidden flex flex-col items-center gap-4"
          style={{ paddingTop: "3rem", paddingBottom: "2.5rem", paddingLeft: "2rem", paddingRight: "2rem" }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/15 text-violet-300 text-xs sm:text-sm font-semibold uppercase tracking-wider border border-violet-500/30 shadow-sm">
            <Sparkles size={14} className="text-violet-400" />
            <span>Patient Intake & Demographic Profile</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-heading text-gradient-violet">
            Welcome to AnxioCare
          </h1>

          <p className="text-slate-300 text-xs sm:text-sm md:text-base max-w-xl leading-relaxed">
            Please complete your clinical profile below to calibrate personalized anxiety benchmarks and tailored severity insights.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm text-center font-medium shadow-sm">
            {error}
          </div>
        )}

        {/* Main Intake Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-8 sm:gap-10">
          
          {/* Section 1: Avatar Persona Selection */}
          <div
            className="premium-card border-slate-800/90 flex flex-col gap-6"
            style={{ paddingTop: "2.5rem", paddingBottom: "2.5rem", paddingLeft: "2rem", paddingRight: "2rem" }}
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-violet-500/20 text-violet-300 font-extrabold text-xs flex items-center justify-center border border-violet-500/30 shrink-0">1</span>
                <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-100 uppercase tracking-wider font-heading">Select Avatar Persona</h3>
              </div>
              <span className="text-xs text-slate-400">Choose your profile accent</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2">
              {AVATAR_OPTIONS.map((av) => (
                <button
                  type="button"
                  key={av.id}
                  onClick={() => setAvatarId(av.id)}
                  className={`p-4 sm:p-5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2 ${
                    avatarId === av.id
                      ? "bg-violet-600/30 border-violet-400 scale-[1.02] shadow-lg shadow-violet-500/25"
                      : "bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <span className="text-3xl block">{av.emoji}</span>
                  <span className="text-xs font-semibold text-slate-200 block truncate w-full">{av.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Demographic Information */}
          <div
            className="premium-card border-slate-800/90 flex flex-col gap-6"
            style={{ paddingTop: "2.5rem", paddingBottom: "2.5rem", paddingLeft: "2rem", paddingRight: "2rem" }}
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-violet-500/20 text-violet-300 font-extrabold text-xs flex items-center justify-center border border-violet-500/30 shrink-0">2</span>
                <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-100 uppercase tracking-wider font-heading">Demographic Information</h3>
              </div>
              <span className="text-xs text-slate-400">Calibrates screening benchmarks</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 pt-2">
              {/* Full Name */}
              <div className="flex flex-col gap-2.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Full Name / Preferred Nickname *
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  <input
                    type="text"
                    placeholder="e.g. Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="custom-input !pl-12 !pr-4 !py-3.5 rounded-xl text-sm"
                    required
                  />
                </div>
              </div>

              {/* Occupation */}
              <div className="flex flex-col gap-2.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Occupation / Role *
                </label>
                <div className="relative flex items-center">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  <input
                    type="text"
                    placeholder="e.g. Software Engineer"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    className="custom-input !pl-12 !pr-4 !py-3.5 rounded-xl text-sm"
                    required
                  />
                </div>
              </div>

              {/* Age */}
              <div className="flex flex-col gap-2.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Age (Years)
                </label>
                <div className="relative flex items-center">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  <input
                    type="number"
                    min={12}
                    max={120}
                    placeholder="e.g. 28"
                    value={age}
                    onChange={(e) => setAge(e.target.value ? Number(e.target.value) : "")}
                    className="custom-input !pl-12 !pr-4 !py-3.5 rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Gender */}
              <div className="flex flex-col gap-2.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Gender Identity
                </label>
                <div className="relative flex items-center">
                  <Heart className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as GenderOption)}
                    className="custom-input !pl-12 !pr-4 !py-3.5 rounded-xl text-sm cursor-pointer"
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

          {/* Section 3: Primary Stress Drivers */}
          <div
            className="premium-card border-slate-800/90 flex flex-col gap-6"
            style={{ paddingTop: "2.5rem", paddingBottom: "2.5rem", paddingLeft: "2rem", paddingRight: "2rem" }}
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-xl bg-violet-500/20 text-violet-300 font-extrabold text-xs flex items-center justify-center border border-violet-500/30 shrink-0">3</span>
                <h3 className="text-xs sm:text-sm md:text-base font-bold text-slate-100 uppercase tracking-wider font-heading">Primary Stress Drivers</h3>
              </div>
              <span className="text-xs text-slate-400">Select all that apply</span>
            </div>

            <div className="flex flex-wrap gap-3.5 pt-2">
              {STRESS_DRIVER_OPTIONS.map((driver) => {
                const isSelected = selectedDrivers.includes(driver);
                return (
                  <button
                    type="button"
                    key={driver}
                    onClick={() => toggleDriver(driver)}
                    className={`text-xs sm:text-sm px-4 py-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-violet-600/30 border-violet-400 text-violet-200 font-semibold shadow-md shadow-violet-500/10"
                        : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    {isSelected ? "✓ " : "+ "}
                    {driver}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Footer Card */}
          <div
            className="premium-card border-slate-800/90 flex flex-col sm:flex-row items-center justify-between gap-6"
            style={{ paddingTop: "2rem", paddingBottom: "2rem", paddingLeft: "2rem", paddingRight: "2rem" }}
          >
            <div className="flex items-center gap-2.5 text-xs text-slate-400 font-medium">
              <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
              <span>100% Private & Stored Locally in Browser</span>
            </div>

            <div className="flex items-center gap-3.5 w-full sm:w-auto justify-end">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="btn-ghost px-6 py-3.5 text-sm w-full sm:w-auto"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
              )}
              <button type="submit" className="btn-violet px-8 py-3.5 text-sm w-full sm:w-auto shadow-xl shadow-violet-500/25">
                <span>Begin Screening</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
