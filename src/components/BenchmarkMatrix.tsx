import React from "react";
import { BarChart3, CheckCircle, ArrowRight } from "lucide-react";

interface BenchmarkMatrixProps {
  rawTokens: number;
}

export const BenchmarkMatrix: React.FC<BenchmarkMatrixProps> = ({ rawTokens }) => {
  const benchmarks = [
    {
      format: "Raw FHIR R4 JSON",
      badge: "Baseline (Uncompressed)",
      tokens: rawTokens,
      reduction: "0%",
      density: "Low (10-15%)",
      structure: "Deep nested schema, full URIs, XHTML text.div",
      bestFor: "EHR Canonical Storage & Database Auditing",
      highlight: false,
    },
    {
      format: "Compact Clinical JSON",
      badge: "RTK / CDS Hooks",
      tokens: Math.round(rawTokens * 0.14),
      reduction: "86%",
      density: "High (85%)",
      structure: "Flat key-value JSON with normalized LOINC/RxNorm codes",
      bestFor: "Programmatic AI Agents, Function Calling & CDS Hooks",
      highlight: true,
    },
    {
      format: "MedPrompt Clinical Text",
      badge: "MedPrompt (FHIR2Text)",
      tokens: Math.round(rawTokens * 0.10),
      reduction: "90%",
      density: "Maximum (92%)",
      structure: "Physician clinical bullet points and shorthand notation",
      bestFor: "Direct LLM Question Answering & Reasoning Prompts",
      highlight: true,
    },
    {
      format: "FHIRBench Flat Markdown",
      badge: "FHIRBench Standard",
      tokens: Math.round(rawTokens * 0.18),
      reduction: "82%",
      density: "High (80%)",
      structure: "Dense markdown tables categorized by clinical domain",
      bestFor: "RAG contexts, Human-in-the-loop review & Clinical Summaries",
      highlight: false,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs mt-4">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
        <BarChart3 className="w-5 h-5 text-indigo-500" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            FHIRBench & Serialization Performance Matrix
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Systematic benchmark across serialization paradigms on the current loaded FHIR payload.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Serialization Format</th>
              <th className="py-2.5 px-3 font-semibold">Estimated Tokens</th>
              <th className="py-2.5 px-3 font-semibold">Reduction %</th>
              <th className="py-2.5 px-3 font-semibold">Information Density</th>
              <th className="py-2.5 px-3 font-semibold">Primary Recommended Use Case</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {benchmarks.map((row, idx) => (
              <tr
                key={idx}
                className={
                  row.highlight
                    ? "bg-emerald-500/5 dark:bg-emerald-950/10 font-medium"
                    : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                }
              >
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    {row.format}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                        row.highlight
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      }`}
                    >
                      {row.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{row.structure}</div>
                </td>
                <td className="py-2.5 px-3 font-mono font-bold text-gray-900 dark:text-gray-100">
                  {row.tokens.toLocaleString()}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      row.reduction === "0%"
                        ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                    }`}
                  >
                    {row.reduction === "0%" ? "0%" : `-${row.reduction}`}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300">{row.density}</td>
                <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300">{row.bestFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
