import React, { useState } from "react";
import type { UserProfile, GenderOption } from "../types/assessment";
import { AVATAR_OPTIONS, STRESS_DRIVER_OPTIONS } from "../data/questions";
import { User, Briefcase, Calendar, Heart, ArrowRight, ShieldCheck, Sparkles, X } from "lucide-react";

interface Props {
  initialProfile?: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onClose?: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ initialProfile, onSave, onClose }) => {
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
      setError("Please enter your name or preferred nickname.");
      return;
    }
    if (!occupation.trim()) {
      setError("Please enter your occupation or role.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md fade-in overflow-y-auto">
      <div className="premium-card w-full max-w-2xl max-h-[92vh] p-5 sm:p-7 relative text-slate-100 border-violet-500/30 shadow-2xl flex flex-col gap-4 sm:gap-5 overflow-y-auto no-scrollbar">
        
        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
            title="Close Modal"
          >
            <X size={18} />
          </button>
        )}

        {/* Header Title Section */}
        <div className="text-center flex flex-col items-center gap-1.5 pt-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/15 text-violet-300 text-[11px] font-semibold uppercase tracking-wider border border-violet-500/30 shadow-sm">
            <Sparkles size={12} className="text-violet-400" />
            <span>Clinical Intake Profile</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-gradient-violet">
            Welcome to AnxioCare
          </h2>
          <p className="text-slate-300 text-xs max-w-md leading-relaxed">
            Please enter your profile details below to calibrate your anxiety baseline & benchmarks.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-center font-medium shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
          {/* Avatar Persona Selection */}
          <div className="flex flex-col gap-2">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Select Avatar Profile Persona
            </label>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {AVATAR_OPTIONS.map((av) => (
                <button
                  type="button"
                  key={av.id}
                  onClick={() => setAvatarId(av.id)}
                  className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                    avatarId === av.id
                      ? "bg-violet-600/35 border-violet-400 scale-[1.02] shadow-md shadow-violet-500/25"
                      : "bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <span className="text-xl block">{av.emoji}</span>
                  <span className="text-[10px] font-semibold text-slate-200 block truncate w-full">{av.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Input Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Full Name / Nickname *
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="custom-input !pl-10 !pr-3 !py-2.5 rounded-xl text-xs sm:text-sm"
                  required
                />
              </div>
            </div>

            {/* Occupation */}
            <div className="flex flex-col gap-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Occupation / Role *
              </label>
              <div className="relative flex items-center">
                <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder="e.g. Software Engineer"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="custom-input !pl-10 !pr-3 !py-2.5 rounded-xl text-xs sm:text-sm"
                  required
                />
              </div>
            </div>

            {/* Age */}
            <div className="flex flex-col gap-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Age (Years)
              </label>
              <div className="relative flex items-center">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="number"
                  min={12}
                  max={120}
                  placeholder="e.g. 28"
                  value={age}
                  onChange={(e) => setAge(e.target.value ? Number(e.target.value) : "")}
                  className="custom-input !pl-10 !pr-3 !py-2.5 rounded-xl text-xs sm:text-sm"
                />
              </div>
            </div>

            {/* Gender */}
            <div className="flex flex-col gap-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Gender Identity
              </label>
              <div className="relative flex items-center">
                <Heart className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderOption)}
                  className="custom-input !pl-10 !pr-3 !py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </div>

          {/* Primary Stress Drivers */}
          <div className="flex flex-col gap-2">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Primary Stress Drivers (Select all that apply)
            </label>
            <div className="flex flex-wrap gap-2">
              {STRESS_DRIVER_OPTIONS.map((driver) => {
                const isSelected = selectedDrivers.includes(driver);
                return (
                  <button
                    type="button"
                    key={driver}
                    onClick={() => toggleDriver(driver)}
                    className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                      isSelected
                        ? "bg-violet-600/30 border-violet-400 text-violet-200 font-semibold shadow-sm"
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

          {/* Submit Footer */}
          <div className="pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
              <span>100% Private & Stored Locally</span>
            </div>
            <button type="submit" className="btn-violet px-6 py-2.5 text-xs sm:text-sm shadow-lg shadow-violet-500/25">
              <span>Begin Screening</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
