import React, { useState, useMemo } from "react";
import {
  Table,
  Search,
  Filter,
  Download,
  Copy,
  Check,
  Layers,
  List,
  Eye,
  CheckCircle2,
  AlertCircle,
  Activity,
  Pill,
  HeartPulse,
  FlaskConical,
  FileCheck,
  ShieldAlert,
  Calendar,
  Code2,
} from "lucide-react";
import { CompressionResult, ProvenanceEntry } from "../types/fhir.ts";

interface FhirTabularViewerProps {
  rawJsonText: string;
  result: CompressionResult;
}

interface FlattenedRow {
  id: string;
  ref: string;
  resourceType: string;
  category: string;
  name: string;
  code: string;
  value: string;
  referenceRange?: string;
  flag?: string;
  status: string;
  dateTime: string;
  rawSnippet: any;
}

export const FhirTabularViewer: React.FC<FhirTabularViewerProps> = ({
  rawJsonText,
  result,
}) => {
  const [viewMode, setViewMode] = useState<"with_category" | "without_category">("with_category");
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyAbnormalFilter, setOnlyAbnormalFilter] = useState<boolean>(false);
  const [selectedRawRow, setSelectedRawRow] = useState<FlattenedRow | null>(null);
  const [copiedRaw, setCopiedRaw] = useState<boolean>(false);
  const [copiedCsv, setCopiedCsv] = useState<boolean>(false);

  // Flatten parsed FHIR resources into tabular rows
  const allRows: FlattenedRow[] = useMemo(() => {
    let parsed: any;
    try {
      parsed = JSON.parse(rawJsonText);
    } catch (e) {
      return [];
    }

    const resources: any[] = [];
    if (parsed.resourceType === "Bundle" && Array.isArray(parsed.entry)) {
      parsed.entry.forEach((e: any) => {
        if (e.resource) resources.push(e.resource);
      });
    } else if (parsed.resourceType) {
      resources.push(parsed);
    }

    const rows: FlattenedRow[] = [];
    let idx = 1;

    resources.forEach((res) => {
      const rt = res.resourceType;
      const origId = res.id || `res-${idx}`;

      // Find matching short ref from result provenance
      let ref = `R${idx}`;
      for (const [k, v] of Object.entries(result.provenanceMap || {})) {
        if (v.originalId === origId) {
          ref = k;
          break;
        }
      }

      if (rt === "Patient") {
        let name = "Patient";
        if (res.name && res.name[0]) {
          const n = res.name[0];
          name = `${Array.isArray(n.given) ? n.given.join(" ") : n.given || ""} ${n.family || ""}`.trim();
        }
        rows.push({
          id: origId,
          ref,
          resourceType: "Patient",
          category: "Demographics",
          name: name || origId,
          code: res.gender ? `Gender: ${res.gender}` : "—",
          value: res.birthDate ? `DOB: ${res.birthDate}` : "—",
          status: "active",
          dateTime: res.birthDate || "—",
          rawSnippet: res,
        });
      } else if (rt === "Observation") {
        // Check Vital Signs vs Laboratory
        const isVital =
          (res.category && JSON.stringify(res.category).toLowerCase().includes("vital")) ||
          [
            "72514-3", "85354-9", "8480-6", "8462-4", "8867-4",
            "9279-1", "8310-5", "59408-5", "29463-7", "8302-2", "39156-5"
          ].includes(res.code?.coding?.[0]?.code || "");

        const testName = res.code?.text || res.code?.coding?.[0]?.display || res.code?.coding?.[0]?.code || "Observation";
        const codeStr = res.code?.coding?.[0]?.code ? `LOINC:${res.code.coding[0].code}` : "—";
        let valStr = "";

        if (res.valueQuantity) {
          valStr = `${res.valueQuantity.value} ${res.valueQuantity.unit || res.valueQuantity.code || ""}`.trim();
        } else if (res.valueString) {
          valStr = res.valueString;
        } else if (res.component && Array.isArray(res.component)) {
          valStr = res.component
            .map((c: any) => `${c.code?.coding?.[0]?.display || c.code?.text}: ${c.valueQuantity?.value} ${c.valueQuantity?.unit || ""}`)
            .join(", ");
        }

        let flag: string | undefined = undefined;
        if (res.interpretation && res.interpretation[0]) {
          flag = res.interpretation[0].coding?.[0]?.code || res.interpretation[0].coding?.[0]?.display || res.interpretation[0].text;
        }

        let refRange = "—";
        if (res.referenceRange && res.referenceRange[0]) {
          const r = res.referenceRange[0];
          if (r.text) refRange = r.text;
          else if (r.low && r.high) refRange = `${r.low.value}-${r.high.value} ${r.low.unit || ""}`;
          else if (r.low) refRange = `>${r.low.value} ${r.low.unit || ""}`;
          else if (r.high) refRange = `<${r.high.value} ${r.high.unit || ""}`;
        }

        rows.push({
          id: origId,
          ref,
          resourceType: "Observation",
          category: isVital ? "Vital Signs" : "Laboratory",
          name: testName,
          code: codeStr,
          value: valStr || "—",
          referenceRange: refRange,
          flag: flag,
          status: res.status || "final",
          dateTime: res.effectiveDateTime || res.issued || "—",
          rawSnippet: res,
        });
      } else if (rt === "CarePlan") {
        const cat = res.category?.[0]?.text || res.category?.[0]?.coding?.[0]?.display || res.title || "Care Plan";
        const activities = (res.activity || [])
          .map((a: any) => a.detail?.description || a.detail?.code?.text || a.detail?.code?.coding?.[0]?.display)
          .filter(Boolean)
          .join(" | ");

        const period = res.period ? `${res.period.start || ""} to ${res.period.end || ""}` : "—";

        rows.push({
          id: origId,
          ref,
          resourceType: "CarePlan",
          category: "Care Plans",
          name: cat,
          code: res.intent ? `Intent: ${res.intent}` : "—",
          value: activities || "Routine Care Protocol",
          referenceRange: period !== "—" ? `Period: ${period}` : "—",
          status: res.status || "active",
          dateTime: res.period?.start || "—",
          rawSnippet: res,
        });
      } else if (rt.startsWith("Medication")) {
        const drug = res.medicationCodeableConcept?.text || res.medicationCodeableConcept?.coding?.[0]?.display || res.medicationReference?.display || "Medication";
        const code = res.medicationCodeableConcept?.coding?.[0]?.code ? `RxNorm:${res.medicationCodeableConcept.coding[0].code}` : "—";
        const sig = res.dosageInstruction?.[0]?.text || (res.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value ? `${res.dosageInstruction[0].doseAndRate[0].doseQuantity.value} ${res.dosageInstruction[0].doseAndRate[0].doseQuantity.unit || ""}` : "As directed");

        rows.push({
          id: origId,
          ref,
          resourceType: "MedicationRequest",
          category: "Medications",
          name: drug,
          code: code,
          value: sig,
          status: res.status || "active",
          dateTime: res.authoredOn || "—",
          rawSnippet: res,
        });
      } else if (rt === "Condition") {
        const diag = res.code?.text || res.code?.coding?.[0]?.display || "Condition";
        const code = res.code?.coding?.[0]?.code ? `SNOMED:${res.code.coding[0].code}` : "—";
        const stat = res.clinicalStatus?.coding?.[0]?.code || res.clinicalStatus?.text || "active";

        rows.push({
          id: origId,
          ref,
          resourceType: "Condition",
          category: "Conditions",
          name: diag,
          code: code,
          value: `Verification: ${res.verificationStatus?.coding?.[0]?.code || "confirmed"}`,
          status: stat,
          dateTime: res.onsetDateTime || res.recordedDate || "—",
          rawSnippet: res,
        });
      } else if (rt === "AllergyIntolerance") {
        const allergen = res.code?.text || res.code?.coding?.[0]?.display || "Allergen";
        const code = res.code?.coding?.[0]?.code ? `Code:${res.code.coding[0].code}` : "—";
        const reaction = res.reaction?.map((r: any) => r.manifestation?.[0]?.text || r.manifestation?.[0]?.coding?.[0]?.display).join(", ") || "Reaction noted";

        rows.push({
          id: origId,
          ref,
          resourceType: "AllergyIntolerance",
          category: "Allergies",
          name: allergen,
          code: code,
          value: reaction,
          flag: res.criticality || "High",
          status: res.clinicalStatus?.coding?.[0]?.code || "active",
          dateTime: res.recordedDate || "—",
          rawSnippet: res,
        });
      } else {
        rows.push({
          id: origId,
          ref,
          resourceType: rt,
          category: "Other Resources",
          name: res.name || res.title || res.code?.text || rt,
          code: "—",
          value: res.description || "—",
          status: res.status || "—",
          dateTime: "—",
          rawSnippet: res,
        });
      }

      idx++;
    });

    return rows;
  }, [rawJsonText, result]);

  // Categories list & counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allRows.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return counts;
  }, [allRows]);

  const categories = Object.keys(categoryCounts);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      // Category filter (in With Category mode)
      if (viewMode === "with_category" && activeCategoryTab !== "all" && row.category !== activeCategoryTab) {
        return false;
      }

      // Abnormal filter
      if (onlyAbnormalFilter) {
        const hasAbnormalFlag = row.flag && !["n", "normal"].includes(row.flag.toLowerCase());
        const isCriticalAllergy = row.category === "Allergies" && row.flag?.toLowerCase().includes("high");
        if (!hasAbnormalFlag && !isCriticalAllergy) return false;
      }

      // Search query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          row.name.toLowerCase().includes(q) ||
          row.code.toLowerCase().includes(q) ||
          row.value.toLowerCase().includes(q) ||
          row.category.toLowerCase().includes(q) ||
          row.resourceType.toLowerCase().includes(q) ||
          row.ref.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [allRows, viewMode, activeCategoryTab, onlyAbnormalFilter, searchQuery]);

  // Export to CSV
  const exportCsv = () => {
    const headers = ["Ref", "ResourceType", "Category", "Clinical Concept", "Code", "Value / Detail", "Ref Range", "Flag", "Status", "Date / Time"];
    const csvLines = [headers.join(",")];

    filteredRows.forEach((r) => {
      const line = [
        `"${r.ref}"`,
        `"${r.resourceType}"`,
        `"${r.category}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.code}"`,
        `"${r.value.replace(/"/g, '""')}"`,
        `"${(r.referenceRange || "").replace(/"/g, '""')}"`,
        `"${r.flag || ""}"`,
        `"${r.status}"`,
        `"${r.dateTime}"`,
      ];
      csvLines.push(line.join(","));
    });

    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fhir_tabular_export_${viewMode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyCsvToClipboard = () => {
    const headers = ["Ref", "ResourceType", "Category", "Clinical Concept", "Code", "Value / Detail", "Ref Range", "Flag", "Status", "Date / Time"];
    const csvLines = [headers.join("\t")];

    filteredRows.forEach((r) => {
      csvLines.push([r.ref, r.resourceType, r.category, r.name, r.code, r.value, r.referenceRange || "", r.flag || "", r.status, r.dateTime].join("\t"));
    });

    navigator.clipboard.writeText(csvLines.join("\n"));
    setCopiedCsv(true);
    setTimeout(() => setCopiedCsv(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col">
      {/* Top Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                FHIR Resource Tabular Viewer
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                Chicago PCDC Standard
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Interactive data exploration: flattens nested FHIR bundles into readable tables.
            </p>
          </div>
        </div>

        {/* Action Controls: View Mode Toggle (With Category vs Without Category) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-gray-200 dark:bg-gray-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setViewMode("with_category")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                viewMode === "with_category"
                  ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>With Category</span>
            </button>
            <button
              onClick={() => setViewMode("without_category")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                viewMode === "without_category"
                  ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Without Category (Unified)</span>
            </button>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors border border-gray-200 dark:border-gray-700 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={copyCsvToClipboard}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors border border-gray-200 dark:border-gray-700 shadow-2xs"
            >
              {copiedCsv ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCsv ? "Copied" : "Copy TSV"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Category Sub-Toolbar */}
      <div className="p-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full max-w-sm">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search concept, code, value, date..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Filter checkbox and row count */}
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAbnormalFilter}
              onChange={(e) => setOnlyAbnormalFilter(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-700"
            />
            <span>Show Abnormal / Critical Flags Only</span>
          </label>
          <span className="font-mono text-gray-500 font-medium">
            Showing {filteredRows.length} of {allRows.length} rows
          </span>
        </div>
      </div>

      {/* Category Pills (Visible when in "With Category" mode) */}
      {viewMode === "with_category" && (
        <div className="px-3 py-2 bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-200 dark:border-gray-800 flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveCategoryTab("all")}
            className={`px-3 py-1 rounded-lg font-medium transition-colors shrink-0 ${
              activeCategoryTab === "all"
                ? "bg-indigo-600 text-white shadow-2xs font-bold"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100"
            }`}
          >
            All Resources ({allRows.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategoryTab(cat)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                activeCategoryTab === cat
                  ? "bg-indigo-600 text-white shadow-2xs font-bold"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100"
              }`}
            >
              <span>{cat}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                {categoryCounts[cat]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto max-h-[560px]">
        {filteredRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-gray-400" />
            <p className="font-medium">No FHIR resources match the current filter.</p>
            <p className="text-[11px] text-gray-400">Try clearing the search query or switching category tabs.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="py-2.5 px-3 font-bold w-12 text-center">Ref</th>
                <th className="py-2.5 px-3 font-bold">Clinical Concept / Item</th>
                <th className="py-2.5 px-3 font-bold">Standard Code</th>
                <th className="py-2.5 px-3 font-bold">Value / Direction</th>
                <th className="py-2.5 px-3 font-bold">Ref Range / Period</th>
                <th className="py-2.5 px-3 font-bold">Flag</th>
                <th className="py-2.5 px-3 font-bold">Status</th>
                <th className="py-2.5 px-3 font-bold">Effective Date / Time</th>
                {viewMode === "without_category" && (
                  <th className="py-2.5 px-3 font-bold">Category</th>
                )}
                <th className="py-2.5 px-3 font-bold text-center w-16">Raw JSON</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 font-sans">
              {filteredRows.map((row) => {
                const isAbnormal = row.flag && !["n", "normal"].includes(row.flag.toLowerCase());
                return (
                  <tr
                    key={row.id + row.ref}
                    className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors ${
                      isAbnormal ? "bg-amber-50/20 dark:bg-amber-950/10" : ""
                    }`}
                  >
                    {/* Ref Tag */}
                    <td className="py-2 px-3 text-center">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                        {row.ref}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="py-2 px-3">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {row.name}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {row.resourceType}/{row.id}
                      </div>
                    </td>

                    {/* Code */}
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                      {row.code}
                    </td>

                    {/* Value */}
                    <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">
                      {row.value}
                    </td>

                    {/* Reference Range */}
                    <td className="py-2 px-3 text-gray-500 font-mono text-[11px]">
                      {row.referenceRange || "—"}
                    </td>

                    {/* Flag */}
                    <td className="py-2 px-3">
                      {row.flag ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            isAbnormal
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {row.flag}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[10px]">Normal</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2 px-3">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {row.status}
                      </span>
                    </td>

                    {/* DateTime */}
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {row.dateTime}
                    </td>

                    {/* Category (if without_category mode) */}
                    {viewMode === "without_category" && (
                      <td className="py-2 px-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium">
                          {row.category}
                        </span>
                      </td>
                    )}

                    {/* Raw JSON trigger */}
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => setSelectedRawRow(row)}
                        title="View Raw FHIR JSON"
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Raw JSON Inspection Modal */}
      {selectedRawRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-gray-900 text-gray-100 rounded-2xl border border-gray-800 w-full max-w-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-3.5 border-b border-gray-800 flex items-center justify-between bg-gray-950">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span>Raw FHIR Slice: {selectedRawRow.resourceType}/{selectedRawRow.id}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  Ref: {selectedRawRow.ref}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedRawRow.rawSnippet, null, 2));
                    setCopiedRaw(true);
                    setTimeout(() => setCopiedRaw(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  {copiedRaw ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedRaw ? "Copied" : "Copy JSON"}</span>
                </button>
                <button
                  onClick={() => setSelectedRawRow(null)}
                  className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1 font-mono text-xs text-emerald-300 leading-relaxed bg-gray-950 select-text">
              <pre>
                <code>{JSON.stringify(selectedRawRow.rawSnippet, null, 2)}</code>
              </pre>
            </div>

            <div className="p-3 border-t border-gray-800 bg-gray-950 text-xs text-gray-400 flex items-center justify-between">
              <span>Category: <strong>{selectedRawRow.category}</strong></span>
              <button
                onClick={() => setSelectedRawRow(null)}
                className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
