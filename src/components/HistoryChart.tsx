import React from "react";
import type { ScoreResult } from "../types/assessment";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { TrendingUp, Trash2, Calendar, Award, BarChart2 } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Props {
  history: ScoreResult[];
  onSelectResult: (result: ScoreResult) => void;
  onClearHistory: () => void;
}

const levelStyles: Record<string, { bg: string; text: string; border: string }> = {
  Minimal:  { bg: "rgba(16,185,129,0.15)",  text: "#34d399", border: "rgba(16,185,129,0.35)" },
  Mild:     { bg: "rgba(6,182,212,0.15)",   text: "#38bdf8", border: "rgba(6,182,212,0.35)" },
  Moderate: { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  Severe:   { bg: "rgba(244,63,94,0.15)",   text: "#f43f5e", border: "rgba(244,63,94,0.35)" },
};

export const HistoryChart: React.FC<Props> = ({ history, onSelectResult, onClearHistory }) => {
  if (history.length === 0) {
    return (
      <div className="glass-panel p-10 text-center max-w-xl mx-auto space-y-4 fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto">
          <BarChart2 size={30} className="text-slate-500" />
        </div>
        <h3 className="text-lg font-bold font-heading text-slate-200">No Assessment Logs Yet</h3>
        <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
          Complete your first anxiety assessment to unlock trend analytics and score progression tracking.
        </p>
      </div>
    );
  }

  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const labels = sortedHistory.map((h) =>
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
        backgroundColor: "rgba(139,92,246,0.12)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#8b5cf6",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 9,
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
        backgroundColor: "#13103a",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        borderColor: "#a78bfa",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (ctx: any) => ` Score: ${ctx.parsed.y} / ${sortedHistory[ctx.dataIndex]?.maxPossibleScore ?? 21}  (${sortedHistory[ctx.dataIndex]?.level})`,
        },
      },
    },
    scales: {
      y: {
        min: 0, max: 21,
        grid: { color: "rgba(255,255,255,0.05)", drawBorder: false },
        ticks: { color: "#64748b", font: { size: 11 } },
        border: { display: false },
      },
      x: {
        grid: { color: "rgba(255,255,255,0.05)", drawBorder: false },
        ticks: { color: "#64748b", font: { size: 11 } },
        border: { display: false },
      },
    },
  };

  const avg = Math.round(dataValues.reduce((a, b) => a + b, 0) / dataValues.length);
  const latest = dataValues[dataValues.length - 1];
  const trend = dataValues.length > 1 ? latest - dataValues[dataValues.length - 2] : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-5 fade-in-up">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Sessions", value: history.length, color: "text-violet-400" },
          { label: "Average Score", value: `${avg}/21`, color: "text-cyan-400" },
          { label: "Latest Trend", value: trend === 0 ? "Stable" : trend > 0 ? `+${trend} ↑` : `${trend} ↓`, color: trend <= 0 ? "text-emerald-400" : "text-rose-400" },
        ].map((s) => (
          <div key={s.label} className="glass-panel p-4 text-center">
            <span className={`text-xl font-extrabold font-heading ${s.color} block`}>{s.value}</span>
            <span className="text-xs text-slate-400 mt-0.5 block">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Chart Panel */}
      <div className="glass-panel p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <TrendingUp className="text-violet-400" size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold font-heading text-slate-100">Anxiety Score Progression</h3>
              <p className="text-xs text-slate-400">GAD-7 screening scores over time</p>
            </div>
          </div>
          <button
            onClick={onClearHistory}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-transparent hover:border-rose-500/25 transition-all"
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
        <div className="h-56 w-full pt-1">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* History List */}
      <div className="glass-panel p-5 sm:p-6 space-y-3">
        <h4 className="text-sm font-bold font-heading text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Award size={15} className="text-violet-400" />
          Recorded Sessions
        </h4>
        <div className="space-y-2">
          {[...sortedHistory].reverse().map((item) => {
            const s = levelStyles[item.level] ?? levelStyles.Minimal;
            return (
              <div
                key={item.id}
                onClick={() => onSelectResult(item)}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl hover:bg-slate-800/60 cursor-pointer transition-all border border-transparent hover:border-slate-700/60 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shrink-0">
                    <Calendar size={14} className="text-slate-400" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {new Date(item.timestamp).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(item.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {item.assessmentType === "GAD7" ? "Standard (7Q)" : "Extended (14Q)"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border"
                    style={{ color: s.text, backgroundColor: s.bg, borderColor: s.border }}
                  >
                    {item.level} · {item.totalScore}/{item.maxPossibleScore}
                  </span>
                  <Award size={14} className="text-slate-600 group-hover:text-violet-400 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
