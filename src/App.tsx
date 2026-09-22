import { useState } from "react";
import type { UserProfile, ScoreResult } from "./types/assessment";
import { LandingPage } from "./components/LandingPage";
import { OnboardingPage } from "./components/OnboardingPage";
import { AssessmentQuiz } from "./components/AssessmentQuiz";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { BreathingExercise } from "./components/BreathingExercise";
import { SoundscapePlayer } from "./components/SoundscapePlayer";
import { HistoryChart } from "./components/HistoryChart";
import { CrisisResources } from "./components/CrisisResources";
import {
  Activity,
  Award,
  Wind,
  TrendingUp,
  ShieldAlert,
  User,
  Brain,
  Volume2,
  Home
} from "lucide-react";

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

  const [activeTab, setActiveTab] = useState<"landing" | "onboarding" | "assessment" | "results" | "coping" | "history" | "resources">("landing");
  const [copingSubTab, setCopingSubTab] = useState<"breathing" | "soundscape">("breathing");

  const handleSaveProfile = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem("anxio_user_profile", JSON.stringify(profile));
    setActiveTab("assessment");
  };

  const handleStartAssessmentClick = () => {
    if (!userProfile) {
      setActiveTab("onboarding");
    } else {
      setActiveTab("assessment");
    }
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
    if (window.confirm("Are you sure you want to clear your assessment history?")) {
      setHistory([]);
      localStorage.removeItem("anxio_history");
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-950 text-slate-100 selection:bg-violet-500 selection:text-white">
      {/* Header Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/80 no-print py-3">
        <div className="layout-wrapper h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <button
            onClick={() => setActiveTab("landing")}
            className="flex items-center gap-3 shrink-0 text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-violet-500/25 group-hover:scale-105 transition-transform">
              <Brain size={22} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold font-heading text-gradient-violet leading-none">
                AnxioCare
              </h1>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide block mt-1 hidden sm:block">
                Anxiety Screening Engine
              </span>
            </div>
          </button>

          {/* Desktop Nav Pills */}
          <div className="h-9 w-[40vw] flex items-center gap-3 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("landing")}
              className={`h-9 w-22 rounded-xl flex items-center gap-1.5 font-medium transition-all whitespace-nowrap ${
                activeTab === "landing"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Home className="ml-4 h-5 w-5" />
              <span>Overview</span>
            </button>

            <button
              onClick={handleStartAssessmentClick}
              className={`h-9 w-22 rounded-xl flex items-center gap-1.5 font-medium transition-all whitespace-nowrap ${
                activeTab === "assessment" || activeTab === "onboarding"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Activity size={14} />
              <span>Assessment</span>
            </button>

            <button
              onClick={() => setActiveTab("results")}
              disabled={!currentResult}
              className={`h-9 w-22 rounded-xl flex items-center gap-1.5 font-medium transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                activeTab === "results"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Award size={14} />
              <span>Results</span>
            </button>

            <button
              onClick={() => setActiveTab("coping")}
              className={`h-9 w-22 rounded-xl flex items-center gap-1.5 font-medium transition-all whitespace-nowrap ${
                activeTab === "coping"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Wind size={14} />
              <span>Relief Toolkit</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`h-9 w-22 rounded-xl flex items-center gap-1.5 font-medium transition-all whitespace-nowrap ${
                activeTab === "history"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <TrendingUp size={14} />
              <span>Trends ({history.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("resources")}
              className={`h-9 w-22 rounded-xl flex items-center gap-1.5 font-medium transition-all whitespace-nowrap ${
                activeTab === "resources"
                  ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white font-semibold shadow-md shadow-rose-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <ShieldAlert size={14} />
              <span>Crisis Support</span>
            </button>
          </div>

          {/* User Profile Button */}
          <div className="flex items-center gap-2 shrink-0">
            {userProfile ? (
              <button
                onClick={() => setActiveTab("onboarding")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all shadow-sm ${
                  activeTab === "onboarding"
                    ? "bg-violet-600/30 border-violet-400 text-white"
                    : "bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 text-slate-100"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
                  {userProfile.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <span className="font-semibold text-slate-100 block leading-tight truncate max-w-[110px]">
                    {userProfile.name}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate max-w-[110px]">
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
                <span className="hidden sm:inline">Profile / Sign In</span>
                <span className="sm:hidden">Profile</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Nav Row */}
        <div className="lg:hidden mt-2 px-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-[11px] w-max mx-auto">
            <button
              onClick={() => setActiveTab("landing")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap ${
                activeTab === "landing" ? "bg-violet-600 text-white font-semibold" : "text-slate-400"
              }`}
            >
              <Home size={13} />
              <span>Home</span>
            </button>
            <button
              onClick={handleStartAssessmentClick}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap ${
                activeTab === "assessment" || activeTab === "onboarding" ? "bg-violet-600 text-white font-semibold" : "text-slate-400"
              }`}
            >
              <Activity size={13} />
              <span>Quiz</span>
            </button>
            <button
              onClick={() => setActiveTab("results")}
              disabled={!currentResult}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap disabled:opacity-30 ${
                activeTab === "results" ? "bg-violet-600 text-white font-semibold" : "text-slate-400"
              }`}
            >
              <Award size={13} />
              <span>Results</span>
            </button>
            <button
              onClick={() => setActiveTab("coping")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap ${
                activeTab === "coping" ? "bg-violet-600 text-white font-semibold" : "text-slate-400"
              }`}
            >
              <Wind size={13} />
              <span>Toolkit</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap ${
                activeTab === "history" ? "bg-violet-600 text-white font-semibold" : "text-slate-400"
              }`}
            >
              <TrendingUp size={13} />
              <span>History</span>
            </button>
            <button
              onClick={() => setActiveTab("resources")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap ${
                activeTab === "resources" ? "bg-rose-600 text-white font-semibold" : "text-slate-400"
              }`}
            >
              <ShieldAlert size={13} />
              <span>Crisis</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 py-6 sm:py-8 layout-wrapper w-full">
        {/* View 1: Landing Page */}
        {activeTab === "landing" && (
          <LandingPage
            onStartAssessment={handleStartAssessmentClick}
            onLoadDemoResult={handleLoadDemoResult}
            onExploreToolkit={() => setActiveTab("coping")}
          />
        )}

        {/* View 2: Onboarding Page (Full Page Intake Form) */}
        {activeTab === "onboarding" && (
          <OnboardingPage
            initialProfile={userProfile}
            onSave={handleSaveProfile}
            onCancel={() => setActiveTab(userProfile ? "assessment" : "landing")}
          />
        )}

        {/* View 3: Assessment Quiz */}
        {activeTab === "assessment" && userProfile && (
          <AssessmentQuiz
            userProfile={userProfile}
            onComplete={handleAssessmentComplete}
            onEditProfile={() => setActiveTab("onboarding")}
          />
        )}

        {/* View 4: Results Dashboard */}
        {activeTab === "results" && currentResult && (
          <ResultsDashboard
            result={currentResult}
            onRetake={handleStartAssessmentClick}
            onGoToCoping={() => setActiveTab("coping")}
          />
        )}

        {/* View 5: Coping Toolkit */}
        {activeTab === "coping" && (
          <div className="space-y-6 max-w-4xl mx-auto fade-in-up">
            <div className="flex justify-center gap-3 border-b border-slate-800/80 pb-4 no-print">
              <button
                onClick={() => setCopingSubTab("breathing")}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  copingSubTab === "breathing"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <Wind size={15} />
                <span>4-7-8 Breathing</span>
              </button>
              <button
                onClick={() => setCopingSubTab("soundscape")}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  copingSubTab === "soundscape"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <Volume2 size={15} />
                <span>Ambient Soundscapes</span>
              </button>
            </div>

            {copingSubTab === "breathing" ? <BreathingExercise /> : <SoundscapePlayer />}
          </div>
        )}

        {/* View 6: History */}
        {activeTab === "history" && (
          <HistoryChart
            history={history}
            onSelectResult={(res) => {
              setCurrentResult(res);
              setActiveTab("results");
            }}
            onClearHistory={handleClearHistory}
          />
        )}

        {/* View 7: Crisis Support */}
        {activeTab === "resources" && <CrisisResources />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500 space-y-1 no-print">
        <p className="font-medium text-slate-400">AnxioCare Mental Health Assessment &copy; {new Date().getFullYear()}</p>
        <p className="text-[11px] opacity-75">
          Validated GAD-7 screening engine & Web Audio relaxation tools.
        </p>
      </footer>
    </div>
  );
}

export default App;
