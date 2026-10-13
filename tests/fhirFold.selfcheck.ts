/**
 * Self-check for the FHIR fold engine. Run: npm test  (tsx tests/fhirFold.selfcheck.ts)
 * Fails (non-zero exit) if a clinical value is dropped, a cell renders blank,
 * a member group is unresolved, or a normal result is fabricated as abnormal.
 */
import { strict as assert } from "node:assert";
import { compressFhir } from "../src/services/fhirCompressor.ts";
import type { CompressionFormat } from "../src/types/fhir.ts";

const FMTS: CompressionFormat[] = [
  "fhirbench_markdown",
  "compact_json",
  "medprompt_text",
  "cds_hooks_prefetch",
];
const opts = { granularity: "exact_timestamp", tokenBudget: 0 } as const;

const out = (b: any, f: CompressionFormat) => compressFhir(b, { ...opts, format: f } as any).compressedOutput;
const everyFmt = (b: any, needle: string) => {
  for (const f of FMTS) assert.ok(out(b, f).includes(needle), `missing "${needle}" in ${f}`);
};
const blankRows = (s: string) =>
  s.split("\n").filter((l) => l.startsWith("|") && /\|\s*\*\*\s*\*\*\s*\|/.test(l)).length;

const bundle = (resources: any[]) => ({
  resourceType: "Bundle",
  type: "collection",
  entry: resources.map((r) => ({ resource: r })),
});

// 1. every value[x] variant renders
{
  const mk = (v: any) => ({
    resourceType: "Observation",
    id: "o1",
    status: "final",
    code: { coding: [{ code: "1234-5", display: "Test analyte" }] },
    effectiveDateTime: "2026-01-02T03:04:05Z",
    ...v,
  });
  everyFmt(bundle([mk({ valueString: "strung" })]), "strung");
  everyFmt(bundle([mk({ valueQuantity: { value: 42, unit: "mg" } })]), "42");
  everyFmt(bundle([mk({ valueBoolean: true })]), "Yes");
  everyFmt(bundle([mk({ valueInteger: 7 })]), "7");
  everyFmt(bundle([mk({ valueRange: { low: { value: 1, unit: "x" }, high: { value: 9, unit: "x" } } })]), "9");
  everyFmt(bundle([mk({ valueRatio: { numerator: { value: 3 }, denominator: { value: 4 } } })]), "3");
  everyFmt(bundle([mk({ valueTime: "10:11:12" })]), "10:11:12");
  everyFmt(bundle([mk({ valueDateTime: "2026-03-04" })]), "2026-03-04");
  everyFmt(
    bundle([mk({ valueCodeableConcept: { coding: [{ display: "One" }, { display: "Two" }] } })]),
    "One"
  );
}

// 2. no fabricated "Normal": unflagged obs must not gain an interpretation
{
  const o = {
    resourceType: "Observation",
    id: "o2",
    status: "final",
    code: { coding: [{ code: "x", display: "Plain" }] },
    valueQuantity: { value: 1, unit: "u" },
    effectiveDateTime: "2026-01-01",
  };
  for (const f of FMTS) {
    const s = out(bundle([o]), f);
    assert.ok(!/\bNormal\b/.test(s), `fabricated Normal in ${f}`);
  }
}

// 3. hasMember grouping resolves to short refs, no blank cells
{
  const parent = {
    resourceType: "Observation",
    id: "bp",
    status: "final",
    code: { coding: [{ code: "85354-9", display: "Blood pressure panel" }] },
    hasMember: [{ reference: "Observation/sys" }, { reference: "Observation/dia" }],
    effectiveDateTime: "2026-01-01T00:00:00Z",
  };
  const sys = {
    resourceType: "Observation",
    id: "sys",
    status: "final",
    code: { coding: [{ code: "8480-6", display: "Systolic" }] },
    valueQuantity: { value: 148, unit: "mmHg" },
    effectiveDateTime: "2026-01-01T00:00:00Z",
  };
  const dia = {
    resourceType: "Observation",
    id: "dia",
    status: "final",
    code: { coding: [{ code: "8462-4", display: "Diastolic" }] },
    valueQuantity: { value: 92, unit: "mmHg" },
    effectiveDateTime: "2026-01-01T00:00:00Z",
  };
  const md = out(bundle([parent, sys, dia]), "fhirbench_markdown");
  everyFmt(bundle([parent, sys, dia]), "148");
  everyFmt(bundle([parent, sys, dia]), "92");
  assert.equal(blankRows(md), 0, "blank markdown cell in member group");
}

// 4. refuted / verification-status conditions are retained, never dropped
{
  const cond = {
    resourceType: "Condition",
    id: "c1",
    clinicalStatus: { coding: [{ code: "active" }] },
    verificationStatus: { coding: [{ code: "refuted" }], display: "Refuted" },
    code: { coding: [{ code: "123", display: "Refuted diagnosis" }] },
    subject: { reference: "Patient/p1" },
  };
  everyFmt(bundle([cond]), "Refuted diagnosis");
}

// 5. grouped / multi-bundle exports (ecw-style nesting) compress without loss
{
  const patient = {
    resourceType: "Patient",
    id: "p1",
    name: [{ text: "Doe, Jane", given: ["Jane"], family: "Doe" }],
    gender: "female",
    birthDate: "1980-05-06",
  };
  const grouped = {
    Patients: [patient],
    Conditions: [
      {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "Condition",
              id: "c2",
              code: { coding: [{ code: "9", display: "Grouped finding" }] },
              subject: { reference: "Patient/p1" },
            },
          },
        ],
      },
    ],
  };
  everyFmt(grouped, "Doe, Jane");
  everyFmt(grouped, "Grouped finding");
}

console.log("fhirFold.selfcheck: all assertions passed");
