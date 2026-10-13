/**
 * namanfhirfold Task-Aware FHIR Context Optimizer
 *
 * CONTRACT:
 * optimize(bundle, intent, token_budget) -> compact_context + provenance_map
 *
 * 6-Stage Pipeline:
 * 1. Parse & reference indexing
 * 2. Structural strip (meta, text.div, URIs, search wrappers)
 * 3. Dedupe & safety validation (filter entered-in-error / refuted)
 * 4. Task-aware intent & profile selection (CDS deterministic vs free query)
 * 5. Ranking & Token Budgeting (safety resources prioritized with explicit overflow)
 * 6. Provenance mapping (short refs: O1, M1, CP1) + Omission transparency
 */

import {
  FhirBundle,
  FhirResource,
  CompressionOptions,
  CompressionResult,
  ClinicalFact,
  ProvenanceEntry,
  CdsProfile,
  GranularityMode,
} from "./fhir.js";

// Prefix table for compact system identifiers
function normalizeSystem(system?: string): string {
  if (!system) return "";
  if (system.includes("loinc.org")) return "loinc";
  if (system.includes("snomed.info")) return "snomed";
  if (system.includes("rxnorm") || system.includes("nlm.nih.gov")) return "rxnorm";
  if (system.includes("unitsofmeasure.org") || system.includes("ucum")) return "ucum";
  if (system.includes("icd-10")) return "icd10";
  if (system.includes("cvx")) return "cvx";
  const parts = system.split("/").filter(Boolean);
  return parts[parts.length - 1] || system;
}

// Concept extraction helper
function humanName(n: any): string {
  if (!n) return "";
  const arr = Array.isArray(n) ? n : [n];
  return arr
    .map((x: any) =>
      x?.text || [x?.prefix?.join(" "), x?.given?.join(" "), x?.family].filter(Boolean).join(" ")
    )
    .filter(Boolean)
    .join(" | ");
}

function calculateAge(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return undefined;
  const today = new Date();
  if (dob > today) return undefined;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const birthdayPassed =
    today.getUTCMonth() > dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return Math.max(0, age);
}

// text + coding display together when they differ (e.g. "Refuted (w/u negative)")
function codeDisplay(c: any): string {
  if (!c) return "";
  const disp = c.coding?.[0]?.display || c.coding?.[0]?.code || "";
  const text = c.text || "";
  if (text && disp && text !== disp) return `${disp} (${text})`;
  return text || disp;
}

// text + every coding display/code, unique within the supported concept contract
function conceptAll(c: any): string {
  if (!c) return "";
  const parts: string[] = [];
  const push = (x: any) => { const s = String(x ?? "").trim(); if (s && !parts.includes(s)) parts.push(s); };
  push(c.text);
  (c.coding || []).forEach((d: any) => { push(d.display); push(d.code); });
  return parts.join(" / ");
}

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

// Check if an observation is a Vital Sign vs Laboratory
function isVitalSign(obs: any): boolean {
  // 1. Check FHIR category
  if (obs.category && Array.isArray(obs.category)) {
    for (const cat of obs.category) {
      const code = cat.coding?.[0]?.code || "";
      const display = cat.coding?.[0]?.display || cat.text || "";
      if (code === "vital-signs" || display.toLowerCase().includes("vital")) {
        return true;
      }
    }
  }

  // 2. Check LOINC codes for known vital signs
  const code = obs.code?.coding?.[0]?.code;
  const vitalLoincs = [
    "72514-3", // Pain severity
    "85354-9", // Blood pressure panel
    "8480-6",  // Systolic BP
    "8462-4",  // Diastolic BP
    "8867-4",  // Heart rate
    "9279-1",  // Respiratory rate
    "8310-5",  // Body temperature
    "59408-5", // Oxygen saturation (SpO2)
    "29463-7", // Body weight
    "8302-2",  // Body height
    "39156-5", // BMI
  ];
  if (code && vitalLoincs.includes(code)) return true;

  const name = (obs.code?.text || obs.code?.coding?.[0]?.display || "").toLowerCase();
  if (name.includes("pain") || name.includes("blood pressure") || name.includes("pulse") || name.includes("heart rate") || name.includes("temperature")) {
    return true;
  }

  return false;
}

// Universal value[x] extractor — every FHIR value type, never silently blank.
// Returns {value, unit} or {absent: reason} when data-absent-reason applies.
function extractValue(src: any): { value: any; unit?: string; absent?: string } {
  if (!src) return { value: "" };
  const dq = src.valueQuantity;
  if (dq) return { value: dq.value, unit: dq.unit || dq.code || undefined };
  if (src.valueString !== undefined) return { value: src.valueString };
  if (src.valueBoolean !== undefined) return { value: src.valueBoolean ? "Yes" : "No" };
  if (src.valueInteger !== undefined) return { value: src.valueInteger };
  if (src.valueDateTime) return { value: src.valueDateTime };
  if (src.valueTime) return { value: src.valueTime };
  if (src.valuePeriod) {
    const p = src.valuePeriod;
    return { value: p.start && p.end ? `${p.start} to ${p.end}` : p.start || p.end || "" };
  }
  if (src.valueRange) {
    const r = src.valueRange;
    const lo = r.low?.value;
    const hi = r.high?.value;
    const u = r.low?.unit || r.high?.unit || "";
    if (lo !== undefined && hi !== undefined) return { value: `${lo}-${hi}`, unit: u || undefined };
    if (lo !== undefined) return { value: `>=${lo}`, unit: u || undefined };
    if (hi !== undefined) return { value: `<=${hi}`, unit: u || undefined };
  }
  if (src.valueRatio) {
    const r = src.valueRatio;
    if (r.numerator?.value !== undefined && r.denominator?.value !== undefined) {
      return { value: `${r.numerator.value}/${r.denominator.value}`, unit: r.numerator.unit || undefined };
    }
  }
  if (src.valueCodeableConcept) {
    const cc = src.valueCodeableConcept;
    const dar = (cc.coding || []).find(
      (c: any) => (c.system || "").includes("data-absent-reason") || c.code === "unknown"
    );
    const text = cc.text || cc.coding?.[0]?.display || cc.coding?.[0]?.code;
    if (dar && !cc.text && !cc.coding?.some((c: any) => !(c.system || "").includes("data-absent-reason"))) {
      return { value: "", absent: dar.code || "unknown" };
    }
    if (dar && cc.coding?.length === 1) return { value: "", absent: dar.code || "unknown" };
    return { value: conceptAll(cc) || text || "" };
  }
  const dar = src.dataAbsentReason;
  if (dar) return { value: "", absent: dar.coding?.[0]?.code || dar.text || "unknown" };
  return { value: "" };
}

// Format date according to granularity
function formatDateTime(dt?: string, granularity: GranularityMode = "date_only"): string {
  if (!dt) return "";
  if (granularity === "exact_timestamp") {
    // preserve full ISO timestamp e.g. 2015-06-05T18:21:10-04:00
    return dt;
  }
  // date_only: YYYY-MM-DD
  return dt.split("T")[0];
}

// Date from any of the FHIR effective[x] / issued forms
function obsDate(res: any): string | undefined {
  if (res.effectiveDateTime) return res.effectiveDateTime;
  if (res.effectivePeriod) return res.effectivePeriod.start || res.effectivePeriod.end;
  if (res.effectiveTiming) return res.effectiveTiming.event?.[0];
  if (res.effectiveInstant) return res.effectiveInstant;
  if (res.issued) return res.issued;
  if (res.issuedPeriod) return res.issuedPeriod.start;
  return undefined;
}

function resourceDateSpan(res: any, granularity: GranularityMode): string | undefined {
  const period = res.performedPeriod || res.occurrencePeriod || res.period;
  const start = formatDateTime(
    obsDate(res) ||
      res.performedDateTime ||
      res.occurrenceDateTime ||
      period?.start ||
      res.recordedDate ||
      res.authoredOn,
    granularity
  );
  const end = formatDateTime(period?.end, granularity);
  if (start && end && start !== end) return `${start} to ${end}`;
  return start || end || undefined;
}

// Format reference range string e.g. "13.0-17.0 g/dL"
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

// Main optimization function
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

  // 1. Parse & Ingest resources
  const rawResources: FhirResource[] = [];
  const resourceTypeCount: Record<string, number> = {};
  const dataGaps: string[] = [];

  if (parsed.resourceType === "Bundle" && Array.isArray(parsed.entry)) {
    parsed.entry.forEach((entry: any) => {
      if (entry.resource) {
        rawResources.push(entry.resource);
        const rt = entry.resource.resourceType || "Unknown";
        resourceTypeCount[rt] = (resourceTypeCount[rt] || 0) + 1;
      }
    });
  } else if (parsed.resourceType) {
    rawResources.push(parsed);
    resourceTypeCount[parsed.resourceType] = 1;
  } else if (parsed && typeof parsed === "object") {
    // Grouped export with no top-level resourceType:
    // { "Patient": {...}, "Conditions": {Bundle}, "Observations": {error}, ... }
    const ingestGroupVal = (key: string, val: any): void => {
      if (!val || typeof val !== "object") return;
      if (Array.isArray(val)) {
        val.forEach((v: any) => ingestGroupVal(key, v));
        return;
      }
      if (val.resourceType === "Bundle" && Array.isArray(val.entry)) {
        val.entry.forEach((entry: any) => {
          if (entry?.resource) {
            rawResources.push(entry.resource);
            const rt = entry.resource.resourceType || "Unknown";
            resourceTypeCount[rt] = (resourceTypeCount[rt] || 0) + 1;
          }
        });
      } else if (val.resourceType) {
        rawResources.push(val);
        resourceTypeCount[val.resourceType] = (resourceTypeCount[val.resourceType] || 0) + 1;
      } else if (val.error) {
        // error stubs like {error: "...", status: 400} — record as data gap, never silently
        dataGaps.push(`${key}: fetch failed (${val.error}${val.status ? ` ${val.status}` : ""})`);
      }
    };
    Object.entries(parsed).forEach(([key, val]: [string, any]) => ingestGroupVal(key, val));
  }

  // Determine Granularity (if query asks for specific time, auto-upgrade to exact_timestamp)
  let granularity: GranularityMode = options.granularity || "date_only";
  if (options.queryFilter) {
    const q = options.queryFilter.toLowerCase();
    if (q.includes("time") || q.includes("pm") || q.includes("am") || q.includes("hour") || q.includes("acute") || q.includes("when")) {
      granularity = "exact_timestamp";
    }
  }

  const profile: CdsProfile = options.profile || "free_query";
  const tokenBudget = options.tokenBudget && options.tokenBudget > 0 ? options.tokenBudget : 0;

  // 2. Flag invalid / refuted / entered-in-error items (kept: ruling-out IS clinical data)
  const validResources = rawResources;
  const flaggedIds = new Set(
    rawResources
      .filter(
        (res) =>
          res.status === "entered-in-error" ||
          res.verificationStatus?.coding?.[0]?.code === "refuted"
      )
      .map((res) => res.id)
      .filter(Boolean)
  );

  // 3. Task-Aware Selection (CDS Hook Profiles vs Free Query)
  let selectedResources = validResources;

  if (profile === "medication_prescribe") {
    // Deterministic CDS Profile for Prescribing:
    // Required: Active Meds, Allergies, Renal Labs (Creatinine, eGFR, BUN), Patient Demographics, Weight
    selectedResources = validResources.filter((res) => {
      const rt = res.resourceType;
      if (rt === "Patient" || rt === "AllergyIntolerance" || rt.startsWith("Medication")) return true;
      if (rt === "Observation") {
        const text = JSON.stringify(res).toLowerCase();
        if (text.includes("creatinine") || text.includes("egfr") || text.includes("bun") || text.includes("weight") || text.includes("potassium")) {
          return true;
        }
      }
      return false;
    });
  } else if (profile === "vitals_monitor") {
    // Vitals Monitoring Profile: Focus on Vitals + Pain + Trends
    selectedResources = validResources.filter((res) => {
      return res.resourceType === "Patient" || isVitalSign(res);
    });
  } else if (options.queryFilter && options.queryFilter.trim().length > 0) {
    // Free query matching
    const qLower = options.queryFilter.toLowerCase().trim();
    selectedResources = validResources.filter((res) => {
      const resStr = JSON.stringify(res).toLowerCase();
      if (resStr.includes(qLower)) return true;
      if (qLower.includes("pain") && (resStr.includes("pain") || res.resourceType === "Observation")) return true;
      if (qLower.includes("vital") && isVitalSign(res)) return true;
      if (qLower.includes("care") || qLower.includes("plan") || qLower.includes("activity") || qLower.includes("surgery") || qLower.includes("recovery")) {
        if (res.resourceType === "CarePlan") return true;
      }
      if (qLower.includes("lab") || qLower.includes("blood") || qLower.includes("test")) {
        if (res.resourceType === "Observation" && !isVitalSign(res)) return true;
      }
      if (qLower.includes("med") || qLower.includes("drug") || qLower.includes("dose")) {
        if (res.resourceType.startsWith("Medication")) return true;
      }
      if (qLower.includes("allergy") && res.resourceType === "AllergyIntolerance") return true;
      if (qLower.includes("condition") || qLower.includes("diagnosis")) {
        if (res.resourceType === "Condition") return true;
      }
      return false;
    });
    if (selectedResources.length === 0) selectedResources = validResources;
  }

  const safetyResource = (res: any): boolean => {
    const rt = res.resourceType || "";
    if (["Patient", "AllergyIntolerance", "CarePlan"].includes(rt)) return true;
    if (rt.startsWith("Medication")) return res.status !== "stopped" && res.status !== "entered-in-error";
    return false;
  };
  const estimateTokens = (res: any): number => Math.max(1, Math.ceil(JSON.stringify(res).length / 3));
  let budgetExceeded = false;
  if (tokenBudget > 0) {
    const safety = selectedResources.filter(safetyResource);
    const normal = selectedResources.filter((res) => !safetyResource(res));
    let used = safety.reduce((sum, res) => sum + estimateTokens(res), 0);
    const withinBudget = normal.filter((res) => {
      const cost = estimateTokens(res);
      if (used + cost > tokenBudget) return false;
      used += cost;
      return true;
    });
    budgetExceeded = safety.length + withinBudget.length < selectedResources.length;
    selectedResources = [...safety, ...withinBudget];
  }

  // 4. Transform & Index Provenance
  const provenanceMap: Record<string, ProvenanceEntry> = {};
  let obsCounter = 1;
  let vitalCounter = 1;
  let medCounter = 1;
  let condCounter = 1;
  let algCounter = 1;
  let cpCounter = 1;
  let encCounter = 1;

  const patients: any[] = [];
  const vitalSigns: any[] = [];
  const labs: any[] = [];
  const medications: any[] = [];
  const conditions: any[] = [];
  const allergies: any[] = [];
  const carePlans: any[] = [];
  const others: any[] = [];
  const encounters: any[] = [];
  // Observation/<id> -> short ref (O1/V1), so hasMember links resolve
  const obsIdToShortRef = new Map<string, string>();
  // no Patient resource in bundle? some EHR exports only carry subject.display
  let patientFallback = "";

  // MUST-INCLUDE SAFETY SET: Allergies, Active Meds, Critical Abnormal Labs
  const safetySetItems: { item: any; category: string; rank: number }[] = [];
  const standardItems: { item: any; category: string; rank: number }[] = [];

  selectedResources.forEach((res) => {
    const rt = res.resourceType;
    const origId = res.id || `res-${Math.random().toString(36).substring(2, 7)}`;
    const subj = res.subject?.reference;
    if (!patientFallback && subj && subj.startsWith("Patient/") && res.subject?.display) {
      patientFallback = res.subject.display;
    }

    // contained resources are real data (relationships, doses, substances) — never drop them
    if (Array.isArray(res.contained) && res.contained.length) {
      res.contained.forEach((c: any) => {
        others.push({
          ref: `X${others.length + 1}`,
          type: `${c.resourceType || "contained"} (contained)`,
          id: c.id || origId,
          name: conceptAll(c.code) || humanName(c.name) || c.id || undefined,
          role: (c.relationship || c.specialty || c.role || []).length
            ? conceptAll((c.relationship || c.specialty || c.role)[0])
            : undefined,
          status: c.status || undefined,
          value: extractValue(c).value || undefined,
          date: formatDateTime(c.effectiveDateTime || c.recordedDate || c.authoredOn, granularity) || undefined,
        });
      });
    }

    switch (rt) {
      case "Patient": {
        const allNames = (Array.isArray(res.name) ? res.name : [])
          .map((n: any) =>
            n.text ||
            [n.prefix?.join(" "), n.given?.join(" "), n.family].filter(Boolean).join(" ")
          )
          .filter(Boolean);
        const name = allNames[0] || "";
        const aka = Array.from(new Set(allNames.slice(1)));
        const tel = (res.telecom || [])
          .map((t: any) => `${t.system || "tel"}: ${t.value}`)
          .filter(Boolean);
        const addr = (res.address || [])
          .map((a: any) =>
            [a.text, [a.line?.join(", "), a.city, a.state, a.postalCode].filter(Boolean).join(", ")]
              .find(Boolean) || [a.city, a.state].filter(Boolean).join(", ")
          )
          .filter(Boolean);
        const langs = (res.communication || [])
          .map((c: any) => codeDisplay(c.language) + (c.preferred ? " (preferred)" : ""))
          .filter(Boolean);
        const contacts = (res.contact || [])
          .map((c: any) => {
            const rel = codeDisplay(c.relationship);
            const who = c.name ? humanName(c.name) : "";
            const ct = (c.telecom || []).map((t: any) => t.value).filter(Boolean).join("/");
            return [rel && `(${rel})`, who, ct].filter(Boolean).join(" ") || undefined;
          })
          .filter(Boolean);
        const pat = {
          ref: "P1",
          id: origId,
          name: name || undefined,
          aka: aka.length ? aka : undefined,
          gender: res.gender,
          age: calculateAge(res.birthDate),
          dob: res.birthDate,
          phone: (res.telecom || []).find((t: any) => t.system === "phone" && t.value)?.value,
          telecom: tel.length ? tel : undefined,
          address: addr.length ? addr : undefined,
          languages: langs.length ? langs : undefined,
          contacts: contacts.length ? contacts : undefined,
          gp: (res.generalPractitioner || []).map((g: any) => g.display).filter(Boolean).join(", ") || undefined,
          marital: codeDisplay(res.maritalStatus) || undefined,
        };
        patients.push(pat);
        provenanceMap["P1"] = {
          shortRef: "P1",
          resourceType: "Patient",
          originalId: origId,
          summary: `${pat.name || "Patient"} (${pat.gender || ""}, Age: ${pat.age ?? "N/A"})`,
          fullSnippet: res,
        };
        break;
      }

      case "Observation": {
        const vital = isVitalSign(res);
        const concept = extractConcept(res.code);
        const ev = extractValue(res);
        let val: any = ev.value;
        let unit = ev.unit || "";
        const absent = ev.absent;

        if (res.component && Array.isArray(res.component)) {
          const comps = res.component
            .map((c: any) => {
              const cName = extractConcept(c.code).name;
              const cv = extractValue(c);
              if (cv.absent) return `${cName}: ABSENT(${cv.absent})`;
              if (cv.value === "" || cv.value === undefined) return null;
              return `${cName}: ${cv.value} ${cv.unit || ""}`.trim();
            })
            .filter(Boolean);
          if (comps.length > 0) val = comps.join(", ");
        }

        // hasMember / derivedFrom: parent has no value[x], answers live in children.
        const memberRefs = [...(res.hasMember || []), ...(res.derivedFrom || [])]
          .map((m: any) => m.reference)
          .filter(Boolean);

        const dateStr = formatDateTime(obsDate(res), granularity);
        const issuedRaw = res.issued && res.issued !== obsDate(res) ? formatDateTime(res.issued, granularity) : "";
        const issuedStr = issuedRaw && issuedRaw !== dateStr ? issuedRaw : "";
        const refRange = formatRefRange(res.referenceRange);
        const obsCat = (res.category || [])
          .map((c: any) => extractConcept(c).name)
          .filter((n: string) => n && n !== "Unknown")
          .join(", ");
        const obsNote = (res.note || [])
          .map((n: any) => n.text)
          .filter(Boolean)
          .join(" | ")
          .replace(/\s*\n\s*/g, " / ");
        const obsPerformer = (res.performer || [])
          .map((p: any) => p.display)
          .filter(Boolean)
          .join(", ");
        let flag: string | undefined = undefined;
        let flagAbnormal = false;
        if (res.interpretation && res.interpretation[0]) {
          const ic = res.interpretation[0].coding?.[0];
          const code = ic?.code || "";
          const disp = ic?.display || res.interpretation[0].text || "";
          flag = disp && code && disp !== code ? `${disp} (${code})` : disp || code || undefined;
          flagAbnormal = !!code && !["n", "normal"].includes(code.toLowerCase());
        }

        const isAbnormal = flagAbnormal;
        if (options.onlyAbnormalLabs && !isAbnormal) return;

        // value display: never render a blank cell — say WHY it is blank
        const displayVal = val === "" || val === undefined
          ? (memberRefs.length ? `→ ${memberRefs.length} answer(s)` : absent ? `ABSENT(${absent})` : "NO VALUE")
          : val;

        const row: any = {
          ref: "",
          name: concept.name,
          test: concept.name,
          code: concept.code ? `${concept.system || "loinc"}:${concept.code}` : undefined,
          value: displayVal,
          unit: undefined,
          date: granularity === "date_only" ? dateStr : undefined,
          dateTime: granularity === "exact_timestamp" ? dateStr : undefined,
          issued: issuedStr || undefined,
          range: refRange,
          flag: flag,
          category: obsCat || undefined,
          note: obsNote || undefined,
          performer: obsPerformer || undefined,
          status: res.status,
          absent,
          members: memberRefs.length ? memberRefs : undefined,
        };
        row.unit = unit || undefined;

        if (vital) {
          const shortRef = `V${vitalCounter++}`;
          row.ref = shortRef;
          if (typeof val !== "number") row.value = displayVal;
          vitalSigns.push(row);
          provenanceMap[shortRef] = {
            shortRef,
            resourceType: "Observation (Vital Signs)",
            originalId: origId,
            summary: `${concept.name} = ${row.value} (${dateStr})`,
            fullSnippet: res,
          };
        } else {
          const shortRef = `O${obsCounter++}`;
          row.ref = shortRef;
          if (typeof val === "number") row.value = val;
          else row.value = displayVal;
          labs.push(row);
          provenanceMap[shortRef] = {
            shortRef,
            resourceType: "Observation (Laboratory)",
            originalId: origId,
            summary: `${concept.name}: ${row.value}${flag ? ` [Flag: ${flag}]` : ""} [${res.status || "final"}]`,
            fullSnippet: res,
          };
          // index shortRef -> Observation/<id> so member links resolve to a ref, not a raw id
          if (origId) obsIdToShortRef.set(origId, shortRef);
        }
        if (vital && origId) obsIdToShortRef.set(origId, row.ref);
        break;
      }

      case "CarePlan": {
        const shortRef = `CP${cpCounter++}`;
        let categoryName = "";
        if (res.category && res.category[0]) categoryName = extractConcept(res.category[0]).name;

        let periodStr = "";
        if (res.period) {
          const s = formatDateTime(res.period.start, granularity);
          const e = formatDateTime(res.period.end, granularity);
          if (s && e) periodStr = `${s} to ${e}`;
        }

        const activities: string[] = [];
        if (res.activity && Array.isArray(res.activity)) {
          res.activity.forEach((act: any) => {
            const detailConcept = extractConcept(act.detail?.code);
            const desc = act.detail?.description;
            if (detailConcept.name !== "Unknown" && desc) activities.push(`${detailConcept.name}: ${desc}`);
            else if (detailConcept.name !== "Unknown") activities.push(detailConcept.name);
            else if (desc) activities.push(desc);
          });
        }

        const cpObj = {
          ref: shortRef,
          type: "CarePlan",
          category: categoryName || res.title || "Care Plan",
          status: res.status,
          intent: res.intent,
          period: periodStr || undefined,
          activities: activities.length > 0 ? activities : undefined,
          careTeam: (res.careTeam || []).map((c: any) => c.display).filter(Boolean).join(", ") || undefined,
          title: res.title || undefined,
        };
        carePlans.push(cpObj);
        provenanceMap[shortRef] = {
          shortRef,
          resourceType: "CarePlan",
          originalId: origId,
          summary: `${cpObj.category} (${cpObj.status}) - ${activities.length} activities`,
          fullSnippet: res,
        };
        break;
      }

      case "MedicationRequest":
      case "MedicationStatement": {
        const shortRef = `M${medCounter++}`;
        const concept = extractConcept(res.medicationCodeableConcept);
        let drug = conceptAll(res.medicationCodeableConcept);
        if (!drug || drug === "Unknown") drug = concept.name;
        if (drug === "Unknown" && res.medicationReference?.display) drug = res.medicationReference.display;

        let sig = res.dosageInstruction?.[0]?.text;
        const di = res.dosageInstruction?.[0];
        const dar = di?.doseAndRate?.[0];
        const extraDose = (di?.doseAndRate || [])
          .slice(1)
          .map((d2: any) => {
            const t = conceptAll(d2.type);
            const q = d2.doseQuantity || d2.doseRateQuantity;
            const amount = q?.value !== undefined ? `${q.value} ${q.unit || ""}`.trim() : "";
            return [t, amount].filter(Boolean).join(" ");
          })
          .filter(Boolean)
          .join("; ");
        if (!sig && dar) {
          const d = dar.doseQuantity || dar.doseRateQuantity;
          const parts = [d?.value, d?.unit].filter((x: any) => x !== undefined && x !== null && x !== "");
          if (parts.length) sig = parts.join(" ");
          const t = dar.rateQuantity;
          if (t?.value) sig = `${sig || ""} @ ${t.value} ${t.unit || ""}`.trim();
        }
        const route = conceptAll(di?.route);
        const doseType = conceptAll(dar?.type);
        if (route && !sig) sig = route;
        else if (sig && route && !sig.toLowerCase().includes(route.toLowerCase())) sig = `${sig}, ${route}`;
        if (sig && doseType) sig = `${sig} [${doseType}]`;
        const timing = di?.timing?.repeat;
        const boundsEnd = timing?.boundsPeriod?.end;
        const boundsStart = timing?.boundsPeriod?.start;
        const prn = conceptAll(di?.asNeededCodeableConcept);
        const instruction = (di?.additionalInstruction || [])
          .map((t: any) => t.text)
          .filter(Boolean)
          .join(" | ")
          .replace(/\s*\n\s*/g, " / ");
        const prescriber =
          res.requester?.display || (res.performer || []).map((p: any) => p.display).filter(Boolean).join(", ");

        const mObj = {
          ref: shortRef,
          drug,
          code: concept.code ? `${concept.system || "rxnorm"}:${concept.code}` : undefined,
          sig: sig || undefined,
          status: res.status,
          date: formatDateTime(res.authoredOn, granularity) || undefined,
          course: conceptAll(res.courseOfTherapyType) || undefined,
          category: (res.category || []).map((c: any) => conceptAll(c)).filter(Boolean).join(", ") || undefined,
          prn: prn || undefined,
          instruction: instruction || undefined,
          startsOn: formatDateTime(boundsStart, granularity) || undefined,
          endsOn: formatDateTime(boundsEnd, granularity) || undefined,
          doseTypes: extraDose || undefined,
          validFrom: formatDateTime(res.dispenseRequest?.validityPeriod?.start, granularity) || undefined,
          prescriber: prescriber || undefined,
          reason: (res.reasonCode || []).map((r: any) => conceptAll(r)).filter(Boolean).join(", ") || undefined,
          note: (res.note || [])
            .map((n: any) => n.text)
            .filter(Boolean)
            .join(" | ")
            .replace(/\s*\n\s*/g, " / ") || undefined,
          dispenseQty: res.dispenseRequest?.quantity
            ? `${res.dispenseRequest.quantity.value ?? ""} ${res.dispenseRequest.quantity.unit ?? ""}`.trim() || undefined
            : undefined,
        };
        medications.push(mObj);
        provenanceMap[shortRef] = {
          shortRef,
          resourceType: "MedicationRequest",
          originalId: origId,
          summary: `${drug} - ${sig || "As directed"} (${res.status})`,
          fullSnippet: res,
        };
        break;
      }

      case "Condition": {
        const shortRef = `C${condCounter++}`;
        const concept = extractConcept(res.code);
        const cObj = {
          ref: shortRef,
          condition: concept.name,
          code: concept.code ? `${concept.system || "snomed"}:${concept.code}` : undefined,
          status: res.clinicalStatus?.coding?.[0]?.code || "active",
          statusText: res.clinicalStatus?.text,
          verification: codeDisplay(res.verificationStatus) || undefined,
          category: codeDisplay(res.category?.[0]) || undefined,
          bodySite: (res.bodySite || [])
            .map((site: any) => conceptAll(site))
            .filter(Boolean)
            .join(", ") || undefined,
          onset: formatDateTime(res.onsetDateTime || res.recordedDate, granularity) || undefined,
          recorded: formatDateTime(res.recordedDate, granularity) || undefined,
          note: res.note?.[0]?.text?.slice(0, 300),
        };
        conditions.push(cObj);
        provenanceMap[shortRef] = {
          shortRef,
          resourceType: "Condition",
          originalId: origId,
          summary: `${concept.name} [${cObj.status}${cObj.verification ? "/" + cObj.verification : ""}]`,
          fullSnippet: res,
        };
        break;
      }

      case "AllergyIntolerance": {
        const shortRef = `A${algCounter++}`;
        const concept = extractConcept(res.code);
        const reactions: string[] = [];
        if (res.reaction) {
          res.reaction.forEach((r: any) => {
            const ms = (r.manifestation || [])
              .map((m: any) => conceptAll(m))
              .filter((x: string) => x && x !== "Unknown");
            if (ms.length) reactions.push(ms.join(" + "));
            if (r.severity) reactions.push(`severity: ${r.severity}`);
            if (r.description) reactions.push(r.description);
          });
        }
        const aNotes = (res.note || [])
          .map((n: any) => n.text)
          .filter(Boolean)
          .join(" | ")
          .replace(/\s*\n\s*/g, " / ");
        const aObj = {
          ref: shortRef,
          allergen: concept.name,
          criticality: res.criticality,
          status: res.clinicalStatus?.coding?.[0]?.code || "active",
          statusText: res.clinicalStatus?.text || undefined,
          verification: codeDisplay(res.verificationStatus) || undefined,
          kind: res.type || undefined,
          reactions: reactions.length > 0 ? reactions.join(", ") : undefined,
          onset: formatDateTime(res.onsetDateTime, granularity) || undefined,
          recorded: formatDateTime(res.recordedDate, granularity) || undefined,
          recorder: res.recorder?.display || undefined,
          note: aNotes || undefined,
        };
        allergies.push(aObj);
        provenanceMap[shortRef] = {
          shortRef,
          resourceType: "AllergyIntolerance",
          originalId: origId,
          summary: `ALLERGY: ${concept.name} (Criticality: ${res.criticality || "High"})`,
          fullSnippet: res,
        };
        break;
      }

      case "Encounter": {
        const shortRef = `E${encCounter++}`;
        const loc = res.location?.[0]?.location;
        const eObj: any = {
          ref: shortRef,
          status: res.status,
          class: res.class?.display && res.class.display !== res.class.code
            ? `${res.class.display} (${res.class.code})`
            : res.class?.display || res.class?.code,
          types: (res.type || [])
            .map((t: any) => codeDisplay(t))
            .filter(Boolean)
            .join(", ") || undefined,
          start: formatDateTime(res.period?.start || res.period?.end, granularity) || undefined,
          end: formatDateTime(res.period?.end, granularity) || undefined,
          location: loc?.display ? `${loc.display}${res.location?.[0]?.status ? ` [${res.location[0].status}]` : ""}` : res.location?.[0]?.status || undefined,
          provider: res.serviceProvider?.display || undefined,
          reason: (res.reasonCode || []).map((r: any) => codeDisplay(r)).filter(Boolean).join("; ") || undefined,
          discharge: codeDisplay(res.hospitalization?.dischargeDisposition) || undefined,
          participants: (res.participant || [])
            .map((p: any) => {
              const who = [p.type?.map((t: any) => conceptAll(t)).filter(Boolean).join("/"), p.individual?.display]
                .filter(Boolean).join(" — ");
              const since = formatDateTime(p.period?.start, granularity);
              const until = formatDateTime(p.period?.end, granularity);
              const span = since && until ? ` (${since} → ${until})` : since ? ` (from ${since})` : until ? ` (until ${until})` : "";
              return who ? `${who}${span}` : undefined;
            })
            .filter(Boolean)
            .join("; ") || undefined,
        };
        eObj.type = eObj.types;
        encounters.push(eObj);
        provenanceMap[shortRef] = {
          shortRef,
          resourceType: "Encounter",
          originalId: origId,
          summary: `${eObj.type || "Encounter"} [${res.status}] ${eObj.start || ""}`,
          fullSnippet: res,
        };
        break;
      }

      default: {
        // Keep the payload visible instead of dropping it to {type,id}
        const brief =
          res.code?.text ||
          res.code?.coding?.[0]?.display ||
          humanName(res.name) ||
          res.description?.[0]?.text ||
          res.title ||
          (res.reasonCode || []).map((r: any) => codeDisplay(r)).join("; ") ||
          (res.activity || []).map((a: any) => codeDisplay(a.detail?.code)).filter(Boolean).join("; ") ||
          res.location?.[0]?.display ||
          "";
        const role =
          codeDisplay(res.specialty?.[0]) ||
          codeDisplay(res.role?.[0]) ||
          codeDisplay(res.healthcareService?.[0]) ||
          res.managingOrganization?.display ||
          res.organization?.display;
        others.push({
          ref: `X${others.length + 1}`,
          type: res.resourceType,
          id: origId,
          name: brief || undefined,
          role: role || undefined,
          status: res.status || res.clinicalStatus?.coding?.[0]?.code,
          value: extractValue(res).value || undefined,
          date: resourceDateSpan(res, granularity),
        });
        provenanceMap[`X${others.length}`] = {
          shortRef: `X${others.length}`,
          resourceType: res.resourceType,
          originalId: origId,
          summary: `${res.resourceType}${brief ? ": " + brief : ""}${role ? ` [${role}]` : ""}`,
          fullSnippet: res,
        };
        break;
      }
    }
  });

  // Bundle had no Patient resource — reconstruct identity from subject.display
  if (patients.length === 0 && patientFallback) {
    patients.push({ ref: "P1", name: patientFallback });
    provenanceMap["P1"] = {
      shortRef: "P1",
      resourceType: "Patient (inferred from subject.display)",
      originalId: "inferred-subject-display",
      summary: patientFallback,
      fullSnippet: { display: patientFallback },
    };
  }

  // subject/patient display aliases: same person, different serialization ("Argonaut, Jason")
  if (patients[0]) {
    const p0 = patients[0];
    const aliases: string[] = [];
    selectedResources.forEach((r: any) => {
      const d = r.subject?.display || r.patient?.display;
      if (d && d !== p0.name && !aliases.includes(d)) aliases.push(d);
    });
    if (aliases.length) p0.aka = [...new Set([...(p0.aka || []), ...aliases])];
  }

  // Resolve hasMember / derivedFrom links -> short refs (children may appear after parent)
  const resolveMembers = (row: any) => {
    if (!row.members) return;
    row.members = row.members.map((m: string) => {
      const id = m.split("/").pop() || m;
      return obsIdToShortRef.get(id) || id;
    });
  };
  [...labs, ...vitalSigns].forEach(resolveMembers);
  // Build parent->child index for markdown rendering (children first: their value is the real data)
  const memberOf = new Map<string, string>(); // shortRef -> parent shortRef
  [...labs, ...vitalSigns].forEach((r) => {
    (r.members || []).forEach((c: string) => memberOf.set(c, r.ref));
  });

  // 5. Token Budget Allocation & Transparency
  const omittedCount = Math.max(0, validResources.length - selectedResources.length);
  let omittedNotice: string | undefined = undefined;
  if (omittedCount > 0) {
    omittedNotice = budgetExceeded
      ? `## Omitted: ${omittedCount} items due to token budget; safety resources retained (call expand(ref) for omitted items)`
      : `## Omitted: ${omittedCount} items not matching query/profile filter → clear query to include all, or retrievable via expand(ref)`;
  }

  const flaggedNotice = flaggedIds.size
    ? `## FLAGGED (kept, not dropped): ${flaggedIds.size} resource(s) are entered-in-error or refuted`
    : undefined;
  const gapNotice = dataGaps.length ? `## DATA GAPS: ${dataGaps.join("; ")}` : undefined;

  // 6. Build target representation
  let compressedOutput = "";

  if (options.format === "compact_json") {
    const compactObj: Record<string, any> = {};
    if (patients.length === 1) compactObj.patient = patients[0];
    else if (patients.length > 1) compactObj.patients = patients;

    // Separate vitalSigns from labs
    if (vitalSigns.length > 0) compactObj.vitalSigns = vitalSigns;
    if (labs.length > 0) compactObj.labs = labs;
    if (carePlans.length > 0) compactObj.carePlans = carePlans;
    if (allergies.length > 0) compactObj.allergies = allergies;
    if (conditions.length > 0) compactObj.conditions = conditions;
    if (medications.length > 0) compactObj.medications = medications;
    if (encounters.length > 0) compactObj.encounters = encounters;
    if (others.length > 0) compactObj.other = others;
    if (omittedNotice) compactObj._omitted = omittedNotice.replace(/^## /, "");
    if (flaggedNotice) compactObj._flagged = `${flaggedIds.size} resource(s) entered-in-error or refuted (retained)`;
    if (gapNotice) compactObj._dataGaps = dataGaps;

    compressedOutput = JSON.stringify(compactObj, null, 2);
  } else if (options.format === "medprompt_text") {
    // MedPrompt Clinical Shorthand with Provenance IDs
    const lines: string[] = [];
    if (patients.length > 0) {
      const p = patients[0];
      const pExtra = [p.dob ? `DOB: ${p.dob}` : "", p.telecom?.length ? `Tel: ${p.telecom.join(", ")}` : p.phone ? `Tel: ${p.phone}` : "", p.marital ? `Marital: ${p.marital}` : "", p.address?.length ? `Addr: ${p.address.join(" | ")}` : "", p.languages?.length ? `Lang: ${p.languages.join(", ")}` : "", p.contacts?.length ? `Contact: ${p.contacts.join(" | ")}` : "", p.gp ? `GP: ${p.gp}` : "", p.aka?.length ? `AKA: ${p.aka.join("; ")}` : ""].filter(Boolean).join(" | ");
      lines.push(`PATIENT [${p.ref}]: ${p.name || "Patient"} | Age: ${p.age ?? "N/A"} | Sex: ${p.gender ?? "N/A"}${pExtra ? " | " + pExtra : ""}`);
    }
    if (vitalSigns.length > 0) {
      lines.push(`\n## VITAL SIGNS & SCALES:`);
      vitalSigns.forEach((v) => {
        const timeStr = v.dateTime || v.date || "";
        lines.push(`[${v.ref}] ${v.name}: ${v.value} ${v.unit || ""}${v.range ? ` [Ref: ${v.range}]` : ""}${v.category ? ` {${v.category}}` : ""}${v.flag ? ` [${v.flag}]` : ""}${v.status ? ` [${v.status}]` : ""} (${timeStr})${v.issued ? ` (issued ${v.issued})` : ""}${v.performer ? ` by ${v.performer}` : ""}${v.note ? ` Note: ${v.note}` : ""}`);
      });
    }
    if (labs.length > 0) {
      lines.push(`\n## LABS & DIAGNOSTICS:`);
      labs.forEach((l) => {
        const timeStr = l.dateTime || l.date || "";
        const flagStr = l.flag ? ` [FLAG: ${l.flag}]` : "";
        lines.push(`[${l.ref}] ${l.test}: ${l.value} ${l.unit || ""}${l.range ? ` [Ref: ${l.range}]` : ""}${l.category ? ` {${l.category}}` : ""}${flagStr}${l.status ? ` [${l.status}]` : ""} (${timeStr})${l.issued ? ` (issued ${l.issued})` : ""}${l.performer ? ` by ${l.performer}` : ""}${l.note ? ` Note: ${l.note}` : ""}`);
      });
    }
    if (carePlans.length > 0) {
      lines.push(`\n## CARE PLANS & PROTOCOLS:`);
      carePlans.forEach((cp) => {
        lines.push(`[${cp.ref}] Plan: ${cp.title ? `${cp.title} - ` : ""}${cp.category} [${cp.status}]${cp.period ? ` (${cp.period})` : ""}${cp.careTeam ? ` Team: ${cp.careTeam}` : ""}`);
        if (cp.activities) {
          cp.activities.forEach((act: string) => {
            lines.push(`  - Instruction: ${act}`);
          });
        }
      });
    }
    if (allergies.length > 0) {
      lines.push(`\n## ALLERGIES (Safety Set):`);
      allergies.forEach((a) => {
        lines.push(`[${a.ref}] ${a.allergen}${a.kind ? ` {${a.kind}}` : ""} [Criticality: ${a.criticality || "High"}]${a.reactions ? ` -> ${a.reactions}` : ""}${a.statusText ? ` ${a.statusText}` : ""}${a.verification ? ` (${a.verification})` : ""}${a.onset ? ` (Onset: ${a.onset})` : ""}${a.recorded ? ` (Recorded: ${a.recorded})` : ""}${a.recorder ? ` by ${a.recorder}` : ""}${a.note ? ` Note: ${a.note}` : ""}`);
      });
    }
    if (conditions.length > 0) {
      lines.push(`\n## ACTIVE CONDITIONS:`);
      conditions.forEach((c) => {
        lines.push(`[${c.ref}] ${c.condition} [${c.status}${c.statusText ? "/" + c.statusText : ""}]${c.verification ? "/" + c.verification : ""}${c.category ? ` {${c.category}}` : ""}${c.bodySite ? ` (Body site: ${c.bodySite})` : ""}${c.onset ? ` (Onset: ${c.onset})` : ""}${c.recorded ? ` (Recorded: ${c.recorded})` : ""}${c.note ? ` Note: ${c.note}` : ""}`);
      });
    }
    if (medications.length > 0) {
      lines.push(`\n## MEDICATIONS:`);
      medications.forEach((m) => {
        lines.push(`[${m.ref}] ${m.drug} - ${m.sig || "As directed"} (${m.status})${m.category ? ` {${m.category}}` : ""}${m.prn ? ` PRN: ${m.prn}` : ""}${m.instruction ? ` Instr: ${m.instruction}` : ""}${m.course ? ` [${m.course}]` : ""}${m.startsOn ? ` from ${m.startsOn}` : ""}${m.endsOn ? ` until ${m.endsOn}` : ""}${m.doseTypes ? ` also: ${m.doseTypes}` : ""}${m.dispenseQty ? ` qty ${m.dispenseQty}` : ""}${m.validFrom ? ` valid from ${m.validFrom}` : ""}${m.date ? ` Rx: ${m.date}` : ""}${m.prescriber ? ` by ${m.prescriber}` : ""}${m.reason ? ` Reason: ${m.reason}` : ""}${m.note ? ` Note: ${m.note}` : ""}`);
      });
    }
    if (encounters.length > 0) {
      lines.push(`\n## ENCOUNTERS:`);
      encounters.forEach((e) => {
        lines.push(`[${e.ref}] ${e.type || "Encounter"}${e.class ? ` {${e.class}}` : ""} ${e.status || ""} ${e.start || ""} ${e.location || ""}${e.reason ? ` reason: ${e.reason}` : ""}${e.discharge ? ` -> ${e.discharge}` : ""}${e.participants ? ` | ${e.participants}` : ""}`.trim());
      });
    }
    if (others.length > 0) {
      lines.push(`\n## OTHER RESOURCES:`);
      others.forEach((o) => lines.push(`[${o.ref}] ${o.type} ${o.name || o.id || ""}${o.role ? ` [${o.role}]` : ""} ${o.status || ""}${o.value !== undefined && o.value !== null && o.value !== "" ? ` = ${o.value}` : ""}${o.date ? ` (${o.date})` : ""}`.trim()));
    }
    if (omittedNotice) {
      lines.push(`\n${omittedNotice}`);
    }
    if (flaggedNotice) lines.push(flaggedNotice);
    if (gapNotice) lines.push(gapNotice);
    compressedOutput = lines.join("\n").trim();
  } else if (options.format === "fhirbench_markdown") {
    // FHIRBench Tabular Format with Provenance IDs
    const sections: string[] = [];
    // Refs already emitted as a child of a group parent — don't repeat them flat
    const childRefs = new Set(memberOf.keys());
    if (patients.length > 0) {
      const p = patients[0];
      const extra = [
        p.dob ? `DOB: ${p.dob}` : null,
        p.phone ? `Contact: ${p.phone}` : null,
        p.marital ? `Marital: ${p.marital}` : null,
        p.telecom?.length ? `Telecom: ${p.telecom.join(", ")}` : null,
        p.address?.length ? `Address: ${p.address.join(" | ")}` : null,
        p.languages?.length ? `Languages: ${p.languages.join(", ")}` : null,
        p.contacts?.length ? `Contacts: ${p.contacts.join(" | ")}` : null,
        p.gp ? `GP: ${p.gp}` : null,
        p.aka?.length ? `Also known as: ${p.aka.join("; ")}` : null,
      ].filter(Boolean).join(" | ");
      sections.push(`### Patient Information [${p.ref}]\n- **Name:** ${p.name || "N/A"}\n- **Age/Gender:** ${p.age ?? "N/A"} / ${p.gender ?? "N/A"}${extra ? `\n- **Details:** ${extra}` : ""}`);
    }
    if (vitalSigns.length > 0) {
      sections.push(
        `### Vital Signs & Physical Measures\n| Ref | Measure | Value | Category | Flag | Date/Time | Status |\n|---|---|---|---|---|---|---|\n` +
        vitalSigns
          .filter((v) => !childRefs.has(v.ref))
          .map((v) => {
            let row = `| **${v.ref}** | ${v.name} | **${v.value}${v.unit ? " " + v.unit : ""}** | ${v.category || "—"} | ${v.flag || "—"} | ${v.dateTime || v.date || "—"}${v.issued ? ` (issued ${v.issued})` : ""} | ${v.status || "—"} |`;
            // group parent: render its member answers inline so no value cell is ever blank
            if (v.members?.length) {
              v.members.forEach((m: string) => {
                const child = vitalSigns.find((x) => x.ref === m) || labs.find((x) => x.ref === m);
                if (child) row += `\n| ${m} | ↳ ${child.name} | **${child.value}${child.unit ? " " + child.unit : ""}** | ${child.category || "—"} | ${child.flag || "—"} | ${child.dateTime || child.date || "—"}${child.issued ? ` (issued ${child.issued})` : ""} | ${child.status || "—"} |`;
              });
            }
            return row;
          })
          .join("\n")
      );
    }
    if (labs.length > 0) {
      sections.push(
        `### Laboratory Results & Observations\n| Ref | Test | Category | Result | Ref Range | Flag | Status | Date/Time |\n|---|---|---|---|---|---|---|---|\n` +
        labs
          .filter((l) => !childRefs.has(l.ref))
          .map((l) => {
            let row = `| **${l.ref}** | ${l.test} | ${l.category || "—"} | **${l.value}${l.unit ? " " + l.unit : ""}** | ${l.range || "—"} | ${l.flag || "—"} | ${l.status || "—"} | ${l.dateTime || l.date || "—"}${l.issued ? ` (issued ${l.issued})` : ""} |`;
            if (l.members?.length) {
              l.members.forEach((m: string) => {
                const child = labs.find((x) => x.ref === m) || vitalSigns.find((x) => x.ref === m);
                if (child) row += `\n| ${m} | ↳ ${child.test} | ${child.category || "—"} | **${child.value}${child.unit ? " " + child.unit : ""}** | ${child.range || "—"} | ${child.flag || "—"} | ${child.status || "—"} | ${child.dateTime || child.date || "—"}${child.issued ? ` (issued ${child.issued})` : ""} |`;
              });
            }
            return row;
          })
          .join("\n")
      );
    }
    const notedObs = [...vitalSigns, ...labs].filter((o) => o.note || o.performer);
    if (notedObs.length > 0) {
      sections.push(
        `### Observation Notes & Provenance\n` +
        notedObs
          .map((o) => `**${o.ref} ${o.test}**${o.performer ? ` — performer: ${o.performer}` : ""}${o.note ? `\n> ${o.note}` : ""}`)
          .join("\n\n")
      );
    }
    if (carePlans.length > 0) {
      sections.push(
        `### Care Plans & Patient Directives\n` +
        carePlans.map((cp) =>
          `**[${cp.ref}] ${cp.title ? `${cp.title} - ` : ""}${cp.category}** (${cp.status}, ${cp.period || "active"})${cp.careTeam ? ` — care team: ${cp.careTeam}` : ""}\n` +
          (cp.activities ? cp.activities.map((a: string) => `- ${a}`).join("\n") : "- Routine monitoring")
        ).join("\n\n")
      );
    }
    if (medications.length > 0) {
      sections.push(
        `### Medications\n| Ref | Drug | Status | Date | Directions |\n|---|---|---|---|---|\n` +
        medications.map((m) => `| **${m.ref}** | ${m.drug} | ${m.status || "—"} | ${m.date || "—"} | ${[m.sig, m.category ? `{${m.category}}` : "", m.prn ? `PRN: ${m.prn}` : "", m.instruction ? `Instr: ${m.instruction}` : "", m.course ? `(${m.course})` : "", m.startsOn ? `from ${m.startsOn}` : "", m.endsOn ? `until ${m.endsOn}` : "", m.dispenseQty ? `disp: ${m.dispenseQty}` : "", m.doseTypes ? `also: ${m.doseTypes}` : "", m.prescriber ? `by ${m.prescriber}` : "", m.reason ? `reason: ${m.reason}` : "", m.note ? `note: ${m.note}` : ""].filter(Boolean).join(" ") || "—"} |`).join("\n")
      );
    }
    if (allergies.length > 0) {
      sections.push(
        `### Allergies & Intolerances\n| Ref | Allergen | Reactions | Criticality | Status | Verification | Onset | Recorded | Recorder | Note |\n|---|---|---|---|---|---|---|---|---|---|\n` +
        allergies.map((a) => `| **${a.ref}** | ${a.allergen}${a.kind ? ` {${a.kind}}` : ""} | ${a.reactions || "—"} | ${a.criticality || "—"} | ${a.status || "—"}${a.statusText ? ` (${a.statusText})` : ""} | ${a.verification || "—"} | ${a.onset || "—"} | ${a.recorded || "—"} | ${a.recorder || "—"} | ${a.note || "—"} |`).join("\n")
      );
    }
    if (conditions.length > 0) {
      sections.push(
        `### Active Conditions\n| Ref | Condition | Status | Verification | Category | Body Site | Onset | Recorded | Note |\n|---|---|---|---|---|---|---|---|---|\n` +
        conditions.map((c) => `| **${c.ref}** | ${c.condition} | ${c.status}${c.statusText ? ` (${c.statusText})` : ""} | ${c.verification || "—"} | ${c.category || "—"} | ${c.bodySite || "—"} | ${c.onset || "—"} | ${c.recorded || "—"} | ${c.note || "—"} |`).join("\n")
      );
    }
    if (encounters.length > 0) {
      sections.push(
        `### Encounters\n| Ref | Type | Class | Status | Start | Location | Reason | Discharge | Participants |\n|---|---|---|---|---|---|---|---|---|\n` +
        encounters.map((e) => `| **${e.ref}** | ${e.type || "—"} | ${e.class || "—"} | ${e.status || "—"} | ${e.start || "—"} | ${e.location || "—"} | ${e.reason || "—"} | ${e.discharge || "—"} | ${e.participants || "—"} |`).join("\n")
      );
    }
    if (others.length > 0) {
      sections.push(
        `### Other Resources\n| Ref | Resource | Name | Role | Status | Value | Date |\n|---|---|---|---|---|---|---|\n` +
        others.map((o) => `| **${o.ref}** | ${o.type} | ${o.name || o.id || "—"} | ${o.role || "—"} | ${o.status || "—"} | ${o.value === undefined || o.value === null || o.value === "" ? "—" : o.value} | ${o.date || "—"} |`).join("\n")
      );
    }
    if (omittedNotice) sections.push(omittedNotice);
    if (flaggedNotice) sections.push(flaggedNotice);
    if (gapNotice) sections.push(gapNotice);
    compressedOutput = sections.join("\n\n").trim();
  } else if (options.format === "cds_hooks_prefetch") {
    // CDS Hooks Prefetch Payload
    compressedOutput = JSON.stringify(
      {
        hook: profile === "medication_prescribe" ? "medication-prescribe" : "patient-view",
        hookInstance: "cds-eval-" + Date.now().toString(36),
        context: {
          patientId: patients[0]?.id || "P001",
          userId: "Practitioner/attending-01",
        },
        prefetch: {
          patient: patients[0] || undefined,
          vitalSigns,
          recentLabs: labs,
          carePlans,
          activeConditions: conditions,
          currentMedications: medications,
          allergies,
          encounters,
          other: others,
        },
        _provenanceRefs: Object.keys(provenanceMap).length,
        ...(dataGaps.length ? { _dataGaps: dataGaps } : {}),
        ...(flaggedIds.size ? { _flagged: flaggedIds.size } : {}),
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
  const budgetUtilization = tokenBudget > 0 ? Math.round((compressedTokens / tokenBudget) * 100) : 0;

  // Extract & Audit Clinical Facts
  const clinicalFacts: ClinicalFact[] = [];
  const textLower = compressedOutput.toLowerCase();

  // Audit Vital Signs
  vitalSigns.forEach((v) => {
    factsCheck: {
      clinicalFacts.push({
        id: `fact-${v.ref}`,
        shortRef: v.ref,
        resourceType: "VitalSign",
        category: "VitalSign",
        label: v.name,
        value: `${v.value} ${v.unit || ""}`.trim(),
        preserved: textLower.includes(`${v.value}`.toLowerCase()),
      });
      if (v.dateTime) {
        clinicalFacts.push({
          id: `fact-time-${v.ref}`,
          shortRef: v.ref,
          resourceType: "VitalSign",
          category: "Temporal",
          label: `${v.name} Exact Time`,
          value: v.dateTime,
          preserved: textLower.includes(v.dateTime.toLowerCase()),
        });
      }
    }
  });

  // Audit Labs
  labs.forEach((l) => {
    clinicalFacts.push({
      id: `fact-${l.ref}`,
      shortRef: l.ref,
      resourceType: "Observation",
      category: "Finding",
      label: l.test,
      value: `${l.value} ${l.unit || ""}`.trim(),
      preserved: textLower.includes(l.test.toLowerCase().slice(0, 8)),
    });
  });

  // Audit CarePlan
  carePlans.forEach((cp) => {
    clinicalFacts.push({
      id: `fact-cp-cat-${cp.ref}`,
      shortRef: cp.ref,
      resourceType: "CarePlan",
      category: "Instruction",
      label: "CarePlan Category",
      value: cp.category,
      preserved: textLower.includes(cp.category.toLowerCase()),
    });
    if (cp.activities) {
      cp.activities.forEach((act: string, idx: number) => {
        clinicalFacts.push({
          id: `fact-act-${cp.ref}-${idx}`,
          shortRef: cp.ref,
          resourceType: "CarePlan",
          category: "Activity",
          label: `Instruction #${idx + 1}`,
          value: act,
          preserved: textLower.includes(act.toLowerCase().slice(0, 15)),
        });
      });
    }
  });

  // Audit Meds & Allergies
  medications.forEach((m) => {
    clinicalFacts.push({
      id: `fact-${m.ref}`,
      shortRef: m.ref,
      resourceType: "MedicationRequest",
      category: "Dosage",
      label: m.drug,
      value: m.sig || "As directed",
      preserved: textLower.includes(m.drug.toLowerCase().slice(0, 8)),
    });
  });

  allergies.forEach((a) => {
    clinicalFacts.push({
      id: `fact-${a.ref}`,
      shortRef: a.ref,
      resourceType: "AllergyIntolerance",
      category: "Allergen",
      label: a.allergen,
      value: [a.criticality || "High", a.kind ? `type ${a.kind}` : "", a.verification, a.recorded ? `recorded ${a.recorded}` : "", a.note ? `note: ${a.note}` : ""].filter(Boolean).join(", "),
      preserved: textLower.includes(a.allergen.toLowerCase().slice(0, 8)),
    });
  });

  const totalFacts = clinicalFacts.length;
  const preservedFactsCount = clinicalFacts.filter((f) => f.preserved).length;
  const factRetentionRate = totalFacts > 0 ? Math.round((preservedFactsCount / totalFacts) * 100) : 100;

  const retainedFields = [
    "Observation.category (vital-signs vs laboratory disambiguation)",
    "Observation.effectiveDateTime (Preserves exact timestamp when needed)",
    "CarePlan.activity[].detail (Actionable instructions preserved)",
    "MedicationRequest.dosageInstruction (Prescriptions & directions)",
    "AllergyIntolerance.reaction & criticality (Must-include Safety Set)",
    "Provenance Short References (O1, V1, M1, CP1 maps to source)",
  ];

  const strippedFields = [
    "meta.profile, versionId & lastUpdated (Schema metadata)",
    "text.div (Duplicate XHTML markup)",
    "coding[].system ('http://loinc.org', 'http://snomed.info' URLs)",
    "subject.reference & display pointers",
    "search.mode and bundle wrapper syntax",
  ];

  const resourceBreakdown = Object.entries(resourceTypeCount).map(([rt, count]) => ({
    resourceType: rt,
    rawCount: count,
    compressedItems:
      rt === "Observation"
        ? (vitalSigns.length + labs.length)
        : rt === "CarePlan"
        ? carePlans.length
        : rt.startsWith("Medication")
        ? medications.length
        : rt === "Condition"
        ? conditions.length
        : rt === "AllergyIntolerance"
        ? allergies.length
        :       rt === "Patient"
        ? patients.length
        : rt === "Encounter"
        ? encounters.length
        : others.filter((o) => o.type === rt).length,
  }));

  return {
    rawJson: rawJsonString,
    compressedOutput,
    format: options.format,
    profileUsed: profile,
    granularityUsed: granularity,
    tokenBudget,
    budgetUtilization,
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
    provenanceMap,
    omittedCount,
    budgetExceeded,
    omittedItemsNotice: omittedNotice,
    resourceBreakdown,
  };
}

/**
 * Expand a short reference (e.g. "P1", "V1", "O1", "M1", "C1", "A1", "CP1")
 * back into the original FHIR resource using a provenance map produced by
 * `compressFhir()`. Returns null if the reference is unknown.
 *
 * Keep the provenance map in your own process — do not send it to the LLM.
 */
export function expand(
  provenanceMap: Record<string, ProvenanceEntry>,
  shortRef: string
): FhirResource | null {
  const entry = provenanceMap[shortRef];
  if (!entry || entry.fullSnippet == null) return null;
  return JSON.parse(JSON.stringify(entry.fullSnippet)) as FhirResource;
}

/**
 * Convenience wrapper: fold the raw input once, then expand `shortRef`.
 * Prefer keeping the `CompressionResult` and calling `expand()` on it when
 * you need multiple refs — this helper re-runs the whole pipeline.
 */
export function expandFromBundle(
  fhirPayload: string | object,
  shortRef: string,
  options?: Partial<CompressionOptions>
): FhirResource | null {
  const opts = {
    format: "compact_json",
    granularity: "exact_timestamp",
    tokenBudget: 800,
    stripMeta: true,
    stripNarrativeText: true,
    normalizeCodingSystems: true,
    stripRedundantReferences: true,
    stripCategory: true,
    ...(options || {}),
  } as CompressionOptions;
  const result = compressFhir(fhirPayload, opts);
  return expand(result.provenanceMap, shortRef);
}
