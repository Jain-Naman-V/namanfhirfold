import type { CompressionResult, ProvenanceEntry } from "../types/fhir.ts";

export type PublicCompressionResult = Omit<CompressionResult, "rawJson" | "provenanceMap"> & {
  provenanceMap: Record<string, Omit<ProvenanceEntry, "fullSnippet">>;
};

/** Remove raw FHIR and provenance snippets before crossing an HTTP boundary. */
export function toPublicCompressionResult(result: CompressionResult): PublicCompressionResult {
  const { rawJson: _rawJson, provenanceMap, ...safeResult } = result;
  const safeProvenance = Object.fromEntries(
    Object.entries(provenanceMap).map(([ref, entry]) => {
      const { fullSnippet: _fullSnippet, ...safeEntry } = entry;
      return [ref, safeEntry];
    }),
  );
  return { ...safeResult, provenanceMap: safeProvenance };
}

/** Best-effort sanitizer for a configured Python service response. */
export function sanitizePublicCompressionResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const { rawJson: _rawJson, provenanceMap, ...safe } = input;
  if (!provenanceMap || typeof provenanceMap !== "object" || Array.isArray(provenanceMap)) return safe;
  const safeMap = Object.fromEntries(
    Object.entries(provenanceMap as Record<string, unknown>).map(([ref, rawEntry]) => {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return [ref, rawEntry];
      const { fullSnippet: _fullSnippet, ...safeEntry } = rawEntry as Record<string, unknown>;
      return [ref, safeEntry];
    }),
  );
  return { ...safe, provenanceMap: safeMap };
}
