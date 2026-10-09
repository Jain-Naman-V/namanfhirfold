import React, { useState } from "react";
import { Sparkles, Play, CheckCircle, Clock, Zap, AlertTriangle } from "lucide-react";

interface LlmEvaluatorProps {
  rawJson: string;
  compressedOutput: string;
  queryFilter: string;
}

export const LlmEvaluator: React.FC<LlmEvaluatorProps> = ({
  rawJson,
  compressedOutput,
  queryFilter,
}) => {
  const [clinicalQuery, setClinicalQuery] = useState(
    queryFilter || "What is the patient's hemoglobin and are there any abnormal lab flags?"
  );
  const [running, setRunning] = useState(false);
  const [rawResult, setRawResult] = useState<{ answer: string; latencyMs: number; tokens: number } | null>(null);
  const [compResult, setCompResult] = useState<{ answer: string; latencyMs: number; tokens: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runEvaluation = async () => {
    setRunning(true);
    setError(null);
    try {
      // 1. Evaluate with compressed context
      const compRes = await fetch("/api/evaluate-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: clinicalQuery,
          context: compressedOutput,
          formatName: "compressed",
        }),
      });
      const compData = await compRes.json();
      if (compData.error) throw new Error(compData.error);

      setCompResult({
        answer: compData.answer,
        latencyMs: compData.latencyMs,
        tokens: compData.tokenEstimate,
      });

      // 2. Evaluate with raw context
      const rawRes = await fetch("/api/evaluate-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: clinicalQuery,
          context: rawJson,
          formatName: "raw",
        }),
      });
      const rawData = await rawRes.json();
      if (rawData.error) throw new Error(rawData.error);

      setRawResult({
        answer: rawData.answer,
        latencyMs: rawData.latencyMs,
        tokens: rawData.tokenEstimate,
      });
    } catch (err: any) {
      setError(err.message || "Failed to execute LLM evaluation");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/20 dark:bg-blue-950/10 p-4 shadow-xs mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100 dark:border-blue-900/40">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Live LLM Verification
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Execute identical clinical query against Raw FHIR vs Compressed Context to verify clinical accuracy and token savings.
            </p>
          </div>
        </div>

        <button
          onClick={runEvaluation}
          disabled={running}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-xs"
        >
          {running ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Running Inference...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Comparative Inference</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Clinical Query / CDS Directive:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={clinicalQuery}
            onChange={(e) => setClinicalQuery(e.target.value)}
            placeholder="e.g., What is the patient's hemoglobin and are there any abnormal lab flags?"
            className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(rawResult || compResult) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Compressed Result */}
          <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                <span>Optimized Context Response</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {compResult?.latencyMs}ms
                </span>
                <span className="bg-emerald-500/20 px-1.5 py-0.5 rounded font-bold">
                  {compResult?.tokens} tokens
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {compResult?.answer}
            </div>
          </div>

          {/* Raw Result */}
          <div className="p-3.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <span>Raw FHIR JSON Response</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {rawResult?.latencyMs}ms
                </span>
                <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-bold">
                  {rawResult?.tokens} tokens
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {rawResult?.answer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
