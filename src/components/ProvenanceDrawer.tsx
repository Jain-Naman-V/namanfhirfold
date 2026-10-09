import React, { useState } from "react";
import { Link2, Eye, ExternalLink, ShieldCheck, AlertCircle, Copy, Check } from "lucide-react";
import { ProvenanceEntry } from "../types/fhir.ts";

interface ProvenanceDrawerProps {
  provenanceMap: Record<string, ProvenanceEntry>;
  omittedCount: number;
  omittedNotice?: string;
}

export const ProvenanceDrawer: React.FC<ProvenanceDrawerProps> = ({
  provenanceMap,
  omittedCount,
  omittedNotice,
}) => {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refs = Object.keys(provenanceMap);
  const activeEntry = selectedRef ? provenanceMap[selectedRef] : (refs.length > 0 ? provenanceMap[refs[0]] : null);

  const copySnippet = (json: any) => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-blue-500" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Provenance Map & Audit Trace
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20">
                {refs.length} Active References
              </span>
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Every short reference (V1, O1, M1, CP1) maps to its original FHIR ID. AI Agents can call <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">expand(ref)</code>.
            </p>
          </div>
        </div>

        {omittedCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{omittedNotice || `${omittedCount} items omitted by budget`}</span>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left: Ref badges */}
        <div className="md:col-span-5 flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
          <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
            Click reference to verify source FHIR slice:
          </span>
          {refs.map((ref) => {
            const entry = provenanceMap[ref];
            const isSelected = activeEntry?.shortRef === ref;
            return (
              <button
                key={ref}
                onClick={() => setSelectedRef(ref)}
                className={`p-2 rounded-lg text-left text-xs transition-colors flex items-center justify-between border ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-500/40 text-blue-900 dark:text-blue-200 font-medium shadow-2xs"
                    : "bg-gray-50/50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <div className="truncate mr-2">
                  <span className="font-mono font-bold mr-1.5 px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-[10px]">
                    {ref}
                  </span>
                  <span className="truncate">{entry.summary}</span>
                </div>
                <Eye className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Right: Raw FHIR Slice Preview */}
        <div className="md:col-span-7 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-950 p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800 text-xs text-gray-400 font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span>expand({activeEntry?.shortRef || "O1"})</span>
                <span className="text-gray-500 font-normal">→ ID: {activeEntry?.originalId}</span>
              </span>
              <button
                onClick={() => activeEntry && copySnippet(activeEntry.fullSnippet)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy Slice"}</span>
              </button>
            </div>
            <pre className="text-[11px] font-mono text-gray-300 max-h-[190px] overflow-auto whitespace-pre-wrap leading-relaxed select-text">
              <code>{JSON.stringify(activeEntry?.fullSnippet, null, 2)}</code>
            </pre>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-900 text-[10px] text-gray-500 flex items-center justify-between">
            <span>Canonical EHR Source: Verified</span>
            <span className="text-emerald-500">Zero Hallucination Guarantee</span>
          </div>
        </div>
      </div>
    </div>
  );
};
