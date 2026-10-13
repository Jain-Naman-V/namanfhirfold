import { strict as assert } from "node:assert";
import { compressFhir } from "../src/services/fhirCompressor.ts";
import type { CompressionFormat } from "../src/types/fhir.ts";

const formats: CompressionFormat[] = [
  "compact_json",
  "medprompt_text",
  "fhirbench_markdown",
  "cds_hooks_prefetch",
];

const bundle = {
  resourceType: "Bundle",
  type: "collection",
  entry: [
    {
      resource: {
        resourceType: "Condition",
        id: "condition-body-site",
        code: { text: "Allergic asthma" },
        bodySite: [
          {
            text: "Unilateral left",
            coding: [{ system: "http://snomed.info/sct", code: "419161000", display: "Unilateral left" }],
          },
        ],
        recordedDate: "2025-12-14T15:17:34-05:00",
      },
    },
    {
      resource: {
        resourceType: "Procedure",
        id: "procedure-performed-period",
        code: { text: "Follow-up procedure" },
        performedPeriod: {
          start: "2026-04-14T14:07:53-04:00",
          end: "2026-04-14T14:25:29-04:00",
        },
      },
    },
  ],
};

const ageBundle = (birthDate: string) => ({
  resourceType: "Bundle",
  type: "collection",
  entry: [{ resource: { resourceType: "Patient", id: "patient-age", birthDate } }],
});

for (const format of formats) {
  const result = compressFhir(bundle, {
    format,
    granularity: "exact_timestamp",
    tokenBudget: 0,
  });

  assert.match(result.compressedOutput, /Unilateral left/);
  assert.match(result.compressedOutput, /2026-04-14T14:07:53-04:00/);
  assert.match(result.compressedOutput, /2026-04-14T14:25:29-04:00/);
}

const currentYear = new Date().getUTCFullYear();
const today = new Date();
const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
const beforeBirthday = `${currentYear - 26}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
const afterBirthday = `${currentYear - 26}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`;
const beforeBirthdayResult = compressFhir(ageBundle(beforeBirthday), {
  format: "compact_json",
  tokenBudget: 0,
});
const afterBirthdayResult = compressFhir(ageBundle(afterBirthday), {
  format: "compact_json",
  tokenBudget: 0,
});
assert.match(beforeBirthdayResult.compressedOutput, /"age": 25/);
assert.match(afterBirthdayResult.compressedOutput, /"age": 26/);

console.log("clinicalFidelity.regression: expected clinical fields retained");
