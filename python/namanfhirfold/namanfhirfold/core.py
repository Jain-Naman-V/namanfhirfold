import json
import re
import time
from datetime import date
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple, Union


class CompressionFormat(str, Enum):
    COMPACT_JSON = "compact_json"
    MEDPROMPT_TEXT = "medprompt_text"
    FHIRBENCH_MARKDOWN = "fhirbench_markdown"
    CDS_HOOKS_PREFETCH = "cds_hooks_prefetch"


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
    budget_exceeded: bool = False

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


# ---------------------------------------------------------------------------
# Concept helpers (parity with TypeScript fhirCompressor.ts)
# ---------------------------------------------------------------------------

_SYSTEM_HINTS = (
    ("loinc.org", "loinc"),
    ("snomed.info", "snomed"),
    ("rxnorm", "rxnorm"),
    ("nlm.nih.gov", "rxnorm"),
    ("unitsofmeasure.org", "ucum"),
    ("ucum", "ucum"),
    ("icd-10", "icd10"),
    ("cvx", "cvx"),
)


def normalize_system(system: Optional[str]) -> str:
    if not system:
        return ""
    for needle, name in _SYSTEM_HINTS:
        if needle in system:
            return name
    parts = [p for p in system.split("/") if p]
    return parts[-1] if parts else system


def human_name(n: Any) -> str:
    if not n:
        return ""
    arr = n if isinstance(n, list) else [n]
    out = []
    for x in arr:
        if not isinstance(x, dict):
            continue
        if x.get("text"):
            out.append(x["text"])
            continue
        parts = [
            " ".join(x.get("prefix") or []) or "",
            " ".join(x.get("given") or []) or "",
            x.get("family") or "",
        ]
        joined = " ".join(p for p in parts if p)
        if joined:
            out.append(joined)
    return " | ".join(s for s in out if s)


def code_display(c: Any) -> str:
    if not c:
        return ""
    coding = (c.get("coding") or [{}]) if isinstance(c, dict) else [{}]
    first = coding[0] if coding and isinstance(coding[0], dict) else {}
    disp = first.get("display") or first.get("code") or ""
    text = c.get("text") or "" if isinstance(c, dict) else ""
    if text and disp and text != disp:
        return f"{disp} ({text})"
    return text or disp


def concept_all(c: Any) -> str:
    """text + every coding display/code, unique within the supported concept contract."""
    if not c or not isinstance(c, dict):
        return ""
    parts: List[str] = []

    def push(x: Any) -> None:
        s = str(x).strip() if x is not None else ""
        if s and s not in parts:
            parts.append(s)

    push(c.get("text"))
    for d in c.get("coding") or []:
        if isinstance(d, dict):
            push(d.get("display"))
            push(d.get("code"))
    return " / ".join(parts)


def _extract_concept(concept: Any) -> Dict[str, Any]:
    if not concept or not isinstance(concept, dict):
        return {"name": "Unknown"}
    coding = (concept.get("coding") or [{}])[0] if concept.get("coding") else {}
    if not isinstance(coding, dict):
        coding = {}
    name = concept.get("text") or coding.get("display") or coding.get("code") or "Unknown"
    if coding.get("code"):
        return {
            "name": name,
            "code": coding.get("code"),
            "system": normalize_system(coding.get("system")) or None,
        }
    return {"name": name}


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
    """True when an Observation is a vital sign rather than a laboratory test."""
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
    if not isinstance(code_obj, dict):
        code_obj = {}
    for coding in code_obj.get("coding") or []:
        if isinstance(coding, dict) and coding.get("code") in _VITAL_LOINCS:
            return True

    name = str(code_obj.get("text") or "").lower()
    if not name:
        codings = code_obj.get("coding") or []
        if codings and isinstance(codings[0], dict):
            name = str(codings[0].get("display") or "").lower()

    return any(hint in name for hint in _VITAL_NAME_HINTS)


def _extract_value(src: Any) -> Dict[str, Any]:
    """Universal value[x] extractor — every FHIR value type, never silently blank."""
    if not src or not isinstance(src, dict):
        return {"value": ""}
    dq = src.get("valueQuantity")
    if dq:
        return {"value": dq.get("value"), "unit": dq.get("unit") or dq.get("code")}
    if src.get("valueString") is not None:
        return {"value": src["valueString"]}
    if src.get("valueBoolean") is not None:
        return {"value": "Yes" if src["valueBoolean"] else "No"}
    if src.get("valueInteger") is not None:
        return {"value": src["valueInteger"]}
    if src.get("valueDateTime"):
        return {"value": src["valueDateTime"]}
    if src.get("valueTime"):
        return {"value": src["valueTime"]}
    if src.get("valuePeriod"):
        p = src["valuePeriod"]
        if p.get("start") and p.get("end"):
            return {"value": f"{p['start']} to {p['end']}"}
        return {"value": p.get("start") or p.get("end") or ""}
    if src.get("valueRange"):
        r = src["valueRange"]
        lo = (r.get("low") or {}).get("value")
        hi = (r.get("high") or {}).get("value")
        u = (r.get("low") or {}).get("unit") or (r.get("high") or {}).get("unit") or ""
        if lo is not None and hi is not None:
            return {"value": f"{lo}-{hi}", "unit": u or None}
        if lo is not None:
            return {"value": f">={lo}", "unit": u or None}
        if hi is not None:
            return {"value": f"<={hi}", "unit": u or None}
    if src.get("valueRatio"):
        r = src["valueRatio"]
        num = (r.get("numerator") or {}).get("value")
        den = (r.get("denominator") or {}).get("value")
        if num is not None and den is not None:
            return {"value": f"{num}/{den}", "unit": (r.get("numerator") or {}).get("unit")}
    if src.get("valueCodeableConcept"):
        cc = src["valueCodeableConcept"]
        codings = cc.get("coding") or []
        dar = next(
            (c for c in codings
             if isinstance(c, dict)
             and ("data-absent-reason" in str(c.get("system") or "") or c.get("code") == "unknown")),
            None,
        )
        non_dar = [c for c in codings if isinstance(c, dict)
                   and "data-absent-reason" not in str(c.get("system") or "")]
        if dar and not cc.get("text") and not non_dar:
            return {"value": "", "absent": dar.get("code") or "unknown"}
        if dar and len(codings) == 1:
            return {"value": "", "absent": dar.get("code") or "unknown"}
        return {"value": concept_all(cc) or cc.get("text") or ""}
    dar = src.get("dataAbsentReason")
    if dar:
        coding = (dar.get("coding") or [{}])[0] if dar.get("coding") else {}
        return {"value": "", "absent": (coding.get("code") if isinstance(coding, dict) else None) or dar.get("text") or "unknown"}
    return {"value": ""}


def _format_date_time(dt: Optional[str], granularity: str) -> str:
    if not dt:
        return ""
    if granularity == "exact_timestamp":
        return str(dt)
    return str(dt).split("T")[0]


def _obs_date(res: Dict[str, Any]) -> Optional[str]:
    if res.get("effectiveDateTime"):
        return res["effectiveDateTime"]
    ep = res.get("effectivePeriod") or {}
    if ep.get("start") or ep.get("end"):
        return ep.get("start") or ep.get("end")
    et = res.get("effectiveTiming") or {}
    events = et.get("event") or []
    if events:
        return events[0]
    if res.get("effectiveInstant"):
        return res["effectiveInstant"]
    if res.get("issued"):
        return res["issued"]
    issued_period = res.get("issuedPeriod") or {}
    if issued_period.get("start"):
        return issued_period["start"]
    return None


def _resource_date_span(res: Dict[str, Any], granularity: str) -> str:
    period = res.get("performedPeriod") or res.get("occurrencePeriod") or res.get("period") or {}
    start = _format_date_time(
        _obs_date(res)
        or res.get("performedDateTime")
        or res.get("occurrenceDateTime")
        or period.get("start")
        or res.get("recordedDate")
        or res.get("authoredOn"),
        granularity,
    )
    end = _format_date_time(period.get("end"), granularity)
    if start and end and start != end:
        return f"{start} to {end}"
    return start or end


def _format_ref_range(ranges: Any) -> Optional[str]:
    if not ranges:
        return None
    r = ranges[0]
    if r.get("text"):
        return r["text"]
    low = r.get("low") or {}
    high = r.get("high") or {}
    lo = str(low["value"]) if low.get("value") is not None else ""
    hi = str(high["value"]) if high.get("value") is not None else ""
    unit = low.get("unit") or high.get("unit") or ""
    if lo and hi:
        return f"{lo}-{hi} {unit}".strip()
    if lo:
        return f">{lo} {unit}".strip()
    if hi:
        return f"<{hi} {unit}".strip()
    return None


def _note_join(items: Any) -> str:
    texts = [n.get("text") for n in (items or []) if isinstance(n, dict) and n.get("text")]
    return re.sub(r"\s*\n\s*", " / ", " | ".join(texts))


def _current_year() -> int:
    return int(time.strftime("%Y"))


def _calculate_age(birth_date: Optional[str]) -> Optional[int]:
    if not birth_date:
        return None
    try:
        dob = date.fromisoformat(str(birth_date)[:10])
    except ValueError:
        return None
    today = date.today()
    if dob > today:
        return None
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return max(0, age)


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def _ingest(data: Any) -> Tuple[List[Dict[str, Any]], Dict[str, int], List[str]]:
    raw_resources: List[Dict[str, Any]] = []
    resource_type_count: Dict[str, int] = {}
    data_gaps: List[str] = []

    def push(res: Dict[str, Any]) -> None:
        raw_resources.append(res)
        rt = res.get("resourceType") or "Unknown"
        resource_type_count[rt] = resource_type_count.get(rt, 0) + 1

    def ingest_group_val(key: str, val: Any) -> None:
        if val is None or not isinstance(val, (dict, list)):
            return
        if isinstance(val, list):
            for v in val:
                ingest_group_val(key, v)
            return
        if val.get("resourceType") == "Bundle" and isinstance(val.get("entry"), list):
            for entry in val["entry"]:
                if isinstance(entry, dict) and entry.get("resource"):
                    push(entry["resource"])
        elif val.get("resourceType"):
            push(val)
        elif val.get("error"):
            status = val.get("status")
            data_gaps.append(f"{key}: fetch failed ({val['error']}{f' {status}' if status else ''})")

    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                ingest_group_val("item", item)
    elif isinstance(data, dict):
        if data.get("resourceType") == "Bundle" and isinstance(data.get("entry"), list):
            for entry in data["entry"]:
                if isinstance(entry, dict) and entry.get("resource"):
                    push(entry["resource"])
        elif data.get("resourceType"):
            push(data)
        else:
            for key, val in data.items():
                ingest_group_val(key, val)

    return raw_resources, resource_type_count, data_gaps


# ---------------------------------------------------------------------------
# Fold
# ---------------------------------------------------------------------------

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

    raw_resources, resource_type_count, data_gaps = _ingest(data)

    granularity = str(granularity)
    if query_filter:
        q = query_filter.lower()
        if any(w in q for w in ("time", "pm", "am", "hour", "acute", "when")):
            granularity = "exact_timestamp"

    profile = str(profile)
    budget_exceeded = False

    # Flag invalid / refuted / entered-in-error items (kept: ruling-out IS clinical data)
    valid_resources = raw_resources
    flagged_ids = {
        res.get("id")
        for res in valid_resources
        if res.get("status") == "entered-in-error"
        or ((res.get("verificationStatus") or {}).get("coding") or [{}])[0].get("code") == "refuted"
        if res.get("id")
    }

    # Task-Aware Selection (CDS Hook Profiles vs Free Query)
    selected_resources = valid_resources
    if profile == "medication_prescribe":
        def keep(res: Dict[str, Any]) -> bool:
            rt = res.get("resourceType") or ""
            if rt in ("Patient", "AllergyIntolerance") or rt.startswith("Medication"):
                return True
            if rt == "Observation":
                text = json.dumps(res).lower()
                return any(w in text for w in ("creatinine", "egfr", "bun", "weight", "potassium"))
            return False
        selected_resources = [r for r in valid_resources if keep(r)]
    elif profile == "vitals_monitor":
        selected_resources = [
            r for r in valid_resources
            if r.get("resourceType") == "Patient" or is_vital_sign(r)
        ]
    elif query_filter and query_filter.strip():
        q_lower = query_filter.lower().strip()

        # Broad/comprehensive intent check: summary, all info, overview, insights
        broad_terms = (
            "all", "summary", "overview", "insight", "insights", "everything",
            "complete", "full", "chart", "record", "records", "history", "profile", "review", "report"
        )
        is_broad = any(w in q_lower for w in broad_terms)

        if is_broad:
            selected_resources = valid_resources
        else:
            def keep(res: Dict[str, Any]) -> bool:
                rt = res.get("resourceType") or ""

                if safety_set_guaranteed:
                    if rt == "Patient":
                        return True
                    if rt == "AllergyIntolerance":
                        return True
                    if rt.startswith("Medication") and res.get("status") not in ("stopped", "entered-in-error"):
                        return True

                res_str = json.dumps(res).lower()
                if q_lower in res_str:
                    return True
                if "pain" in q_lower and ("pain" in res_str or rt == "Observation"):
                    return True
                if ("vital" in q_lower or "bp" in q_lower or "pressure" in q_lower or "pulse" in q_lower or "temp" in q_lower) and is_vital_sign(res):
                    return True
                if any(w in q_lower for w in ("care", "plan", "activity", "protocol", "recovery")) and rt == "CarePlan":
                    return True
                if any(w in q_lower for w in ("lab", "blood", "test", "panel", "result", "finding", "pefr", "spo2", "hba1c")) and rt == "Observation" and not is_vital_sign(res):
                    return True
                if any(w in q_lower for w in ("med", "drug", "dose", "rx", "prescription", "pharmacy")) and rt.startswith("Medication"):
                    return True
                if any(w in q_lower for w in ("allergy", "allergies", "intolerance", "reaction")) and rt == "AllergyIntolerance":
                    return True
                if any(w in q_lower for w in ("condition", "diagnosis", "problem", "disease", "illness")) and rt == "Condition":
                    return True
                if any(w in q_lower for w in ("encounter", "visit", "admission", "consult", "clinic", "appointment", "stay", "surgery")) and rt == "Encounter":
                    return True
                if any(w in q_lower for w in ("procedure", "operation", "intervention")) and rt == "Procedure":
                    return True
                if any(w in q_lower for w in ("vaccine", "vaccination", "immunization", "shot")) and rt == "Immunization":
                    return True
                return False

            selected_resources = [r for r in valid_resources if keep(r)]
            if not selected_resources:
                selected_resources = valid_resources

    if token_budget and token_budget > 0:
        def is_safety(res: Dict[str, Any]) -> bool:
            rt = res.get("resourceType") or ""
            if rt in ("Patient", "AllergyIntolerance", "CarePlan"):
                return True
            return rt.startswith("Medication") and res.get("status") not in ("stopped", "entered-in-error")

        def estimate(res: Dict[str, Any]) -> int:
            return max(1, (len(json.dumps(res, separators=(",", ":"))) + 2) // 3)

        safety = [r for r in selected_resources if is_safety(r)]
        normal = [r for r in selected_resources if not is_safety(r)]
        used = sum(estimate(r) for r in safety)
        within = []
        for res in normal:
            cost = estimate(res)
            if used + cost <= token_budget:
                used += cost
                within.append(res)
        budget_exceeded = len(safety) + len(within) < len(selected_resources)
        selected_resources = safety + within

    # Transform & index provenance
    patients: List[Dict[str, Any]] = []
    vital_signs: List[Dict[str, Any]] = []
    labs: List[Dict[str, Any]] = []
    medications: List[Dict[str, Any]] = []
    conditions: List[Dict[str, Any]] = []
    allergies: List[Dict[str, Any]] = []
    care_plans: List[Dict[str, Any]] = []
    others: List[Dict[str, Any]] = []
    encounters: List[Dict[str, Any]] = []
    obs_id_to_short_ref: Dict[str, str] = {}
    patient_fallback = ""

    obs_counter = vital_counter = med_counter = cond_counter = alg_counter = cp_counter = enc_counter = 1

    for res in selected_resources:
        rt = res.get("resourceType") or ""
        orig_id = res.get("id") or f"res-{int(time.time() * 1000) % 100000:05x}"
        subj = (res.get("subject") or {})
        if not patient_fallback and str(subj.get("reference") or "").startswith("Patient/") and subj.get("display"):
            patient_fallback = subj["display"]

        # contained resources are real data — never drop them
        contained = res.get("contained")
        if isinstance(contained, list) and contained:
            for c in contained:
                if not isinstance(c, dict):
                    continue
                role_val = c.get("relationship") or c.get("specialty") or c.get("role") or []
                others.append({
                    "ref": f"X{len(others) + 1}",
                    "type": f"{c.get('resourceType') or 'contained'} (contained)",
                    "id": c.get("id") or orig_id,
                    "name": concept_all(c.get("code")) or human_name(c.get("name")) or c.get("id") or None,
                    "role": concept_all(role_val[0]) if isinstance(role_val, list) and role_val else None,
                    "status": c.get("status") or None,
                    "value": _extract_value(c).get("value") or None,
                    "date": _format_date_time(c.get("effectiveDateTime") or c.get("recordedDate") or c.get("authoredOn"), granularity) or None,
                })

        if rt == "Patient":
            all_names = [
                n.get("text") or " ".join(p for p in [
                    " ".join(n.get("prefix") or []) or "",
                    " ".join(n.get("given") or []) or "",
                    n.get("family") or "",
                ] if p)
                for n in (res.get("name") or []) if isinstance(n, dict)
            ]
            all_names = [n for n in all_names if n]
            name = all_names[0] if all_names else ""
            aka = list(dict.fromkeys(all_names[1:]))
            tel = [f"{t.get('system') or 'tel'}: {t.get('value')}"
                   for t in (res.get("telecom") or []) if isinstance(t, dict) and t.get("value")]
            addr = []
            for a in (res.get("address") or []):
                if not isinstance(a, dict):
                    continue
                line = ", ".join(a.get("line") or [])
                composed = ", ".join(p for p in [line, a.get("city"), a.get("state"), a.get("postalCode")] if p)
                fallback = ", ".join(p for p in [a.get("city"), a.get("state")] if p)
                addr.append(a.get("text") or composed or fallback)
            addr = [a for a in addr if a]
            langs = [
                code_display(c.get("language")) + (" (preferred)" if c.get("preferred") else "")
                for c in (res.get("communication") or []) if isinstance(c, dict)
            ]
            langs = [l for l in langs if l]
            contacts = []
            for c in (res.get("contact") or []):
                if not isinstance(c, dict):
                    continue
                rel = code_display(c.get("relationship"))
                who = human_name(c.get("name")) if c.get("name") else ""
                ct = "/".join(str(t.get("value")) for t in (c.get("telecom") or []) if isinstance(t, dict) and t.get("value"))
                joined = " ".join(x for x in [f"({rel})" if rel else "", who, ct] if x)
                contacts.append(joined or None)
            contacts = [c for c in contacts if c]
            gp = ", ".join(g.get("display") for g in (res.get("generalPractitioner") or []) if isinstance(g, dict) and g.get("display"))
            birth = res.get("birthDate")
            pat = {
                "ref": "P1",
                "id": orig_id,
                "name": name or None,
                "aka": aka or None,
                "gender": res.get("gender"),
                "age": _calculate_age(birth),
                "dob": birth,
                "phone": next((t.get("value") for t in (res.get("telecom") or [])
                               if isinstance(t, dict) and t.get("system") == "phone" and t.get("value")), None),
                "telecom": tel or None,
                "address": addr or None,
                "languages": langs or None,
                "contacts": contacts or None,
                "gp": gp or None,
                "marital": code_display(res.get("maritalStatus")) or None,
            }
            patients.append(pat)
            provenance_map["P1"] = ProvenanceEntry(
                short_ref="P1",
                resource_type="Patient",
                original_id=orig_id,
                summary=f"{pat.get('name') or 'Patient'} ({pat.get('gender') or ''}, Age: {pat.get('age') if pat.get('age') is not None else 'N/A'})",
                raw_snippet=res,
            )

        elif rt == "Observation":
            vital = is_vital_sign(res)
            concept = _extract_concept(res.get("code"))
            ev = _extract_value(res)
            val = ev.get("value")
            unit = ev.get("unit") or ""
            absent = ev.get("absent")

            components = res.get("component")
            if isinstance(components, list) and components:
                comps = []
                for c in components:
                    if not isinstance(c, dict):
                        continue
                    c_name = _extract_concept(c.get("code"))["name"]
                    cv = _extract_value(c)
                    if cv.get("absent"):
                        comps.append(f"{c_name}: ABSENT({cv['absent']})")
                    elif cv.get("value") == "" or cv.get("value") is None:
                        continue
                    else:
                        comps.append(f"{c_name}: {cv.get('value')} {cv.get('unit') or ''}".strip())
                if comps:
                    val = ", ".join(comps)

            member_refs = [
                m.get("reference")
                for m in ((res.get("hasMember") or []) + (res.get("derivedFrom") or []))
                if isinstance(m, dict) and m.get("reference")
            ]

            date_str = _format_date_time(_obs_date(res), granularity)
            obs_dt = _obs_date(res)
            issued_raw = _format_date_time(res.get("issued"), granularity) if res.get("issued") and res.get("issued") != obs_dt else ""
            issued_str = issued_raw if issued_raw and issued_raw != date_str else ""
            ref_range = _format_ref_range(res.get("referenceRange"))
            obs_cat = ", ".join(
                n for n in (
                    _extract_concept(c).get("name") for c in (res.get("category") or []) if isinstance(c, dict)
                ) if n and n != "Unknown"
            )
            obs_note = _note_join(res.get("note"))
            obs_performer = ", ".join(
                p.get("display") for p in (res.get("performer") or []) if isinstance(p, dict) and p.get("display")
            )
            flag = None
            flag_abnormal = False
            interp = res.get("interpretation")
            if isinstance(interp, list) and interp:
                coding = ((interp[0].get("coding") or [{}])[0] if isinstance(interp[0], dict) and interp[0].get("coding") else {})
                code = coding.get("code") or ""
                disp = coding.get("display") or (interp[0].get("text") if isinstance(interp[0], dict) else "") or ""
                if disp and code and disp != code:
                    flag = f"{disp} ({code})"
                else:
                    flag = disp or code or None
                flag_abnormal = bool(code) and code.lower() not in ("n", "normal")

            if not isinstance(flag_abnormal, bool):
                flag_abnormal = False
            if getattr(_fold_options_proxy, "only_abnormal_labs", False) and not flag_abnormal:
                continue

            if val == "" or val is None:
                if member_refs:
                    display_val = f"→ {len(member_refs)} answer(s)"
                elif absent:
                    display_val = f"ABSENT({absent})"
                else:
                    display_val = "NO VALUE"
            else:
                display_val = val

            row: Dict[str, Any] = {
                "ref": "",
                "name": concept.get("name"),
                "test": concept.get("name"),
                "code": f"{concept.get('system') or 'loinc'}:{concept['code']}" if concept.get("code") else None,
                "value": display_val,
                "unit": None,
                "date": date_str if granularity == "date_only" else None,
                "dateTime": date_str if granularity == "exact_timestamp" else None,
                "issued": issued_str or None,
                "range": ref_range,
                "flag": flag,
                "category": obs_cat or None,
                "note": obs_note or None,
                "performer": obs_performer or None,
                "status": res.get("status"),
                "absent": absent,
                "members": member_refs or None,
            }
            row["unit"] = unit or None

            if vital:
                short_ref = f"V{vital_counter}"
                vital_counter += 1
                row["ref"] = short_ref
                if not isinstance(val, (int, float)) or isinstance(val, bool):
                    row["value"] = display_val
                vital_signs.append(row)
                provenance_map[short_ref] = ProvenanceEntry(
                    short_ref=short_ref,
                    resource_type="Observation (Vital Signs)",
                    original_id=orig_id,
                    summary=f"{concept.get('name')} = {row.get('value')} ({date_str})",
                    raw_snippet=res,
                )
            else:
                short_ref = f"O{obs_counter}"
                obs_counter += 1
                row["ref"] = short_ref
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    row["value"] = val
                else:
                    row["value"] = display_val
                labs.append(row)
                provenance_map[short_ref] = ProvenanceEntry(
                    short_ref=short_ref,
                    resource_type="Observation (Laboratory)",
                    original_id=orig_id,
                    summary=f"{concept.get('name')}: {row.get('value')}"
                            + (f" [Flag: {flag}]" if flag else "")
                            + f" [{res.get('status') or 'final'}]",
                    raw_snippet=res,
                )
                if orig_id:
                    obs_id_to_short_ref[orig_id] = short_ref
            if vital and orig_id:
                obs_id_to_short_ref[orig_id] = row["ref"]

        elif rt == "CarePlan":
            short_ref = f"CP{cp_counter}"
            cp_counter += 1
            category_name = ""
            if res.get("category"):
                category_name = _extract_concept(res["category"][0]).get("name", "")

            period_str = ""
            if res.get("period"):
                s = _format_date_time(res["period"].get("start"), granularity)
                e = _format_date_time(res["period"].get("end"), granularity)
                if s and e:
                    period_str = f"{s} to {e}"

            activities = []
            for act in (res.get("activity") or []):
                if not isinstance(act, dict):
                    continue
                detail = act.get("detail") or {}
                detail_concept = _extract_concept(detail.get("code"))
                desc = detail.get("description")
                if detail_concept.get("name") != "Unknown" and desc:
                    activities.append(f"{detail_concept['name']}: {desc}")
                elif detail_concept.get("name") != "Unknown":
                    activities.append(detail_concept["name"])
                elif desc:
                    activities.append(desc)

            care_team = ", ".join(c.get("display") for c in (res.get("careTeam") or []) if isinstance(c, dict) and c.get("display"))
            cp_obj = {
                "ref": short_ref,
                "type": "CarePlan",
                "category": category_name or res.get("title") or "Care Plan",
                "status": res.get("status"),
                "intent": res.get("intent"),
                "period": period_str or None,
                "activities": activities or None,
                "careTeam": care_team or None,
                "title": res.get("title") or None,
            }
            care_plans.append(cp_obj)
            provenance_map[short_ref] = ProvenanceEntry(
                short_ref=short_ref,
                resource_type="CarePlan",
                original_id=orig_id,
                summary=f"{cp_obj['category']} ({cp_obj['status']}) - {len(activities)} activities",
                raw_snippet=res,
            )

        elif rt in ("MedicationRequest", "MedicationStatement"):
            short_ref = f"M{med_counter}"
            med_counter += 1
            concept = _extract_concept(res.get("medicationCodeableConcept"))
            drug = concept_all(res.get("medicationCodeableConcept"))
            if not drug or drug == "Unknown":
                drug = concept.get("name")
            if drug == "Unknown" and (res.get("medicationReference") or {}).get("display"):
                drug = res["medicationReference"]["display"]

            dosage = res.get("dosageInstruction") or []
            di = dosage[0] if dosage else {}
            if not isinstance(di, dict):
                di = {}
            sig = di.get("text")
            dose_rate = di.get("doseAndRate") or []
            dar = dose_rate[0] if dose_rate else {}
            if not isinstance(dar, dict):
                dar = {}
            extra_dose_parts = []
            for d2 in dose_rate[1:]:
                if not isinstance(d2, dict):
                    continue
                t = concept_all(d2.get("type"))
                q = d2.get("doseQuantity") or d2.get("doseRateQuantity") or {}
                amount = f"{q.get('value')} {q.get('unit') or ''}".strip() if q.get("value") is not None else ""
                joined = " ".join(x for x in (t, amount) if x)
                if joined:
                    extra_dose_parts.append(joined)
            extra_dose = "; ".join(extra_dose_parts)
            if not sig and dar:
                d = dar.get("doseQuantity") or dar.get("doseRateQuantity") or {}
                parts = [str(x) for x in (d.get("value"), d.get("unit")) if x is not None and x != ""]
                if parts:
                    sig = " ".join(parts)
                t = dar.get("rateQuantity") or {}
                if t.get("value"):
                    sig = f"{sig or ''} @ {t.get('value')} {t.get('unit') or ''}".strip()
            route = concept_all(di.get("route"))
            dose_type = concept_all(dar.get("type"))
            if route and not sig:
                sig = route
            elif sig and route and route.lower() not in sig.lower():
                sig = f"{sig}, {route}"
            if sig and dose_type:
                sig = f"{sig} [{dose_type}]"
            timing = (di.get("timing") or {}).get("repeat") or {}
            bounds_end = (timing.get("boundsPeriod") or {}).get("end")
            bounds_start = (timing.get("boundsPeriod") or {}).get("start")
            prn = concept_all(di.get("asNeededCodeableConcept"))
            instruction = _note_join(di.get("additionalInstruction"))
            prescriber = (res.get("requester") or {}).get("display") or ", ".join(
                p.get("display") for p in (res.get("performer") or []) if isinstance(p, dict) and p.get("display")
            )
            dispense = res.get("dispenseRequest") or {}
            dq = dispense.get("quantity")
            dispense_qty = None
            if dq:
                dispense_qty = f"{dq.get('value') if dq.get('value') is not None else ''} {dq.get('unit') or ''}".strip() or None

            m_obj = {
                "ref": short_ref,
                "drug": drug,
                "code": f"{concept.get('system') or 'rxnorm'}:{concept['code']}" if concept.get("code") else None,
                "sig": sig or None,
                "status": res.get("status"),
                "date": _format_date_time(res.get("authoredOn"), granularity) or None,
                "course": concept_all(res.get("courseOfTherapyType")) or None,
                "category": ", ".join(x for x in (concept_all(c) for c in (res.get("category") or [])) if x) or None,
                "prn": prn or None,
                "instruction": instruction or None,
                "startsOn": _format_date_time(bounds_start, granularity) or None,
                "endsOn": _format_date_time(bounds_end, granularity) or None,
                "doseTypes": extra_dose or None,
                "validFrom": _format_date_time((dispense.get("validityPeriod") or {}).get("start"), granularity) or None,
                "prescriber": prescriber or None,
                "reason": ", ".join(x for x in (concept_all(r) for r in (res.get("reasonCode") or [])) if x) or None,
                "note": _note_join(res.get("note")) or None,
                "dispenseQty": dispense_qty,
            }
            medications.append(m_obj)
            provenance_map[short_ref] = ProvenanceEntry(
                short_ref=short_ref,
                resource_type="MedicationRequest",
                original_id=orig_id,
                summary=f"{drug} - {sig or 'As directed'} ({res.get('status')})",
                raw_snippet=res,
            )

        elif rt == "Condition":
            short_ref = f"C{cond_counter}"
            cond_counter += 1
            concept = _extract_concept(res.get("code"))
            clinical = ((res.get("clinicalStatus") or {}).get("coding") or [{}])[0]
            c_obj = {
                "ref": short_ref,
                "condition": concept.get("name"),
                "code": f"{concept.get('system') or 'snomed'}:{concept['code']}" if concept.get("code") else None,
                "status": (clinical.get("code") if isinstance(clinical, dict) else None) or "active",
                "statusText": (res.get("clinicalStatus") or {}).get("text"),
                "verification": code_display(res.get("verificationStatus")) or None,
                "category": code_display((res.get("category") or [None])[0]) or None,
                "bodySite": ", ".join(
                    x for x in (concept_all(site) for site in (res.get("bodySite") or [])) if x
                ) or None,
                "onset": _format_date_time(res.get("onsetDateTime") or res.get("recordedDate"), granularity) or None,
                "recorded": _format_date_time(res.get("recordedDate"), granularity) or None,
                "note": ((res.get("note") or [{}])[0].get("text") or "")[:300] or None,
            }
            conditions.append(c_obj)
            provenance_map[short_ref] = ProvenanceEntry(
                short_ref=short_ref,
                resource_type="Condition",
                original_id=orig_id,
                summary=f"{concept.get('name')} [{c_obj['status']}{('/' + c_obj['verification']) if c_obj['verification'] else ''}]",
                raw_snippet=res,
            )

        elif rt == "AllergyIntolerance":
            short_ref = f"A{alg_counter}"
            alg_counter += 1
            concept = _extract_concept(res.get("code"))
            reactions = []
            for r in (res.get("reaction") or []):
                if not isinstance(r, dict):
                    continue
                ms = [
                    x for x in (concept_all(m) for m in (r.get("manifestation") or []))
                    if x and x != "Unknown"
                ]
                if ms:
                    reactions.append(" + ".join(ms))
                if r.get("severity"):
                    reactions.append(f"severity: {r['severity']}")
                if r.get("description"):
                    reactions.append(r["description"])
            clinical = ((res.get("clinicalStatus") or {}).get("coding") or [{}])[0]
            a_obj = {
                "ref": short_ref,
                "allergen": concept.get("name"),
                "criticality": res.get("criticality"),
                "status": (clinical.get("code") if isinstance(clinical, dict) else None) or "active",
                "statusText": (res.get("clinicalStatus") or {}).get("text") or None,
                "verification": code_display(res.get("verificationStatus")) or None,
                "kind": res.get("type") or None,
                "reactions": ", ".join(reactions) or None,
                "onset": _format_date_time(res.get("onsetDateTime"), granularity) or None,
                "recorded": _format_date_time(res.get("recordedDate"), granularity) or None,
                "recorder": (res.get("recorder") or {}).get("display") or None,
                "note": _note_join(res.get("note")) or None,
            }
            allergies.append(a_obj)
            provenance_map[short_ref] = ProvenanceEntry(
                short_ref=short_ref,
                resource_type="AllergyIntolerance",
                original_id=orig_id,
                summary=f"ALLERGY: {concept.get('name')} (Criticality: {res.get('criticality') or 'High'})",
                raw_snippet=res,
            )

        elif rt == "Encounter":
            short_ref = f"E{enc_counter}"
            enc_counter += 1
            loc_entry = (res.get("location") or [{}])[0] if res.get("location") else {}
            if not isinstance(loc_entry, dict):
                loc_entry = {}
            loc = loc_entry.get("location") or {}
            cls = res.get("class") or {}
            if cls.get("display") and cls.get("display") != cls.get("code"):
                cls_str = f"{cls['display']} ({cls['code']})"
            else:
                cls_str = cls.get("display") or cls.get("code")
            types = ", ".join(x for x in (code_display(t) for t in (res.get("type") or [])) if x) or None
            participants = []
            for p in (res.get("participant") or []):
                if not isinstance(p, dict):
                    continue
                type_str = "/".join(x for x in (concept_all(t) for t in (p.get("type") or [])) if x)
                who = " — ".join(x for x in (type_str, (p.get("individual") or {}).get("display")) if x)
                period = p.get("period") or {}
                since = _format_date_time(period.get("start"), granularity)
                until = _format_date_time(period.get("end"), granularity)
                if since and until:
                    span = f" ({since} → {until})"
                elif since:
                    span = f" (from {since})"
                elif until:
                    span = f" (until {until})"
                else:
                    span = ""
                if who:
                    participants.append(f"{who}{span}")
            loc_status = loc_entry.get("status")
            if loc.get("display"):
                location = f"{loc['display']} [{loc_status}]" if loc_status else loc["display"]
            else:
                location = loc_status
            e_obj = {
                "ref": short_ref,
                "status": res.get("status"),
                "class": cls_str,
                "types": types,
                "start": _format_date_time((res.get("period") or {}).get("start") or (res.get("period") or {}).get("end"), granularity) or None,
                "end": _format_date_time((res.get("period") or {}).get("end"), granularity) or None,
                "location": location,
                "provider": (res.get("serviceProvider") or {}).get("display") or None,
                "reason": "; ".join(x for x in (code_display(r) for r in (res.get("reasonCode") or [])) if x) or None,
                "discharge": code_display((res.get("hospitalization") or {}).get("dischargeDisposition")) or None,
                "participants": "; ".join(participants) or None,
            }
            e_obj["type"] = e_obj["types"]
            encounters.append(e_obj)
            provenance_map[short_ref] = ProvenanceEntry(
                short_ref=short_ref,
                resource_type="Encounter",
                original_id=orig_id,
                summary=f"{e_obj.get('type') or 'Encounter'} [{res.get('status')}] {e_obj.get('start') or ''}",
                raw_snippet=res,
            )

        else:
            reason_str = "; ".join(code_display(r) for r in (res.get("reasonCode") or []))
            activity_str = "; ".join(
                x for x in (code_display((a.get("detail") or {}).get("code")) for a in (res.get("activity") or []) if isinstance(a, dict)) if x
            )
            locs = res.get("location") or []
            brief = (
                (res.get("code") or {}).get("text")
                or ((res.get("code") or {}).get("coding") or [{}])[0].get("display")
                or human_name(res.get("name"))
                or ((res.get("description") or [{}])[0].get("text") if res.get("description") else None)
                or res.get("title")
                or reason_str
                or activity_str
                or (locs[0].get("display") if locs and isinstance(locs[0], dict) else None)
                or ""
            )
            role = (
                code_display((res.get("specialty") or [None])[0])
                or code_display((res.get("role") or [None])[0])
                or code_display((res.get("healthcareService") or [None])[0])
                or (res.get("managingOrganization") or {}).get("display")
                or (res.get("organization") or {}).get("display")
            )
            others.append({
                "ref": f"X{len(others) + 1}",
                "type": res.get("resourceType"),
                "id": orig_id,
                "name": brief or None,
                "role": role or None,
                "status": res.get("status") or ((res.get("clinicalStatus") or {}).get("coding") or [{}])[0].get("code"),
                "value": _extract_value(res).get("value") or None,
                "date": _resource_date_span(res, granularity) or None,
            })
            key = f"X{others.__len__()}"
            provenance_map[key] = ProvenanceEntry(
                short_ref=key,
                resource_type=res.get("resourceType"),
                original_id=orig_id,
                summary=f"{res.get('resourceType')}{': ' + brief if brief else ''}{f' [{role}]' if role else ''}",
                raw_snippet=res,
            )

    # Bundle had no Patient resource — reconstruct identity from subject.display
    if not patients and patient_fallback:
        patients.append({"ref": "P1", "name": patient_fallback})
        provenance_map["P1"] = ProvenanceEntry(
            short_ref="P1",
            resource_type="Patient (inferred from subject.display)",
            original_id="inferred-subject-display",
            summary=patient_fallback,
            raw_snippet={"display": patient_fallback},
        )

    # subject/patient display aliases: same person, different serialization
    if patients:
        p0 = patients[0]
        aliases = []
        for r in selected_resources:
            if not isinstance(r, dict):
                continue
            d = (r.get("subject") or {}).get("display") or (r.get("patient") or {}).get("display")
            if d and d != p0.get("name") and d not in aliases:
                aliases.append(d)
        if aliases:
            merged = list(p0.get("aka") or [])
            for a in aliases:
                if a not in merged:
                    merged.append(a)
            p0["aka"] = merged

    # Resolve hasMember / derivedFrom links -> short refs
    for row in labs + vital_signs:
        if row.get("members"):
            row["members"] = [
                obs_id_to_short_ref.get(str(m).split("/")[-1], str(m).split("/")[-1])
                for m in row["members"]
            ]
    member_of: Dict[str, str] = {}
    for r in labs + vital_signs:
        for c in r.get("members") or []:
            member_of[c] = r["ref"]

    # Transparency notices
    omitted_count = max(0, len(valid_resources) - len(selected_resources))
    omitted_notice = None
    if omitted_count > 0:
        omitted_notice = (
            f"## Omitted: {omitted_count} items due to token budget; safety resources retained "
            "(call expand(ref) for omitted items)"
            if budget_exceeded else
            f"## Omitted: {omitted_count} items not matching query/profile filter → "
            "clear query to include all, or retrievable via expand(ref)"
        )
    flagged_notice = (
        f"## FLAGGED (kept, not dropped): {len(flagged_ids)} resource(s) are entered-in-error or refuted"
        if flagged_ids else None
    )
    gap_notice = f"## DATA GAPS: {'; '.join(data_gaps)}" if data_gaps else None

    # Build target representation
    fmt = getattr(format, "value", str(format))
    compressed_output = ""

    def _j(obj: Any) -> str:
        return json.dumps(obj, indent=2, ensure_ascii=False)

    if fmt == "compact_json":
        compact_obj: Dict[str, Any] = {}
        if len(patients) == 1:
            compact_obj["patient"] = patients[0]
        elif len(patients) > 1:
            compact_obj["patients"] = patients
        if vital_signs:
            compact_obj["vitalSigns"] = vital_signs
        if labs:
            compact_obj["labs"] = labs
        if care_plans:
            compact_obj["carePlans"] = care_plans
        if allergies:
            compact_obj["allergies"] = allergies
        if conditions:
            compact_obj["conditions"] = conditions
        if medications:
            compact_obj["medications"] = medications
        if encounters:
            compact_obj["encounters"] = encounters
        if others:
            compact_obj["other"] = others
        if omitted_notice:
            compact_obj["_omitted"] = omitted_notice[3:]
        if flagged_notice:
            compact_obj["_flagged"] = f"{len(flagged_ids)} resource(s) entered-in-error or refuted (retained)"
        if gap_notice:
            compact_obj["_dataGaps"] = data_gaps
        compressed_output = _j(compact_obj)

    elif fmt == "medprompt_text":
        lines: List[str] = []
        if patients:
            p = patients[0]
            p_extra = " | ".join(x for x in [
                f"DOB: {p['dob']}" if p.get("dob") else "",
                (f"Tel: {', '.join(p['telecom'])}" if p.get("telecom") else f"Tel: {p['phone']}" if p.get("phone") else ""),
                f"Marital: {p['marital']}" if p.get("marital") else "",
                f"Addr: {' | '.join(p['address'])}" if p.get("address") else "",
                f"Lang: {', '.join(p['languages'])}" if p.get("languages") else "",
                f"Contact: {' | '.join(p['contacts'])}" if p.get("contacts") else "",
                f"GP: {p['gp']}" if p.get("gp") else "",
                f"AKA: {'; '.join(p['aka'])}" if p.get("aka") else "",
            ] if x)
            age = p.get("age") if p.get("age") is not None else "N/A"
            lines.append(
                f"PATIENT [{p['ref']}]: {p.get('name') or 'Patient'} | Age: {age} | "
                f"Sex: {p.get('gender') or 'N/A'}" + (f" | {p_extra}" if p_extra else "")
            )
        if vital_signs:
            lines.append("\n## VITAL SIGNS & SCALES:")
            for v in vital_signs:
                time_str = v.get("dateTime") or v.get("date") or ""
                lines.append(
                    f"[{v['ref']}] {v['name']}: {v.get('value')} {v.get('unit') or ''}"
                    f"{' [Ref: ' + v['range'] + ']' if v.get('range') else ''}"
                    f"{' {' + v['category'] + '}' if v.get('category') else ''}"
                    f"{' [' + v['flag'] + ']' if v.get('flag') else ''}"
                    f"{' [' + str(v['status']) + ']' if v.get('status') else ''}"
                    f" ({time_str})"
                    f"{' (issued ' + v['issued'] + ')' if v.get('issued') else ''}"
                    f"{' by ' + v['performer'] if v.get('performer') else ''}"
                    f"{' Note: ' + v['note'] if v.get('note') else ''}"
                )
        if labs:
            lines.append("\n## LABS & DIAGNOSTICS:")
            for l in labs:
                time_str = l.get("dateTime") or l.get("date") or ""
                flag_str = f" [FLAG: {l['flag']}]" if l.get("flag") else ""
                lines.append(
                    f"[{l['ref']}] {l['test']}: {l.get('value')} {l.get('unit') or ''}"
                    f"{' [Ref: ' + l['range'] + ']' if l.get('range') else ''}"
                    f"{' {' + l['category'] + '}' if l.get('category') else ''}"
                    f"{flag_str}"
                    f"{' [' + str(l['status']) + ']' if l.get('status') else ''}"
                    f" ({time_str})"
                    f"{' (issued ' + l['issued'] + ')' if l.get('issued') else ''}"
                    f"{' by ' + l['performer'] if l.get('performer') else ''}"
                    f"{' Note: ' + l['note'] if l.get('note') else ''}"
                )
        if care_plans:
            lines.append("\n## CARE PLANS & PROTOCOLS:")
            for cp in care_plans:
                title_part = f"{cp['title']} - " if cp.get("title") else ""
                lines.append(
                    f"[{cp['ref']}] Plan: {title_part}{cp['category']} [{cp.get('status')}]"
                    f"{' (' + cp['period'] + ')' if cp.get('period') else ''}"
                    f"{' Team: ' + cp['careTeam'] if cp.get('careTeam') else ''}"
                )
                for act in cp.get("activities") or []:
                    lines.append(f"  - Instruction: {act}")
        if allergies:
            lines.append("\n## ALLERGIES (Safety Set):")
            for a in allergies:
                lines.append(
                    f"[{a['ref']}] {a['allergen']}"
                    f"{' {' + a['kind'] + '}' if a.get('kind') else ''}"
                    f" [Criticality: {a.get('criticality') or 'High'}]"
                    f"{' -> ' + a['reactions'] if a.get('reactions') else ''}"
                    f"{' ' + a['statusText'] if a.get('statusText') else ''}"
                    f"{' (' + a['verification'] + ')' if a.get('verification') else ''}"
                    f"{' (Onset: ' + a['onset'] + ')' if a.get('onset') else ''}"
                    f"{' (Recorded: ' + a['recorded'] + ')' if a.get('recorded') else ''}"
                    f"{' by ' + a['recorder'] if a.get('recorder') else ''}"
                    f"{' Note: ' + a['note'] if a.get('note') else ''}"
                )
        if conditions:
            lines.append("\n## ACTIVE CONDITIONS:")
            for c in conditions:
                lines.append(
                    f"[{c['ref']}] {c['condition']} [{c['status']}"
                    f"{'/' + c['statusText'] if c.get('statusText') else ''}]"
                    f"{'/' + c['verification'] if c.get('verification') else ''}"
                    f"{' {' + c['category'] + '}' if c.get('category') else ''}"
                    f"{' (Body site: ' + c['bodySite'] + ')' if c.get('bodySite') else ''}"
                    f"{' (Onset: ' + c['onset'] + ')' if c.get('onset') else ''}"
                    f"{' (Recorded: ' + c['recorded'] + ')' if c.get('recorded') else ''}"
                    f"{' Note: ' + c['note'] if c.get('note') else ''}"
                )
        if medications:
            lines.append("\n## MEDICATIONS:")
            for m in medications:
                lines.append(
                    f"[{m['ref']}] {m['drug']} - {m.get('sig') or 'As directed'} ({m.get('status')})"
                    f"{' {' + m['category'] + '}' if m.get('category') else ''}"
                    f"{' PRN: ' + m['prn'] if m.get('prn') else ''}"
                    f"{' Instr: ' + m['instruction'] if m.get('instruction') else ''}"
                    f"{' [' + m['course'] + ']' if m.get('course') else ''}"
                    f"{' from ' + m['startsOn'] if m.get('startsOn') else ''}"
                    f"{' until ' + m['endsOn'] if m.get('endsOn') else ''}"
                    f"{' also: ' + m['doseTypes'] if m.get('doseTypes') else ''}"
                    f"{' qty ' + m['dispenseQty'] if m.get('dispenseQty') else ''}"
                    f"{' valid from ' + m['validFrom'] if m.get('validFrom') else ''}"
                    f"{' Rx: ' + m['date'] if m.get('date') else ''}"
                    f"{' by ' + m['prescriber'] if m.get('prescriber') else ''}"
                    f"{' Reason: ' + m['reason'] if m.get('reason') else ''}"
                    f"{' Note: ' + m['note'] if m.get('note') else ''}"
                )
        if encounters:
            lines.append("\n## ENCOUNTERS:")
            for e in encounters:
                lines.append(
                    f"[{e['ref']}] {e.get('type') or 'Encounter'}"
                    f"{' {' + e['class'] + '}' if e.get('class') else ''} "
                    f"{e.get('status') or ''} {e.get('start') or ''} {e.get('location') or ''}"
                    f"{' reason: ' + e['reason'] if e.get('reason') else ''}"
                    f"{' -> ' + e['discharge'] if e.get('discharge') else ''}"
                    f"{' | ' + e['participants'] if e.get('participants') else ''}"
                )
        if others:
            lines.append("\n## OTHER RESOURCES:")
            for o in others:
                val_part = f" = {o['value']}" if o.get("value") not in (None, "") else ""
                lines.append(
                    f"[{o['ref']}] {o.get('type')} {o.get('name') or o.get('id') or ''}"
                    f"{' [' + o['role'] + ']' if o.get('role') else ''} {o.get('status') or ''}{val_part}"
                    f"{' (' + o['date'] + ')' if o.get('date') else ''}"
                )
        if omitted_notice:
            lines.append(f"\n{omitted_notice}")
        if flagged_notice:
            lines.append(flagged_notice)
        if gap_notice:
            lines.append(gap_notice)
        compressed_output = "\n".join(lines).strip()

    elif fmt == "fhirbench_markdown":
        sections: List[str] = []
        child_refs = set(member_of.keys())
        if patients:
            p = patients[0]
            extra = " | ".join(x for x in [
                f"DOB: {p['dob']}" if p.get("dob") else None,
                f"Contact: {p['phone']}" if p.get("phone") else None,
                f"Marital: {p['marital']}" if p.get("marital") else None,
                f"Telecom: {', '.join(p['telecom'])}" if p.get("telecom") else None,
                f"Address: {' | '.join(p['address'])}" if p.get("address") else None,
                f"Languages: {', '.join(p['languages'])}" if p.get("languages") else None,
                f"Contacts: {' | '.join(p['contacts'])}" if p.get("contacts") else None,
                f"GP: {p['gp']}" if p.get("gp") else None,
                f"Also known as: {'; '.join(p['aka'])}" if p.get("aka") else None,
            ] if x)
            age = p.get("age") if p.get("age") is not None else "N/A"
            sections.append(
                f"### Patient Information [{p['ref']}]\n"
                f"- **Name:** {p.get('name') or 'N/A'}\n"
                f"- **Age/Gender:** {age} / {p.get('gender') or 'N/A'}"
                + (f"\n- **Details:** {extra}" if extra else "")
            )

        def _md_row(prefix: str, cells: List[str]) -> str:
            return "| " + " | ".join([prefix] + cells) + " |"

        def _issued(row: dict) -> str:
            return f" (issued {row['issued']})" if row.get("issued") else ""

        if vital_signs:
            rows = []
            for v in vital_signs:
                if v["ref"] in child_refs:
                    continue
                rows.append(
                    f"| **{v['ref']}** | {v['name']} | **{v.get('value')}{(' ' + v['unit']) if v.get('unit') else ''}** | "
                    f"{v.get('category') or '—'} | {v.get('flag') or '—'} | "
                    f"{v.get('dateTime') or v.get('date') or '—'}{_issued(v)} | "
                    f"{v.get('status') or '—'} |"
                )
                for m in v.get("members") or []:
                    child = next((x for x in vital_signs if x["ref"] == m), None) or \
                            next((x for x in labs if x["ref"] == m), None)
                    if child:
                        rows.append(
                            f"| {m} | ↳ {child['name']} | **{child.get('value')}{(' ' + child['unit']) if child.get('unit') else ''}** | "
                            f"{child.get('category') or '—'} | {child.get('flag') or '—'} | "
                            f"{child.get('dateTime') or child.get('date') or '—'}{_issued(child)} | "
                            f"{child.get('status') or '—'} |"
                        )
            sections.append(
                "### Vital Signs & Physical Measures\n"
                "| Ref | Measure | Value | Category | Flag | Date/Time | Status |\n"
                "|---|---|---|---|---|---|---|\n" + "\n".join(rows)
            )
        if labs:
            rows = []
            for l in labs:
                if l["ref"] in child_refs:
                    continue
                rows.append(
                    f"| **{l['ref']}** | {l['test']} | {l.get('category') or '—'} | "
                    f"**{l.get('value')}{(' ' + l['unit']) if l.get('unit') else ''}** | {l.get('range') or '—'} | "
                    f"{l.get('flag') or '—'} | {l.get('status') or '—'} | "
                    f"{l.get('dateTime') or l.get('date') or '—'}{_issued(l)} |"
                )
                for m in l.get("members") or []:
                    child = next((x for x in labs if x["ref"] == m), None) or \
                            next((x for x in vital_signs if x["ref"] == m), None)
                    if child:
                        rows.append(
                            f"| {m} | ↳ {child['test']} | {child.get('category') or '—'} | "
                            f"**{child.get('value')}{(' ' + child['unit']) if child.get('unit') else ''}** | "
                            f"{child.get('range') or '—'} | {child.get('flag') or '—'} | {child.get('status') or '—'} | "
                            f"{child.get('dateTime') or child.get('date') or '—'}{_issued(child)} |"
                        )
            sections.append(
                "### Laboratory Results & Observations\n"
                "| Ref | Test | Category | Result | Ref Range | Flag | Status | Date/Time |\n"
                "|---|---|---|---|---|---|---|---|\n" + "\n".join(rows)
            )
        noted_obs = [o for o in vital_signs + labs if o.get("note") or o.get("performer")]
        if noted_obs:
            sections.append(
                "### Observation Notes & Provenance\n" + "\n\n".join(
                    f"**{o['ref']} {o['test']}**"
                    f"{' — performer: ' + o['performer'] if o.get('performer') else ''}"
                    f"{'\n> ' + o['note'] if o.get('note') else ''}"
                    for o in noted_obs
                )
            )
        if care_plans:
            sections.append(
                "### Care Plans & Patient Directives\n" + "\n\n".join(
                    f"**[{cp['ref']}]{(' ' + cp['title'] + ' -') if cp.get('title') else ''} {cp['category']}** "
                    f"({cp.get('status')}, {cp.get('period') or 'active'})"
                    f"{(' — care team: ' + cp['careTeam']) if cp.get('careTeam') else ''}\n"
                    + ("\n".join(f"- {a}" for a in cp.get("activities") or []) if cp.get("activities") else "- Routine monitoring")
                    for cp in care_plans
                )
            )
        if medications:
            rows = []
            for m in medications:
                directions = " ".join(x for x in [
                    m.get("sig"),
                    f"{{{m['category']}}}" if m.get("category") else "",
                    f"PRN: {m['prn']}" if m.get("prn") else "",
                    f"Instr: {m['instruction']}" if m.get("instruction") else "",
                    f"({m['course']})" if m.get("course") else "",
                    f"from {m['startsOn']}" if m.get("startsOn") else "",
                    f"until {m['endsOn']}" if m.get("endsOn") else "",
                    f"disp: {m['dispenseQty']}" if m.get("dispenseQty") else "",
                    f"also: {m['doseTypes']}" if m.get("doseTypes") else "",
                    f"by {m['prescriber']}" if m.get("prescriber") else "",
                    f"reason: {m['reason']}" if m.get("reason") else "",
                    f"note: {m['note']}" if m.get("note") else "",
                ] if x) or "—"
                rows.append(
                    f"| **{m['ref']}** | {m['drug']} | {m.get('status') or '—'} | {m.get('date') or '—'} | {directions} |"
                )
            sections.append(
                "### Medications\n| Ref | Drug | Status | Date | Directions |\n|---|---|---|---|---|\n" + "\n".join(rows)
            )
        if allergies:
            rows = []
            for a in allergies:
                rows.append(
                    f"| **{a['ref']}** | {a['allergen']}{(' {' + a['kind'] + '}') if a.get('kind') else ''} | "
                    f"{a.get('reactions') or '—'} | {a.get('criticality') or '—'} | "
                    f"{a.get('status') or '—'}{(' (' + a['statusText'] + ')') if a.get('statusText') else ''} | "
                    f"{a.get('verification') or '—'} | {a.get('onset') or '—'} | {a.get('recorded') or '—'} | "
                    f"{a.get('recorder') or '—'} | {a.get('note') or '—'} |"
                )
            sections.append(
                "### Allergies & Intolerances\n"
                "| Ref | Allergen | Reactions | Criticality | Status | Verification | Onset | Recorded | Recorder | Note |\n"
                "|---|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows)
            )
        if conditions:
            rows = []
            for c in conditions:
                rows.append(
                    f"| **{c['ref']}** | {c['condition']} | {c['status']}"
                    f"{(' (' + c['statusText'] + ')') if c.get('statusText') else ''} | "
                    f"{c.get('verification') or '—'} | {c.get('category') or '—'} | {c.get('bodySite') or '—'} | {c.get('onset') or '—'} | {c.get('recorded') or '—'} | "
                    f"{c.get('note') or '—'} |"
                )
            sections.append(
                "### Active Conditions\n"
                "| Ref | Condition | Status | Verification | Category | Body Site | Onset | Recorded | Note |\n"
                "|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows)
            )
        if encounters:
            rows = []
            for e in encounters:
                rows.append(
                    f"| **{e['ref']}** | {e.get('type') or '—'} | {e.get('class') or '—'} | {e.get('status') or '—'} | "
                    f"{e.get('start') or '—'} | {e.get('location') or '—'} | {e.get('reason') or '—'} | "
                    f"{e.get('discharge') or '—'} | {e.get('participants') or '—'} |"
                )
            sections.append(
                "### Encounters\n"
                "| Ref | Type | Class | Status | Start | Location | Reason | Discharge | Participants |\n"
                "|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows)
            )
        if others:
            rows = []
            for o in others:
                val = "—" if o.get("value") in (None, "") else o["value"]
                rows.append(
                    f"| **{o['ref']}** | {o.get('type')} | {o.get('name') or o.get('id') or '—'} | "
                    f"{o.get('role') or '—'} | {o.get('status') or '—'} | {val} | {o.get('date') or '—'} |"
                )
            sections.append(
                "### Other Resources\n"
                "| Ref | Resource | Name | Role | Status | Value | Date |\n"
                "|---|---|---|---|---|---|---|\n" + "\n".join(rows)
            )
        if omitted_notice:
            sections.append(omitted_notice)
        if flagged_notice:
            sections.append(flagged_notice)
        if gap_notice:
            sections.append(gap_notice)
        compressed_output = "\n\n".join(sections).strip()

    elif fmt == "cds_hooks_prefetch":
        payload: Dict[str, Any] = {
            "hook": "medication-prescribe" if profile == "medication_prescribe" else "patient-view",
            "hookInstance": f"cds-eval-{int(time.time() * 1000):x}",
            "context": {
                "patientId": (patients[0].get("id") if patients else None) or "P001",
                "userId": "Practitioner/attending-01",
            },
            "prefetch": {
                "patient": patients[0] if patients else None,
                "vitalSigns": vital_signs,
                "recentLabs": labs,
                "carePlans": care_plans,
                "activeConditions": conditions,
                "currentMedications": medications,
                "allergies": allergies,
                "encounters": encounters,
                "other": others,
            },
            "_provenanceRefs": len(provenance_map),
        }
        if data_gaps:
            payload["_dataGaps"] = data_gaps
        if flagged_ids:
            payload["_flagged"] = len(flagged_ids)
        compressed_output = _j(payload)
    else:
        compressed_output = _j({"patient": patients[0]} if patients else {})

    return FoldResult(output=compressed_output, provenance_map=provenance_map, budget_exceeded=budget_exceeded)


_fold_options_proxy = type("_Proxy", (), {"only_abnormal_labs": False})()


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
