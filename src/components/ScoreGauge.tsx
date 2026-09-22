import React from 'react';
import type { SeverityInfo } from '../types/assessment';

interface Props {
  score: number;
  maxScore: number;
  severity: SeverityInfo;
}

export const ScoreGauge: React.FC<Props> = ({ score, maxScore, severity }) => {
  const percentage = Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)));
  
  // Radius & Arc dimensions for SVG semicircular gauge
  const radius = 80;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // Half circle arc
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative w-56 h-36 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-180" viewBox="0 0 200 110">
          {/* Background Arc Track */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Animated Value Arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={severity.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Score Display */}
        <div className="absolute bottom-2 text-center flex flex-col items-center">
          <span className="text-4xl font-extrabold font-heading text-slate-100 leading-none">
            {score}
          </span>
          <span className="text-xs text-slate-400 font-medium mt-1">
            out of {maxScore}
          </span>
        </div>
      </div>

      {/* Severity Badge */}
      <div
        className="mt-3 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider shadow-sm transition-all"
        style={{
          color: severity.color,
          backgroundColor: severity.bgColor,
          borderColor: severity.borderColor,
        }}
      >
        {severity.level} Anxiety Level
      </div>
    </div>
  );
};
