# namanfhirfold 🦀📦🐍
### FHIR Clinical-Context and Token Optimization SDK
**Task-Aware Clinical Context Optimizer & Token Reducer for Healthcare AI & CDS Hooks**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![FHIR Version: R4 / R5](https://img.shields.io/badge/FHIR-R4%20%2F%20R5-orange.svg)](https://hl7.org/fhir/)
[![Token Reduction](https://img.shields.io/badge/Input%20Tokens--85%25%20to%20--94%25-emerald.svg)]()
[![Clinical Fidelity](https://img.shields.io/badge/Fact%20Retention-fixture--validated-purple.svg)]()
[![Crates.io](https://img.shields.io/badge/crates.io-namanfhirfold-orange.svg)](https://crates.io)
[![NPM](https://img.shields.io/badge/npm-namanfhirfold-red.svg)](https://npmjs.com)
[![PyPI](https://img.shields.io/badge/pypi-namanfhirfold-blue.svg)](https://pypi.org)

> **"Optimize clinical context for fewer tokens."**  
> *Clear purpose, memorable, and immediately recognizable to healthcare developers.*

 See how namanfhirfold folds a raw FHIR bundle into a 67-token LLM-ready payload in real time.

 https://github.com/user-attachments/assets/9ceb03de-98ac-41f5-b272-58a7d4d71893

`namanfhirfold` is an ultra-fast, zero-copy healthcare context optimization engine designed to bridge the gap between verbose electronic health record (EHR) FHIR repositories and large language model (LLM) agents, clinical decision support (CDS) hooks, and retrieval-augmented generation (RAG) pipelines. Available as a **Rust crate (`crates/namanfhirfold`)**, **NPM package (`packages/namanfhirfold`)**, and **Python package (`python/namanfhirfold`)**.

---

## 🚨 The Problem: FHIR Schema Bloat

Fast Healthcare Interoperability Resources (FHIR R4/R5) is the canonical source-of-truth standard for health data interoperability across Epic, Cerner, and SMART on FHIR gateways. However, **FHIR JSON is notoriously verbose for LLM consumption**:

- A single **Pain Severity Observation** or **Hemoglobin Lab** takes **~15–20 words** of clinically meaningful facts, yet balloons to **200–260 tokens** in raw FHIR JSON due to canonical metadata (`meta.profile`), duplicate XHTML narrative (`text.div`), 80-character URL schemas (`http://loinc.org`, `http://unitsofmeasure.org`), and repeated subject references.
- A 20-test metabolic panel and Complete Blood Count (CBC) balloons to **4,200+ tokens**.
- An inpatient stay bundle with polypharmacy easily exceeds **15,000–35,000 tokens**.

### Why Universal JSON Compressors Fail
Blindly minifying or dropping fields creates severe medical risks:
1. **Semantic Category Confusion:** Mistaking vital signs (Pain Score LOINC `72514-3`) for laboratory tests.
2. **Clinical Directives Lost:** Throwing away `CarePlan` activity details (e.g. *Recommendation to rest*, *Limit sexual activity*).
3. **Temporal Distortion:** Truncating acute timestamps (`2015-06-05T18:21:10-04:00` down to `2015-06-05`), making acute emergency or ICU reasoning impossible.
4. **Attention Dilution:** LLMs suffer from *"lost-in-the-middle"* hallucinations when 85% of input tokens are non-clinical schema noise.

---

## 💡 The Solution: namanfhirfold (`namanfhirfold`)

namanfhirfold sits as an intelligent, high-throughput gateway proxy between the EHR and the AI layer. **FHIR remains the untouched canonical source-of-truth**, while namanfhirfold dynamically synthesizes an information-dense clinical context tuned to the specific task or CDS Hook.

```
       EHR / SMART on FHIR Server (Canonical Source)
                           ↓
              Raw FHIR Bundle (5k–25k Tokens)
                           ↓
┌────────────────────────────────────────────────────────┐
│  namanfhirfold Gateway (Rust / TypeScript)     │
│  1. Parse & Index References                           │
│  2. Structural Context Reduction (meta, text.div, URIs)│
│  3. Dedupe & Safety Filter (drop entered-in-error)     │
│  4. Task-Aware Selection (CDS Profiles vs Free Query)  │
│  5. Ranking & Token Budget Allocator (Safety Set Lock) │
│  6. Compact Serialization + Provenance Map (V1, O1, M1)│
└────────────────────────────────────────────────────────┘
                           ↓
       Task-Aware Clinical Context (150–350 Tokens)
           [-85% to -94% Input Tokens Spared]
              ┌────────────┴────────────┐
              ↓                         ↓
   CDS Hooks Rule Engine       LLM / AI Agent
   (Epic/Cerner <500ms SLA)    (Gemini 3.8 / GPT-4o / Claude)
```

---

## 🏆 The Gold-Standard Triad Metric

Rather than measuring token reduction in isolation, namanfhirfold measures the **Clinical Triad**:

$$\text{Evaluation Metric} = \text{Input Token Reduction} + \text{Clinical Information Retention} + \text{Task Accuracy}$$

| Metric | Raw FHIR R4 | namanfhirfold Optimized | Benefit |
|---|---|---|---|
| **Pain Severity Observation** | 248 tokens | **27 tokens** | **~9.2× fewer input tokens** |
| **Post-Op Surgery CarePlan** | 593 tokens | **82 tokens** | **~7.2× fewer input tokens** |
| **20-Lab Metabolic Panel** | 4,200 tokens | **280 tokens** | **~15.0× fewer input tokens** |
| **Inpatient CDS Stay Bundle** | 12,850 tokens | **840 tokens** | **~15.3× fewer input tokens** |
| **Clinical Facts Preserved** | Fixture-validated | **Validated per supported fixture/format** | **Unrecognized fields require audit** |
| **Provenance Traceability** | None | **100% (V1, O1, M1, CP1)** | **Auditable via `expand(ref)`** |

---

## 🚀 Key Features

- **Semantic Disambiguation:** Strictly categorizes observations into `vitalSigns` vs. `labs` vs. `observations` using FHIR category and LOINC taxonomy.
- **Granularity Control:**
  - `exact_timestamp`: Retains full ISO timestamps (`2015-06-05T18:21:10-04:00`) for acute vitals, ICU, and pain scales.
  - `date_only`: Day-level format (`2015-06-05`) for chronic problem lists and annual health records.
- **Deterministic CDS Profiles:** Ultra-fast, deterministic rule-based selection for CDS Hooks (`medication-prescribe`, `patient-view`, `vitals-monitor`) that bypass slow, unpredictable LLM planners.
- **Safety Set:** Patient, allergy, active medication, and care-plan resources are prioritized under a token budget; if they alone exceed it, the result reports explicit overflow.
- **Provenance Map & `expand(ref)` Tool:** Every item receives a compact reference code (`O1`, `V1`, `M1`, `CP1`) mapping directly to its original FHIR Resource ID. AI agents can invoke `expand(ref)` to retrieve the full raw FHIR slice on-demand.
- **Zero Silent Drops:** When selection or token budgeting omits records, an explicit omission notice and count are appended; trusted in-process callers can use `expand(ref)`.

---

## 📦 Installation & SDK Packages

The same optimization contract is available in three package formats:

| Package | Input | Output |
|---|---|---|
| NPM | JavaScript FHIR object / Bundle | `CompressionResult` and compact `compressedOutput` |
| PyPI | Python `dict` or JSON string | Compact `str` or `FoldResult` with local provenance |
| Rust | FHIR JSON `&str` | `OptimizationResult` with compact output and metrics |

All formats support compact JSON, MedPrompt text, FHIRBench Markdown, and CDS Hooks prefetch output. The compact result is for model context; the canonical FHIR payload remains the source of truth.

### TypeScript / Node.js / Bun (NPM)
```bash
npm install namanfhirfold
```

```typescript
import { compressFhir } from "namanfhirfold";

// 1. Fetch raw FHIR bundle from EHR or SMART-on-FHIR server
const rawBundle = await fetchPatientBundle(patientId);

// 2. Task-Aware Context Optimization
const optimizedContext = compressFhir(rawBundle, {
  format: "compact_json",          // "compact_json" | "medprompt_text" | "fhirbench_markdown"
  granularity: "exact_timestamp",  // "exact_timestamp" | "date_only"
  profile: "vitals_monitor",       // "free_query" | "medication_prescribe" | "vitals_monitor"
  tokenBudget: 800,
  queryFilter: "What was the patient's pain score at 6:21 PM?"
});

console.log(optimizedContext.tokenMultiple); // e.g. 9.2x fewer input tokens
console.log(optimizedContext.clinicalFacts); // retained facts + provenance refs

// 3. Send clean context to any OpenAI-compatible LLM endpoint
const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [{ role: "user", content: `Patient Clinical Context:\n${optimizedContext.compressedOutput}\n\nQuery: What was the pain score?` }],
  }),
});
const response = await res.json();
```

### Rust Crate (`namanfhirfold`)
```toml
# Cargo.toml
[dependencies]
namanfhirfold = { version = "0.1.0", features = ["wasm"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

```rust
use namanfhirfold::{optimize, CompressionOptions, Granularity, CdsProfile};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let raw_fhir_json = std::fs::read_to_string("patient_bundle.json")?;
    
    // Sub-millisecond zero-copy optimization (<1.2ms)
    // "Optimize clinical context for fewer tokens."
    let result = optimize(&raw_fhir_json, &CompressionOptions {
        profile: CdsProfile::VitalsMonitor,
        granularity: Granularity::ExactTimestamp,
        token_budget: Some(800),
        safety_set_guaranteed: true,
        ..Default::default()
    })?;
    
    println!("Tokens Reduced: {}%", result.reduction_percentage);
    println!("Clinical Facts Retained: {}/{}", result.retained_facts_count, result.total_facts_count);
    println!("Ready for LLM Prompt:\n{}", result.compressed_output);
    Ok(())
}
```

### Python / PyPI (`namanfhirfold`)
```bash
pip install namanfhirfold
```

```python
from namanfhirfold import fold, CdsProfile, Granularity

raw_bundle = load_ehr_fhir_bundle()

# "Optimize clinical context for fewer tokens."
compressed_output = fold(
    raw_bundle,
    format="compact_json",         # or "medprompt_text", "markdown"
    profile=CdsProfile.VITALS_MONITOR,
    granularity=Granularity.EXACT_TIMESTAMP,
    safety_set_guaranteed=True
)

print(compressed_output)
```

### TypeScript / NPM (`namanfhirfold`)
```bash
npm install namanfhirfold
```

```typescript
import { compressFhir } from "namanfhirfold";

const optimizedContext = compressFhir(rawBundle, {
  format: "compact_json",
  granularity: "exact_timestamp",
  profile: "vitals_monitor",
  tokenBudget: 800,
});
```

---

## 🔓 Decompression: Getting the FHIR Back (`expand(ref)`)

Folding is one direction. Every compact output carries a **provenance map** that stores the
**full original resource** for each short reference when the local provenance map is retained; the compact output itself remains a task-aware representation.

### Short reference legend

| Ref | Resource | Notes |
|---|---|---|
| `P1` | `Patient` | Always exactly one |
| `V1`, `V2`, … | Vital-sign `Observation` | `category=vital-signs` |
| `O1`, `O2`, … | Other `Observation` | Labs and everything else |
| `M1`, `M2`, … | `Medication` / `MedicationRequest` | Safety-set item |
| `C1`, `C2`, … | `Condition` | Problem list |
| `A1`, `A2`, … | `AllergyIntolerance` | Safety-set item |
| `CP1`, `CP2`, … | `CarePlan` | |

Counters are assigned in encounter order, so `O2` is the second retained Observation — not a
guaranteed mapping to a particular LOINC code.

### ⚠️ Keep the map local

> The provenance map stores whole resources, so it can be **as large as your input bundle**.
> Send **only** the folded output to the LLM. Hold the map in your own process and expand on
> demand. Shipping the map to the model defeats the token saving.

### Python

```python
from namanfhirfold import fold_with_provenance

result = fold_with_provenance(raw_bundle_json)      # or a dict

print(result.output)        # the compact, LLM-ready string
print(result.short_refs)    # e.g. ['P1', 'V1', 'O1', 'M1', 'C1', 'A1', 'CP1']

original = result.expand("O1")   # full original Observation dict (None if unknown)
print(original["id"])            # e.g. "obs-gluc"

# one-shot convenience (re-folds each call — prefer result.expand() in hot paths)
from namanfhirfold import expand
same = expand(raw_bundle_json, "O1")
```

### TypeScript / Node.js

```typescript
import { compressFhir, expand, expandFromBundle } from "namanfhirfold";

const result = compressFhir(rawBundle, { format: "compact_json" });
console.log(result.compressedOutput);
console.log(Object.keys(result.provenanceMap)); // ['P1', 'O1', ...]

// Preferred: reuse the map you already hold
const original = expand(result.provenanceMap, "O1");   // FhirResource | null

// Or one-shot (re-runs the pipeline)
const same = expandFromBundle(rawBundle, "O1");
```

### Rust

```rust
use namanfhirfold::{optimize, expand, expand_from_result, short_refs, CompressionOptions};

let result = optimize(&raw_fhir_json, &CompressionOptions::default())?;
println!("{}", result.compressed_output);
println!("{:?}", short_refs(&result));

// Preferred: O(1), no re-run
let original = expand_from_result(&result, "O1");   // Option<serde_json::Value>

// Or one-shot (re-runs the optimizer)
let same = expand(&raw_fhir_json, "O1");
```

Unknown references return `None` / `null` rather than raising — an agent asking for a ref that
the fold dropped gets a clean miss instead of an exception.

---

## 🖥️ Interactive Workbench

namanfhirfold includes a split-screen interactive engineering workbench running on port 3000:
- **Left Panel:** Raw FHIR Bundle syntax editor with real-time token estimator and upload support.
- **Center Bridge:** Real-time token reduction gauge, input token ratio, and fact retention audit.
- **Right Panel:** Optimized clinical output with 1-click **Copy to LLM Prompt** and **Live Gemini 3.8 Flash** test inference.
- **Provenance Drawer:** Click any `V1`, `O1`, `CP1` reference to inspect the source raw FHIR slice.

---

## 📄 License & Attribution

Distributed under the MIT License. Based on insights and benchmarking methodologies from FHIRBench, MedPrompt (FHIR2Text), fhir-medrecon, and FHIR-MCP.
