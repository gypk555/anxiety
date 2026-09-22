import React, { useState } from "react";
import type { UserProfile, ScoreResult, SymptomCategory, CategoryBreakdown } from "../types/assessment";
import { ASSESSMENT_QUESTIONS, GAD7_OPTIONS, calculateSeverity, generateDemographicInsight } from "../data/questions";
import { ArrowLeft, ArrowRight, CheckCircle2, HelpCircle, Award, UserCheck, Sparkles, Brain, Activity } from "lucide-react";

interface Props {
  userProfile:   UserProfile;
  onComplete:    (result: ScoreResult) => void;
  onEditProfile: () => void;
}

const categoryConfig: Record<SymptomCategory, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  Cognitive:  { icon: Brain,    color: "text-purple-300", bg: "bg-purple-500/15", border: "border-purple-500/30" },
  Emotional:  { icon: Activity, color: "text-rose-300",   bg: "bg-rose-500/15",   border: "border-rose-500/30"   },
  Physical:   { icon: Activity, color: "text-cyan-300",   bg: "bg-cyan-500/15",   border: "border-cyan-500/30"   },
  Behavioral: { icon: Activity, color: "text-amber-300",  bg: "bg-amber-500/15",  border: "border-amber-500/30"  },
};

export const AssessmentQuiz: React.FC<Props> = ({ userProfile, onComplete, onEditProfile }) => {
  const [isExtendedMode, setIsExtendedMode] = useState(false);
  const [currentIndex,   setCurrentIndex]   = useState(0);
  const [answers,        setAnswers]         = useState<Record<number, number>>({});
  const [showInfo,       setShowInfo]        = useState(false);

  const activeQuestions = isExtendedMode
    ? ASSESSMENT_QUESTIONS
    : ASSESSMENT_QUESTIONS.filter((q) => !q.isExtendedOnly);

  const currentQuestion = activeQuestions[currentIndex];
  const totalQuestions  = activeQuestions.length;
  const isAnswered      = answers[currentQuestion.id] !== undefined;
  const completedCount  = Object.keys(answers).length;
  const progressPct     = Math.round(((currentIndex) / totalQuestions) * 100);
  const cfg             = categoryConfig[currentQuestion.category];

  const handleSelectOption = (score: number) => {
    const updatedAnswers = { ...answers, [currentQuestion.id]: score };
    setAnswers(updatedAnswers);
    if (currentIndex < totalQuestions - 1) {
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setShowInfo(false);
      }, 220);
    }
  };

  const handleFinish = () => {
    let totalScore = 0;
    activeQuestions.forEach((q) => { totalScore += answers[q.id] || 0; });
    const maxPossibleScore = totalQuestions * 3;
    const severity = calculateSeverity(totalScore, maxPossibleScore);

    const categories: SymptomCategory[] = ["Cognitive", "Emotional", "Physical", "Behavioral"];
    const categoryBreakdown: CategoryBreakdown[] = categories.map((cat) => {
      const catQs  = activeQuestions.filter((q) => q.category === cat);
      const catMax = catQs.length * 3;
      let catScore = 0;
      catQs.forEach((q) => { catScore += answers[q.id] || 0; });
      return { category: cat, score: catScore, maxScore: catMax, percentage: catMax > 0 ? Math.round((catScore / catMax) * 100) : 0 };
    });

    const result: ScoreResult = {
      id: "res_" + Date.now(),
      timestamp: new Date().toISOString(),
      totalScore, maxPossibleScore,
      level: severity.level,
      categoryBreakdown, answers, userProfile,
      assessmentType: isExtendedMode ? "Extended" : "GAD7",
      demographicInsight: generateDemographicInsight(userProfile, severity.level),
    };
    onComplete(result);
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5 fade-in-up pb-12">

      {/* ── TOP BANNER ── */}
      <div className="premium-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 flex items-center justify-center shrink-0">
            <UserCheck size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
              <span className="font-semibold text-slate-200">{userProfile.name}</span>
              <span className="text-slate-600 hidden sm:inline">·</span>
              <span className="text-slate-500 hidden sm:inline">{userProfile.occupation}</span>
              <button
                onClick={onEditProfile}
                className="text-violet-400 underline hover:text-violet-300 font-medium transition-colors ml-1"
              >
                Edit
              </button>
            </div>
            <h2 className="text-base sm:text-lg font-bold font-heading text-slate-100 mt-0.5 leading-tight">
              Anxiety Screening Questionnaire
            </h2>
          </div>
        </div>

        {/* Mode switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs gap-1 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => { setIsExtendedMode(false); setCurrentIndex(0); setAnswers({}); }}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg transition-all font-medium whitespace-nowrap text-center ${
              !isExtendedMode
                ? "bg-violet-600 text-white font-semibold shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            GAD-7 Standard (7 Qs)
          </button>
          <button
            onClick={() => { setIsExtendedMode(true); setCurrentIndex(0); setAnswers({}); }}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg transition-all font-medium whitespace-nowrap text-center ${
              isExtendedMode
                ? "bg-violet-600 text-white font-semibold shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Deep Assessment (14 Qs)
          </button>
        </div>
      </div>

      {/* ── PROGRESS ── */}
      <div className="premium-card p-4 sm:p-5 space-y-3">
        {/* Step dots */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
          {activeQuestions.map((_, idx) => {
            const answered = answers[activeQuestions[idx].id] !== undefined;
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={idx}
                onClick={() => { setCurrentIndex(idx); setShowInfo(false); }}
                className={`shrink-0 rounded-full transition-all ${
                  isCurrent
                    ? "w-6 h-3 bg-violet-500 shadow-md shadow-violet-500/50"
                    : answered
                      ? "w-3 h-3 bg-indigo-500/70"
                      : "w-3 h-3 bg-slate-800 border border-slate-700"
                }`}
                title={`Question ${idx + 1}`}
              />
            );
          })}
        </div>

        {/* Bar + labels */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-violet-300 flex items-center gap-1.5">
              <Sparkles size={12} className="text-violet-400" />
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <span className="text-slate-500">{completedCount}/{totalQuestions} answered · {progressPct}%</span>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 transition-all duration-400 shadow-sm shadow-violet-500/40"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── MAIN QUESTION AREA — sidebar layout on desktop ── */}
      <div className="sidebar-layout">

        {/* LEFT: Question info panel */}
        <div className="space-y-4">
          <div className="premium-card p-6 sm:p-7 space-y-5 h-full">
            {/* Category badge */}
            <div className="flex items-center justify-between gap-3">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                {currentQuestion.category} Symptom
              </span>
              <span className="text-xs text-slate-600 font-mono">#{currentQuestion.id}</span>
            </div>

            {/* Question text */}
            <h3 className="text-xl sm:text-2xl lg:text-2xl xl:text-3xl font-bold font-heading text-slate-100 leading-snug">
              {currentQuestion.text}
            </h3>

            {/* Time frame note */}
            <p className="text-xs text-slate-500 italic">
              Think about the past 2 weeks when answering.
            </p>

            {/* Clinical context toggle */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-violet-300 transition-colors bg-slate-900/60 px-3.5 py-2 rounded-xl border border-slate-800 w-full sm:w-auto"
            >
              <HelpCircle size={14} />
              <span>{showInfo ? "Hide" : "View"} Clinical Context</span>
            </button>

            {showInfo && (
              <div className="p-4 rounded-xl bg-violet-950/40 border border-violet-500/28 text-violet-200 text-xs fade-in leading-relaxed">
                <span className="font-bold text-violet-300 block mb-1">Clinical Context:</span>
                {currentQuestion.explanation}
              </div>
            )}

            {/* Desktop: navigation lives here too */}
            <div className="hidden lg:flex items-center justify-between gap-3 pt-4 border-t border-slate-800/70 mt-auto">
              <button
                onClick={() => { if (currentIndex > 0) { setCurrentIndex(currentIndex - 1); setShowInfo(false); } }}
                disabled={currentIndex === 0}
                className="btn-ghost text-sm px-4 py-2.5"
              >
                <ArrowLeft size={16} />
                <span>Prev</span>
              </button>

              {currentIndex < totalQuestions - 1 ? (
                <button
                  onClick={() => { setCurrentIndex(currentIndex + 1); setShowInfo(false); }}
                  disabled={!isAnswered}
                  className="btn-violet text-sm px-5 py-2.5"
                >
                  <span>Next</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={completedCount < totalQuestions}
                  className="btn-violet text-sm px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30"
                  id="quiz-calculate-score"
                >
                  <Award size={16} />
                  <span>Calculate Score</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Answer options */}
        <div className="premium-card p-6 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              How often did you experience this?
            </p>
            {isAnswered && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 size={12} /> Answered
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {GAD7_OPTIONS.map((opt) => {
              const isSelected = answers[currentQuestion.id] === opt.score;
              return (
                <button
                  key={opt.score}
                  onClick={() => handleSelectOption(opt.score)}
                  id={`quiz-option-${opt.score}`}
                  className={`quiz-option-card py-4 px-5 ${isSelected ? "quiz-option-card-selected" : ""}`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                        isSelected
                          ? "bg-violet-500 text-white shadow-md shadow-violet-500/50"
                          : "bg-slate-900 text-slate-400 border border-slate-800"
                      }`}
                    >
                      {opt.score}
                    </span>
                    <span className="text-sm sm:text-base font-medium leading-snug">{opt.label}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="text-violet-400 shrink-0" size={20} />}
                </button>
              );
            })}
          </div>

          {/* Mobile navigation — shown only below lg */}
          <div className="lg:hidden pt-4 border-t border-slate-800/70 flex items-center justify-between gap-4">
            <button
              onClick={() => { if (currentIndex > 0) { setCurrentIndex(currentIndex - 1); setShowInfo(false); } }}
              disabled={currentIndex === 0}
              className="btn-ghost text-sm px-4 py-2.5"
            >
              <ArrowLeft size={16} />
              <span>Prev</span>
            </button>

            {currentIndex < totalQuestions - 1 ? (
              <button
                onClick={() => { setCurrentIndex(currentIndex + 1); setShowInfo(false); }}
                disabled={!isAnswered}
                className="btn-violet text-sm px-6 py-2.5"
              >
                <span>Next</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={completedCount < totalQuestions}
                className="btn-violet text-sm px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600"
              >
                <Award size={16} />
                <span>Calculate Score</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
