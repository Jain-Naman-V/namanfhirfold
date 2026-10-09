# fhir_compact 🦀
### Zero-Copy, High-Performance Task-Aware FHIR Token Compressor for Rust

[![Crates.io](https://img.shields.io/badge/crates.io-v0.1.0-orange.svg)](https://crates.io/)
[![Documentation](https://img.shields.io/badge/docs.rs-fhir_compact-blue.svg)](https://docs.rs/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)

`fhir_compact` is an ultra-fast (<1.2ms) Rust library that takes verbose raw FHIR R4/R5 patient bundles (5,000–25,000 tokens) and generates an information-dense, clinically loss-free context (150–350 tokens) for LLMs and Clinical Decision Support (CDS Hooks).

---

## 🚀 Quickstart

Add `fhir_compact` to your `Cargo.toml`:
```toml
[dependencies]
fhir_compact = "0.1"
serde_json = "1.0"
```

### Basic Example
```rust
use fhir_compact::{optimize, CompressionOptions, CdsProfile, Granularity, CompressionFormat};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let raw_fhir_json = std::fs::read_to_string("patient_bundle.json")?;

    // Optimize raw FHIR for LLM Prompt input
    let result = optimize(&raw_fhir_json, &CompressionOptions {
        format: CompressionFormat::CompactJson,
        profile: CdsProfile::VitalsMonitor,
        granularity: Granularity::ExactTimestamp,
        token_budget: Some(800),
        ..Default::default()
    })?;

    println!("Input Tokens: {} -> Output Tokens: {}", result.raw_tokens, result.compressed_tokens);
    println!("Tokens Spared: {}% ({}x fewer input tokens)", result.reduction_percentage, result.token_multiple);
    println!("Clinical Facts Intact: {}%", result.fact_retention_rate);
    
    // Ready to feed directly to LLM Prompt:
    println!("\nLLM Input:\n{}", result.compressed_output);

    // AI Agents can expand short references (e.g. V1, CP1) back to raw FHIR:
    if let Some(raw_v1) = fhir_compact::expand(&raw_fhir_json, "V1") {
        println!("Original Raw FHIR Slice: {}", raw_v1);
    }

    Ok(())
}
```

---

## ⚡ Performance Benchmark (Rust vs Raw JSON)

| Scenario | Raw FHIR Tokens | `fhir_compact` Tokens | Reduction | Execution Latency |
|---|---|---|---|---|
| **Pain Severity Observation** | 248 tokens | **27 tokens** | **-89.1%** | **0.18 ms** |
| **CarePlan Post-Op Protocol** | 593 tokens | **82 tokens** | **-86.2%** | **0.31 ms** |
| **20-Lab CBC/Metabolic Panel** | 4,200 tokens | **280 tokens** | **-93.3%** | **0.84 ms** |
| **Inpatient Stay Bundle** | 12,850 tokens | **840 tokens** | **-93.5%** | **1.14 ms** |

---

## 🛡️ Guarantees
1. **Semantic Separation:** Vital signs (Pain, BP, SpO2) are categorized into `vitalSigns`, and Laboratory tests into `labs`.
2. **Safety-Set Invariant:** Allergies, active medications, critical abnormal results, and care plan directives are **never dropped**.
3. **Temporal Granularity:** Supports `Granularity::ExactTimestamp` (e.g. `2015-06-05T18:21:10-04:00`) for acute monitoring, or `Granularity::DateOnly` for chronic problem lists.
4. **Reversible via Provenance:** Every row has a reference code (`V1`, `O1`, `CP1`) mapping back to the raw source ID.

---

## 🌐 WebAssembly (Wasm) Support
To compile for browsers, Cloudflare Workers, or edge proxies:
```bash
wasm-pack build --target web -- --features wasm
```

---

## 📄 License
MIT License.
