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

impl Granularity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Granularity::ExactTimestamp => "exact_timestamp",
            Granularity::DateOnly => "date_only",
        }
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

impl CdsProfile {
    pub fn as_str(&self) -> &'static str {
        match self {
            CdsProfile::FreeQuery => "free_query",
            CdsProfile::MedicationPrescribe => "medication_prescribe",
            CdsProfile::VitalsMonitor => "vitals_monitor",
            CdsProfile::PatientView => "patient_view",
            CdsProfile::AcuteInpatient => "acute_inpatient",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompressionFormat {
    #[serde(rename = "compact_json")]
    CompactJson,
    #[serde(rename = "medprompt_text")]
    MedPromptText,
    #[serde(rename = "fhirbench_markdown")]
    FhirBenchMarkdown,
    #[serde(rename = "cds_hooks_prefetch")]
    CdsHooksPrefetch,
}

impl Default for CompressionFormat {
    fn default() -> Self {
        CompressionFormat::CompactJson
    }
}

impl CompressionFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            CompressionFormat::CompactJson => "compact_json",
            CompressionFormat::MedPromptText => "medprompt_text",
            CompressionFormat::FhirBenchMarkdown => "fhirbench_markdown",
            CompressionFormat::CdsHooksPrefetch => "cds_hooks_prefetch",
        }
    }

    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "medprompt_text" => CompressionFormat::MedPromptText,
            "fhirbench_markdown" => CompressionFormat::FhirBenchMarkdown,
            "cds_hooks_prefetch" => CompressionFormat::CdsHooksPrefetch,
            _ => CompressionFormat::CompactJson,
        }
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
            token_budget: None,
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
