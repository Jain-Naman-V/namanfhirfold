/**
 * ClinContext FHIR - Task-Aware Context Optimizer & Provenance Engine
 * High-performance FHIR token compression based on FHIRBench, MedPrompt & FHIR-MCP.
 */

import React, { useState, useEffect } from "react";
import {
  SAMPLE_PAIN_SEVERITY,
  SAMPLE_CAREPLAN_SURGERY,
  SAMPLE_HEMOGLOBIN,
  SAMPLE_20_LAB_PANEL,
  SAMPLE_FULL_CDS_BUNDLE,
} from "./data/sampleFhirData.ts";
import { compressFhir } from "./services/fhirCompressor.ts";
import {
  CompressionFormat,
  CompressionOptions,
  CompressionResult,
  GranularityMode,
  CdsProfile,
} from "./types/fhir.ts";
import { MetricCard } from "./components/MetricCard.tsx";
import { FieldExplainer } from "./components/FieldExplainer.tsx";
import { LlmEvaluator } from "./components/LlmEvaluator.tsx";
import { BenchmarkMatrix } from "./components/BenchmarkMatrix.tsx";
import { ArchitectureDiagram } from "./components/ArchitectureDiagram.tsx";
import { CrateExporter } from "./components/CrateExporter.tsx";
import { PackageHub } from "./components/PackageHub.tsx";
import { SplitWorkbench } from "./components/SplitWorkbench.tsx";
import { DocsViewer } from "./components/DocsViewer.tsx";
import { FhirTabularViewer } from "./components/FhirTabularViewer.tsx";
import {
  Activity,
  Cpu,
  Table,
  BarChart3,
  Layers,
  Code2,
  Package,
  BookOpen,
} from "lucide-react";

type SampleKey = "pain" | "careplan" | "hemoglobin" | "20_labs" | "full_cds" | "custom";
type TabKey = "workbench" | "tabular_viewer" | "package_hub" | "docs" | "benchmark" | "architecture" | "rust_crate";

export default function App() {
  const [selectedSample, setSelectedSample] = useState<SampleKey>("pain");
  const [activeTab, setActiveTab] = useState<TabKey>("workbench");
  const [format, setFormat] = useState<CompressionFormat>("compact_json");
  const [granularity, setGranularity] = useState<GranularityMode>("exact_timestamp");
  const [profile, setProfile] = useState<CdsProfile>("free_query");
  const [tokenBudget, setTokenBudget] = useState<number>(800);
  const [queryFilter, setQueryFilter] = useState<string>("What was the patient's pain score?");
  const [onlyAbnormal, setOnlyAbnormal] = useState<boolean>(false);

  // Raw JSON input text (default to Pain Severity to verify vitalSigns categorization & exact timestamp!)
  const [rawJsonText, setRawJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_PAIN_SEVERITY, null, 2)
  );

  // Compression result state
  const [result, setResult] = useState<CompressionResult>(() => {
    return compressFhir(SAMPLE_PAIN_SEVERITY, {
      format: "compact_json",
      granularity: "exact_timestamp",
      profile: "free_query",
      tokenBudget: 800,
      queryFilter: "What was the patient's pain score?",
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
    if (sample === "pain") {
      newPayload = SAMPLE_PAIN_SEVERITY;
      setQueryFilter("What was the patient's pain score?");
      setGranularity("exact_timestamp");
    } else if (sample === "careplan") {
      newPayload = SAMPLE_CAREPLAN_SURGERY;
      setQueryFilter("What instructions were given in this CarePlan?");
      setGranularity("date_only");
    } else if (sample === "hemoglobin") {
      newPayload = SAMPLE_HEMOGLOBIN;
      setQueryFilter("");
      setGranularity("date_only");
    } else if (sample === "20_labs") {
      newPayload = SAMPLE_20_LAB_PANEL;
      setQueryFilter("");
      setGranularity("date_only");
    } else if (sample === "full_cds") {
      newPayload = SAMPLE_FULL_CDS_BUNDLE;
      setQueryFilter("");
      setGranularity("date_only");
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
        granularity,
        profile,
        tokenBudget,
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
  }, [rawJsonText, format, granularity, profile, tokenBudget, queryFilter, onlyAbnormal]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-orange-500/20 font-black">
                🦀
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-gray-900 dark:text-white tracking-tight font-mono">
                    namanfhirfold
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Rust • NPM • Python
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium italic">
                  Fold the structure. Keep every detail.
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs overflow-x-auto">
              {/* Tab 1: Split Workbench */}
              <button
                onClick={() => setActiveTab("workbench")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "workbench"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                <span>Split Workbench</span>
              </button>

              {/* Tab 2: Tabular Viewer (Chicago PCDC Style) */}
              <button
                onClick={() => setActiveTab("tabular_viewer")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "tabular_viewer"
                    ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Table className="w-3.5 h-3.5 text-indigo-500" />
                <span>Tabular Viewer</span>
              </button>

              {/* Tab 3: Package Hub */}
              <button
                onClick={() => setActiveTab("package_hub")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "package_hub"
                    ? "bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 font-bold shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Package className="w-3.5 h-3.5 text-amber-500" />
                <span>Publish & Packages</span>
              </button>

              {/* Tab 4: Docs */}
              <button
                onClick={() => setActiveTab("docs")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "docs"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                <span>Specs & Docs</span>
              </button>

              {/* Tab 5: Benchmark Matrix */}
              <button
                onClick={() => setActiveTab("benchmark")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "benchmark"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                <span>FHIRBench Matrix</span>
              </button>

              {/* Tab 6: CDS Pipeline */}
              <button
                onClick={() => setActiveTab("architecture")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "architecture"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>CDS Pipeline</span>
              </button>

              {/* Tab 7: Rust Crate */}
              <button
                onClick={() => setActiveTab("rust_crate")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                  activeTab === "rust_crate"
                    ? "bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-orange-500" />
                <span>Rust Crate</span>
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
              granularity={granularity}
              setGranularity={setGranularity}
              profile={profile}
              setProfile={setProfile}
              tokenBudget={tokenBudget}
              setTokenBudget={setTokenBudget}
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

        {/* Tab 2: Tabular Viewer (Chicago PCDC Style - With Category & Without Category) */}
        {activeTab === "tabular_viewer" && (
          <FhirTabularViewer
            rawJsonText={rawJsonText}
            result={result}
          />
        )}

        {/* Tab 3: Package & SDK Hub */}
        {activeTab === "package_hub" && (
          <PackageHub />
        )}

        {/* Tab 4: System Specifications & Documentation */}
        {activeTab === "docs" && (
          <DocsViewer />
        )}

        {/* Tab 5: FHIRBench Benchmark Matrix */}
        {activeTab === "benchmark" && (
          <BenchmarkMatrix rawTokens={result.rawTokens} />
        )}

        {/* Tab 6: Architecture Pipeline */}
        {activeTab === "architecture" && (
          <ArchitectureDiagram />
        )}

        {/* Tab 7: Rust & TS Crate Export */}
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
