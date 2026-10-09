use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Granularity {
    ExactTimestamp,
    DateOnly,
}

impl Default for Granularity {
    fn default() -> Self {
        Granularity::ExactTimestamp
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CdsProfile {
    FreeQuery,
    MedicationPrescribe,
    VitalsMonitor,
    PatientView,
    AcuteInpatient,
}

impl Default for CdsProfile {
    fn default() -> Self {
        CdsProfile::FreeQuery
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressionFormat {
    CompactJson,
    MedPromptText,
    FhirBenchMarkdown,
    CdsHooksPrefetch,
}

impl Default for CompressionFormat {
    fn default() -> Self {
        CompressionFormat::CompactJson
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionOptions {
    pub format: CompressionFormat,
    pub profile: CdsProfile,
    pub granularity: Granularity,
    pub token_budget: Option<usize>,
    pub query_filter: Option<String>,
    pub only_abnormal_labs: bool,
    pub safety_set_guaranteed: bool,
}

impl Default for CompressionOptions {
    fn default() -> Self {
        Self {
            format: CompressionFormat::CompactJson,
            profile: CdsProfile::FreeQuery,
            granularity: Granularity::ExactTimestamp,
            token_budget: Some(800),
            query_filter: None,
            only_abnormal_labs: false,
            safety_set_guaranteed: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceEntry {
    pub short_ref: String,
    pub resource_type: String,
    pub original_id: String,
    pub summary: String,
    pub raw_snippet: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactObservation {
    pub ref_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactCarePlan {
    pub ref_id: String,
    pub category: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub activities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactMedication {
    pub ref_id: String,
    pub drug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sig: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactCondition {
    pub ref_id: String,
    pub condition: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub onset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactAllergy {
    pub ref_id: String,
    pub allergen: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub criticality: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reactions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactPatient {
    pub ref_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub compressed_output: String,
    pub format: CompressionFormat,
    pub raw_tokens: usize,
    pub compressed_tokens: usize,
    pub reduction_percentage: f32,
    pub token_multiple: f32,
    pub total_facts: usize,
    pub preserved_facts_count: usize,
    pub fact_retention_rate: f32,
    pub provenance_map: HashMap<String, ProvenanceEntry>,
    pub omitted_count: usize,
    pub omitted_notice: Option<String>,
}
