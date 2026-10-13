"""
Self-check for the FHIR fold engine. Run: python3 -m tests.test_selfcheck
or: python3 tests/test_selfcheck.py
Fails (non-zero exit) if a clinical value is dropped, a cell renders blank,
a member group is unresolved, or a normal result is fabricated as abnormal.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from namanfhirfold.core import fold, fold_with_provenance, CompressionFormat

FMTS = [
    "fhirbench_markdown",
    "compact_json",
    "medprompt_text",
    "cds_hooks_prefetch",
]
GRAN = "exact_timestamp"


def out(b, f: str) -> str:
    return fold(b, format=f, granularity=GRAN, token_budget=0)


def every_fmt(b, needle: str):
    for f in FMTS:
        s = out(b, f)
        assert needle in s, f'missing "{needle}" in {f}: {s[:200]}'


def blank_rows(s: str) -> int:
    return len(
        [l for l in s.split("\n") if l.startswith("|") and re.search(r"\|\s*\*\*\s*\*\*\s*\|", l)]
    )


def bundle(resources):
    return {"resourceType": "Bundle", "type": "collection", "entry": [{"resource": r} for r in resources]}


# 1. every value[x] variant renders
def test_value_variants():
    def mk(v):
        base = {
            "resourceType": "Observation",
            "id": "o1",
            "status": "final",
            "code": {"coding": [{"code": "1234-5", "display": "Test analyte"}]},
            "effectiveDateTime": "2026-01-02T03:04:05Z",
        }
        base.update(v)
        return base

    every_fmt(bundle([mk({"valueString": "strung"})]), "strung")
    every_fmt(bundle([mk({"valueQuantity": {"value": 42, "unit": "mg"}})]), "42")
    every_fmt(bundle([mk({"valueBoolean": True})]), "Yes")
    every_fmt(bundle([mk({"valueInteger": 7})]), "7")
    every_fmt(
        bundle([mk({"valueRange": {"low": {"value": 1, "unit": "x"}, "high": {"value": 9, "unit": "x"}}})]),
        "9",
    )
    every_fmt(bundle([mk({"valueRatio": {"numerator": {"value": 3}, "denominator": {"value": 4}}})]), "3")
    every_fmt(bundle([mk({"valueTime": "10:11:12"})]), "10:11:12")
    every_fmt(bundle([mk({"valueDateTime": "2026-03-04"})]), "2026-03-04")
    every_fmt(
        bundle([mk({"valueCodeableConcept": {"coding": [{"display": "One"}, {"display": "Two"}]}})]),
        "One",
    )


# 2. no fabricated "Normal": unflagged obs must not gain an interpretation
def test_no_fabricated_normal():
    o = {
        "resourceType": "Observation",
        "id": "o2",
        "status": "final",
        "code": {"coding": [{"code": "x", "display": "Plain"}]},
        "valueQuantity": {"value": 1, "unit": "u"},
        "effectiveDateTime": "2026-01-01",
    }
    for f in FMTS:
        s = out(bundle([o]), f)
        assert not re.search(r"\bNormal\b", s), f"fabricated Normal in {f}"


# 3. hasMember grouping resolves to short refs, no blank cells
def test_has_member_grouping():
    parent = {
        "resourceType": "Observation",
        "id": "bp",
        "status": "final",
        "code": {"coding": [{"code": "85354-9", "display": "Blood pressure panel"}]},
        "hasMember": [{"reference": "Observation/sys"}, {"reference": "Observation/dia"}],
        "effectiveDateTime": "2026-01-01T00:00:00Z",
    }
    sys_o = {
        "resourceType": "Observation",
        "id": "sys",
        "status": "final",
        "code": {"coding": [{"code": "8480-6", "display": "Systolic"}]},
        "valueQuantity": {"value": 148, "unit": "mmHg"},
        "effectiveDateTime": "2026-01-01T00:00:00Z",
    }
    dia = {
        "resourceType": "Observation",
        "id": "dia",
        "status": "final",
        "code": {"coding": [{"code": "8462-4", "display": "Diastolic"}]},
        "valueQuantity": {"value": 92, "unit": "mmHg"},
        "effectiveDateTime": "2026-01-01T00:00:00Z",
    }
    md = out(bundle([parent, sys_o, dia]), "fhirbench_markdown")
    every_fmt(bundle([parent, sys_o, dia]), "148")
    every_fmt(bundle([parent, sys_o, dia]), "92")
    assert blank_rows(md) == 0, "blank markdown cell in member group"


# 4. refuted / verification-status conditions are retained, never dropped
def test_refuted_retained():
    cond = {
        "resourceType": "Condition",
        "id": "c1",
        "clinicalStatus": {"coding": [{"code": "active"}]},
        "verificationStatus": {"coding": [{"code": "refuted"}], "display": "Refuted"},
        "code": {"coding": [{"code": "123", "display": "Refuted diagnosis"}]},
        "subject": {"reference": "Patient/p1"},
    }
    every_fmt(bundle([cond]), "Refuted diagnosis")


# 5. grouped / multi-bundle exports (ecw-style nesting) compress without loss
def test_grouped_export():
    patient = {
        "resourceType": "Patient",
        "id": "p1",
        "name": [{"text": "Doe, Jane", "given": ["Jane"], "family": "Doe"}],
        "gender": "female",
        "birthDate": "1980-05-06",
    }
    grouped = {
        "Patients": [patient],
        "Conditions": [
            {
                "resourceType": "Bundle",
                "entry": [
                    {
                        "resource": {
                            "resourceType": "Condition",
                            "id": "c2",
                            "code": {"coding": [{"code": "9", "display": "Grouped finding"}]},
                            "subject": {"reference": "Patient/p1"},
                        }
                    }
                ],
            }
        ],
    }
    every_fmt(grouped, "Doe, Jane")
    every_fmt(grouped, "Grouped finding")


def test_clinical_field_retention():
    bundle_data = bundle([
        {
            "resourceType": "Condition",
            "id": "condition-body-site",
            "code": {"text": "Allergic asthma"},
            "bodySite": [{
                "text": "Unilateral left",
                "coding": [{"system": "http://snomed.info/sct", "code": "419161000", "display": "Unilateral left"}],
            }],
            "recordedDate": "2025-12-14T15:17:34-05:00",
        },
        {
            "resourceType": "Procedure",
            "id": "procedure-performed-period",
            "code": {"text": "Follow-up procedure"},
            "performedPeriod": {
                "start": "2026-04-14T14:07:53-04:00",
                "end": "2026-04-14T14:25:29-04:00",
            },
        },
    ])
    for f in FMTS:
        result = out(bundle_data, f)
        assert "Unilateral left" in result, f"bodySite missing in {f}"
        assert "2026-04-14T14:07:53-04:00" in result, f"performed start missing in {f}"
        assert "2026-04-14T14:25:29-04:00" in result, f"performed end missing in {f}"


def test_age_is_birthday_aware():
    from datetime import date, timedelta
    today = date.today()
    current_year = today.year
    tomorrow = today + timedelta(days=1)
    yesterday = today - timedelta(days=1)
    before_birthday = f"{current_year - 26:04d}-{tomorrow.month:02d}-{tomorrow.day:02d}"
    after_birthday = f"{current_year - 26:04d}-{yesterday.month:02d}-{yesterday.day:02d}"
    before = out(bundle([{"resourceType": "Patient", "id": "p-age", "birthDate": before_birthday}]), "compact_json")
    after = out(bundle([{"resourceType": "Patient", "id": "p-age", "birthDate": after_birthday}]), "compact_json")
    assert '"age": 25' in before
    assert '"age": 26' in after


# ---------------------------------------------------------------------------
# Substring audit (port of /tmp/verify.ts): presets + EHR files
# ---------------------------------------------------------------------------

CLINICAL_KEYS = {
    "display", "text", "value", "unit", "code", "status", "category", "reaction",
    "criticality", "onsetDateTime", "effectiveDateTime", "issued", "authoredOn",
    "recordedDate", "abatementDateTime", "start", "end", "dob", "birthDate", "gender",
    "quantity", "low", "high", "note", "period", "type", "class", "location", "name",
    "dosage", "route", "doseAndRate", "period.start", "period.end", "occurrenceDateTime",
    "instruction", "insurance", "reasonCode", "allergyCode", "substance", "manufacturer",
    "dose", "frequency", "asNeeded", "strength", "amount", "numerator", "denominator",
}
SKIP = {
    "id", "resourceType", "meta", "reference", "identifier", "system", "extension", "div",
    "link", "url", "fullUrl", "search", "relation", "profile", "source", "target",
    "instantiatesCanonical", "instantiatesUri", "partOf", "basedOn", "context",
    "request", "response", "expression", "language", "implicitRules", "modifierExtension",
}
REFTYPES = {
    "Practitioner", "Location", "Organization", "Patient", "PractitionerRole",
    "RelatedPerson", "Device", "Group", "Medication", "AllergyIntolerance",
    "Encounter", "Condition", "Observation",
}


def is_noise(s):
    return bool(re.match(r"^(urn:|https?://|oid:|\d+(\.\d+){3,})", s))


def collect(node, out_list):
    if node is None:
        return
    if isinstance(node, list):
        for r in node:
            collect(r, out_list)
        return
    if isinstance(node, dict):
        for k, v in node.items():
            if k in SKIP:
                continue
            if k == "type" and isinstance(v, str) and v in REFTYPES:
                continue
            if k == "coding":
                collect(v, out_list)
                continue
            if k in ("code", "system", "div"):
                continue
            if k == "status" and v == "generated":
                continue
            if isinstance(v, (dict, list)):
                collect(v, out_list)
            elif isinstance(v, str) and k in CLINICAL_KEYS and 1 < len(v) < 150 and not is_noise(v):
                out_list.append(v)
            elif isinstance(v, (int, float)) and not isinstance(v, bool) and k in CLINICAL_KEYS:
                out_list.append(str(v))
            elif isinstance(v, bool) and k in CLINICAL_KEYS:
                out_list.append("Yes" if v else "No")


def clinical_strings(inp):
    out_l = []
    resources = []

    def harvest(n):
        if n is None:
            return
        if isinstance(n, list):
            for x in n:
                harvest(x)
            return
        if not isinstance(n, dict):
            return
        if "resourceType" in n and n["resourceType"] != "Bundle":
            resources.append(n)
            return
        for v in n.values():
            harvest(v)

    harvest(inp)
    for res in resources:
        if res["resourceType"] in ("Bundle", "OperationOutcome", "ImplementationGuide", "CapabilityStatement"):
            continue
        if res["resourceType"] == "Patient":
            for nm in res.get("name") or []:
                if nm.get("text"):
                    out_l.append(nm["text"])
                for g in nm.get("given") or []:
                    out_l.append(g)
                if nm.get("family"):
                    out_l.append(nm["family"])
            if res.get("birthDate"):
                out_l.append(res["birthDate"])
            if res.get("gender"):
                out_l.append(res["gender"])
            continue
        collect(res, out_l)
    return list(dict.fromkeys(out_l))


def norm(x):
    s = re.sub(r"\s+", " ", str(x))
    s = re.sub(r"\s*/\s*", " ", s)
    return s.lower()


def lost_values(out_s, values):
    out_low = norm(out_s)
    result = []
    for v in values:
        if not v:
            continue
        nv = norm(v)
        if nv in out_low:
            continue
        jv = norm(json.dumps(v))[1:-1]
        if jv in out_low:
            continue
        result.append(v)
    return result


def audit(label, inp):
    uniq = clinical_strings(inp)
    bad_found = []
    for f in FMTS:
        s = fold(inp, format=f, granularity=GRAN, token_budget=0)
        lost = lost_values(s, uniq)
        blanks = blank_rows(s)
        if lost or blanks:
            bad_found.append((f, lost, blanks))
    return bad_found


def test_audit_presets_and_ehr():
    here = os.path.dirname(__file__)
    presets_path = os.path.join(here, "fixtures", "presets.json")
    bad_total = 0

    with open(presets_path) as f:
        presets = json.load(f)
    print("--- presets ---")
    for name, preset in presets.items():
        fails = audit(name, preset)
        for f, lost, blanks in fails:
            bad_total += 1
            print(f"  FAIL {name} {f}: lost={len(lost)} blankRows={blanks}")
            print(f"     e.g. {[v[:60] for v in lost[:10]]}")

    ehr_dir = os.environ.get("NAMANFHIRFOLD_EHR_AUDIT_DIR")
    if ehr_dir and os.path.isdir(ehr_dir):
        print("--- EHR files ---")
        for fn in sorted(os.listdir(ehr_dir)):
            if not fn.startswith("patient_all_data_") or not fn.endswith(".json"):
                continue
            with open(os.path.join(ehr_dir, fn)) as f:
                data = json.load(f)
            label = fn.replace("patient_all_data_", "").replace(".json", "")
            fails = audit(label, data)
            for f, lost, blanks in fails:
                bad_total += 1
                print(f"  FAIL {label} {f}: lost={len(lost)} blankRows={blanks}")
                print(f"     e.g. {[v[:60] for v in lost[:10]]}")

    assert bad_total == 0, f"{bad_total} audit failures"


if __name__ == "__main__":
    test_value_variants()
    test_no_fabricated_normal()
    test_has_member_grouping()
    test_refuted_retained()
    test_grouped_export()
    test_clinical_field_retention()
    test_age_is_birthday_aware()
    test_audit_presets_and_ehr()
    print("fhirFold.test_selfcheck: all assertions passed")
