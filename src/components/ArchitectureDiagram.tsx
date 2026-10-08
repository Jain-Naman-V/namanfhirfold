import React from "react";
import { Layers, ArrowDown, Database, Cpu, Brain, CheckCircle2, ShieldAlert } from "lucide-react";

export const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs mt-4">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
        <Layers className="w-5 h-5 text-blue-500" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            End-to-End CDS & LLM Gateway Architecture
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How the ClinContext Token Reducer integrates between EHR / FHIR servers and Clinical Decision Support (CDS) pipelines.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col md:flex-row items-stretch justify-between gap-3 text-xs">
        {/* Step 1: EHR Source */}
        <div className="flex-1 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white mb-1.5">
              <Database className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span>1. EHR / SMART Server</span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              Canonical FHIR R4 repository (Epic, Cerner, HAPI FHIR).
            </p>
            <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-[11px] text-rose-800 dark:text-rose-300 font-mono">
              Raw Bundle: 5,000–25,000 Tokens<br />
              • Huge JSON syntax bloat<br />
              • XHTML narrative text.div<br />
              • Redundant coding systems
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden md:flex items-center justify-center text-gray-400">
          <span className="text-lg">→</span>
        </div>

        {/* Step 2: Context Optimizer */}
        <div className="flex-1 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300 mb-1.5">
              <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>2. RTK Token Compressor</span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Zero-copy Rust/TS microservice or edge proxy before CDS ingestion.
            </p>
            <ul className="space-y-1 text-[11px] text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span><strong>Intent Filter:</strong> Select relevant resources</span>
              </li>
              <li className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span><strong>Field Pruning:</strong> Discards meta, URIs & wrappers</span>
              </li>
              <li className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span><strong>Clinical Retention:</strong> 100% Values, Units & Flags</span>
              </li>
            </ul>
          </div>
          <div className="mt-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            ⚡ &lt;1.5ms Latency • -85% to -92% Tokens
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden md:flex items-center justify-center text-gray-400">
          <span className="text-lg">→</span>
        </div>

        {/* Step 3: CDS & LLM Delivery */}
        <div className="flex-1 p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300 mb-1.5">
              <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>3. CDS Hooks & LLM Inference</span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              High-speed reasoning without prompt attention dilution.
            </p>
            <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300">
              <strong>High Throughput:</strong><br />
              • Fits within strict hospital 500ms timeout<br />
              • 10x cheaper token costs<br />
              • Zero "lost-in-the-middle" hallucinations
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
