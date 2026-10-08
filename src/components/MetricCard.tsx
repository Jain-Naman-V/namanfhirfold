import React from "react";
import { TrendingDown, ShieldCheck, Zap, Database, HelpCircle } from "lucide-react";

interface MetricCardProps {
  rawTokens: number;
  compressedTokens: number;
  reductionPercentage: number;
  tokenMultiple: number;
  rawChars: number;
  compressedChars: number;
  factRetentionRate: number;
  preservedFactsCount: number;
  totalFacts: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  rawTokens,
  compressedTokens,
  reductionPercentage,
  tokenMultiple,
  rawChars,
  compressedChars,
  factRetentionRate,
  preservedFactsCount,
  totalFacts,
}) => {
  const tokensSpared = Math.max(0, rawTokens - compressedTokens);
  const remainingPct = rawTokens > 0 ? ((compressedTokens / rawTokens) * 100).toFixed(1) : "0";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
      {/* 1. Input Token Reduction (Mathematically Rigorous) */}
      <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
          <span>Input Token Reduction</span>
          <TrendingDown className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
          -{reductionPercentage}%
        </div>
        <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
          {tokensSpared} spared • {remainingPct}% remain
        </div>
      </div>

      {/* 2. Token Multiple Ratio (Fewer Input Tokens) */}
      <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
          <span>Input Token Ratio</span>
          <Zap className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">
          ~{tokenMultiple}×
        </div>
        <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
          fewer input prompt tokens
        </div>
      </div>

      {/* 3. Clinical Information Retention (The Critical Triad Metric) */}
      <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
          <span>Clinical Fact Fidelity</span>
          <ShieldCheck className="w-4 h-4 text-purple-500" />
        </div>
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 tracking-tight">
          {factRetentionRate}%
        </div>
        <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
          {preservedFactsCount}/{totalFacts} clinical facts intact
        </div>
      </div>

      {/* 4. Payload Size */}
      <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
          <span>Wire Size</span>
          <Database className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
          {(compressedChars / 1024).toFixed(1)} KB
        </div>
        <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
          down from {(rawChars / 1024).toFixed(1)} KB raw
        </div>
      </div>
    </div>
  );
};
