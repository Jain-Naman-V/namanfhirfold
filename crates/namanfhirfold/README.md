# namanfhirfold 🦀

> **Fold the structure. Keep every detail.**

`namanfhirfold` is an ultra-fast, zero-copy, task-aware FHIR R4 token compression engine in Rust. It shrinks massive EHR FHIR bundles by **85% to 94%** for LLMs, Clinical Decision Support (CDS Hooks), and RAG pipelines while preserving clinical facts, units, codes, and numerical values in the retained safety set.

---

## ⚡ Why `namanfhirfold`?

Typical FHIR JSON payloads waste 70–90% of token budgets on nested JSON scaffolding:
- Repetitive `resourceType`, full URLs, meta profiles, system schemas
- Deep narrative HTML duplication (`text.div`)
- Redundant subject/encounter cross-references repeated across dozens of observations

`namanfhirfold` strips structural bloat and retains critical clinical semantics with sub-millisecond execution.

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

Every fold emits a short reference per retained resource and stores the **full original
resource** in `result.provenance_map`, so the round-trip is lossless.

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
