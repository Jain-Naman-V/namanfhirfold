/**
 * namanfhirfold — public API.
 *
 * compressFhir(): fold a FHIR R4 bundle into a compact, LLM-ready string.
 * expand():       retrieve the full original resource for a short ref (O1, M1, …).
 */

export { compressFhir, expand, expandFromBundle } from "./fhirCompressor.js";

export type {
  FhirCoding,
  FhirCodeableConcept,
  FhirQuantity,
  FhirReference,
  FhirReferenceRange,
  FhirResource,
  FhirBundleEntry,
  FhirBundle,
  CompressionFormat,
  GranularityMode,
  CdsProfile,
  CompressionOptions,
  ClinicalFact,
  ProvenanceEntry,
  CompressionResult,
} from "./fhir.js";
