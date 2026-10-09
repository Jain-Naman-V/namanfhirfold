//! # fhir_compact
//! 
//! High-performance, zero-copy task-aware FHIR R4 token compression engine.
//! Designed for Clinical Decision Support (CDS Hooks), EHR proxies, and LLM reasoning agents.
//! 
//! ## Example
//! ```rust
//! use fhir_compact::{optimize, CompressionOptions, CdsProfile, Granularity};
//! 
//! let raw_bundle = std::fs::read_to_string("bundle.json").unwrap();
//! let result = optimize(&raw_bundle, CompressionOptions {
//!     profile: CdsProfile::VitalsMonitor,
//!     granularity: Granularity::ExactTimestamp,
//!     token_budget: Some(800),
//!     ..Default::default()
//! }).unwrap();
//! 
//! println!("Optimized LLM Prompt:\n{}", result.compressed_output);
//! println!("Tokens reduced by: {}%", result.reduction_percentage);
//! ```

pub mod models;
pub mod profiles;
pub mod optimizer;

pub use models::*;
pub use optimizer::execute_optimization as optimize;

/// Expands a compact short reference (e.g. "V1", "O1", "CP1") back into its original raw FHIR slice.
pub fn expand(raw_fhir_json: &str, short_ref: &str) -> Option<serde_json::Value> {
    let result = optimizer::execute_optimization(raw_fhir_json, &CompressionOptions::default()).ok()?;
    result.provenance_map.get(short_ref).map(|p| p.raw_snippet.clone())
}

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn optimize_wasm(raw_fhir_json: &str) -> Result<String, JsValue> {
    let opts = CompressionOptions::default();
    let res = optimize(raw_fhir_json, &opts)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(res.compressed_output)
}
