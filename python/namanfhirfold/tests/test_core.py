"""Tests for the namanfhirfold Python package."""

import json

import pytest

from namanfhirfold import (
    CdsProfile,
    CompressionFormat,
    FoldOptions,
    FoldResult,
    Granularity,
    expand,
    expand_from_map,
    fold,
    fold_with_provenance,
)
from namanfhirfold.core import is_vital_sign


def patient_bundle():
    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {
                "resource": {
                    "resourceType": "Patient",
                    "id": "pat-1",
                    "gender": "female",
                    "birthDate": "1980-04-12",
                    "name": [{"family": "Doe", "given": ["Jane"]}],
                }
            },
            {
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs-bp",
                    "status": "final",
                    "category": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                    "code": "vital-signs",
                                    "display": "Vital Signs",
                                }
                            ]
                        }
                    ],
                    "code": {
                        "coding": [
                            {"system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel"},
                        ],
                        "text": "Blood pressure",
                    },
                    "effectiveDateTime": "2026-01-15T09:30:00+05:30",
                    "valueQuantity": {
                        "value": 128,
                        "unit": "mmHg",
                        "system": "http://unitsofmeasure.org",
                        "code": "mm[Hg]",
                    },
                }
            },
            {
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs-gluc",
                    "status": "final",
                    "category": [{"coding": [{"code": "laboratory", "display": "Laboratory"}]}],
                    "code": {
                        "coding": [{"system": "http://loinc.org", "code": "2345-7", "display": "Glucose"}],
                        "text": "Glucose",
                    },
                    "effectiveDateTime": "2026-01-15T09:35:00+05:30",
                    "valueQuantity": {
                        "value": 92,
                        "unit": "mg/dL",
                        "system": "http://unitsofmeasure.org",
                        "code": "mg/dL",
                    },
                }
            },
            {
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": "med-1",
                    "status": "active",
                    "intent": "order",
                    "medicationCodeableConcept": {"text": "Lisinopril 10mg"},
                    "subject": {"reference": "Patient/pat-1"},
                    "authoredOn": "2026-01-10",
                }
            },
        ],
    }


# --- fold -----------------------------------------------------------------


def test_fold_returns_nonempty_string():
    out = fold(patient_bundle())
    assert isinstance(out, str)
    assert out.strip()
    assert len(out) < len(json.dumps(patient_bundle()))


def test_fold_accepts_json_string_input():
    as_str = json.dumps(patient_bundle())
    assert fold(as_str) == fold(patient_bundle())


def test_fold_output_is_json_for_compact_json():
    out = fold(patient_bundle(), format="compact_json")
    parsed = json.loads(out)
    assert parsed["patient"]["ref"] == "P1"


def test_all_python_formats_produce_output():
    for fmt in ("compact_json", "medprompt_text", "markdown"):
        out = fold(patient_bundle(), format=fmt)
        assert isinstance(out, str) and out.strip(), fmt


def test_format_enum_matches_string_form():
    assert fold(patient_bundle(), format=CompressionFormat.MARKDOWN) == fold(
        patient_bundle(), format="markdown"
    )


def test_default_profile_and_granularity_are_valid():
    assert CdsProfile.FREE_QUERY.value == "free_query"
    assert Granularity.EXACT_TIMESTAMP.value == "exact_timestamp"
    assert Granularity.DATE_ONLY.value == "date_only"


# --- provenance -----------------------------------------------------------


def test_fold_with_provenance_returns_fold_result():
    result = fold_with_provenance(patient_bundle())
    assert isinstance(result, FoldResult)
    assert result.output == fold(patient_bundle())


def test_provenance_map_holds_short_refs():
    result = fold_with_provenance(patient_bundle())
    assert set(result.provenance_map) == {"P1", "V1", "O1", "M1"}


def test_short_refs_property_matches_map_keys():
    result = fold_with_provenance(patient_bundle())
    assert result.short_refs == list(result.provenance_map.keys())


def test_provenance_entry_fields_populated():
    entry = fold_with_provenance(patient_bundle()).provenance_map["P1"]
    assert entry.short_ref == "P1"
    assert entry.resource_type == "Patient"
    assert entry.original_id == "pat-1"
    assert entry.raw_snippet["resourceType"] == "Patient"


def test_vitals_bucketed_separately_from_labs():
    result = fold_with_provenance(patient_bundle())
    assert "V1" in result.provenance_map
    assert "vital_signs" in result.output
    refs = [e.short_ref for e in result.provenance_map.values()]
    assert refs.count("V1") == 1


# --- expand ---------------------------------------------------------------


def test_expand_restores_original_patient():
    result = fold_with_provenance(patient_bundle())
    restored = result.expand("P1")
    assert restored == patient_bundle()["entry"][0]["resource"]


def test_expand_preserves_resource_type_and_id():
    result = fold_with_provenance(patient_bundle())
    for ref in result.short_refs:
        restored = result.expand(ref)
        assert restored is not None, ref
        assert restored["resourceType"] in {"Patient", "Observation", "MedicationRequest"}
        assert "id" in restored


def test_expand_all_short_refs_roundtrip():
    bundle = patient_bundle()
    originals = {r["resource"]["id"]: r["resource"] for r in bundle["entry"]}
    result = fold_with_provenance(bundle)
    for ref in result.short_refs:
        restored = result.expand(ref)
        assert restored["id"] in originals
        assert restored == originals[restored["id"]]


def test_expand_unknown_ref_returns_none():
    result = fold_with_provenance(patient_bundle())
    assert result.expand("ZZ9") is None
    assert expand_from_map(result.provenance_map, "ZZ9") is None


def test_expand_from_map_standalone():
    result = fold_with_provenance(patient_bundle())
    assert expand_from_map(result.provenance_map, "P1") == result.expand("P1")


def test_expand_convenience_recomputes():
    restored = expand(patient_bundle(), "P1")
    assert restored is not None
    assert restored["id"] == "pat-1"


def test_expand_does_not_mutate_provenance():
    result = fold_with_provenance(patient_bundle())
    before = json.dumps(result.provenance_map["P1"].raw_snippet, sort_keys=True)
    restored = result.expand("P1")
    restored["id"] = "tampered"
    after = json.dumps(result.provenance_map["P1"].raw_snippet, sort_keys=True)
    assert before == after


# --- is_vital_sign --------------------------------------------------------


def test_vital_by_category_coding():
    obs = patient_bundle()["entry"][1]["resource"]
    assert is_vital_sign(obs) is True


def test_lab_observation_is_not_vital():
    obs = patient_bundle()["entry"][2]["resource"]
    assert is_vital_sign(obs) is False


def test_vital_by_loinc_code():
    obs = {
        "resourceType": "Observation",
        "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}]},
    }
    assert is_vital_sign(obs) is True


def test_vital_by_display_name_hint():
    obs = {"resourceType": "Observation", "code": {"text": "Body temperature"}}
    assert is_vital_sign(obs) is True


def test_non_observation_is_not_vital():
    assert is_vital_sign({"resourceType": "Patient"}) is False
    assert is_vital_sign({}) is False


# --- compression ----------------------------------------------------------


def test_compression_actually_reduces_tokens():
    bundle = patient_bundle()
    raw_len = len(json.dumps(bundle))
    out_len = len(fold(bundle))
    assert out_len < raw_len


def test_patient_identity_survives_compression():
    out = json.loads(fold(patient_bundle()))
    assert out["patient"]["id"] == "pat-1"
    assert out["patient"]["gender"] == "female"
    assert out["patient"]["birthDate"] == "1980-04-12"


def test_medication_survives_compression():
    out = json.loads(fold(patient_bundle()))
    assert "Lisinopril 10mg" in out["medications"][0]["drug"]


@pytest.mark.parametrize("profile", [p.value for p in CdsProfile])
def test_every_profile_produces_output(profile):
    assert fold(patient_bundle(), profile=profile).strip()


@pytest.mark.parametrize("granularity", [g.value for g in Granularity])
def test_every_granularity_produces_output(granularity):
    assert fold(patient_bundle(), granularity=granularity).strip()


def test_date_only_granularity_strips_time():
    out = fold(patient_bundle(), granularity="date_only")
    assert "09:30:00" not in out


def test_exact_timestamp_preserves_time():
    out = fold(patient_bundle(), granularity="exact_timestamp")
    assert "09:30:00" in out


def test_malformed_json_returns_error_output():
    out = fold("{not valid json")
    assert out.startswith("Error parsing FHIR JSON")


# --- enum handling --------------------------------------------------------


def test_format_enum_not_stringified():
    """Regression: str(CompressionFormat.MARKDOWN) is 'CompressionFormat.MARKDOWN',
    which silently fell through to the default JSON format."""
    enum_out = fold(patient_bundle(), format=CompressionFormat.MARKDOWN)
    str_out = fold(patient_bundle(), format="markdown")
    assert enum_out == str_out
    assert enum_out.startswith("# FHIR Compact Context")


def test_format_enum_medprompt():
    assert fold(patient_bundle(), format=CompressionFormat.MEDPROMPT_TEXT).startswith(
        "PATIENT: P1"
    )


def test_granularity_enum_strips_time():
    out = fold(patient_bundle(), granularity=Granularity.DATE_ONLY)
    assert "09:30:00" not in out
    out = fold(patient_bundle(), granularity=Granularity.EXACT_TIMESTAMP)
    assert "09:30:00" in out


def test_fold_options_normalizes_enums():
    opts = FoldOptions(
        format=CompressionFormat.MARKDOWN,
        profile=CdsProfile.VITALS_MONITOR,
        granularity=Granularity.DATE_ONLY,
    )
    assert opts.format == "markdown"
    assert opts.profile == "vitals_monitor"
    assert opts.granularity == "date_only"


def test_fold_options_defaults():
    opts = FoldOptions()
    assert opts.format == "compact_json"
    assert opts.profile == "free_query"
    assert opts.granularity == "exact_timestamp"
    assert opts.token_budget is None
