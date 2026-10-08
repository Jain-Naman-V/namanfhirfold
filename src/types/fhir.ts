/**
 * FHIR R4 & ClinContext Optimization Types
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

export interface CompressionOptions {
  format: CompressionFormat;
  stripMeta: boolean;
  stripNarrativeText: boolean;
  normalizeCodingSystems: boolean;
  stripRedundantReferences: boolean;
  stripCategory: boolean;
  onlyAbnormalLabs?: boolean;
  queryFilter?: string;
  maxRecentDays?: number;
}

export interface CompressedFieldSummary {
  retained: string[];
  stripped: string[];
}

export interface ClinicalFact {
  id: string;
  resourceType: string;
  category: "Activity" | "Dosage" | "Finding" | "Diagnosis" | "Range" | "Temporal" | "Instruction" | "Allergen";
  label: string;
  value: string;
  preserved: boolean;
}

export interface CompressionResult {
  rawJson: string;
  compressedOutput: string;
  format: CompressionFormat;
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
  resourceBreakdown: {
    resourceType: string;
    rawCount: number;
    compressedItems: number;
  }[];
}
