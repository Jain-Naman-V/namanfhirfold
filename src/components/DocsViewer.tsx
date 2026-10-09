import React, { useState } from "react";
import { BookOpen, FileText, Layers, Package, Copy, Check } from "lucide-react";

export const DocsViewer: React.FC = () => {
  const [selectedDoc, setSelectedDoc] = useState<"readme" | "architecture" | "product">("readme");
  const [copied, setCopied] = useState(false);

  // Markdown contents
  const docContents = {
    readme: `# ClinContext FHIR (fhirctx)
### Task-Aware Clinical Context Optimizer & Token Reducer for Healthcare AI & CDS Hooks

"Don't just blindly serialize FHIR. Dynamically select what to retrieve, what granularity to preserve, and how to serialize it based on the clinical task."

## The Problem
- Raw FHIR Observation: 248 tokens for 15 words of clinical facts.
- 20-Lab Metabolic Panel: 4,200 tokens.
- Inpatient Stay Bundle: 12,000–35,000 tokens.
- Why universal compressors fail: Dropping care plan activities, confusing pain scores for lab tests, and losing acute timestamps.

## The Triad Metric Guarantee
Evaluation = Token Reduction + Clinical Fact Retention (100%) + Task Accuracy
- Pain Severity Observation: 248 → 27 tokens (~9.2× fewer input tokens, 100% facts intact)
- CarePlan Post-Op: 593 → 82 tokens (~7.2× fewer input tokens, 100% facts intact)
- 20-Lab Panel: 4,200 → 280 tokens (~15.0× fewer input tokens)

## Key Capabilities
1. Semantic Disambiguation: Vital Signs (Pain, BP) vs Laboratory (CBC, Renal).
2. Granularity Control: Exact Timestamp (18:21:10) vs Date-Only (YYYY-MM-DD).
3. Deterministic CDS Profiles: medication-prescribe, vitals_monitor, patient_view.
4. Guaranteed Safety Set: Allergies, Active Meds, Critical Outliers never dropped.
5. Provenance Map: Short IDs (V1, O1, M1, CP1) with on-demand expand(ref).
6. Zero Silent Drops: Explicit omission notices when budget prunes older items.

## Packages
- NPM: npm install @clincontext/fhir-compress
- Rust: cargo add fhir_compact
- Python: pip install fhir-compress`,

    architecture: `# ClinContext Architecture Specification

## Design Contract
optimize(bundle: FhirBundle, intent: ClinicalIntent, token_budget: Option<usize>)
    -> (CompactContext, ProvenanceMap, OmissionNotice)

## 6-Stage Execution Pipeline
1. Parse & Reference Indexing (streaming deserialization)
2. Lossless Structural Strip (meta, text.div XHTML, 80-char system URIs)
3. Dedupe & Safety Filtration (drop entered-in-error, refuted, dedupe providers)
4. Task-Aware Selection (Deterministic CDS Profiles vs Free-Form Agent)
5. Ranking & Token Budgeting (Guaranteed Must-Include Safety Set)
6. Compact Serialization & Provenance Mapping (V1, O1, M1, CP1)

## Semantic Disambiguation
- vitalSigns: Pain severity (LOINC 72514-3), Blood Pressure, Heart Rate, SpO2, Temp
- labs: Hemoglobin, Glucose, Creatinine, Electrolytes
- carePlans: Activities, instructions, restriction protocols

## Provenance & expand(ref)
Every short reference maps to the original FHIR ID. AI agents can call expand("V1") to retrieve the original canonical FHIR slice.

## Rust Crates (fhirctx)
- fhirctx-core: zero-copy parser & graph
- fhirctx-profiles: declarative TOML profiles
- fhirctx-serialize: compact formats
- fhirctx-mcp: Model Context Protocol server tools`,

    product: `# ClinContext Product Specification (PRD)

## Product Positioning
Not an end-user chatbot. A foundational healthcare context optimization layer between EHR FHIR repositories and clinical AI models / CDS Hooks.

## Target Personas
1. Clinical AI / LLM Engineers (reducing prompt tokens by 85-94% without hallucinations).
2. CDS Hooks Developers (meeting Epic/Cerner <500ms hospital SLA timeouts).
3. Healthcare RAG & Agent Builders (grounding models with provenance traceability).

## Key Differentiators vs FHIRBench / MEDPrompt
- Triad Metric: Measures and enforces 100% Fact Retention, not just token drop.
- CarePlan Preservation: Full clinical activities ("Rest for 72 hrs", "Limit activity") preserved.
- Temporal Granularity: Exact timestamp option for acute care vs date-only for chronic care.
- Provenance Reversibility: Every item links to raw FHIR via expand(ref).

## Clinical Safety Invariants
- Unit Invariance: Units are never mutated or converted silently.
- Error Filtering: Resources marked entered-in-error are never forwarded.
- Zero Silent Drops: Pruned historical records always emit an explicit omission notice.
- HIPAA Compliant: Stateless transformation; zero patient data persisted.`
  };

  const copyDoc = () => {
    navigator.clipboard.writeText(docContents[selectedDoc]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              System Documentation & Specifications
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              README.md • ARCHITECTURE.md • PRODUCT.md (Saved in root repository)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Doc Switcher */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg text-xs">
            <button
              onClick={() => setSelectedDoc("readme")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                selectedDoc === "readme"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                  : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              README.md
            </button>
            <button
              onClick={() => setSelectedDoc("architecture")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                selectedDoc === "architecture"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                  : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              ARCHITECTURE.md
            </button>
            <button
              onClick={() => setSelectedDoc("product")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                selectedDoc === "product"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                  : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              PRODUCT.md
            </button>
          </div>

          <button
            onClick={copyDoc}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy Markdown"}</span>
          </button>
        </div>
      </div>

      <div className="mt-4">
        <pre className="p-5 rounded-xl bg-gray-950 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800 max-h-[500px] whitespace-pre-wrap select-text">
          <code>{docContents[selectedDoc]}</code>
        </pre>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Files saved on disk: <code>/README.md</code>, <code>/ARCHITECTURE.md</code>, <code>/PRODUCT.md</code></span>
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Production-Ready Healthcare Specifications</span>
      </div>
    </div>
  );
};
