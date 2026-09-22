import React, { useState } from "react";
import type { UserProfile, ScoreResult, SymptomCategory, CategoryBreakdown } from "../types/assessment";
import { ASSESSMENT_QUESTIONS, GAD7_OPTIONS, calculateSeverity, generateDemographicInsight } from "../data/questions";
import { ArrowLeft, ArrowRight, CheckCircle2, HelpCircle, Award, UserCheck, Sparkles } from "lucide-react";

interface Props {
  userProfile: UserProfile;
  onComplete: (result: ScoreResult) => void;
  onEditProfile: () => void;
}

export const AssessmentQuiz: React.FC<Props> = ({ userProfile, onComplete, onEditProfile }) => {
  const [isExtendedMode, setIsExtendedMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showInfo, setShowInfo] = useState(false);

  const activeQuestions = isExtendedMode
    ? ASSESSMENT_QUESTIONS
    : ASSESSMENT_QUESTIONS.filter((q) => !q.isExtendedOnly);

  const currentQuestion = activeQuestions[currentIndex];
  const totalQuestions = activeQuestions.length;
  const isAnswered = answers[currentQuestion.id] !== undefined;

  const handleSelectOption = (score: number) => {
    const updatedAnswers = { ...answers, [currentQuestion.id]: score };
    setAnswers(updatedAnswers);

    if (currentIndex < totalQuestions - 1) {
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setShowInfo(false);
      }, 180);
    }
  };

  const handleFinish = () => {
    let totalScore = 0;
    activeQuestions.forEach((q) => {
      totalScore += answers[q.id] || 0;
    });

    const maxPossibleScore = totalQuestions * 3;
    const severity = calculateSeverity(totalScore, maxPossibleScore);

    const categories: SymptomCategory[] = ["Cognitive", "Emotional", "Physical", "Behavioral"];
    const categoryBreakdown: CategoryBreakdown[] = categories.map((cat) => {
      const catQuestions = activeQuestions.filter((q) => q.category === cat);
      const catMax = catQuestions.length * 3;
      let catScore = 0;
      catQuestions.forEach((q) => {
        catScore += answers[q.id] || 0;
      });
      const pct = catMax > 0 ? Math.round((catScore / catMax) * 100) : 0;
      return {
        category: cat,
        score: catScore,
        maxScore: catMax,
        percentage: pct,
      };
    });

    const result: ScoreResult = {
      id: "res_" + Date.now(),
      timestamp: new Date().toISOString(),
      totalScore,
      maxPossibleScore,
      level: severity.level,
      categoryBreakdown,
      answers,
      userProfile,
      assessmentType: isExtendedMode ? "Extended" : "GAD7",
      demographicInsight: generateDemographicInsight(userProfile, severity.level),
    };

    onComplete(result);
  };

  const categoryBadgeStyle = (cat: SymptomCategory) => {
    switch (cat) {
      case "Cognitive":  return "bg-purple-500/15 text-purple-300 border-purple-500/30";
      case "Emotional":  return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      case "Physical":   return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
      case "Behavioral": return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    }
  };

  const completedCount = Object.keys(answers).length;
  const progressPct = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  return (
    <div className="max-w-4xl mx-auto w-full space-y-5 fade-in-up pb-12">
      {/* Top Banner & Mode Toggle */}
      <div className="premium-card p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300 flex items-center justify-center font-bold shrink-0">
            <UserCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Patient:</span>
              <span className="font-semibold text-slate-200">{userProfile.name}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">{userProfile.occupation}</span>
              <button
                onClick={onEditProfile}
                className="text-[11px] text-violet-400 underline hover:text-violet-300 ml-1 font-medium"
              >
                Edit Profile
              </button>
            </div>
            <h2 className="text-lg sm:text-xl font-bold font-heading text-slate-100 mt-0.5">
              Anxiety Screening Questionnaire
            </h2>
          </div>
        </div>

        {/* Responsive Mode Switcher */}
        <div className="w-full md:w-auto flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs gap-1.5 shrink-0">
          <button
            onClick={() => {
              setIsExtendedMode(false);
              setCurrentIndex(0);
            }}
            className={`flex-1 md:flex-initial px-3.5 py-2 rounded-lg transition-all text-center whitespace-nowrap font-medium ${
              !isExtendedMode
                ? "bg-violet-600 text-white font-semibold shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            GAD-7 Standard (7 Qs)
          </button>
          <button
            onClick={() => {
              setIsExtendedMode(true);
              setCurrentIndex(0);
            }}
            className={`flex-1 md:flex-initial px-3.5 py-2 rounded-lg transition-all text-center whitespace-nowrap font-medium ${
              isExtendedMode
                ? "bg-violet-600 text-white font-semibold shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Deep Assessment (14 Qs)
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="glass-panel p-4 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={13} className="text-violet-400" />
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <span className="text-slate-400 font-medium">{completedCount} of {totalQuestions} Answered</span>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 transition-all duration-300 shadow-md shadow-violet-500/40"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Main Question Card */}
      <div className="premium-card p-6 sm:p-8 space-y-6 border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${categoryBadgeStyle(currentQuestion.category)}`}>
            {currentQuestion.category} Symptom
          </span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-slate-400 hover:text-violet-300 transition-colors flex items-center gap-1.5 text-xs font-medium bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800"
          >
            <HelpCircle size={15} />
            <span>Clinical Context</span>
          </button>
        </div>

        {/* Question Text */}
        <h3 className="text-xl sm:text-2xl font-bold font-heading text-slate-100 leading-relaxed">
          {currentQuestion.text}
        </h3>

        {/* Clinical Guidance Box */}
        {showInfo && (
          <div className="p-4 rounded-xl bg-violet-950/40 border border-violet-500/30 text-violet-200 text-xs fade-in leading-relaxed">
            <span className="font-bold text-violet-300 block mb-1">Clinical Context & Significance:</span>
            {currentQuestion.explanation}
          </div>
        )}

        {/* Options Stack */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {GAD7_OPTIONS.map((opt) => {
            const isSelected = answers[currentQuestion.id] === opt.score;
            return (
              <button
                key={opt.score}
                onClick={() => handleSelectOption(opt.score)}
                className={`quiz-option-card py-4 px-5 ${isSelected ? "quiz-option-card-selected" : ""}`}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                      isSelected
                        ? "bg-violet-500 text-white shadow-md shadow-violet-500/50"
                        : "bg-slate-900 text-slate-400 border border-slate-800"
                    }`}
                  >
                    {opt.score}
                  </span>
                  <span className="text-sm font-medium leading-snug">{opt.label}</span>
                </div>
                {isSelected && <CheckCircle2 className="text-violet-400 shrink-0" size={20} />}
              </button>
            );
          })}
        </div>

        {/* Footer Navigation */}
        <div className="pt-6 border-t border-slate-800/80 flex items-center justify-between gap-4">
          <button
            onClick={() => {
              if (currentIndex > 0) {
                setCurrentIndex(currentIndex - 1);
                setShowInfo(false);
              }
            }}
            disabled={currentIndex === 0}
            className="btn-ghost text-xs sm:text-sm px-4 py-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={16} />
            <span>Previous</span>
          </button>

          {currentIndex < totalQuestions - 1 ? (
            <button
              onClick={() => {
                setCurrentIndex(currentIndex + 1);
                setShowInfo(false);
              }}
              disabled={!isAnswered}
              className="btn-violet text-xs sm:text-sm px-6 py-2.5 disabled:opacity-50"
            >
              <span>Next</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={completedCount < totalQuestions}
              className="btn-violet text-xs sm:text-sm px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30"
            >
              <Award size={16} />
              <span>Calculate Score</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
