import React, { useState, useRef } from "react";
import {
  FileText,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  Search,
  Zap,
  TrendingDown,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Calendar,
} from "lucide-react";
import { CompressionFormat, CompressionResult, GranularityMode, CdsProfile } from "../types/fhir.ts";
import { ProvenanceDrawer } from "./ProvenanceDrawer.tsx";

interface SplitWorkbenchProps {
  rawJsonText: string;
  setRawJsonText: (val: string) => void;
  result: CompressionResult;
  format: CompressionFormat;
  setFormat: (f: CompressionFormat) => void;
  queryFilter: string;
  setQueryFilter: (q: string) => void;
  granularity: GranularityMode;
  setGranularity: (g: GranularityMode) => void;
  profile: CdsProfile;
  setProfile: (p: CdsProfile) => void;
  tokenBudget: number;
  setTokenBudget: (b: number) => void;
  onlyAbnormal: boolean;
  setOnlyAbnormal: (b: boolean) => void;
  onSelectSample: (sampleKey: "pain" | "careplan" | "hemoglobin" | "20_labs" | "full_cds" | "custom") => void;
  selectedSample: string;
}

export const SplitWorkbench: React.FC<SplitWorkbenchProps> = ({
  rawJsonText,
  setRawJsonText,
  result,
  format,
  setFormat,
  queryFilter,
  setQueryFilter,
  granularity,
  setGranularity,
  profile,
  setProfile,
  tokenBudget,
  setTokenBudget,
  onlyAbnormal,
  setOnlyAbnormal,
  onSelectSample,
  selectedSample,
}) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmResponse, setLlmResponse] = useState<{ answer: string; latencyMs: number; tokens: number } | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(result.compressedOutput);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleDownload = () => {
    const ext = format === "compact_json" || format === "cds_hooks_prefetch" ? "json" : "txt";
    const blob = new Blob([result.compressedOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optimized_llm_input_${format}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        setRawJsonText(JSON.stringify(parsed, null, 2));
        onSelectSample("custom");
      } catch (err) {
        alert("Invalid JSON file provided.");
      }
    };
    reader.readAsText(file);
  };

  const runQuickLlmTest = async () => {
    setTestingLlm(true);
    setLlmError(null);
    try {
      const query = queryFilter || "What was the patient's pain severity and clinical status?";
      const res = await fetch("/api/evaluate-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          context: result.compressedOutput,
          formatName: format,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLlmResponse({
        answer: data.answer,
        latencyMs: data.latencyMs,
        tokens: data.tokenEstimate,
      });
    } catch (err: any) {
      setLlmError(err.message || "Failed to query Gemini model");
    } finally {
      setTestingLlm(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Toolbar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 mr-1">
              Select Preset Payload:
            </span>
            <button
              onClick={() => onSelectSample("pain")}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                selectedSample === "pain"
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-300 font-bold"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              ⭐ Pain Severity Vital (Score 2 • LOINC 72514-3)
            </button>
            <button
              onClick={() => onSelectSample("careplan")}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                selectedSample === "careplan"
                  ? "bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300 font-bold"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              CarePlan Post-Op (Activities Intact)
            </button>
            <button
              onClick={() => onSelectSample("hemoglobin")}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                selectedSample === "hemoglobin"
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              Hemoglobin Lab (1 Obs)
            </button>
            <button
              onClick={() => onSelectSample("20_labs")}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                selectedSample === "20_labs"
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              20-Lab Panel (4,200 Tok)
            </button>
            <button
              onClick={() => onSelectSample("full_cds")}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                selectedSample === "full_cds"
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold"
                  : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              Inpatient CDS Bundle
            </button>
            
            {/* Upload File */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-blue-500" />
              <span>Upload .json</span>
            </button>
          </div>

          {/* Target Format */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Format:
            </span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as CompressionFormat)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="compact_json">Compact Clinical JSON (vitalSigns vs labs)</option>
              <option value="medprompt_text">MedPrompt Text (FHIR2Text Shorthand)</option>
              <option value="fhirbench_markdown">FHIRBench Flat Markdown Tables</option>
              <option value="cds_hooks_prefetch">CDS Hooks Prefetch Context</option>
            </select>
          </div>
        </div>

        {/* Task-Aware Optimizer Controls: Granularity, CDS Profiles, Token Budget */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. CDS Profile Selector */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              CDS Intent Profile:
            </label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as CdsProfile)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:outline-none"
            >
              <option value="free_query">Agent / Free-Form Query</option>
              <option value="medication_prescribe">medication-prescribe (Deterministic CDS)</option>
              <option value="vitals_monitor">vitals_monitor (Pain, BP, Acute)</option>
              <option value="patient_view">patient_view (Inpatient Snapshot)</option>
            </select>
          </div>

          {/* 2. Granularity Selector */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              Temporal Granularity:
            </label>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
              <button
                onClick={() => setGranularity("exact_timestamp")}
                className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                  granularity === "exact_timestamp"
                    ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                Exact Timestamp
              </button>
              <button
                onClick={() => setGranularity("date_only")}
                className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                  granularity === "date_only"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs font-bold"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                Date Only
              </button>
            </div>
          </div>

          {/* 3. Token Budget Slider */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1 flex justify-between">
              <span>Token Budget:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{tokenBudget} tok max</span>
            </label>
            <div className="flex items-center gap-1.5">
              {[250, 500, 800, 1500].map((b) => (
                <button
                  key={b}
                  onClick={() => setTokenBudget(b)}
                  className={`flex-1 py-1 rounded border text-[11px] font-mono transition-colors ${
                    tokenBudget === b
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Safety Set Status */}
          <div className="flex flex-col justify-end">
            <div className="p-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span><strong>Safety-Set:</strong> Allergies, Meds, Outliers Never Dropped</span>
            </div>
          </div>
        </div>

        {/* Free Query Input */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="w-full sm:w-auto flex-1 flex items-center gap-2">
            <div className="relative w-full max-w-lg">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queryFilter}
                onChange={(e) => setQueryFilter(e.target.value)}
                placeholder="Query / Task Intent (e.g. 'What was the patient\'s pain score?', 'Pain score at 6:21 PM')"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {queryFilter && (
              <button
                onClick={() => setQueryFilter("")}
                className="text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={onlyAbnormal}
              onChange={(e) => setOnlyAbnormal(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 dark:border-gray-700"
            />
            <span>Filter Only Abnormal Results</span>
          </label>
        </div>
      </div>

      {/* Main Visual Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* LEFT PANEL: Input FHIR Bundle */}
        <div className="lg:col-span-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-900 dark:text-white">
                  INPUT: Raw FHIR Bundle
                </h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Canonical EHR Source of Truth
                </p>
              </div>
            </div>

            {/* Token Badge */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 font-bold">
                {result.rawTokens.toLocaleString()} Input Tokens
              </span>
            </div>
          </div>

          {/* Sub-bar stats */}
          <div className="px-3.5 py-1.5 bg-gray-50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between text-[11px] text-gray-500 font-mono">
            <span>Size: {(result.rawCharCount / 1024).toFixed(1)} KB</span>
            <span>{rawJsonText.split("\n").length} Lines</span>
            <button
              onClick={() => {
                try {
                  const p = JSON.parse(rawJsonText);
                  setRawJsonText(JSON.stringify(p, null, 2));
                } catch (e) {}
              }}
              className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1 font-sans"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Format JSON</span>
            </button>
          </div>

          {/* Textarea Editor */}
          <div className="flex-1 p-2 bg-gray-900 flex flex-col">
            <textarea
              value={rawJsonText}
              onChange={(e) => setRawJsonText(e.target.value)}
              className="w-full h-full min-h-[440px] p-2.5 font-mono text-xs bg-transparent text-gray-200 border-0 focus:outline-none resize-none leading-relaxed"
              placeholder="Paste raw FHIR JSON bundle here..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* CENTER BRIDGE: Action & Reduction Gauge */}
        <div className="lg:col-span-2 flex flex-col justify-center items-center gap-3 py-2">
          <div className="w-full p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 text-center shadow-xs flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md mb-2">
              <TrendingDown className="w-5 h-5" />
            </div>

            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              -{result.reductionPercentage}%
            </div>
            <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mt-0.5">
              Input-Token Reduction
            </div>

            <div className="mt-3 pt-3 border-t border-emerald-500/20 w-full space-y-1.5 text-[11px] text-left font-mono">
              <div className="flex justify-between text-gray-500">
                <span>Before:</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">{result.rawTokens}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>After:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{result.compressedTokens}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Spared:</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  {Math.max(0, result.rawTokens - result.compressedTokens)} tok
                </span>
              </div>
            </div>

            {/* Token ratio badge */}
            <div className="mt-3 w-full p-2 rounded-lg bg-blue-500/10 text-[10px] text-blue-800 dark:text-blue-300 font-sans font-semibold">
              ~{result.tokenMultiple}× fewer input tokens
            </div>

            {/* Fact Retention badge */}
            <div className="mt-1.5 w-full p-2 rounded-lg bg-purple-500/10 text-[10px] text-purple-800 dark:text-purple-300 font-sans flex items-center justify-between">
              <span>Facts Intact:</span>
              <span className="font-bold text-purple-700 dark:text-purple-300">
                {result.preservedFactsCount}/{result.totalFacts} ({result.factRetentionRate}%)
              </span>
            </div>

            {/* Budget status */}
            <div className="mt-1.5 w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-600 dark:text-gray-400 font-sans flex items-center justify-between">
              <span>Budget Usage:</span>
              <span className="font-bold font-mono text-gray-900 dark:text-white">
                {result.compressedTokens}/{tokenBudget} ({result.budgetUtilization}%)
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Output for LLM */}
        <div className="lg:col-span-5 rounded-2xl border border-emerald-500/30 bg-white dark:bg-gray-900 shadow-sm flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-emerald-500/20 bg-emerald-500/10 dark:bg-emerald-950/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-500 text-white flex items-center justify-center font-bold text-xs">
                2
              </div>
              <div>
                <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  OUTPUT: <span className="font-mono text-emerald-600 dark:text-emerald-400">namanfhirfold</span> Context
                </h3>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 italic">
                  Fold the structure. Keep every detail. • Provenance IDs (V1, O1, CP1)
                </p>
              </div>
            </div>

            {/* Token Badge */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-bold">
                {result.compressedTokens.toLocaleString()} LLM Tokens
              </span>
            </div>
          </div>

          {/* Sub-bar stats & actions */}
          <div className="px-3.5 py-1.5 bg-gray-50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between text-[11px] text-gray-500">
            <span className="font-mono">Granularity: {granularity}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-colors shadow-2xs"
              >
                {copiedPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPrompt ? "Copied!" : "Copy LLM Prompt"}</span>
              </button>
              <button
                onClick={handleDownload}
                title="Download file"
                className="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Output Syntax Viewer */}
          <div className="flex-1 p-2 bg-gray-950 flex flex-col">
            <pre className="w-full h-full min-h-[440px] p-2.5 font-mono text-xs text-emerald-300 overflow-auto whitespace-pre-wrap leading-relaxed select-text">
              <code>{result.compressedOutput}</code>
            </pre>
          </div>

          {/* Quick LLM Test Trigger Bar */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Verify accuracy on Gemini 3.8 Flash:
            </span>
            <button
              onClick={runQuickLlmTest}
              disabled={testingLlm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-2xs"
            >
              {testingLlm ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Inferring...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Test Prompt Live</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Live LLM Response Card if tested */}
      {llmResponse && (
        <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-500/20">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Live Gemini 3.8 Flash Clinical Answer (Verified on Optimized Input):</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-blue-700 dark:text-blue-300">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {llmResponse.latencyMs}ms
              </span>
              <span className="bg-blue-500/20 px-2 py-0.5 rounded font-bold">
                {llmResponse.tokens} total tokens used
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
            {llmResponse.answer}
          </div>
        </div>
      )}

      {llmError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{llmError}</span>
        </div>
      )}

      {/* Provenance Map Drawer */}
      <ProvenanceDrawer
        provenanceMap={result.provenanceMap}
        omittedCount={result.omittedCount}
        omittedNotice={result.omittedItemsNotice}
      />
    </div>
  );
};
