import { useState } from "react";
import type { UserProfile, ScoreResult } from "./types/assessment";
import { LandingPage }        from "./components/LandingPage";
import { OnboardingPage }     from "./components/OnboardingPage";
import { AssessmentQuiz }     from "./components/AssessmentQuiz";
import { ResultsDashboard }   from "./components/ResultsDashboard";
import { BreathingExercise }  from "./components/BreathingExercise";
import { SoundscapePlayer }   from "./components/SoundscapePlayer";
import { HistoryChart }       from "./components/HistoryChart";
import { CrisisResources }    from "./components/CrisisResources";
import {
  Activity, Award, Wind, TrendingUp,
  ShieldAlert, User, Brain, Volume2, Home,
} from "lucide-react";

type Tab = "landing" | "onboarding" | "assessment" | "results" | "coping" | "history" | "resources";

export function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("anxio_user_profile");
    return saved ? JSON.parse(saved) : null;
  });

  const [history, setHistory] = useState<ScoreResult[]>(() => {
    const saved = localStorage.getItem("anxio_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [currentResult, setCurrentResult] = useState<ScoreResult | null>(() => {
    const saved = localStorage.getItem("anxio_latest_result");
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<Tab>("landing");
  const [copingSubTab, setCopingSubTab] = useState<"breathing" | "soundscape">("breathing");

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveProfile = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem("anxio_user_profile", JSON.stringify(profile));
    setActiveTab("assessment");
  };

  const handleStartAssessmentClick = () => {
    if (!userProfile) setActiveTab("onboarding");
    else             setActiveTab("assessment");
  };

  const handleLoadDemoResult = (demoResult: ScoreResult) => {
    setUserProfile(demoResult.userProfile);
    localStorage.setItem("anxio_user_profile", JSON.stringify(demoResult.userProfile));
    setCurrentResult(demoResult);
    localStorage.setItem("anxio_latest_result", JSON.stringify(demoResult));
    const updatedHistory = [demoResult, ...history.filter((h) => h.id !== demoResult.id)];
    setHistory(updatedHistory);
    localStorage.setItem("anxio_history", JSON.stringify(updatedHistory));
    setActiveTab("results");
  };

  const handleAssessmentComplete = (result: ScoreResult) => {
    setCurrentResult(result);
    localStorage.setItem("anxio_latest_result", JSON.stringify(result));
    const updatedHistory = [result, ...history];
    setHistory(updatedHistory);
    localStorage.setItem("anxio_history", JSON.stringify(updatedHistory));
    setActiveTab("results");
  };

  const handleClearHistory = () => {
    if (window.confirm("Clear all assessment history?")) {
      setHistory([]);
      localStorage.removeItem("anxio_history");
    }
  };

  // ── Nav helpers ───────────────────────────────────────────────────────────
  const desktopNavItems = [
    { id: "landing",    label: "Overview",                   Icon: Home,        crisis: false, disabled: false },
    { id: "assessment", label: "Assessment",                 Icon: Activity,    crisis: false, disabled: false, onClick: handleStartAssessmentClick },
    { id: "results",    label: "Results",                   Icon: Award,       crisis: false, disabled: !currentResult },
    { id: "coping",     label: "Relief Toolkit",            Icon: Wind,        crisis: false, disabled: false },
    { id: "history",    label: `Trends (${history.length})`,Icon: TrendingUp,  crisis: false, disabled: false },
    { id: "resources",  label: "Crisis Support",            Icon: ShieldAlert, crisis: true,  disabled: false },
  ];

  const mobileNavItems = [
    { id: "landing",    label: "Home",    Icon: Home,        crisis: false, disabled: false },
    { id: "assessment", label: "Screen",  Icon: Activity,    crisis: false, disabled: false, onClick: handleStartAssessmentClick },
    { id: "results",    label: "Results", Icon: Award,       crisis: false, disabled: !currentResult },
    { id: "coping",     label: "Toolkit", Icon: Wind,        crisis: false, disabled: false },
    { id: "history",    label: "Trends",  Icon: TrendingUp,  crisis: false, disabled: false },
    { id: "resources",  label: "Crisis",  Icon: ShieldAlert, crisis: true,  disabled: false },
  ];

  const isAssessmentActive = activeTab === "assessment" || activeTab === "onboarding";

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-950 text-slate-100">

      {/* ══════════════════════════════════════════
          DESKTOP + TABLET HEADER
      ══════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/70 no-print">
        <div className="layout-wrapper flex items-center justify-between gap-4 h-16">

          {/* Logo */}
          <button
            onClick={() => setActiveTab("landing")}
            className="flex items-center gap-2.5 shrink-0 group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-violet-500/30 group-hover:scale-105 transition-transform shrink-0">
              <Brain size={20} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-extrabold font-heading text-gradient-violet leading-none">
                AnxioCare
              </h1>
              <span className="text-[10px] text-slate-500 font-medium tracking-wide block mt-0.5 leading-none">
                Anxiety Screening Engine
              </span>
            </div>
          </button>

          {/* Desktop Nav — hidden on small mobile */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-950/70 rounded-2xl border border-slate-800/80 px-2 py-1.5">
            {desktopNavItems.map(({ id, label, Icon, crisis, disabled, ...rest }) => {
              const isActive = id === "assessment"
                ? isAssessmentActive
                : activeTab === id;
              const onClick = (rest as any).onClick ?? (() => setActiveTab(id as Tab));
              return (
                <button
                  key={id}
                  onClick={onClick}
                  disabled={disabled}
                  className={`nav-pill disabled:opacity-35 disabled:cursor-not-allowed ${
                    isActive
                      ? crisis ? "nav-pill-crisis-active" : "nav-pill-active"
                      : crisis ? "nav-pill-crisis" : ""
                  }`}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tablet nav — md to lg */}
          <nav className="hidden md:flex lg:hidden items-center gap-1 bg-slate-950/70 rounded-xl border border-slate-800/80 px-1.5 py-1">
            {desktopNavItems.map(({ id, label: _label, Icon, crisis, disabled, ...rest }) => {
              const isActive = id === "assessment"
                ? isAssessmentActive
                : activeTab === id;
              const onClick = (rest as any).onClick ?? (() => setActiveTab(id as Tab));
              return (
                <button
                  key={id}
                  onClick={onClick}
                  disabled={disabled}
                  title={_label}
                  className={`nav-pill disabled:opacity-35 disabled:cursor-not-allowed ${
                    isActive
                      ? crisis ? "nav-pill-crisis-active" : "nav-pill-active"
                      : crisis ? "nav-pill-crisis" : ""
                  }`}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </nav>

          {/* Profile button — right side */}
          <div className="flex items-center gap-2 shrink-0">
            {userProfile ? (
              <button
                onClick={() => setActiveTab("onboarding")}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                  activeTab === "onboarding"
                    ? "bg-violet-600/25 border-violet-400/60 text-white"
                    : "bg-slate-800/70 hover:bg-slate-800 border-slate-700/70 text-slate-100"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
                  {userProfile.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <span className="font-semibold text-slate-100 block leading-tight truncate max-w-[100px]">
                    {userProfile.name}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate max-w-[100px]">
                    {userProfile.occupation}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => setActiveTab("onboarding")}
                className="btn-violet text-xs py-2 px-4"
              >
                <User size={14} />
                <span className="hidden sm:inline">Get Started</span>
                <span className="sm:hidden">Start</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <main className="main-content layout-wrapper w-full">

        {/* Landing */}
        {activeTab === "landing" && (
          <div className="page-transition">
            <LandingPage
              onStartAssessment={handleStartAssessmentClick}
              onLoadDemoResult={handleLoadDemoResult}
              onExploreToolkit={() => setActiveTab("coping")}
            />
          </div>
        )}

        {/* Onboarding */}
        {activeTab === "onboarding" && (
          <div className="page-transition">
            <OnboardingPage
              initialProfile={userProfile}
              onSave={handleSaveProfile}
              onCancel={() => setActiveTab(userProfile ? "assessment" : "landing")}
            />
          </div>
        )}

        {/* Assessment Quiz */}
        {activeTab === "assessment" && userProfile && (
          <div className="page-transition">
            <AssessmentQuiz
              userProfile={userProfile}
              onComplete={handleAssessmentComplete}
              onEditProfile={() => setActiveTab("onboarding")}
            />
          </div>
        )}

        {/* Results Dashboard */}
        {activeTab === "results" && currentResult && (
          <div className="page-transition">
            <ResultsDashboard
              result={currentResult}
              onRetake={handleStartAssessmentClick}
              onGoToCoping={() => setActiveTab("coping")}
            />
          </div>
        )}

        {/* Relief Toolkit */}
        {activeTab === "coping" && (
          <div className="page-transition max-w-4xl mx-auto space-y-6">
            {/* Sub-tab toggle */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 no-print">
              <button
                onClick={() => setCopingSubTab("breathing")}
                className={`flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all min-h-[44px] ${
                  copingSubTab === "breathing"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <Wind size={16} />
                <span>4-7-8 Breathing</span>
              </button>
              <button
                onClick={() => setCopingSubTab("soundscape")}
                className={`flex-1 sm:flex-none justify-center px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all min-h-[44px] ${
                  copingSubTab === "soundscape"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <Volume2 size={16} />
                <span>Ambient Soundscapes</span>
              </button>
            </div>

            {copingSubTab === "breathing" ? <BreathingExercise /> : <SoundscapePlayer />}
          </div>
        )}

        {/* History */}
        {activeTab === "history" && (
          <div className="page-transition">
            <HistoryChart
              history={history}
              onSelectResult={(res) => {
                setCurrentResult(res);
                setActiveTab("results");
              }}
              onClearHistory={handleClearHistory}
            />
          </div>
        )}

        {/* Crisis Resources */}
        {activeTab === "resources" && (
          <div className="page-transition">
            <CrisisResources />
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════
          FOOTER — desktop only visible
      ══════════════════════════════════════════ */}
      <footer className="border-t border-slate-800/60 bg-slate-950/80 no-print hidden md:block">
        <div className="layout-wrapper py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center">
                <Brain size={16} className="text-white" />
              </div>
              <div>
                <span className="text-sm font-bold font-heading text-gradient-violet">AnxioCare</span>
                <span className="text-[11px] text-slate-500 block">Mental Health Assessment</span>
              </div>
            </div>

            {/* Links */}
            <div className="flex items-center gap-5 text-xs text-slate-500">
              <button onClick={() => setActiveTab("landing")} className="hover:text-slate-300 transition-colors">Overview</button>
              <button onClick={handleStartAssessmentClick} className="hover:text-slate-300 transition-colors">Assessment</button>
              <button onClick={() => setActiveTab("coping")} className="hover:text-slate-300 transition-colors">Toolkit</button>
              <button onClick={() => setActiveTab("resources")} className="hover:text-rose-400 transition-colors">Crisis Support</button>
            </div>

            {/* Legal */}
            <p className="text-[11px] text-slate-600 text-center sm:text-right">
              Validated GAD-7 · {new Date().getFullYear()} · Not a substitute for clinical care
            </p>
          </div>
        </div>
      </footer>

      {/* ══════════════════════════════════════════
          MOBILE BOTTOM NAV — visible below lg
      ══════════════════════════════════════════ */}
      <nav className="bottom-nav lg:hidden no-print">
        <div className="bottom-nav-inner">
          {mobileNavItems.map(({ id, label, Icon, crisis, disabled, ...rest }) => {
            const isActive = id === "assessment" ? isAssessmentActive : activeTab === id;
            const onClick = (rest as any).onClick ?? (() => setActiveTab(id as Tab));
            return (
              <button
                key={id}
                onClick={onClick}
                disabled={disabled}
                className={`bottom-nav-item ${
                  isActive
                    ? crisis ? "bottom-nav-item-crisis-active" : "bottom-nav-item-active"
                    : ""
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <div className={`${
                  isActive
                    ? crisis
                      ? "bottom-nav-item-crisis-icon"
                      : "bottom-nav-item-active-icon"
                    : ""
                } transition-all`}>
                  <Icon size={18} />
                </div>
                <span className="leading-none">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default App;
