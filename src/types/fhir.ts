/**
 * FHIR R4 & Task-Aware Context Optimization Types
 * Contract: optimize(bundle, intent, token_budget) -> compact_context + provenance_map
 */

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirQuantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface FhirReference {
  reference?: string;
  display?: string;
}

export interface FhirReferenceRange {
  low?: FhirQuantity;
  high?: FhirQuantity;
  text?: string;
}

export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: any;
  status?: string;
  [key: string]: any;
}

export interface FhirBundleEntry {
  fullUrl?: string;
  resource?: FhirResource;
  search?: {
    mode?: string;
  };
}

export interface FhirBundle {
  resourceType: "Bundle";
  id?: string;
  type?: string;
  total?: number;
  entry?: FhirBundleEntry[];
}

export type CompressionFormat = 
  | "compact_json" 
  | "medprompt_text" 
  | "fhirbench_markdown" 
  | "cds_hooks_prefetch";

export type GranularityMode = "exact_timestamp" | "date_only";

export type CdsProfile = 
  | "free_query" 
  | "medication_prescribe" 
  | "patient_view" 
  | "vitals_monitor" 
  | "acute_inpatient";

export interface CompressionOptions {
  format: CompressionFormat;
  profile?: CdsProfile;
  queryFilter?: string;
  granularity?: GranularityMode;
  tokenBudget?: number; // e.g. 250, 500, 800, 1500 (0 for unlimited)
  safetySetGuaranteed?: boolean; // Always preserve allergies, active meds, critical abnormal values
  stripMeta: boolean;
  stripNarrativeText: boolean;
  normalizeCodingSystems: boolean;
  stripRedundantReferences: boolean;
  stripCategory: boolean;
  onlyAbnormalLabs?: boolean;
}

export interface ClinicalFact {
  id: string;
  shortRef?: string;
  resourceType: string;
  category: "Activity" | "Dosage" | "Finding" | "Diagnosis" | "Range" | "Temporal" | "Instruction" | "Allergen" | "VitalSign";
  label: string;
  value: string;
  preserved: boolean;
}

export interface ProvenanceEntry {
  shortRef: string; // e.g. O1, M1, A1, C1
  resourceType: string;
  originalId: string;
  summary: string;
  fullSnippet: any;
}

export interface CompressionResult {
  rawJson: string;
  compressedOutput: string;
  format: CompressionFormat;
  profileUsed: CdsProfile;
  granularityUsed: GranularityMode;
  tokenBudget: number;
  budgetUtilization: number; // % of budget used
  rawCharCount: number;
  compressedCharCount: number;
  rawTokens: number;
  compressedTokens: number;
  reductionPercentage: number;
  tokenMultiple: number; // e.g. 15.2x fewer input tokens
  retainedFields: string[];
  strippedFields: string[];
  clinicalFacts: ClinicalFact[];
  totalFacts: number;
  preservedFactsCount: number;
  factRetentionRate: number; // e.g. 100%
  provenanceMap: Record<string, ProvenanceEntry>;
  omittedCount: number;
  omittedItemsNotice?: string;
  resourceBreakdown: {
    resourceType: string;
    rawCount: number;
    compressedItems: number;
  }[];
}
