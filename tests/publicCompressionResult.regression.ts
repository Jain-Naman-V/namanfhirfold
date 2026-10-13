import { strict as assert } from "node:assert";
import { toPublicCompressionResult } from "../src/services/publicCompressionResult.ts";
import { compressFhir } from "../src/services/fhirCompressor.ts";

const privateResult = compressFhir(
  { resourceType: "Patient", id: "phi-patient", name: [{ text: "Private Patient" }] },
  { format: "compact_json", tokenBudget: 0 },
);
const publicResult = toPublicCompressionResult(privateResult);
assert.equal("rawJson" in publicResult, false);
assert.equal("fullSnippet" in (publicResult.provenanceMap.P1 ?? {}), false);

const budgetResult = compressFhir(
  {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      { resource: { resourceType: "Patient", id: "safety", birthDate: "1990-01-01" } },
      { resource: { resourceType: "Observation", id: "normal", code: { text: "A very detailed historical observation" }, valueString: "historical" } },
    ],
  },
  { format: "compact_json", tokenBudget: 1 },
);
assert.equal(budgetResult.budgetExceeded, true);
assert.match(budgetResult.compressedOutput, /token budget/);
assert.match(budgetResult.compressedOutput, /safety/);

console.log("publicCompressionResult.regression: redaction and budget metadata passed");
