# namanfhirfold 📦

> **Fold the structure. Keep every detail.**

High-efficiency task-aware FHIR R4 token compression engine for JavaScript, TypeScript, Node.js, and browser environments. Reduces token usage by **85% to 94%** while preserving 100% of clinical facts, numeric results, units, codes, and ranges.

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

---

## 🔓 Decompression: `expand(ref)`

Every fold emits a short reference per retained resource and stores the **full original
resource** in `result.provenanceMap`, so the round-trip is lossless.

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
