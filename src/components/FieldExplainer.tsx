import React, { useState } from "react";
import { CheckCircle2, XCircle, Info, ShieldCheck, Sparkles } from "lucide-react";

interface FieldExplainerProps {
  retainedFields: string[];
  strippedFields: string[];
}

export const FieldExplainer: React.FC<FieldExplainerProps> = ({
  retainedFields,
  strippedFields,
}) => {
  const [activeTab, setActiveTab] = useState<"comparison" | "retained" | "stripped">("comparison");

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Clinical Fidelity & Field Selection Protocol
          </h3>
        </div>
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setActiveTab("comparison")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "comparison"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Direct Breakdown
          </button>
          <button
            onClick={() => setActiveTab("retained")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "retained"
                ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Retained ({retainedFields.length})
          </button>
          <button
            onClick={() => setActiveTab("stripped")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "stripped"
                ? "bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 shadow-xs"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Stripped ({strippedFields.length})
          </button>
        </div>
      </div>

      <div className="mt-3">
        {activeTab === "comparison" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Retained Fields */}
            <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Retained Clinical Core (Preserved 100%)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Concept & Code:</strong> Clean test/drug name & normalized LOINC/RxNorm identifier</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Quantitative Value:</strong> Magnitude and standard unit (e.g. 13.5 g/dL)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Reference Limits:</strong> Low & high reference range for outlier detection</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Interpretation Flag:</strong> Critical abnormal tags (High, Low, Stage 2)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Temporal Context:</strong> Effective date in compact ISO format (YYYY-MM-DD)</span>
                </li>
              </ul>
            </div>

            {/* Stripped Fields */}
            <div className="p-3.5 rounded-lg bg-rose-500/5 border border-rose-500/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-400 mb-2">
                <XCircle className="w-4 h-4" />
                <span>Discarded Boilerplate (85%+ Token Bloat)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>System URLs:</strong> "http://loinc.org" or "http://unitsofmeasure.org" 80-char URIs</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Structural Metadata:</strong> <code>meta.profile</code>, <code>versionId</code>, and <code>lastUpdated</code> timestamps</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Redundant References:</strong> Repeated <code>subject: reference: "Patient/P001"</code> across every observation</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Narrative XHTML:</strong> <code>text.div</code> auto-generated duplicate HTML snippets</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Bundle Wrappers:</strong> <code>fullUrl: "urn:uuid:..."</code>, <code>search.mode</code>, <code>entry[]</code> boilerplate</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === "retained" && (
          <div className="space-y-1.5">
            {retainedFields.map((field, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2.5 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-mono">{field}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "stripped" && (
          <div className="space-y-1.5">
            {strippedFields.map((field, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2.5 rounded-md bg-rose-500/10 text-rose-800 dark:text-rose-300">
                <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="font-mono">{field}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p>
            <strong>Core Architecture Insight:</strong> FHIR remains the canonical source-of-truth in your EHR/SMART server. The Context Optimizer acts as an intelligent pre-CDS/pre-LLM proxy, generating an information-dense representation only when transmitting to AI inference.
          </p>
        </div>
      </div>
    </div>
  );
};
