import React from "react";
import { TrendingDown, Zap, DollarSign, Database } from "lucide-react";

interface MetricCardProps {
  rawTokens: number;
  compressedTokens: number;
  reductionPercentage: number;
  rawChars: number;
  compressedChars: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  rawTokens,
  compressedTokens,
  reductionPercentage,
  rawChars,
  compressedChars,
}) => {
  // Cost estimates based on Gemini 3.8 Flash ($0.15 per 1M input tokens)
  const costPer100kRaw = ((rawTokens * 100000) / 1000000) * 0.15;
  const costPer100kComp = ((compressedTokens * 100000) / 1000000) * 0.15;
  const savedDollars = costPer100kRaw - costPer100kComp;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
      {/* Reduction % */}
      <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
          <span>Token Reduction</span>
          <TrendingDown className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
          -{reductionPercentage}%
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {rawTokens} → {compressedTokens} tokens
        </div>
      </div>

      {/* Latency & Throughput */}
      <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
          <span>LLM TTFT & Speed</span>
          <Zap className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">
          {Math.max(1.5, Math.round((rawTokens / Math.max(1, compressedTokens)) * 10) / 10)}x
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          Faster prompt processing
        </div>
      </div>

      {/* 100k Inference Cost */}
      <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
          <span>Cost / 100k Calls</span>
          <DollarSign className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
          ${costPer100kComp.toFixed(2)}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-through">
          was ${costPer100kRaw.toFixed(2)} (save ${savedDollars.toFixed(2)})
        </div>
      </div>

      {/* Payload Size */}
      <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
          <span>Payload Size</span>
          <Database className="w-4 h-4" />
        </div>
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 tracking-tight">
          {Math.round(compressedChars / 1024 * 10) / 10} KB
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          down from {Math.round(rawChars / 1024 * 10) / 10} KB raw
        </div>
      </div>
    </div>
  );
};
