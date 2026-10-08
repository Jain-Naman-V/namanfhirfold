/**
 * High-Performance FHIR R4 Token Compressor & Clinical Fact Preservation Engine
 * Inspired by FHIRBench, MedPrompt (FHIR2Text), fhir-medrecon, and FHIR-MCP.
 * 
 * CORE CLINICAL CONSTITUTION:
 * "Token Reduction + Clinical Information Retention + Task Accuracy"
 * Never throw away actionable clinical facts (CarePlan activities, dosages, ranges, abnormal flags).
 */

import {
  FhirBundle,
  FhirResource,
  CompressionOptions,
  CompressionResult,
  ClinicalFact,
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

// 1. Observation extractor
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
    status: obs.status !== "final" ? obs.status : undefined,
  };
}

// 2. CarePlan Extractor (Preserves clinical activities, instructions, categories, dates)
export function compressCarePlan(cp: any): any {
  // Extract category e.g. "Minor surgery care management"
  let categoryName = "";
  if (cp.category && cp.category[0]) {
    categoryName = extractConcept(cp.category[0]).name;
  }

  // Extract period
  let periodStr = "";
  if (cp.period) {
    const s = formatShortDate(cp.period.start);
    const e = formatShortDate(cp.period.end);
    if (s && e) periodStr = `${s} to ${e}`;
    else if (s) periodStr = `From ${s}`;
  }

  // Extract activities & recommendations
  const activities: string[] = [];
  if (cp.activity && Array.isArray(cp.activity)) {
    cp.activity.forEach((act: any) => {
      let actText = "";
      if (act.detail) {
        const detailConcept = extractConcept(act.detail.code);
        const desc = act.detail.description;
        if (detailConcept.name !== "Unknown" && desc) {
          actText = `${detailConcept.name}: ${desc}`;
        } else if (detailConcept.name !== "Unknown") {
          actText = detailConcept.name;
        } else if (desc) {
          actText = desc;
        }
      } else if (act.progress && act.progress[0]?.text) {
        actText = act.progress[0].text;
      }
      if (actText) activities.push(actText);
    });
  }

  return {
    type: "CarePlan",
    title: cp.title || undefined,
    category: categoryName || undefined,
    status: cp.status,
    intent: cp.intent !== "plan" ? cp.intent : undefined,
    period: periodStr || undefined,
    activities: activities.length > 0 ? activities : undefined,
  };
}

// 3. MedicationRequest extractor
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

// 4. Condition extractor
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

// 5. AllergyIntolerance extractor
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

// 6. Patient extractor
export function compressPatient(pat: any): any {
  let name = "";
  if (pat.name && pat.name[0]) {
    const n = pat.name[0];
    const given = Array.isArray(n.given) ? n.given.join(" ") : n.given || "";
    const family = n.family || "";
    name = `${given} ${family}`.trim();
  }

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

// 7. Procedure extractor
export function compressProcedure(proc: any): any {
  const concept = extractConcept(proc.code);
  const status = proc.status;
  const date = formatShortDate(proc.performedDateTime || proc.performedPeriod?.start);
  return {
    procedure: concept.name,
    code: concept.code ? `${concept.system ? concept.system + ":" : ""}${concept.code}` : undefined,
    status,
    date: date || undefined,
  };
}

// 8. DiagnosticReport extractor
export function compressDiagnosticReport(diag: any): any {
  const concept = extractConcept(diag.code);
  const conclusion = diag.conclusion;
  const date = formatShortDate(diag.effectiveDateTime || diag.issued);
  return {
    report: concept.name,
    conclusion: conclusion || undefined,
    status: diag.status,
    date: date || undefined,
  };
}

// 9. Encounter extractor
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

/**
 * CLINICAL FACT AUDITOR
 * Extracts atomic clinical facts from raw FHIR and audits if they survived in compressed context.
 */
export function extractAndAuditFacts(resources: any[], compressedText: string): ClinicalFact[] {
  const facts: ClinicalFact[] = [];
  const textLower = compressedText.toLowerCase();

  resources.forEach((res, rIdx) => {
    const rt = res.resourceType;

    // CarePlan Facts
    if (rt === "CarePlan") {
      if (res.category && res.category[0]) {
        const cat = extractConcept(res.category[0]).name;
        facts.push({
          id: `fact-cp-cat-${rIdx}`,
          resourceType: "CarePlan",
          category: "Instruction",
          label: "CarePlan Category",
          value: cat,
          preserved: textLower.includes(cat.toLowerCase()),
        });
      }
      if (res.period?.start) {
        const p = `${formatShortDate(res.period.start)} to ${formatShortDate(res.period.end)}`;
        facts.push({
          id: `fact-cp-period-${rIdx}`,
          resourceType: "CarePlan",
          category: "Temporal",
          label: "CarePlan Period",
          value: p,
          preserved: textLower.includes(formatShortDate(res.period.start)),
        });
      }
      if (res.activity && Array.isArray(res.activity)) {
        res.activity.forEach((act: any, aIdx: number) => {
          const name = extractConcept(act.detail?.code).name;
          if (name && name !== "Unknown") {
            facts.push({
              id: `fact-cp-act-${rIdx}-${aIdx}`,
              resourceType: "CarePlan",
              category: "Activity",
              label: `Activity #${aIdx + 1}`,
              value: name,
              preserved: textLower.includes(name.toLowerCase()),
            });
          }
        });
      }
    }

    // Observation Facts
    if (rt === "Observation") {
      const name = extractConcept(res.code).name;
      let val = "";
      if (res.valueQuantity) val = `${res.valueQuantity.value} ${res.valueQuantity.unit || ""}`.trim();
      else if (res.valueString) val = res.valueString;

      if (name && val) {
        facts.push({
          id: `fact-obs-${rIdx}`,
          resourceType: "Observation",
          category: "Finding",
          label: name,
          value: val,
          preserved: textLower.includes(name.toLowerCase()) && textLower.includes(`${res.valueQuantity?.value ?? ""}`),
        });
      }

      if (res.referenceRange && res.referenceRange[0]) {
        const rr = formatRefRange(res.referenceRange);
        if (rr) {
          facts.push({
            id: `fact-rr-${rIdx}`,
            resourceType: "Observation",
            category: "Range",
            label: `${name} Range`,
            value: rr,
            preserved: textLower.includes(rr.split(" ")[0].toLowerCase()),
          });
        }
      }
    }

    // MedicationRequest Facts
    if (rt === "MedicationRequest") {
      const drug = extractConcept(res.medicationCodeableConcept).name;
      const sig = res.dosageInstruction?.[0]?.text;
      facts.push({
        id: `fact-med-${rIdx}`,
        resourceType: "MedicationRequest",
        category: "Dosage",
        label: drug,
        value: sig || "As prescribed",
        preserved: textLower.includes(drug.toLowerCase().slice(0, 10)),
      });
    }

    // Condition Facts
    if (rt === "Condition") {
      const cond = extractConcept(res.code).name;
      facts.push({
        id: `fact-cond-${rIdx}`,
        resourceType: "Condition",
        category: "Diagnosis",
        label: cond,
        value: res.clinicalStatus?.coding?.[0]?.code || "Active",
        preserved: textLower.includes(cond.toLowerCase().slice(0, 8)),
      });
    }

    // Allergy Facts
    if (rt === "AllergyIntolerance") {
      const alg = extractConcept(res.code).name;
      facts.push({
        id: `fact-alg-${rIdx}`,
        resourceType: "AllergyIntolerance",
        category: "Allergen",
        label: alg,
        value: res.criticality || "Critical",
        preserved: textLower.includes(alg.toLowerCase().slice(0, 8)),
      });
    }
  });

  return facts;
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

  // Query filtering logic
  let filteredResources = resources;
  if (options.queryFilter && options.queryFilter.trim().length > 0) {
    const qLower = options.queryFilter.toLowerCase().trim();
    filteredResources = resources.filter((res) => {
      const resStr = JSON.stringify(res).toLowerCase();
      if (resStr.includes(qLower)) return true;
      if (qLower.includes("care") || qLower.includes("plan") || qLower.includes("activity") || qLower.includes("surgery") || qLower.includes("recovery")) {
        if (res.resourceType === "CarePlan") return true;
      }
      if (qLower.includes("lab") || qLower.includes("test") || qLower.includes("blood") || qLower.includes("cbc")) {
        if (res.resourceType === "Observation" || res.resourceType === "DiagnosticReport") return true;
      }
      if (qLower.includes("med") || qLower.includes("drug") || qLower.includes("prescription") || qLower.includes("dose")) {
        if (res.resourceType.startsWith("Medication")) return true;
      }
      if (qLower.includes("allergy") && res.resourceType === "AllergyIntolerance") return true;
      if (qLower.includes("condition") || qLower.includes("diagnosis")) {
        if (res.resourceType === "Condition") return true;
      }
      return false;
    });
    if (filteredResources.length === 0) filteredResources = resources;
  }

  // Containers
  const patients: any[] = [];
  const observations: any[] = [];
  const medications: any[] = [];
  const conditions: any[] = [];
  const allergies: any[] = [];
  const carePlans: any[] = [];
  const procedures: any[] = [];
  const diagnosticReports: any[] = [];
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
      case "CarePlan": {
        const c = compressCarePlan(res);
        if (c) carePlans.push(c);
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
      case "Procedure": {
        const c = compressProcedure(res);
        if (c) procedures.push(c);
        break;
      }
      case "DiagnosticReport": {
        const c = compressDiagnosticReport(res);
        if (c) diagnosticReports.push(c);
        break;
      }
      case "Encounter": {
        const c = compressEncounter(res);
        if (c) encounters.push(c);
        break;
      }
      default: {
        others.push({
          type: res.resourceType,
          id: res.id,
          name: res.name || res.title || res.code?.text,
          status: res.status,
        });
      }
    }
  });

  // Build target outputs
  let compressedOutput = "";

  if (options.format === "compact_json") {
    // Zero-bloat JSON without metadata loss
    const compactObj: Record<string, any> = {};
    if (patients.length === 1) compactObj.patient = patients[0];
    else if (patients.length > 1) compactObj.patients = patients;

    if (allergies.length > 0) compactObj.allergies = allergies;
    if (conditions.length > 0) compactObj.conditions = conditions;
    if (carePlans.length > 0) compactObj.carePlans = carePlans;
    if (medications.length > 0) compactObj.medications = medications;
    if (observations.length > 0) compactObj.labs = observations;
    if (procedures.length > 0) compactObj.procedures = procedures;
    if (diagnosticReports.length > 0) compactObj.diagnosticReports = diagnosticReports;
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
    if (carePlans.length > 0) {
      lines.push(`\nCARE PLANS & PROTOCOLS:`);
      carePlans.forEach((cp) => {
        lines.push(`• Plan: ${cp.category || cp.title || "Care Plan"} [Status: ${cp.status}]${cp.period ? ` (Period: ${cp.period})` : ""}`);
        if (cp.activities && cp.activities.length > 0) {
          cp.activities.forEach((act: string) => {
            lines.push(`  - Instruction: ${act}`);
          });
        }
      });
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
    if (carePlans.length > 0) {
      sections.push(
        `### Care Plans & Patient Instructions\n` +
        carePlans.map((cp) => 
          `**${cp.category || cp.title || "Care Plan"}** (${cp.status}, ${cp.period || "active"})\n` +
          (cp.activities ? cp.activities.map((a: string) => `- ${a}`).join("\n") : "- No specific activities logged.")
        ).join("\n\n")
      );
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
          carePlans: carePlans,
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

  // Token Metrics
  const rawCharCount = rawJsonString.length;
  const compressedCharCount = compressedOutput.length;
  const rawTokens = Math.max(1, Math.round(rawCharCount / 3.8));
  const compressedTokens = Math.max(1, Math.round(compressedCharCount / 3.8));
  const reductionPercentage = Math.round(((rawTokens - compressedTokens) / rawTokens) * 100);
  const tokenMultiple = Math.round((rawTokens / Math.max(1, compressedTokens)) * 10) / 10;

  // Audit Clinical Facts
  const clinicalFacts = extractAndAuditFacts(filteredResources, compressedOutput);
  const totalFacts = clinicalFacts.length;
  const preservedFactsCount = clinicalFacts.filter((f) => f.preserved).length;
  const factRetentionRate = totalFacts > 0 ? Math.round((preservedFactsCount / totalFacts) * 100) : 100;

  const retainedFields = [
    "CarePlan.category & title (Condition / Protocol)",
    "CarePlan.activity[].detail.code & description (Mandatory Instructions)",
    "CarePlan.period (Start & End Recovery Dates)",
    "Observation.code.display (Test Name)",
    "Observation.valueQuantity.value (Result Value)",
    "Observation.valueQuantity.unit (Unit)",
    "Observation.referenceRange (Normal Limits)",
    "Observation.interpretation (Abnormal Flags)",
    "MedicationRequest.dosageInstruction (Sig / Dose)",
    "Condition.code (Diagnosis & Status)",
    "AllergyIntolerance.code & reaction (Allergen & Severity)",
  ];

  const strippedFields = [
    "meta.profile, versionId, and lastUpdated (Canonical Schema Bloat)",
    "text.div (Auto-generated XHTML Redundant Markup)",
    "coding[].system ('http://snomed.info/sct', 'http://loinc.org' URLs)",
    "subject.reference & display repeated on every resource",
    "encounter.reference ('Encounter/enc-surg-001')",
    "careTeam[].reference and duplicate identifiers",
    "search.mode and bundle wrapper syntax",
  ];

  const resourceBreakdown = Object.entries(resourceTypeCount).map(([rt, count]) => ({
    resourceType: rt,
    rawCount: count,
    compressedItems:
      rt === "Observation"
        ? observations.length
        : rt === "CarePlan"
        ? carePlans.length
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
    tokenMultiple,
    retainedFields,
    strippedFields,
    clinicalFacts,
    totalFacts,
    preservedFactsCount,
    factRetentionRate,
    resourceBreakdown,
  };
}
