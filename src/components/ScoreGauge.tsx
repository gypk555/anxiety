import React, { useEffect, useState } from 'react';
import type { SeverityInfo } from '../types/assessment';

interface Props {
  score:    number;
  maxScore: number;
  severity: SeverityInfo;
}

export const ScoreGauge: React.FC<Props> = ({ score, maxScore, severity }) => {
  const [displayScore,  setDisplayScore]  = useState(0);
  const [animatedPct,   setAnimatedPct]   = useState(0);

  const targetPct = Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)));

  // Animate on mount
  useEffect(() => {
    const duration  = 900; // ms
    const steps     = 45;
    const interval  = duration / steps;
    let   step      = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedPct(Math.round(eased * targetPct));
      setDisplayScore(Math.round(eased * score));
      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [score, targetPct]);

  // SVG arc parameters
  const cx = 150, cy = 140;
  const r  = 110;
  const strokeWidth = 16;

  // Semi-circle: starts at left (180°) sweeps to right (0°) via bottom
  // Using a path: M(left) arc to (right), half circle
  const startX = cx - r; // left point
  const startY = cy;
  const endX   = cx + r; // right point
  const endY   = cy;

  const totalArcLength = Math.PI * r;
  const filledLength   = (animatedPct / 100) * totalArcLength;

  // Gradient id
  const gradId = `gauge-grad-${severity.level.toLowerCase()}`;

  const gradColors: Record<string, [string, string]> = {
    Minimal:  ["#10b981", "#34d399"],
    Mild:     ["#06b6d4", "#38bdf8"],
    Moderate: ["#f59e0b", "#fbbf24"],
    Severe:   ["#f43f5e", "#fb7185"],
  };
  const [c1, c2] = gradColors[severity.level] ?? ["#8b5cf6", "#a78bfa"];

  return (
    <div className="flex flex-col items-center justify-center" aria-label={`Anxiety score: ${score} out of ${maxScore}. Level: ${severity.level}`}>
      <div className="relative" style={{ width: 300, height: 180 }}>
        <svg width={300} height={180} viewBox={`0 0 ${cx * 2} ${cy + 40}`} overflow="visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={c1} />
              <stop offset="100%" stopColor={c2} />
            </linearGradient>
          </defs>

          {/* Track arc */}
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Filled arc — stroke-dasharray trick on a half-circle path */}
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${totalArcLength}`}
            strokeDashoffset={`${totalArcLength - filledLength}`}
            style={{ transition: "none", filter: `drop-shadow(0 0 8px ${c1}80)` }}
          />

          {/* Tick marks at 33% and 66% */}
          {[33, 66].map((pct) => {
            const angle = Math.PI * (1 - pct / 100); // 0=right, PI=left
            const tx = cx - r * Math.cos(angle);
            const ty = cy - r * Math.sin(angle);
            return (
              <circle
                key={pct}
                cx={tx}
                cy={ty}
                r={4}
                fill="rgba(255,255,255,0.15)"
              />
            );
          })}
        </svg>

        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 score-reveal">
          <span
            className="text-5xl font-extrabold font-heading leading-none"
            style={{ color: c2 }}
          >
            {displayScore}
          </span>
          <span className="text-xs text-slate-400 font-medium mt-1">out of {maxScore}</span>
        </div>
      </div>

      {/* Severity badge */}
      <div
        className="mt-2 px-5 py-2 rounded-full border text-sm font-bold uppercase tracking-wider shadow-md transition-all"
        style={{
          color:           severity.color,
          backgroundColor: severity.bgColor,
          borderColor:     severity.borderColor,
          boxShadow:       `0 4px 20px -4px ${severity.color}55`,
        }}
      >
        {severity.level} Anxiety Level
      </div>

      {/* Level scale labels */}
      <div className="flex items-center justify-between w-64 mt-3 text-[10px] text-slate-600 font-medium px-1">
        <span>Minimal</span>
        <span>Mild</span>
        <span>Moderate</span>
        <span>Severe</span>
      </div>
    </div>
  );
};
