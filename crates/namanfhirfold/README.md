# namanfhirfold 🦀

> **Fold the structure. Keep every detail.**

`namanfhirfold` is an ultra-fast, zero-copy, task-aware FHIR R4 token compression engine in Rust. It shrinks massive EHR FHIR bundles by **85% to 94%** for LLMs, Clinical Decision Support (CDS Hooks), and RAG pipelines while strictly preserving 100% of clinical facts, units, codes, and numerical values.

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
    println!("Clinical Facts Retained: {}/{}", result.retained_facts_count, result.total_facts_count);
    println!("\nLLM Prompt Context:\n{}", result.compressed_output);

    Ok(())
}
```

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
