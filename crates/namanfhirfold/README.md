# namanfhirfold 🦀

> **Optimize clinical context for fewer tokens.**

`namanfhirfold` is a task-aware FHIR R4 clinical-context and token optimization SDK in Rust. It converts verbose EHR bundles into compact context for LLMs, CDS Hooks, and RAG pipelines while reporting what was retained, omitted, or limited by the selected budget.

### Input and output

- Input: a FHIR R4 resource or Bundle as a JSON `&str`.
- Output: `OptimizationResult`, containing compact output, token metrics, omission metadata, and an in-process provenance map.
- Formats: compact JSON, MedPrompt text, FHIRBench Markdown, and CDS Hooks prefetch.
- `token_budget: None` means unlimited selection; a positive budget prioritizes safety resources and reports overflow/omissions.

---

## ⚡ Why `namanfhirfold`?

Typical FHIR JSON payloads waste 70–90% of token budgets on nested JSON scaffolding:
- Repetitive `resourceType`, full URLs, meta profiles, system schemas
- Deep narrative HTML duplication (`text.div`)
- Redundant subject/encounter cross-references repeated across dozens of observations

`namanfhirfold` reduces structural bloat and retains the supported clinical semantics; benchmark latency depends on input size and deployment.

```rust
use namanfhirfold::{optimize, CompressionOptions, CdsProfile, Granularity};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let fhir_bundle = std::fs::read_to_string("patient_bundle.json")?;

    let result = optimize(&fhir_bundle, &CompressionOptions {
        profile: CdsProfile::VitalsMonitor,
        granularity: Granularity::ExactTimestamp,
        token_budget: Some(800),
        safety_set_guaranteed: true,
        ..Default::default()
    })?;

    println!("Optimized Tokens: {}", result.compressed_tokens);
    println!("Tokens Reduced: {}%", result.reduction_percentage);
    println!("Clinical Facts Retained: {}/{}", result.preserved_facts_count, result.total_facts);
    println!("\nLLM Prompt Context:\n{}", result.compressed_output);

    Ok(())
}
```

---

## 🔓 Decompression: `expand(ref)`

Every fold emits a short reference per retained resource and stores the original resource
in `result.provenance_map` for trusted local expansion. The compact output remains a
task-aware representation; the canonical FHIR resource is still authoritative.

| Ref | Resource |
|---|---|
| `P1` | `Patient` (always one) |
| `V1`, `V2`, … | Vital-sign `Observation` |
| `O1`, `O2`, … | Other `Observation` (labs, etc.) |
| `M1`, … | `Medication` / `MedicationRequest` |
| `C1`, … | `Condition` |
| `A1`, … | `AllergyIntolerance` |
| `CP1`, … | `CarePlan` |

```rust
use namanfhirfold::{optimize, expand, expand_from_result, short_refs, CompressionOptions};

let result = optimize(&fhir_bundle, &CompressionOptions::default())?;
println!("{:?}", short_refs(&result)); // ["A1", "C1", "CP1", "M1", "O1", "P1", "V1"]

// Preferred: O(1), no re-run of the optimizer
let original: Option<serde_json::Value> = expand_from_result(&result, "O1");
assert_eq!(original.unwrap()["id"], "obs-gluc");

// One-shot convenience (re-runs the optimizer internally)
let same = expand(&fhir_bundle, "O1");
```

> ⚠️ **Keep the map local.** The provenance map stores whole resources and can be as large as
> your input bundle. Send only `result.compressed_output` to the LLM; expand refs from your own
> process. Unknown refs return `None` instead of panicking.

---

## 📦 Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
namanfhirfold = "0.1.0"
```

Or via cargo CLI:
```bash
cargo add namanfhirfold
```

For WebAssembly (Wasm) in Node.js or browser:
```toml
namanfhirfold = { version = "0.1.0", features = ["wasm"] }
```

---

## 🚀 Publishing to Crates.io

```bash
cargo login
cargo publish
```

---

## 🛡️ License

MIT License. Designed for clinical systems and open healthcare innovation.
