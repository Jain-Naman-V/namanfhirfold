/**
 * ClinContext FHIR - LLM Token & Context Optimizer
 * High-performance FHIR token compression engine based on FHIRBench, MedPrompt & FHIR-MCP.
 */

import React, { useState, useEffect } from "react";
import {
  SAMPLE_CAREPLAN_SURGERY,
  SAMPLE_HEMOGLOBIN,
  SAMPLE_20_LAB_PANEL,
  SAMPLE_FULL_CDS_BUNDLE,
} from "./data/sampleFhirData.ts";
import { compressFhir } from "./services/fhirCompressor.ts";
import { CompressionFormat, CompressionOptions, CompressionResult } from "./types/fhir.ts";
import { MetricCard } from "./components/MetricCard.tsx";
import { FieldExplainer } from "./components/FieldExplainer.tsx";
import { LlmEvaluator } from "./components/LlmEvaluator.tsx";
import { BenchmarkMatrix } from "./components/BenchmarkMatrix.tsx";
import { ArchitectureDiagram } from "./components/ArchitectureDiagram.tsx";
import { CrateExporter } from "./components/CrateExporter.tsx";
import { PackageHub } from "./components/PackageHub.tsx";
import { SplitWorkbench } from "./components/SplitWorkbench.tsx";
import {
  Activity,
  Cpu,
  BarChart3,
  Layers,
  Code2,
  Package,
} from "lucide-react";

type SampleKey = "careplan" | "hemoglobin" | "20_labs" | "full_cds" | "custom";
type TabKey = "workbench" | "package_hub" | "benchmark" | "architecture" | "rust_crate";

export default function App() {
  const [selectedSample, setSelectedSample] = useState<SampleKey>("careplan");
  const [activeTab, setActiveTab] = useState<TabKey>("workbench");
  const [format, setFormat] = useState<CompressionFormat>("compact_json");
  const [queryFilter, setQueryFilter] = useState<string>("");
  const [onlyAbnormal, setOnlyAbnormal] = useState<boolean>(false);

  // Raw JSON input text (default to CarePlan to verify the user's exact scenario!)
  const [rawJsonText, setRawJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_CAREPLAN_SURGERY, null, 2)
  );

  // Compression result state
  const [result, setResult] = useState<CompressionResult>(() => {
    return compressFhir(SAMPLE_CAREPLAN_SURGERY, {
      format: "compact_json",
      stripMeta: true,
      stripNarrativeText: true,
      normalizeCodingSystems: true,
      stripRedundantReferences: true,
      stripCategory: true,
    });
  });

  // Handle sample selection
  const handleSelectSample = (sample: SampleKey) => {
    setSelectedSample(sample);
    let newPayload: any;
    if (sample === "careplan") {
      newPayload = SAMPLE_CAREPLAN_SURGERY;
      setQueryFilter("");
    } else if (sample === "hemoglobin") {
      newPayload = SAMPLE_HEMOGLOBIN;
      setQueryFilter("");
    } else if (sample === "20_labs") {
      newPayload = SAMPLE_20_LAB_PANEL;
      setQueryFilter("");
    } else if (sample === "full_cds") {
      newPayload = SAMPLE_FULL_CDS_BUNDLE;
      setQueryFilter("");
    } else {
      return;
    }
    const formatted = JSON.stringify(newPayload, null, 2);
    setRawJsonText(formatted);
  };

  // Re-run compression when text or options change
  useEffect(() => {
    try {
      const opts: CompressionOptions = {
        format,
        stripMeta: true,
        stripNarrativeText: true,
        normalizeCodingSystems: true,
        stripRedundantReferences: true,
        stripCategory: true,
        queryFilter,
        onlyAbnormalLabs: onlyAbnormal,
      };
      const res = compressFhir(rawJsonText, opts);
      setResult(res);
    } catch (err) {
      // keep previous valid result while typing invalid JSON
    }
  }, [rawJsonText, format, queryFilter, onlyAbnormal]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
                    ClinContext FHIR
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Token Reducer & Fact Preserver
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Left: Raw FHIR Bundle → Right: Optimized Context (Token Reduction + 100% Fact Retention)
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs overflow-x-auto">
              <button
                onClick={() => setActiveTab("workbench")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "workbench"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                <span>Split Workbench</span>
              </button>
              <button
                onClick={() => setActiveTab("package_hub")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "package_hub"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Package className="w-3.5 h-3.5 text-amber-500" />
                <span>NPM / Rust Package</span>
              </button>
              <button
                onClick={() => setActiveTab("benchmark")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "benchmark"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                <span>FHIRBench Matrix</span>
              </button>
              <button
                onClick={() => setActiveTab("architecture")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "architecture"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>CDS Pipeline</span>
              </button>
              <button
                onClick={() => setActiveTab("rust_crate")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "rust_crate"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-purple-500" />
                <span>Crate Code</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex-1 w-full space-y-4">
        {/* Dynamic Metric Cards */}
        <MetricCard
          rawTokens={result.rawTokens}
          compressedTokens={result.compressedTokens}
          reductionPercentage={result.reductionPercentage}
          tokenMultiple={result.tokenMultiple}
          rawChars={result.rawCharCount}
          compressedChars={result.compressedCharCount}
          factRetentionRate={result.factRetentionRate}
          preservedFactsCount={result.preservedFactsCount}
          totalFacts={result.totalFacts}
        />

        {/* Tab 1: Split Workbench */}
        {activeTab === "workbench" && (
          <div className="space-y-4">
            <SplitWorkbench
              rawJsonText={rawJsonText}
              setRawJsonText={setRawJsonText}
              result={result}
              format={format}
              setFormat={setFormat}
              queryFilter={queryFilter}
              setQueryFilter={setQueryFilter}
              onlyAbnormal={onlyAbnormal}
              setOnlyAbnormal={setOnlyAbnormal}
              onSelectSample={handleSelectSample}
              selectedSample={selectedSample}
            />

            {/* Field Explainer & Clinical Fact Auditor */}
            <FieldExplainer
              retainedFields={result.retainedFields}
              strippedFields={result.strippedFields}
              clinicalFacts={result.clinicalFacts}
              factRetentionRate={result.factRetentionRate}
            />

            {/* Live LLM Evaluator */}
            <LlmEvaluator
              rawJson={result.rawJson}
              compressedOutput={result.compressedOutput}
              queryFilter={queryFilter}
            />
          </div>
        )}

        {/* Tab 2: Package & SDK Hub */}
        {activeTab === "package_hub" && (
          <PackageHub />
        )}

        {/* Tab 3: FHIRBench Benchmark Matrix */}
        {activeTab === "benchmark" && (
          <BenchmarkMatrix rawTokens={result.rawTokens} />
        )}

        {/* Tab 4: Architecture Pipeline */}
        {activeTab === "architecture" && (
          <ArchitectureDiagram />
        )}

        {/* Tab 5: Rust & TS Crate Export */}
        {activeTab === "rust_crate" && (
          <CrateExporter />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
        ClinContext Engine • Standardized Metric: Token Reduction + Clinical Information Retention + Task Accuracy
      </footer>
    </div>
  );
}
