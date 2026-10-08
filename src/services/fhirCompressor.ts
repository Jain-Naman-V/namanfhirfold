/**
 * High-Performance FHIR R4 Token Compressor & Clinical Context Engine
 * Inspired by FHIRBench, MedPrompt (FHIR2Text), fhir-medrecon, and FHIR-MCP.
 */

import {
  FhirBundle,
  FhirResource,
  CompressionOptions,
  CompressionResult,
} from "../types/fhir.ts";

// Helper to normalize coding system URLs to compact human/LLM-readable identifiers
function normalizeSystem(system?: string): string {
  if (!system) return "";
  if (system.includes("loinc.org")) return "LOINC";
  if (system.includes("snomed.info")) return "SNOMED";
  if (system.includes("rxnorm") || system.includes("nlm.nih.gov")) return "RxNorm";
  if (system.includes("unitsofmeasure.org") || system.includes("ucum")) return "UCUM";
  if (system.includes("icd-10")) return "ICD-10";
  if (system.includes("cpt")) return "CPT";
  if (system.includes("cvx")) return "CVX";
  // fallback: return last segment or brief name
  const parts = system.split("/").filter(Boolean);
  return parts[parts.length - 1] || system;
}

// Extract primary concept name and normalized code
function extractConcept(concept?: any): { name: string; code?: string; system?: string } {
  if (!concept) return { name: "Unknown" };
  const coding = concept.coding?.[0];
  const name = concept.text || coding?.display || coding?.code || "Unknown";
  if (coding?.code) {
    const sys = normalizeSystem(coding.system);
    return {
      name,
      code: coding.code,
      system: sys || undefined,
    };
  }
  return { name };
}

// Format date into short ISO YYYY-MM-DD
function formatShortDate(dt?: string): string {
  if (!dt) return "";
  return dt.split("T")[0];
}

// Format reference range string e.g. "13.0 - 17.0 g/dL"
function formatRefRange(ranges?: any[]): string | undefined {
  if (!ranges || ranges.length === 0) return undefined;
  const r = ranges[0];
  if (r.text) return r.text;
  const low = r.low?.value !== undefined ? `${r.low.value}` : "";
  const high = r.high?.value !== undefined ? `${r.high.value}` : "";
  const unit = r.low?.unit || r.high?.unit || "";
  if (low && high) return `${low}-${high} ${unit}`.trim();
  if (low) return `>${low} ${unit}`.trim();
  if (high) return `<${high} ${unit}`.trim();
  return undefined;
}

// Observation extractor: from ~250 tokens down to ~20 tokens
export function compressObservation(obs: any, opts: CompressionOptions): any | null {
  const concept = extractConcept(obs.code);
  let valStr: string | number = "";
  let unit = "";

  if (obs.valueQuantity) {
    valStr = obs.valueQuantity.value ?? "";
    unit = obs.valueQuantity.unit || obs.valueQuantity.code || "";
  } else if (obs.valueString) {
    valStr = obs.valueString;
  } else if (obs.valueCodeableConcept) {
    valStr = extractConcept(obs.valueCodeableConcept).name;
  } else if (obs.component && Array.isArray(obs.component)) {
    // Multi-component (e.g. Blood Pressure: Systolic / Diastolic)
    const comps = obs.component.map((c: any) => {
      const cName = extractConcept(c.code).name;
      const cVal = c.valueQuantity?.value;
      const cUnit = c.valueQuantity?.unit || "";
      return `${cName}: ${cVal} ${cUnit}`.trim();
    });
    valStr = comps.join(", ");
  }

  const range = formatRefRange(obs.referenceRange);
  let interpretation: string | undefined = undefined;
  if (obs.interpretation && obs.interpretation[0]) {
    const interpCoding = obs.interpretation[0].coding?.[0];
    interpretation = interpCoding?.code || interpCoding?.display || obs.interpretation[0].text;
  }

  // Check abnormal filter if requested
  const isAbnormal = !!interpretation && !["N", "normal", "Normal"].includes(interpretation.toLowerCase());
  if (opts.onlyAbnormalLabs && !isAbnormal) {
    return null;
  }

  const date = formatShortDate(obs.effectiveDateTime || obs.issued);

  return {
    test: concept.name,
    code: concept.code ? `${concept.system ? concept.system + ":" : ""}${concept.code}` : undefined,
    value: typeof valStr === "number" ? valStr : `${valStr} ${unit}`.trim(),
    unit: typeof valStr === "number" ? unit || undefined : undefined,
    range: range || undefined,
    flag: interpretation || undefined,
    date: date || undefined,
    status: obs.status !== "final" ? obs.status : undefined, // omit "final" if default
  };
}

// MedicationRequest extractor: from ~350 tokens down to ~35 tokens
export function compressMedicationRequest(med: any): any {
  const concept = extractConcept(med.medicationCodeableConcept);
  let drugName = concept.name;
  if (drugName === "Unknown" && med.medicationReference?.display) {
    drugName = med.medicationReference.display;
  }

  let sig = "";
  if (med.dosageInstruction && med.dosageInstruction[0]) {
    const d = med.dosageInstruction[0];
    sig = d.text || "";
    if (!sig && d.doseAndRate && d.doseAndRate[0]) {
      const dose = d.doseAndRate[0].doseQuantity;
      const route = d.route?.coding?.[0]?.display || d.route?.text || "";
      sig = `${dose?.value || ""} ${dose?.unit || ""} ${route}`.trim();
    }
  }

  const date = formatShortDate(med.authoredOn);

  return {
    drug: drugName,
    code: concept.code ? `${concept.system ? concept.system + ":" : ""}${concept.code}` : undefined,
    sig: sig || undefined,
    status: med.status,
    date: date || undefined,
  };
}

// Condition extractor
export function compressCondition(cond: any): any {
  const concept = extractConcept(cond.code);
  const status = cond.clinicalStatus?.coding?.[0]?.code || cond.clinicalStatus?.text;
  const verification = cond.verificationStatus?.coding?.[0]?.code;
  const onset = formatShortDate(cond.onsetDateTime || cond.recordedDate);
  const severity = cond.severity?.coding?.[0]?.display || cond.severity?.text;

  return {
    condition: concept.name,
    code: concept.code ? `${concept.system ? concept.system + ":" : ""}${concept.code}` : undefined,
    status: status || undefined,
    verification: verification || undefined,
    severity: severity || undefined,
    onset: onset || undefined,
  };
}

// AllergyIntolerance extractor
export function compressAllergy(alg: any): any {
  const concept = extractConcept(alg.code);
  const criticality = alg.criticality;
  const status = alg.clinicalStatus?.coding?.[0]?.code;
  const reactions: string[] = [];
  if (alg.reaction && Array.isArray(alg.reaction)) {
    alg.reaction.forEach((r: any) => {
      const manifest = r.manifestation?.[0]?.coding?.[0]?.display || r.manifestation?.[0]?.text;
      const sev = r.severity;
      if (manifest) reactions.push(sev ? `${manifest} (${sev})` : manifest);
    });
  }

  return {
    allergen: concept.name,
    criticality: criticality || undefined,
    status: status || undefined,
    reactions: reactions.length > 0 ? reactions.join(", ") : undefined,
  };
}

// Patient extractor
export function compressPatient(pat: any): any {
  let name = "";
  if (pat.name && pat.name[0]) {
    const n = pat.name[0];
    const given = Array.isArray(n.given) ? n.given.join(" ") : n.given || "";
    const family = n.family || "";
    name = `${given} ${family}`.trim();
  }

  // Calculate age if birthDate available
  let age: number | undefined = undefined;
  if (pat.birthDate) {
    const birthYear = new Date(pat.birthDate).getFullYear();
    const currentYear = 2026;
    age = currentYear - birthYear;
  }

  return {
    id: pat.id || undefined,
    name: name || undefined,
    gender: pat.gender || undefined,
    age: age || undefined,
    dob: pat.birthDate || undefined,
  };
}

// Encounter extractor
export function compressEncounter(enc: any): any {
  const encClass = enc.class?.code || enc.class?.display;
  const type = enc.type?.[0]?.coding?.[0]?.display || enc.type?.[0]?.text;
  const reason = enc.reasonCode?.[0]?.coding?.[0]?.display || enc.reasonCode?.[0]?.text;
  const date = formatShortDate(enc.period?.start);

  return {
    encounter: type || encClass || "Encounter",
    class: encClass || undefined,
    reason: reason || undefined,
    date: date || undefined,
    status: enc.status !== "finished" ? enc.status : undefined,
  };
}

// Main compression function
export function compressFhir(
  fhirPayload: string | object,
  options: CompressionOptions
): CompressionResult {
  let parsed: any;
  const rawJsonString = typeof fhirPayload === "string" ? fhirPayload : JSON.stringify(fhirPayload, null, 2);

  try {
    parsed = typeof fhirPayload === "string" ? JSON.parse(fhirPayload) : fhirPayload;
  } catch (err) {
    throw new Error("Invalid FHIR JSON payload provided.");
  }

  // Collect resources
  const resources: FhirResource[] = [];
  const resourceTypeCount: Record<string, number> = {};

  if (parsed.resourceType === "Bundle" && Array.isArray(parsed.entry)) {
    parsed.entry.forEach((entry: any) => {
      if (entry.resource) {
        resources.push(entry.resource);
        const rt = entry.resource.resourceType || "Unknown";
        resourceTypeCount[rt] = (resourceTypeCount[rt] || 0) + 1;
      }
    });
  } else if (parsed.resourceType) {
    resources.push(parsed);
    resourceTypeCount[parsed.resourceType] = 1;
  }

  // Query filtering logic (if user provided a query like "Hemoglobin" or "Medication")
  let filteredResources = resources;
  if (options.queryFilter && options.queryFilter.trim().length > 0) {
    const qLower = options.queryFilter.toLowerCase().trim();
    filteredResources = resources.filter((res) => {
      const resStr = JSON.stringify(res).toLowerCase();
      // Match query terms
      if (resStr.includes(qLower)) return true;
      // Domain associations
      if (qLower.includes("lab") || qLower.includes("test") || qLower.includes("blood") || qLower.includes("cbc")) {
        if (res.resourceType === "Observation" || res.resourceType === "DiagnosticReport") return true;
      }
      if (qLower.includes("med") || qLower.includes("drug") || qLower.includes("prescription") || qLower.includes("dose")) {
        if (res.resourceType.startsWith("Medication")) return true;
      }
      if (qLower.includes("allergy") && res.resourceType === "AllergyIntolerance") return true;
      if (qLower.includes("condition") || qLower.includes("diagnosis") || qLower.includes("history")) {
        if (res.resourceType === "Condition") return true;
      }
      return false;
    });
    // If filter wiped everything out, fall back to all
    if (filteredResources.length === 0) filteredResources = resources;
  }

  // Group compressed structures
  const patients: any[] = [];
  const observations: any[] = [];
  const medications: any[] = [];
  const conditions: any[] = [];
  const allergies: any[] = [];
  const encounters: any[] = [];
  const others: any[] = [];

  filteredResources.forEach((res) => {
    switch (res.resourceType) {
      case "Patient": {
        const c = compressPatient(res);
        if (c) patients.push(c);
        break;
      }
      case "Observation": {
        const c = compressObservation(res, options);
        if (c) observations.push(c);
        break;
      }
      case "MedicationRequest":
      case "MedicationStatement":
      case "MedicationAdministration": {
        const c = compressMedicationRequest(res);
        if (c) medications.push(c);
        break;
      }
      case "Condition": {
        const c = compressCondition(res);
        if (c) conditions.push(c);
        break;
      }
      case "AllergyIntolerance": {
        const c = compressAllergy(res);
        if (c) allergies.push(c);
        break;
      }
      case "Encounter": {
        const c = compressEncounter(res);
        if (c) encounters.push(c);
        break;
      }
      default: {
        // Generic clean resource
        others.push({
          type: res.resourceType,
          id: res.id,
          name: res.name || res.title || res.code?.text,
          status: res.status,
        });
      }
    }
  });

  // Build compressed representations based on selected format
  let compressedOutput = "";

  if (options.format === "compact_json") {
    const compactObj: Record<string, any> = {};
    if (patients.length === 1) compactObj.patient = patients[0];
    else if (patients.length > 1) compactObj.patients = patients;

    if (allergies.length > 0) compactObj.allergies = allergies;
    if (conditions.length > 0) compactObj.conditions = conditions;
    if (medications.length > 0) compactObj.medications = medications;
    if (observations.length > 0) compactObj.labs = observations;
    if (encounters.length > 0) compactObj.encounters = encounters;
    if (others.length > 0) compactObj.otherResources = others;

    compressedOutput = JSON.stringify(compactObj, null, 2);
  } else if (options.format === "medprompt_text") {
    // MedPrompt Clinical Narrative (FHIR2Text)
    const lines: string[] = [];
    if (patients.length > 0) {
      const p = patients[0];
      lines.push(`PATIENT: ${p.name || p.id || "Patient"} | Age: ${p.age ?? "N/A"} | Sex: ${p.gender ?? "N/A"}`);
    }
    if (allergies.length > 0) {
      lines.push(`\nALLERGIES:`);
      allergies.forEach((a) => {
        lines.push(`• ${a.allergen} (Criticality: ${a.criticality || "unspecified"}${a.reactions ? `, Reactions: ${a.reactions}` : ""})`);
      });
    }
    if (conditions.length > 0) {
      lines.push(`\nCONDITIONS / PROBLEMS:`);
      conditions.forEach((c) => {
        lines.push(`• ${c.condition} [${c.status || "active"}]${c.onset ? ` (Onset: ${c.onset})` : ""}`);
      });
    }
    if (medications.length > 0) {
      lines.push(`\nMEDICATIONS:`);
      medications.forEach((m) => {
        lines.push(`• ${m.drug} ${m.sig ? `- ${m.sig}` : ""} (${m.status || "active"})`);
      });
    }
    if (observations.length > 0) {
      lines.push(`\nLABS & OBSERVATIONS:`);
      observations.forEach((o) => {
        const flagStr = o.flag ? ` [FLAG: ${o.flag}]` : "";
        const rangeStr = o.range ? ` (Ref: ${o.range})` : "";
        lines.push(`• ${o.test}: ${o.value} ${o.unit || ""}${rangeStr}${flagStr} (${o.date || "recent"})`);
      });
    }
    compressedOutput = lines.join("\n").trim();
  } else if (options.format === "fhirbench_markdown") {
    // FHIRBench Tabular Markdown
    const sections: string[] = [];
    if (patients.length > 0) {
      const p = patients[0];
      sections.push(`### Patient Information\n- **Name/ID:** ${p.name || p.id}\n- **Age/Gender:** ${p.age ?? "N/A"} / ${p.gender ?? "N/A"}`);
    }
    if (observations.length > 0) {
      sections.push(`### Laboratory Results\n| Test | Result | Ref Range | Flag | Date |\n|---|---|---|---|---|\n` +
        observations.map((o) => `| ${o.test} | ${o.value} ${o.unit || ""} | ${o.range || "—"} | ${o.flag || "Normal"} | ${o.date || "—"} |`).join("\n")
      );
    }
    if (medications.length > 0) {
      sections.push(`### Medications\n| Medication | Directions | Status | Date |\n|---|---|---|---|\n` +
        medications.map((m) => `| ${m.drug} | ${m.sig || "As directed"} | ${m.status || "active"} | ${m.date || "—"} |`).join("\n")
      );
    }
    if (conditions.length > 0) {
      sections.push(`### Active Conditions\n| Condition | Status | Onset Date |\n|---|---|---|\n` +
        conditions.map((c) => `| ${c.condition} | ${c.status || "active"} | ${c.onset || "—"} |`).join("\n")
      );
    }
    if (allergies.length > 0) {
      sections.push(`### Allergies\n| Substance | Criticality | Reactions |\n|---|---|---|\n` +
        allergies.map((a) => `| ${a.allergen} | ${a.criticality || "Normal"} | ${a.reactions || "—"} |`).join("\n")
      );
    }
    compressedOutput = sections.join("\n\n").trim();
  } else if (options.format === "cds_hooks_prefetch") {
    // CDS Hooks Card & Prefetch Context Format
    compressedOutput = JSON.stringify(
      {
        hook: "patient-view",
        hookInstance: "cds-fast-eval-" + Date.now().toString(36),
        context: {
          patientId: patients[0]?.id || "P001",
          userId: "Practitioner/attending-01",
        },
        prefetch: {
          activeConditions: conditions.map((c) => ({ name: c.condition, code: c.code, status: c.status })),
          currentMedications: medications.map((m) => ({ drug: m.drug, sig: m.sig, status: m.status })),
          recentObservations: observations.map((o) => ({
            test: o.test,
            val: `${o.value} ${o.unit || ""}`.trim(),
            range: o.range,
            flag: o.flag,
            date: o.date,
          })),
        },
      },
      null,
      2
    );
  }

  // Token & Char counts (Standard GPT/Gemini BPE estimate: ~3.7 to 4 chars per token)
  const rawCharCount = rawJsonString.length;
  const compressedCharCount = compressedOutput.length;

  const rawTokens = Math.max(1, Math.round(rawCharCount / 3.8));
  const compressedTokens = Math.max(1, Math.round(compressedCharCount / 3.8));
  const reductionPercentage = Math.round(((rawTokens - compressedTokens) / rawTokens) * 100);

  // Field breakdown
  const retainedFields = [
    "Observation.code.display (Test Name)",
    "Observation.valueQuantity.value (Result Value)",
    "Observation.valueQuantity.unit (Unit)",
    "Observation.referenceRange (Normal Limits)",
    "Observation.interpretation (Abnormal Flags)",
    "Observation.effectiveDateTime (Date)",
    "MedicationRequest.medicationCodeableConcept (Drug Name & RxNorm)",
    "MedicationRequest.dosageInstruction (Sig / Dose)",
    "Condition.code (Diagnosis)",
    "AllergyIntolerance.code & reaction (Allergen & Severity)",
  ];

  const strippedFields = [
    "meta.profile (Canonical URIs)",
    "meta.versionId & lastUpdated",
    "text.div (XHTML Narratives)",
    "category.coding (Redundant classifications)",
    "coding[].system ('http://loinc.org', 'http://unitsofmeasure.org' URLs)",
    "subject.reference ('Patient/P001' repeated 20+ times)",
    "issued & performers (Auditing timestamps)",
    "fullUrl ('urn:uuid:... / http://...')",
    "search.mode ('match')",
    "resourceType: 'Bundle' & entry[] nesting syntax",
  ];

  const resourceBreakdown = Object.entries(resourceTypeCount).map(([rt, count]) => ({
    resourceType: rt,
    rawCount: count,
    compressedItems:
      rt === "Observation"
        ? observations.length
        : rt.startsWith("Medication")
        ? medications.length
        : rt === "Condition"
        ? conditions.length
        : rt === "AllergyIntolerance"
        ? allergies.length
        : rt === "Patient"
        ? patients.length
        : others.length,
  }));

  return {
    rawJson: rawJsonString,
    compressedOutput,
    format: options.format,
    rawCharCount,
    compressedCharCount,
    rawTokens,
    compressedTokens,
    reductionPercentage: Math.max(0, reductionPercentage),
    retainedFields,
    strippedFields,
    resourceBreakdown,
  };
}
