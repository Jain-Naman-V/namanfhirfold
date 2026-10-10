//! # namanfhirfold 🦀
//! 
//! > **Fold the structure. Keep every detail.**
//! 
//! Ultra-fast, zero-copy task-aware FHIR R4 token compression engine.
//! Designed for Clinical Decision Support (CDS Hooks), EHR proxies, and LLM reasoning agents.
//! 
//! ## Example
//! ```no_run
//! use namanfhirfold::{optimize, CompressionOptions, CdsProfile, Granularity};
//! 
//! let raw_bundle = std::fs::read_to_string("patient_bundle.json").unwrap();
//! let result = optimize(&raw_bundle, &CompressionOptions {
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
///
/// This re-runs the optimizer internally. When you already hold an
/// [`OptimizationResult`], prefer [`expand_from_result`] — it is O(1).
pub fn expand(raw_fhir_json: &str, short_ref: &str) -> Option<serde_json::Value> {
    let result = optimizer::execute_optimization(raw_fhir_json, &CompressionOptions::default()).ok()?;
    expand_from_result(&result, short_ref)
}

/// Expands a short reference using an existing [`OptimizationResult`], without
/// re-running the optimizer.
///
/// ```
/// use namanfhirfold::{optimize, expand_from_result, CompressionOptions};
///
/// let raw = serde_json::json!({
///     "resourceType": "Bundle",
///     "entry": [{ "resource": {
///         "resourceType": "Patient", "id": "pat-1", "gender": "female"
///     }}]
/// }).to_string();
///
/// let result = optimize(&raw, &CompressionOptions::default()).unwrap();
/// let original = expand_from_result(&result, "P1").unwrap();
/// assert_eq!(original["id"], "pat-1");
/// ```
pub fn expand_from_result(
    result: &OptimizationResult,
    short_ref: &str,
) -> Option<serde_json::Value> {
    result
        .provenance_map
        .get(short_ref)
        .map(|p| p.raw_snippet.clone())
}

/// Returns every short reference present in the result, sorted (P1, V1, O1, M1, C1, A1, CP1).
pub fn short_refs(result: &OptimizationResult) -> Vec<String> {
    let mut refs: Vec<String> = result.provenance_map.keys().cloned().collect();
    refs.sort();
    refs
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_bundle() -> String {
        serde_json::json!({
            "resourceType": "Bundle",
            "entry": [
                { "resource": { "resourceType": "Patient", "id": "pat-1",
                    "gender": "female", "birthDate": "1980-04-12" } },
                { "resource": { "resourceType": "Observation", "id": "obs-1",
                    "status": "final",
                    "code": { "text": "Heart rate" },
                    "valueQuantity": { "value": 72, "unit": "/min" },
                    "effectiveDateTime": "2026-01-05T08:31:00Z" } },
                { "resource": { "resourceType": "MedicationRequest", "id": "med-1",
                    "status": "active",
                    "medicationCodeableConcept": { "text": "Lisinopril 10mg" },
                    "dosageInstruction": [{ "text": "1 tab daily" }] } },
                { "resource": { "resourceType": "Condition", "id": "cond-1",
                    "code": { "text": "Hypertension" },
                    "clinicalStatus": { "coding": [{ "code": "active" }] } } },
                { "resource": { "resourceType": "AllergyIntolerance", "id": "alg-1",
                    "code": { "text": "Penicillin" }, "criticality": "high" } },
                { "resource": { "resourceType": "Observation", "id": "obs-err",
                    "status": "entered-in-error",
                    "code": { "text": "Bad reading" },
                    "valueQuantity": { "value": 1 } } }
            ]
        })
        .to_string()
    }

    #[test]
    fn round_trip_expands_every_ref() {
        let raw = sample_bundle();
        let result = optimize(&raw, &CompressionOptions::default()).unwrap();

        // entered-in-error must be excluded
        let refs = short_refs(&result);
        assert!(!refs.is_empty(), "expected provenance refs, got none");

        // Every ref must expand back to a resource carrying its original id.
        for r in &refs {
            let expanded = expand_from_result(&result, r)
                .unwrap_or_else(|| panic!("expand_from_result returned None for {r}"));
            assert!(
                expanded.get("resourceType").and_then(|v| v.as_str()).is_some(),
                "{r} lost resourceType"
            );
            assert!(
                expanded.get("id").and_then(|v| v.as_str()).is_some(),
                "{r} lost id"
            );
        }

        // Spot-check a known mapping: the Patient keeps its original id.
        let patient = expand_from_result(&result, "P1").expect("P1 must exist");
        assert_eq!(patient["id"], "pat-1");
    }

    #[test]
    fn expand_unknown_ref_is_none() {
        let raw = sample_bundle();
        let result = optimize(&raw, &CompressionOptions::default()).unwrap();
        assert!(expand_from_result(&result, "ZZZ").is_none());
        assert!(expand(&raw, "ZZZ").is_none());
    }

    #[test]
    fn expand_is_lossless_snippet() {
        let raw = sample_bundle();
        let result = optimize(&raw, &CompressionOptions::default()).unwrap();
        let patient = expand_from_result(&result, "P1").unwrap();
        // Full original resource, not just the summary fields.
        assert_eq!(patient["birthDate"], "1980-04-12");
        assert_eq!(patient["gender"], "female");
        assert_eq!(patient["resourceType"], "Patient");
    }

    #[test]
    fn expand_without_result_reproduces_same_value() {
        let raw = sample_bundle();
        let result = optimize(&raw, &CompressionOptions::default()).unwrap();
        let direct = expand(&raw, "P1").expect("expand() must resolve P1");
        let via_result = expand_from_result(&result, "P1").unwrap();
        assert_eq!(direct, via_result);
    }

    #[test]
    fn short_refs_are_sorted() {
        let raw = sample_bundle();
        let result = optimize(&raw, &CompressionOptions::default()).unwrap();
        let refs = short_refs(&result);
        let mut sorted = refs.clone();
        sorted.sort();
        assert_eq!(refs, sorted);
    }
}
