import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, List, Optional, Union

class CompressionFormat(str, Enum):
    COMPACT_JSON = "compact_json"
    MEDPROMPT_TEXT = "medprompt_text"
    MARKDOWN = "markdown"

class CdsProfile(str, Enum):
    FREE_QUERY = "free_query"
    MEDICATION_PRESCRIBE = "medication_prescribe"
    VITALS_MONITOR = "vitals_monitor"
    PATIENT_VIEW = "patient_view"

class Granularity(str, Enum):
    EXACT_TIMESTAMP = "exact_timestamp"
    DATE_ONLY = "date_only"

@dataclass
class ProvenanceEntry:
    """Maps a short reference (P1, V1, O1, M1, C1, A1) back to the original FHIR resource."""
    short_ref: str
    resource_type: str
    original_id: str
    summary: str
    raw_snippet: Dict[str, Any]


@dataclass
class FoldResult:
    """Full result of a fold: the compact output plus the provenance map for expansion."""
    output: str
    provenance_map: Dict[str, ProvenanceEntry] = field(default_factory=dict)

    @property
    def short_refs(self) -> List[str]:
        return list(self.provenance_map.keys())

    def expand(self, short_ref: str) -> Optional[Dict[str, Any]]:
        """Expand a short reference back into the original FHIR resource."""
        return expand_from_map(self.provenance_map, short_ref)


class FoldOptions:
    def __init__(
        self,
        format: Union[CompressionFormat, str] = CompressionFormat.COMPACT_JSON,
        profile: Union[CdsProfile, str] = CdsProfile.FREE_QUERY,
        granularity: Union[Granularity, str] = Granularity.EXACT_TIMESTAMP,
        token_budget: Optional[int] = None,
        safety_set_guaranteed: bool = True,
        query_filter: Optional[str] = None
    ):
        self.format = str(getattr(format, "value", format))
        self.profile = str(getattr(profile, "value", profile))
        self.granularity = str(getattr(granularity, "value", granularity))
        self.token_budget = token_budget
        self.safety_set_guaranteed = safety_set_guaranteed
        self.query_filter = query_filter

# LOINC codes for observations that are vital signs rather than laboratory tests.
_VITAL_LOINCS = {
    "72514-3",  # Pain severity
    "85354-9",  # Blood pressure panel
    "8480-6",   # Systolic BP
    "8462-4",   # Diastolic BP
    "8867-4",   # Heart rate
    "9279-1",   # Respiratory rate
    "8310-5",   # Body temperature
    "59408-5",  # Oxygen saturation (SpO2)
    "29463-7",  # Body weight
    "8302-2",   # Body height
    "39156-5",  # BMI
}

_VITAL_NAME_HINTS = (
    "pain", "blood pressure", "pulse", "heart rate", "temperature",
)


def is_vital_sign(resource: Dict[str, Any]) -> bool:
    """True when an Observation is a vital sign rather than a laboratory test.

    Mirrors the classifier used by the TypeScript and Rust implementations:
    FHIR category first, then known vital-sign LOINC codes, then display text.
    """
    for cat in resource.get("category") or []:
        if not isinstance(cat, dict):
            continue
        for coding in cat.get("coding") or []:
            if not isinstance(coding, dict):
                continue
            if coding.get("code") == "vital-signs":
                return True
            display = str(coding.get("display") or "").lower()
            if "vital" in display:
                return True
        if "vital" in str(cat.get("text") or "").lower():
            return True

    code_obj = resource.get("code") or {}
    for coding in code_obj.get("coding") or []:
        if isinstance(coding, dict) and coding.get("code") in _VITAL_LOINCS:
            return True

    name = str(code_obj.get("text") or "").lower()
    if not name:
        codings = code_obj.get("coding") or []
        if codings and isinstance(codings[0], dict):
            name = str(codings[0].get("display") or "").lower()

    return any(hint in name for hint in _VITAL_NAME_HINTS)


def fold(
    raw_fhir_input: Union[str, Dict[str, Any]],
    format: Union[CompressionFormat, str] = "compact_json",
    profile: Union[CdsProfile, str] = "free_query",
    granularity: Union[Granularity, str] = "exact_timestamp",
    token_budget: Optional[int] = None,
    safety_set_guaranteed: bool = True,
    query_filter: Optional[str] = None
) -> str:
    """
    Fold the structure. Keep every detail.
    Takes a raw FHIR R4 Bundle or Resource and produces an ultra-compact context for LLMs.

    Returns only the compact output string. To also get the provenance map
    (required for later `expand()` calls), use `fold_with_provenance()` instead.
    """
    return fold_with_provenance(
        raw_fhir_input,
        format=format,
        profile=profile,
        granularity=granularity,
        token_budget=token_budget,
        safety_set_guaranteed=safety_set_guaranteed,
        query_filter=query_filter,
    ).output


def fold_with_provenance(
    raw_fhir_input: Union[str, Dict[str, Any]],
    format: Union[CompressionFormat, str] = "compact_json",
    profile: Union[CdsProfile, str] = "free_query",
    granularity: Union[Granularity, str] = "exact_timestamp",
    token_budget: Optional[int] = None,
    safety_set_guaranteed: bool = True,
    query_filter: Optional[str] = None
) -> FoldResult:
    """
    Fold a FHIR R4 Bundle/Resource and return BOTH the compact output and the
    provenance map. Keep the provenance map in your own process; expand(ref)
    uses it to restore any short reference to its original FHIR resource.
    """
    provenance_map: Dict[str, ProvenanceEntry] = {}
    if isinstance(raw_fhir_input, str):
        try:
            data = json.loads(raw_fhir_input)
        except Exception as e:
            return FoldResult(output=f"Error parsing FHIR JSON: {e}")
    else:
        data = raw_fhir_input

    # Flatten resources
    resources = []
    if data.get("resourceType") == "Bundle":
        for entry in data.get("entry", []):
            if "resource" in entry:
                resources.append(entry["resource"])
    else:
        resources.append(data)

    patient_summary = {}
    observations = []
    vital_signs = []
    medications = []
    conditions = []
    allergies = []
    care_plans = []

    v_idx = 1
    o_idx = 1
    m_idx = 1
    c_idx = 1
    a_idx = 1
    cp_idx = 1

    for res in resources:
        rt = res.get("resourceType")
        if res.get("status") in ["entered-in-error", "refuted"]:
            continue

        if rt == "Patient":
            patient_summary["ref"] = "P1"
            patient_summary["id"] = res.get("id")
            patient_summary["gender"] = res.get("gender")
            patient_summary["birthDate"] = res.get("birthDate")
            provenance_map["P1"] = ProvenanceEntry(
                short_ref="P1",
                resource_type="Patient",
                original_id=str(res.get("id") or ""),
                summary="Patient Demographics",
                raw_snippet=res,
            )

        elif rt == "Observation":
            test_name = res.get("code", {}).get("text")
            code_val = None
            for c in res.get("code", {}).get("coding", []):
                if not test_name:
                    test_name = c.get("display")
                if c.get("code"):
                    sys_name = "LOINC" if "loinc" in (c.get("system") or "").lower() else "Code"
                    code_val = f"{sys_name}:{c.get('code')}"

            # Value extraction
            val = None
            if "valueQuantity" in res:
                vq = res["valueQuantity"]
                val = f"{vq.get('value')} {vq.get('unit', '')}".strip()
            elif "valueCodeableConcept" in res:
                val = res["valueCodeableConcept"].get("text") or res["valueCodeableConcept"].get("coding", [{}])[0].get("display")
            elif "valueString" in res:
                val = res["valueString"]

            date_str = res.get("effectiveDateTime") or res.get("issued")
            if date_str and granularity == "date_only" and "T" in date_str:
                date_str = date_str.split("T")[0]

            obs_obj = {
                "test": test_name or "Observation",
                "value": val,
                "date": date_str
            }
            if code_val:
                obs_obj["code"] = code_val
            if "referenceRange" in res and res["referenceRange"]:
                rr = res["referenceRange"][0]
                low = rr.get("low", {}).get("value")
                high = rr.get("high", {}).get("value")
                if low is not None or high is not None:
                    obs_obj["range"] = f"{low or ''}-{high or ''}"

            if is_vital_sign(res):
                ref = f"V{v_idx}"
                v_idx += 1
                bucket = vital_signs
            else:
                ref = f"O{o_idx}"
                o_idx += 1
                bucket = observations
            obs_obj["ref"] = ref
            bucket.append(obs_obj)
            provenance_map[ref] = ProvenanceEntry(
                short_ref=ref,
                resource_type="Observation",
                original_id=str(res.get("id") or ""),
                summary=f"{obs_obj['test']} = {val}",
                raw_snippet=res,
            )

        elif rt in ["MedicationRequest", "MedicationStatement"]:
            med_name = res.get("medicationCodeableConcept", {}).get("text")
            for c in res.get("medicationCodeableConcept", {}).get("coding", []):
                if not med_name:
                    med_name = c.get("display")

            sig = None
            dosages = res.get("dosageInstruction", [])
            if dosages:
                sig = dosages[0].get("text")

            ref = f"M{m_idx}"
            m_idx += 1
            medications.append({
                "ref": ref,
                "drug": med_name or "Medication",
                "status": res.get("status", "active"),
                "sig": sig
            })
            provenance_map[ref] = ProvenanceEntry(
                short_ref=ref,
                resource_type=rt,
                original_id=str(res.get("id") or ""),
                summary=str(med_name or "Medication"),
                raw_snippet=res,
            )

        elif rt == "Condition":
            cond_name = res.get("code", {}).get("text")
            for c in res.get("code", {}).get("coding", []):
                if not cond_name:
                    cond_name = c.get("display")
            ref = f"C{c_idx}"
            c_idx += 1
            conditions.append({
                "ref": ref,
                "condition": cond_name or "Condition",
                "status": res.get("clinicalStatus", {}).get("coding", [{}])[0].get("code", "active"),
                "onset": res.get("onsetDateTime")
            })
            provenance_map[ref] = ProvenanceEntry(
                short_ref=ref,
                resource_type="Condition",
                original_id=str(res.get("id") or ""),
                summary=str(cond_name or "Condition"),
                raw_snippet=res,
            )

        elif rt == "AllergyIntolerance":
            subst = res.get("code", {}).get("text")
            for c in res.get("code", {}).get("coding", []):
                if not subst:
                    subst = c.get("display")
            ref = f"A{a_idx}"
            a_idx += 1
            allergies.append({
                "ref": ref,
                "substance": subst or "Allergy",
                "criticality": res.get("criticality")
            })
            provenance_map[ref] = ProvenanceEntry(
                short_ref=ref,
                resource_type="AllergyIntolerance",
                original_id=str(res.get("id") or ""),
                summary=str(subst or "Allergy"),
                raw_snippet=res,
            )

        elif rt == "CarePlan":
            cat = None
            for c in res.get("category", []):
                for coding in c.get("coding", []):
                    if coding.get("display"):
                        cat = coding.get("display")
                        break
                if cat:
                    break
            ref = f"CP{cp_idx}"
            cp_idx += 1
            care_plans.append({
                "ref": ref,
                "category": cat or "CarePlan",
            })
            provenance_map[ref] = ProvenanceEntry(
                short_ref=ref,
                resource_type="CarePlan",
                original_id=str(res.get("id") or ""),
                summary=str(cat or "CarePlan"),
                raw_snippet=res,
            )

    output_dict = {}
    if patient_summary:
        output_dict["patient"] = patient_summary
    if allergies:
        output_dict["allergies"] = allergies
    if medications:
        output_dict["medications"] = medications
    if conditions:
        output_dict["conditions"] = conditions
    if care_plans:
        output_dict["care_plans"] = care_plans
    if vital_signs:
        output_dict["vital_signs"] = vital_signs
    if observations:
        output_dict["observations"] = observations
    output_dict["_refs"] = sorted(provenance_map.keys())

    fmt = (format.value if isinstance(format, CompressionFormat) else str(format)).lower()
    if fmt == "medprompt_text":
        lines = []
        if patient_summary:
            lines.append(f"PATIENT: {patient_summary.get('ref', '')} {patient_summary.get('id', 'P')} | {patient_summary.get('gender', '')} | DOB: {patient_summary.get('birthDate', '')}")
        if allergies:
            lines.append("ALLERGIES: " + ", ".join([f"{a['ref']} {a['substance']} ({a.get('criticality', 'high')})" for a in allergies]))
        if medications:
            lines.append("MEDICATIONS:")
            for m in medications:
                lines.append(f" - {m['ref']} {m['drug']} [{m.get('status', 'active')}] {m.get('sig', '')}")
        if conditions:
            lines.append("CONDITIONS: " + ", ".join([f"{c['ref']} {c['condition']} ({c.get('status', 'active')})" for c in conditions]))
        if care_plans:
            lines.append("CARE PLANS: " + ", ".join([f"{cp['ref']} {cp['category']}" for cp in care_plans]))
        if vital_signs:
            lines.append("VITAL SIGNS & SCALES:")
            for v in vital_signs:
                lines.append(f" - {v['ref']} {v['test']}: {v.get('value')} [{v.get('date', '')}]")
        if observations:
            lines.append("OBSERVATIONS / LABS:")
            for o in observations:
                lines.append(f" - {o['ref']} {o['test']}: {o.get('value')} (Normal: {o.get('range', 'N/A')}) [{o.get('date', '')}]")
        return FoldResult(output="\n".join(lines), provenance_map=provenance_map)

    if fmt == "markdown":
        lines = ["# FHIR Compact Context"]
        if patient_summary:
            lines.append(f"- **Patient** `{patient_summary.get('ref')}`: {patient_summary.get('id')} ({patient_summary.get('gender')}, DOB {patient_summary.get('birthDate')})")
        for section, items, label in (
            ("allergies", allergies, "Allergies"),
            ("medications", medications, "Medications"),
            ("conditions", conditions, "Conditions"),
            ("care_plans", care_plans, "Care Plans"),
            ("vital_signs", vital_signs, "Vital Signs"),
            ("observations", observations, "Observations"),
        ):
            if items:
                lines.append(f"\n## {label}")
                for it in items:
                    ref = it.get("ref", "")
                    name = it.get("substance") or it.get("drug") or it.get("condition") or it.get("category") or it.get("test") or ""
                    val = it.get("value") or it.get("sig") or it.get("onset") or it.get("status") or ""
                    lines.append(f"- `{ref}` {name}: {val}".rstrip(": "))
        lines.append(f"\n_Provenance refs: {', '.join(provenance_map.keys()) or 'none'} — expand(ref) restores original FHIR._")
        return FoldResult(output="\n".join(lines), provenance_map=provenance_map)

    return FoldResult(output=json.dumps(output_dict, indent=2), provenance_map=provenance_map)


def expand_from_map(
    provenance_map: Dict[str, ProvenanceEntry],
    short_ref: str
) -> Optional[Dict[str, Any]]:
    """
    Expand a short reference (e.g. "O1", "V1", "M1", "A1", "C1", "CP1", "P1")
    back into the original FHIR resource using a provenance map obtained from
    `fold_with_provenance()`. Returns None if the reference is unknown.
    """
    entry = provenance_map.get(short_ref)
    return dict(entry.raw_snippet) if entry is not None else None


def expand(
    raw_fhir_input: Union[str, Dict[str, Any]],
    short_ref: str,
    **fold_kwargs: Any
) -> Optional[Dict[str, Any]]:
    """
    Convenience wrapper: re-fold the raw input, then expand `short_ref`.

    Prefer `fold_with_provenance(...).expand(ref)` in performance-sensitive code —
    this helper re-parses the bundle on every call.
    """
    result = fold_with_provenance(raw_fhir_input, **fold_kwargs)
    return result.expand(short_ref)
