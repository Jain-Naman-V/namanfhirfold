# namanfhirfold 📦

> **Optimize clinical context for fewer tokens.**

High-efficiency task-aware FHIR R4 token compression engine for JavaScript, TypeScript, Node.js, and browser environments. Reduces token usage while preserving the clinical fields covered by the local regression fixtures; unsupported fields must be audited before claiming complete retention.

---

## ⚡ Installation

```bash
npm install namanfhirfold
```

or with yarn / pnpm / bun:

```bash
pnpm add namanfhirfold
```

---

## 🛠️ Usage

```typescript
import { compressFhir, expand } from "namanfhirfold";

// 1. Raw EHR FHIR Bundle (thousands of tokens)
const rawBundle = await fetchPatientFhirBundle(patientId);

// 2. Fold structure, keep every detail
const compressedContext = compressFhir(rawBundle, {
  format: "medprompt_text", // or "compact_json" | "fhirbench_markdown" | "cds_hooks_prefetch"
  profile: "medication_prescribe", // or "vitals_monitor" | "patient_view" | "free_query" | "acute_inpatient"
  granularity: "exact_timestamp",
  safetySetGuaranteed: true
});

// 3. Pass clean optimized context to Gemini, OpenAI, Claude, or LangChain
console.log(compressedContext.compressedOutput);
```

### Contract for package users

All three SDKs accept the same logical input: a FHIR R4 resource or Bundle. The
serialized form differs by language:

| Package | Input | Output |
|---|---|---|
| NPM | JavaScript object / FHIR JSON object | `CompressionResult` with `compressedOutput`, metrics, omission metadata, and local `provenanceMap` |
| PyPI | Python `dict` or JSON string | `str` from `fold()` or `FoldResult` from `fold_with_provenance()` |
| Rust | JSON `&str` | `OptimizationResult` with compact output, token metrics, omission metadata, and local provenance |

Supported output formats are `compact_json`, `medprompt_text`,
`fhirbench_markdown`, and `cds_hooks_prefetch`. The compact output is intended
for the LLM context; keep provenance local and treat the original FHIR resource
as the canonical source.

---

## 🔓 Decompression: `expand(ref)`

Every fold emits a short reference per retained resource and can store the original
resource in `result.provenanceMap` for trusted local expansion. The compact output is a
task-aware representation; the canonical FHIR source remains authoritative.

| Ref | Resource |
|---|---|
| `P1` | `Patient` (always one) |
| `V1`, `V2`, … | Vital-sign `Observation` |
| `O1`, `O2`, … | Other `Observation` (labs, etc.) |
| `M1`, … | `Medication` / `MedicationRequest` |
| `C1`, … | `Condition` |
| `A1`, … | `AllergyIntolerance` |
| `CP1`, … | `CarePlan` |

```typescript
import { compressFhir, expand, expandFromBundle } from "namanfhirfold";

const result = compressFhir(rawBundle, { format: "compact_json" });

// Preferred: reuse the map you already hold
const original = expand(result.provenanceMap, "O1"); // FhirResource | null
console.log(original?.id);                           // "obs-gluc"

// One-shot convenience (re-runs the pipeline)
const same = expandFromBundle(rawBundle, "O1");
```

> ⚠️ **Keep the map local.** The provenance map stores whole resources and can be as large as
> your input bundle. Send only `result.compressedOutput` to the LLM; expand refs from your own
> process. Unknown refs return `null` instead of throwing.

---

## 🚀 Publishing to NPM

```bash
cd packages/namanfhirfold
npm login
npm publish --access public
```

---

## 🛡️ License

MIT License
