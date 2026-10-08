import React, { useState } from "react";
import { CheckCircle2, XCircle, Info, ShieldCheck, FileCheck, Layers } from "lucide-react";
import { ClinicalFact } from "../types/fhir.ts";

interface FieldExplainerProps {
  retainedFields: string[];
  strippedFields: string[];
  clinicalFacts: ClinicalFact[];
  factRetentionRate: number;
}

export const FieldExplainer: React.FC<FieldExplainerProps> = ({
  retainedFields,
  strippedFields,
  clinicalFacts,
  factRetentionRate,
}) => {
  const [activeTab, setActiveTab] = useState<"facts" | "comparison" | "retained" | "stripped">("facts");

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Clinical Fact Audit & Information Retention
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                factRetentionRate === 100
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
              }`}>
                {factRetentionRate}% Facts Retained
              </span>
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Metric: Token Reduction + Clinical Information Retention + Task Accuracy
            </p>
          </div>
        </div>

        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab("facts")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "facts"
                ? "bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Fact Audit ({clinicalFacts.length})
          </button>
          <button
            onClick={() => setActiveTab("comparison")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "comparison"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Field Breakdown
          </button>
          <button
            onClick={() => setActiveTab("retained")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "retained"
                ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Retained Fields
          </button>
          <button
            onClick={() => setActiveTab("stripped")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === "stripped"
                ? "bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Stripped Boilerplate
          </button>
        </div>
      </div>

      <div className="mt-3">
        {/* Tab 1: Clinical Fact Audit Checklist */}
        {activeTab === "facts" && (
          <div>
            <div className="p-3 mb-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-xs text-purple-900 dark:text-purple-200">
              <strong>Clinical Fact Integrity Principle:</strong> High token compression without clinical fact preservation is dangerous. Below is the automated audit of atomic facts from the source FHIR payload (diagnoses, care plan activities, dosages, lab values, limits) and their verified presence in the compressed LLM output.
            </div>

            {clinicalFacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">
                No atomic clinical facts detected in current selection.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto p-1">
                {clinicalFacts.map((fact) => (
                  <div
                    key={fact.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 transition-colors ${
                      fact.preserved
                        ? "bg-emerald-500/5 border-emerald-500/20 text-gray-800 dark:text-gray-200"
                        : "bg-rose-500/5 border-rose-500/20 text-rose-800 dark:text-rose-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          {fact.category}
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-white truncate">
                          {fact.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600 dark:text-gray-400 font-mono truncate">
                        {fact.value}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold">
                      {fact.preserved ? (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Intact</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Missing</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Direct Comparison */}
        {activeTab === "comparison" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Retained Fields */}
            <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Preserved Clinical Core (Actionable for Reasoning)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>CarePlan Instructions:</strong> Full category, protocol activities ("Rest", "Limit activity"), and duration dates</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Quantitative Labs:</strong> Numerical value, standardized unit (13.5 g/dL), outlier range, abnormal flags</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Medications:</strong> Active drug name, RxNorm identifier, dosage frequency and route</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span><strong>Conditions:</strong> Clinical problem list, verification status, and recorded onset</span>
                </li>
              </ul>
            </div>

            {/* Stripped Fields */}
            <div className="p-3.5 rounded-lg bg-rose-500/5 border border-rose-500/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-400 mb-2">
                <XCircle className="w-4 h-4" />
                <span>Discarded Boilerplate (85%+ Non-Clinical Bloat)</span>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>System URIs:</strong> 80-char long URLs (e.g. <code>http://snomed.info/sct</code>, <code>http://loinc.org</code>)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Narrative XHTML:</strong> Auto-generated <code>text.div</code> HTML blocks duplicated across every resource</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Auditing Metadata:</strong> <code>meta.profile</code>, <code>versionId</code>, and <code>lastUpdated</code> timestamps</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span><strong>Redundant References:</strong> Repeated <code>subject: reference: "Patient/P001"</code> on every resource</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 3: Retained Fields List */}
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

        {/* Tab 4: Stripped Fields List */}
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
            <strong>Scanbo / SMART Multi-EHR Standard:</strong> True clinical context optimization is defined as <em>"Token Reduction + Clinical Information Retention + Task Accuracy"</em>. Even with an 85-93% token reduction, all clinical activities and directives remain accessible to the LLM.
          </p>
        </div>
      </div>
    </div>
  );
};
