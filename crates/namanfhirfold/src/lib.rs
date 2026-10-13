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

    // ---- parity helpers (mirror python tests/test_selfcheck.py) ----
    const FMTS: [CompressionFormat; 4] = [
        CompressionFormat::FhirBenchMarkdown,
        CompressionFormat::CompactJson,
        CompressionFormat::MedPromptText,
        CompressionFormat::CdsHooksPrefetch,
    ];

    fn bundle(resources: Vec<serde_json::Value>) -> String {
        serde_json::json!({
            "resourceType": "Bundle",
            "type": "collection",
            "entry": resources.into_iter().map(|r| serde_json::json!({ "resource": r })).collect::<Vec<_>>()
        })
        .to_string()
    }

    fn out(raw: &str, f: CompressionFormat) -> String {
        let opts = CompressionOptions { format: f, granularity: Granularity::ExactTimestamp, token_budget: None, ..Default::default() };
        optimize(raw, &opts).unwrap().compressed_output
    }

    fn every_fmt(raw: &str, needle: &str) {
        for f in FMTS {
            let s = out(raw, f);
            assert!(s.contains(needle), "missing \"{}\" in {:?}: {}", needle, f, &s[..s.len().min(200)]);
        }
    }

    fn blank_rows(s: &str) -> usize {
        s.lines()
            .filter(|l| l.starts_with('|'))
            .filter(|l| l.split('|').skip(1).any(|c| { let t = c.trim(); t == "**" || t == "** " }))
            .count()
    }

    #[test]
    fn parity_value_variants() {
        let mk = |extra: serde_json::Value| {
            let mut base = serde_json::json!({
                "resourceType": "Observation", "id": "o1", "status": "final",
                "code": { "coding": [{ "code": "1234-5", "display": "Test analyte" }] },
                "effectiveDateTime": "2026-01-02T03:04:05Z"
            });
            if let Some(m) = base.as_object_mut() {
                if let Some(extra_obj) = extra.as_object() {
                    for (k, v) in extra_obj { m.insert(k.clone(), v.clone()); }
                }
            }
            base
        };
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueString": "strung"}))]), "strung");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueQuantity": {"value": 42, "unit": "mg"}}))]), "42");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueBoolean": true}))]), "Yes");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueInteger": 7}))]), "7");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueRange": {"low": {"value": 1, "unit": "x"}, "high": {"value": 9, "unit": "x"}}}))]), "9");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueRatio": {"numerator": {"value": 3}, "denominator": {"value": 4}}}))]), "3");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueTime": "10:11:12"}))]), "10:11:12");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueDateTime": "2026-03-04"}))]), "2026-03-04");
        every_fmt(&bundle(vec![mk(serde_json::json!({"valueCodeableConcept": {"coding": [{"display": "One"}, {"display": "Two"}]}}))]), "One");
    }

    #[test]
    fn parity_no_fabricated_normal() {
        let o = serde_json::json!({
            "resourceType": "Observation", "id": "o2", "status": "final",
            "code": { "coding": [{ "code": "x", "display": "Plain" }] },
            "valueQuantity": { "value": 1, "unit": "u" },
            "effectiveDateTime": "2026-01-01"
        });
        let raw = bundle(vec![o]);
        for f in FMTS {
            let s = out(&raw, f);
            assert!(!s.split_whitespace().any(|w| w == "Normal"), "fabricated Normal in {:?}", f);
        }
    }

    #[test]
    fn parity_has_member_grouping() {
        let parent = serde_json::json!({
            "resourceType": "Observation", "id": "bp", "status": "final",
            "code": { "coding": [{ "code": "85354-9", "display": "Blood pressure panel" }] },
            "hasMember": [{ "reference": "Observation/sys" }, { "reference": "Observation/dia" }],
            "effectiveDateTime": "2026-01-01T00:00:00Z"
        });
        let sys_o = serde_json::json!({
            "resourceType": "Observation", "id": "sys", "status": "final",
            "code": { "coding": [{ "code": "8480-6", "display": "Systolic" }] },
            "valueQuantity": { "value": 148, "unit": "mmHg" },
            "effectiveDateTime": "2026-01-01T00:00:00Z"
        });
        let dia = serde_json::json!({
            "resourceType": "Observation", "id": "dia", "status": "final",
            "code": { "coding": [{ "code": "8462-4", "display": "Diastolic" }] },
            "valueQuantity": { "value": 92, "unit": "mmHg" },
            "effectiveDateTime": "2026-01-01T00:00:00Z"
        });
        let raw = bundle(vec![parent, sys_o, dia]);
        every_fmt(&raw, "148");
        every_fmt(&raw, "92");
        let md = out(&raw, CompressionFormat::FhirBenchMarkdown);
        assert_eq!(blank_rows(&md), 0, "blank markdown cell in member group");
    }

    #[test]
    fn parity_refuted_retained() {
        let cond = serde_json::json!({
            "resourceType": "Condition", "id": "c1",
            "clinicalStatus": { "coding": [{ "code": "active" }] },
            "verificationStatus": { "coding": [{ "code": "refuted" }], "display": "Refuted" },
            "code": { "coding": [{ "code": "123", "display": "Refuted diagnosis" }] },
            "subject": { "reference": "Patient/p1" }
        });
        every_fmt(&bundle(vec![cond]), "Refuted diagnosis");
    }

    #[test]
    fn parity_entered_in_error_retained_flagged() {
        let o = serde_json::json!({
            "resourceType": "Observation", "id": "e1", "status": "entered-in-error",
            "code": { "text": "Wrong reading" },
            "valueQuantity": { "value": 1, "unit": "u" },
            "effectiveDateTime": "2026-01-01"
        });
        let raw = bundle(vec![o]);
        let result = optimize(&raw, &CompressionOptions { format: CompressionFormat::FhirBenchMarkdown, ..Default::default() }).unwrap();
        // retained: a provenance ref exists
        assert!(!short_refs(&result).is_empty(), "entered-in-error must be retained (flagged), not dropped");
        // flagged: marker present (compact_json/cds_hooks_prefetch => "_flagged"; markdown/medprompt => "FLAGGED")
        let s = result.compressed_output;
        assert!(s.contains("_flagged") || s.contains("FLAGGED"), "entered-in-error must carry a flagged notice");
    }

    #[test]
    fn parity_grouped_export() {
        let patient = serde_json::json!({
            "resourceType": "Patient", "id": "p1",
            "name": [{ "text": "Doe, Jane", "given": ["Jane"], "family": "Doe" }],
            "gender": "female", "birthDate": "1980-05-06"
        });
        let grouped = serde_json::json!({
            "Patients": [patient],
            "Conditions": [{
                "resourceType": "Bundle",
                "entry": [{ "resource": {
                    "resourceType": "Condition", "id": "c2",
                    "code": { "coding": [{ "code": "9", "display": "Grouped finding" }] },
                    "subject": { "reference": "Patient/p1" }
                }}]
            }]
        }).to_string();
        every_fmt(&grouped, "Doe, Jane");
        every_fmt(&grouped, "Grouped finding");
    }

    #[test]
    fn round_trip_expands_every_ref() {
        let raw = sample_bundle();
        let result = optimize(&raw, &CompressionOptions::default()).unwrap();

        // entered-in-error is retained + flagged, not dropped; refs must exist
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
