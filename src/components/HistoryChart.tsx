import React from "react";
import type { ScoreResult } from "../types/assessment";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { TrendingUp, Trash2, Calendar, Award, BarChart2, ArrowRight } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Props {
  history:        ScoreResult[];
  onSelectResult: (result: ScoreResult) => void;
  onClearHistory: () => void;
}

const levelStyles: Record<string, { bg: string; text: string; border: string; leftBar: string }> = {
  Minimal:  { bg: "rgba(16,185,129,0.12)",  text: "#34d399", border: "rgba(16,185,129,0.30)", leftBar: "bg-emerald-400" },
  Mild:     { bg: "rgba(6,182,212,0.12)",   text: "#38bdf8", border: "rgba(6,182,212,0.30)",  leftBar: "bg-cyan-400"    },
  Moderate: { bg: "rgba(245,158,11,0.12)",  text: "#fbbf24", border: "rgba(245,158,11,0.30)", leftBar: "bg-amber-400"   },
  Severe:   { bg: "rgba(244,63,94,0.12)",   text: "#f87171", border: "rgba(244,63,94,0.30)",  leftBar: "bg-rose-500"    },
};

export const HistoryChart: React.FC<Props> = ({ history, onSelectResult, onClearHistory }) => {
  if (history.length === 0) {
    return (
      <div className="glass-panel p-12 text-center max-w-lg mx-auto space-y-5 fade-in-up">
        <div className="w-20 h-20 rounded-3xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-center mx-auto">
          <BarChart2 size={36} className="text-slate-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold font-heading text-slate-200">No Assessment Logs Yet</h3>
          <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
            Complete your first anxiety assessment to unlock trend analytics and score progression tracking.
          </p>
        </div>
      </div>
    );
  }

  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const labels     = sortedHistory.map((h) =>
    new Date(h.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );
  const dataValues = sortedHistory.map((h) => h.totalScore);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Anxiety Score",
        data: dataValues,
        borderColor: "#a78bfa",
        backgroundColor: "rgba(139,92,246,0.10)",
        fill: true,
        tension: 0.45,
        pointBackgroundColor: "#8b5cf6",
        pointBorderColor: "#1e1b4b",
        pointBorderWidth: 2.5,
        pointRadius: 7,
        pointHoverRadius: 10,
        borderWidth: 2.5,
      },
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f0e2a",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        borderColor: "#a78bfa",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        callbacks: {
          label: (ctx: any) =>
            ` Score: ${ctx.parsed.y} / ${sortedHistory[ctx.dataIndex]?.maxPossibleScore ?? 21}  ·  ${sortedHistory[ctx.dataIndex]?.level}`,
        },
      },
    },
    scales: {
      y: {
        min: 0, max: 22,
        grid:   { color: "rgba(255,255,255,0.04)", drawBorder: false },
        ticks:  { color: "#475569", font: { size: 11 }, stepSize: 5 },
        border: { display: false },
      },
      x: {
        grid:   { color: "rgba(255,255,255,0.04)", drawBorder: false },
        ticks:  { color: "#475569", font: { size: 11 } },
        border: { display: false },
      },
    },
    animation: { duration: 600, easing: "easeOutCubic" },
  };

  const avg    = Math.round(dataValues.reduce((a, b) => a + b, 0) / dataValues.length);
  const latest = dataValues[dataValues.length - 1];
  const trend  = dataValues.length > 1 ? latest - dataValues[dataValues.length - 2] : 0;
  const trendLabel = trend === 0 ? "Stable" : trend > 0 ? `+${trend} ↑` : `${trend} ↓`;
  const trendColor = trend <= 0 ? "text-emerald-400" : "text-rose-400";

  const statCards = [
    { label: "Total Sessions", value: String(history.length),  color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20"  },
    { label: "Average Score",  value: `${avg}/21`,             color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20"      },
    { label: "Latest Trend",   value: trendLabel,              color: trendColor,         bg: trend <= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 fade-in-up pb-12">

      {/* ── STATS ROW ── */}
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        {statCards.map((s) => (
          <div key={s.label} className={`stat-card text-center border ${s.bg}`}>
            <span className={`text-xl sm:text-2xl lg:text-3xl font-extrabold font-heading ${s.color} block`}>
              {s.value}
            </span>
            <span className="text-xs text-slate-400 mt-1 block font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── CHART PANEL ── */}
      <div className="glass-panel p-5 sm:p-7 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/28 flex items-center justify-center shrink-0">
              <TrendingUp className="text-violet-400" size={17} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-heading text-slate-100">Anxiety Score Progression</h3>
              <p className="text-xs text-slate-500">GAD-7 screening scores over time</p>
            </div>
          </div>
          <button
            onClick={onClearHistory}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-2 rounded-xl border border-transparent hover:border-rose-500/22 transition-all"
            id="history-clear"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Clear All</span>
          </button>
        </div>

        {/* Chart — taller on desktop */}
        <div className="h-56 sm:h-72 lg:h-80 w-full">
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Level legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 pt-1">
          {Object.entries(levelStyles).map(([level, s]) => (
            <div key={level} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-full ${s.leftBar}`} />
              {level}
            </div>
          ))}
        </div>
      </div>

      {/* ── SESSION HISTORY LIST ── */}
      <div className="glass-panel p-5 sm:p-7 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold font-heading text-slate-200 flex items-center gap-2">
            <Award size={16} className="text-violet-400" />
            Recorded Sessions
          </h3>
          <span className="text-xs text-slate-500">{history.length} total</span>
        </div>

        <div className="space-y-2">
          {[...sortedHistory].reverse().map((item) => {
            const s = levelStyles[item.level] ?? levelStyles.Minimal;
            return (
              <button
                key={item.id}
                onClick={() => onSelectResult(item)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-slate-800/50 cursor-pointer transition-all border border-transparent hover:border-slate-700/50 group text-left"
              >
                {/* Severity left bar */}
                <div className={`w-1 self-stretch rounded-full shrink-0 ${s.leftBar}`} />

                {/* Date / time */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/50 flex items-center justify-center shrink-0">
                    <Calendar size={14} className="text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 block truncate">
                      {new Date(item.timestamp).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(item.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      &nbsp;·&nbsp;
                      {item.assessmentType === "GAD7" ? "Standard" : "Extended"}
                    </span>
                  </div>
                </div>

                {/* Score badge + chevron */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className="text-xs px-3 py-1.5 rounded-full font-bold uppercase tracking-wider border"
                    style={{ color: s.text, backgroundColor: s.bg, borderColor: s.border }}
                  >
                    {item.level} · {item.totalScore}/{item.maxPossibleScore}
                  </span>
                  <ArrowRight size={14} className="text-slate-700 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
