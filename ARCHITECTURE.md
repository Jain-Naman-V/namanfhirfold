# namanfhirfold Architecture Specification
### Fold the structure. Keep every detail.
**High-Performance Zero-Copy Task-Aware Clinical Context Engine in Rust, TypeScript, and Python**

---

## 1. Executive Summary & Design Contract

> **`namanfhirfold`**  
> **Tagline:** *"Fold the structure. Keep every detail."*  
> **Mission:** Fold verbose nested FHIR R4 schema scaffolding while preserving 100% of clinical fidelity, codes, numbers, units, and timestamps.

`namanfhirfold` is not a simple JSON minifier. It is an **information-theoretic clinical context engine** implemented in zero-copy Rust with TypeScript and Python ecosystem bridges. 

### The Core Contract:
```rust
optimize(bundle: FhirBundle, intent: ClinicalIntent, token_budget: Option<usize>) 
    -> (CompactContext, ProvenanceMap, OmissionNotice)
```

### Architectural Axioms:
1. **FHIR is the Canonical Source of Truth:** Never mutate or replace FHIR repositories in the EHR. ClinContext operates strictly as an edge gateway or proxy before inference.
2. **Task-Aware > Universal Compression:** Compression without clinical task context is dangerous. A prescription review requires different fields than an ICU vitals trend check.
3. **Guaranteed Safety Set:** Allergies, active medications, critical abnormal values, and active care plan instructions are **never silently dropped**.
4. **Reversible via Provenance:** Every compressed line carries a short reference (`O1`, `V1`, `M1`, `CP1`) mapping back to the raw FHIR resource ID. If an agent requires deeper context, it invokes `expand(ref)`.
5. **Deterministic Latency for CDS Hooks:** For real-time CDS hooks (e.g. Epic/Cerner <500ms timeout), profile selection is deterministic and rule-based—no slow LLM planning step.

---

## 2. End-to-End System Topology

```
┌────────────────────────────────────────────────────────┐
│             EHR / SMART on FHIR Repository             │
│            (Epic, Cerner, HAPI FHIR Server)            │
└──────────────────────────┬─────────────────────────────┘
                           │ Raw FHIR Bundle
                           │ (5,000–25,000 tokens)
                           ▼
┌────────────────────────────────────────────────────────┐
│             ClinContext / fhirctx Gateway              │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Stage 1: Parse & Streaming Reference Indexing    │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Stage 2: Lossless Structural Strip               │  │
│  │          (meta, text.div, URIs, search wrappers) │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Stage 3: Dedupe & Safety Filtration              │  │
│  │          (drop entered-in-error, refuted)        │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Stage 4: Task-Aware Selection                    │  │
│  │          (Deterministic CDS Profiles / Intent)   │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Stage 5: Ranking & Token Budget Allocation       │  │
│  │          (Must-Include Safety Set Lock)          │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           ▼                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Stage 6: Compact Serialization & Provenance Map  │  │
│  │          (Short IDs: V1, O1, M1, CP1)            │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────┬─────────────────────────────┘
                           │ Compact Context
                           │ (150–350 tokens, -90% drop)
                           ▼
            ┌──────────────┴──────────────┐
            ▼                             ▼
┌───────────────────────┐     ┌───────────────────────┐
│ CDS Hooks Rule Engine │     │ LLM Agent / Reasoner  │
│ (<500ms hospital SLA) │     │ (Gemini, Claude, GPT) │
└───────────────────────┘     └───────────┬───────────┘
                                          │ On ambiguity
                                          ▼
                              ┌───────────────────────┐
                              │ expand(ref) MCP Tool  │
                              │ (Fetch raw FHIR slice)│
                              └───────────────────────┘
```

---

## 3. The 6-Stage Processing Pipeline

### Stage 1: Parse & Reference Indexing
- Fast zero-copy streaming deserialization (`serde_json::Value` or native Rust structs).
- Builds an in-memory graph index of internal pointers (`subject`, `encounter`, `careTeam`, `performer`).

### Stage 2: Lossless Structural Strip
Removes schema boilerplate that confers zero clinical semantics:
- Strips `meta.profile`, `meta.versionId`, `meta.lastUpdated`.
- Strips `text.div` XHTML narrative snippets (often hundreds of bytes of redundant HTML per observation).
- Compresses 80-character system URLs via a static Prefix Dictionary:
  - `http://loinc.org` → `loinc`
  - `http://snomed.info/sct` → `snomed`
  - `http://www.nlm.nih.gov/research/umls/rxnorm` → `rxnorm`
  - `http://unitsofmeasure.org` → `ucum`
  - `http://hl7.org/fhir/sid/icd-10-cm` → `icd10`
- Collapses single-item `coding` arrays into `{ system, code, display }`.
- Drops `fullUrl: "urn:uuid:..."`, `search.mode: "match"`, and `entry[]` packaging syntax.

### Stage 3: Deduplication & Clinical Safety Filtering
- **Safety Filtration:** Explicitly excludes or flags resources with statuses such as `entered-in-error` or verification status `refuted`.
- **Deduplication:** Merges repeated Practitioner, Organization, and Patient metadata references down to a single instance. Deduplicates identical repeated observations while strictly preserving distinct temporal readings.

### Stage 4: Task-Aware Intent Selection
ClinContext bifurcates selection into two operating modes:

#### Mode A: Deterministic CDS Hook Profiles (Fast, Safe, Zero-LLM)
For strict latency and compliance constraints, hard-coded declarative profiles select relevant clinical concepts:
- **`medication-prescribe`**:
  - *Included:* Active Medications, Allergies & Intolerances, Renal Labs (Creatinine, eGFR, BUN), Demographics (Age, Gender, Weight), Pregnancy indicators.
  - *Excluded:* Past encounters, unrelated radiology reports, historical immunizations.
- **`vitals-monitor`**:
  - *Included:* Vitals signs (Blood Pressure, Heart Rate, Respiration, SpO2, Temperature, Pain Scale), exact timestamps, temporal trends.
- **`patient-view`**:
  - *Included:* Active Conditions, Active Medications, Recent Abnormal Labs (<30 days), Active Care Plans.

#### Mode B: Agent Free-Query Mode
- Uses query keyword and domain association heuristics to rank and filter resources relevant to natural language directives (e.g. *"What instructions were given in the CarePlan?"*).

### Stage 5: Ranking, Budgeting, & Must-Include Safety Set
When a `token_budget` (e.g. 800 tokens) is specified:
1. **Safety Set Guarantee (Never Dropped):**
   - Active Allergies & Severe Criticalities
   - Current Active Prescriptions
   - Critical Outlier Observations (Interpretation `H`, `L`, `Critical`)
   - Active CarePlan protocols and patient instructions
2. **Relevance Ranking:**
   - Remaining resources are scored by recency, status (`active` > `completed`), and query overlap.
3. **Explicit Omission Notice (Never Silent Drop):**
   - If historical records are pruned to satisfy the budget, an explicit notice is appended:
     ```text
     ## Omitted: 14 normal historical observations → retrievable via expand(ref)
     ```

### Stage 6: Compact Serialization & Provenance Mapping
- Assigns short reference tags: `V1`, `O1`, `M1`, `C1`, `A1`, `CP1`.
- Compiles a `provenanceMap: Record<string, ProvenanceEntry>` linking each short tag to its canonical `resourceType`, `originalId`, and full unpruned source snippet.

---

## 4. Semantic Disambiguation: Vital Signs vs. Labs

A common flaw in naive FHIR converters is categorizing every `Observation` as a "lab test".

ClinContext inspects both `category.coding` and LOINC terminology to enforce semantic boundaries:
```typescript
// LOINC Classification Table
const VITAL_SIGN_LOINCS = [
  "72514-3", // Pain severity score
  "85354-9", // Blood pressure panel
  "8480-6",  // Systolic BP
  "8462-4",  // Diastolic BP
  "8867-4",  // Heart rate
  "9279-1",  // Respiratory rate
  "8310-5",  // Body temperature
  "59408-5", // Oxygen saturation (SpO2)
  "29463-7", // Body weight
  "8302-2",  // Body height
  "39156-5", // Body Mass Index (BMI)
];
```

Output payloads strictly distinguish:
```json
{
  "vitalSigns": [
    { "ref": "V1", "name": "Pain severity", "code": "loinc:72514-3", "value": 2, "unit": "{score}", "dateTime": "2015-06-05T18:21:10-04:00" }
  ],
  "labs": [
    { "ref": "O1", "test": "Hemoglobin", "code": "loinc:718-7", "value": 13.5, "unit": "g/dL", "range": "13.0-17.0 g/dL" }
  ]
}
```

---

## 5. Granularity Architecture

ClinContext supports two temporal granularity modes:

1. **`exact_timestamp` Mode:**
   - Preserves complete ISO-8601 timestamps: `"2015-06-05T18:21:10-04:00"`.
   - Used for acute triage, ICU telemetry, anesthesia logs, and time-critical pain scales.
   - Auto-enabled if the prompt query mentions time keywords (`PM`, `AM`, `hour`, `acute`, `when`).
2. **`date_only` Mode:**
   - Formats to compact day-level ISO: `"2015-06-05"`.
   - Used for chronic problem lists, annual lab screenings, and longitudinal trends.

---

## 6. Provenance & The `expand(ref)` AI Agent Tool

To enable lossy token reduction with **zero clinical hallucination risk**, ClinContext implements an interactive Provenance contract:

```
LLM Prompt Context:
[V1] Pain severity: 2 {score} (2015-06-05T18:21:10-04:00)
[CP1] Plan: Minor surgery care management (2023-02-13 to 2023-03-02)
      - Instruction: Recommendation to rest: Mandatory bed rest for 72 hours
      - Instruction: Recommendation to limit sexual activity: Abstain for 2 weeks
## Omitted: 5 normal observations → retrievable via expand(ref)
```

If an AI Agent needs to inspect the full FHIR provenance of `CP1` or retrieve omitted resources, it invokes:
```json
{
  "name": "expand",
  "arguments": { "ref": "CP1" }
}
```
The server resolves `CP1` in the `provenanceMap` and returns the exact canonical source JSON slice.

---

## 7. Rust Crate Architecture (`fhirctx`)

The production core is organized as modular Rust crates:

```
crates/
 ├── fhirctx-core/       # Zero-copy streaming parser, reference graph, deduplication
 ├── fhirctx-profiles/   # Declarative TOML/JSON CDS Hook profiles
 ├── fhirctx-serialize/  # Compact JSON, MedPrompt narrative, and Markdown generators
 ├── fhirctx-tokens/     # High-accuracy BPE/tiktoken token counting
 ├── fhirctx-mcp/        # Model Context Protocol (MCP) server integration
 └── fhirctx-cli/        # Command-line tool (cat bundle.json | fhirctx --budget 800)
```

### Integration Modes:
1. **Embedded Rust Crate:** Linked directly into high-throughput Rust EHR gateways.
2. **WebAssembly (`wasm-bindgen`):** Runs client-side in browsers or at the CDN edge (Cloudflare Workers, Fastly).
3. **HTTP / CDS Hooks Middleware:** Reverse-proxy placed between Epic/Cerner EHRs and external CDS card evaluators.
4. **Model Context Protocol (MCP) Server:** Native context provider for Cursor, Claude Desktop, and LangChain agents.
