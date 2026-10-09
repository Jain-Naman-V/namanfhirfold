import json
import re
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
        self.format = str(format)
        self.profile = str(profile)
        self.granularity = str(granularity)
        self.token_budget = token_budget
        self.safety_set_guaranteed = safety_set_guaranteed
        self.query_filter = query_filter

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
    """
    if isinstance(raw_fhir_input, str):
        try:
            data = json.loads(raw_fhir_input)
        except Exception as e:
            return f"Error parsing FHIR JSON: {e}"
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
    medications = []
    conditions = []
    allergies = []
    care_plans = []

    for res in resources:
        rt = res.get("resourceType")
        if res.get("status") in ["entered-in-error", "refuted"]:
            continue

        if rt == "Patient":
            patient_summary["id"] = res.get("id")
            patient_summary["gender"] = res.get("gender")
            patient_summary["birthDate"] = res.get("birthDate")

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

            observations.append(obs_obj)

        elif rt in ["MedicationRequest", "MedicationStatement"]:
            med_name = res.get("medicationCodeableConcept", {}).get("text")
            for c in res.get("medicationCodeableConcept", {}).get("coding", []):
                if not med_name:
                    med_name = c.get("display")

            sig = None
            dosages = res.get("dosageInstruction", [])
            if dosages:
                sig = dosages[0].get("text")

            medications.append({
                "drug": med_name or "Medication",
                "status": res.get("status", "active"),
                "sig": sig
            })

        elif rt == "Condition":
            cond_name = res.get("code", {}).get("text")
            for c in res.get("code", {}).get("coding", []):
                if not cond_name:
                    cond_name = c.get("display")
            conditions.append({
                "condition": cond_name or "Condition",
                "status": res.get("clinicalStatus", {}).get("coding", [{}])[0].get("code", "active"),
                "onset": res.get("onsetDateTime")
            })

        elif rt == "AllergyIntolerance":
            subst = res.get("code", {}).get("text")
            for c in res.get("code", {}).get("coding", []):
                if not subst:
                    subst = c.get("display")
            allergies.append({
                "substance": subst or "Allergy",
                "criticality": res.get("criticality")
            })

    output_dict = {}
    if patient_summary:
        output_dict["patient"] = patient_summary
    if allergies:
        output_dict["allergies"] = allergies
    if medications:
        output_dict["medications"] = medications
    if conditions:
        output_dict["conditions"] = conditions
    if observations:
        output_dict["observations"] = observations

    fmt = str(format).lower()
    if fmt == "medprompt_text":
        lines = []
        if patient_summary:
            lines.append(f"PATIENT: {patient_summary.get('id', 'P')} | {patient_summary.get('gender', '')} | DOB: {patient_summary.get('birthDate', '')}")
        if allergies:
            lines.append("ALLERGIES: " + ", ".join([f"{a['substance']} ({a.get('criticality', 'high')})" for a in allergies]))
        if medications:
            lines.append("MEDICATIONS:")
            for m in medications:
                lines.append(f" - {m['drug']} [{m.get('status', 'active')}] {m.get('sig', '')}")
        if conditions:
            lines.append("CONDITIONS: " + ", ".join([f"{c['condition']} ({c.get('status', 'active')})" for c in conditions]))
        if observations:
            lines.append("OBSERVATIONS / LABS:")
            for o in observations:
                lines.append(f" - {o['test']}: {o.get('value')} (Normal: {o.get('range', 'N/A')}) [{o.get('date', '')}]")
        return "\n".join(lines)

    return json.dumps(output_dict, indent=2)
