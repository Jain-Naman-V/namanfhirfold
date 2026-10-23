"""Test suite verifying broad query handling and safety set guarantees in query_filter."""

import json
from namanfhirfold import fold_with_provenance


def sample_comprehensive_bundle():
    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {
                "resource": {
                    "resourceType": "Patient",
                    "id": "pat-100",
                    "name": [{"family": "Lopez", "given": ["Camila"]}],
                    "gender": "female",
                    "birthDate": "1980-03-24",
                }
            },
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": "cnd-1",
                    "code": {"text": "Moderate Persistent Asthma"},
                    "clinicalStatus": {"coding": [{"code": "active"}]},
                }
            },
            {
                "resource": {
                    "resourceType": "Condition",
                    "id": "cnd-2",
                    "code": {"text": "Atopic Dermatitis"},
                    "clinicalStatus": {"coding": [{"code": "active"}]},
                }
            },
            {
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": "med-1",
                    "medicationCodeableConcept": {"text": "Albuterol Sulfate Inhaler"},
                    "status": "active",
                }
            },
            {
                "resource": {
                    "resourceType": "AllergyIntolerance",
                    "id": "alg-1",
                    "code": {"text": "Sulfamethoxazole (Sulfa)"},
                    "clinicalStatus": {"coding": [{"code": "active"}]},
                }
            },
            {
                "resource": {
                    "resourceType": "Encounter",
                    "id": "enc-1",
                    "type": [{"text": "Pulmonology Consult"}],
                    "status": "finished",
                }
            },
            {
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs-pefr",
                    "code": {"coding": [{"code": "33452-4"}], "text": "Peak Expiratory Flow Rate"},
                    "valueQuantity": {"value": 380, "unit": "L/min"},
                    "status": "final",
                }
            },
            {
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs-spo2",
                    "code": {"coding": [{"code": "2708-6"}], "text": "Oxygen Saturation"},
                    "valueQuantity": {"value": 98, "unit": "%"},
                    "status": "final",
                }
            },
            {
                "resource": {
                    "resourceType": "Observation",
                    "id": "obs-bp",
                    "code": {"coding": [{"code": "85354-9"}], "text": "Blood Pressure"},
                    "component": [
                        {"code": {"coding": [{"code": "8480-6"}]}, "valueQuantity": {"value": 118, "unit": "mmHg"}},
                        {"code": {"coding": [{"code": "8462-4"}]}, "valueQuantity": {"value": 74, "unit": "mmHg"}},
                    ],
                    "status": "final",
                }
            },
        ],
    }


def test_broad_query_with_lab_keyword_preserves_entire_chart():
    bundle = sample_comprehensive_bundle()
    query = "Please see the patient and give me insights about it from its lab and all info and summary"
    res = fold_with_provenance(bundle, format="compact_json", query_filter=query)
    data = json.loads(res.output)

    assert "patient" in data, "Patient demographics must be preserved"
    assert "conditions" in data and len(data["conditions"]) == 2, "Conditions must be preserved"
    assert "medications" in data and len(data["medications"]) == 1, "Medications must be preserved"
    assert "allergies" in data and len(data["allergies"]) == 1, "Allergies must be preserved"
    assert "encounters" in data and len(data["encounters"]) == 1, "Encounters must be preserved"
    assert "labs" in data and len(data["labs"]) == 2, "Labs must be preserved"
    assert "vitalSigns" in data and len(data["vitalSigns"]) == 1, "Vitals must be preserved"
    assert "_omitted" not in data, "No items should be marked omitted"


def test_focused_query_preserves_safety_set():
    bundle = sample_comprehensive_bundle()
    query = "What are the lab results?"
    res = fold_with_provenance(bundle, format="compact_json", query_filter=query, safety_set_guaranteed=True)
    data = json.loads(res.output)

    # Labs must be present
    assert "labs" in data and len(data["labs"]) == 2
    # Safety set items (Patient, Allergies, active Meds) must be retained even under focused lab query
    assert "patient" in data, "Patient must be preserved for safety"
    assert "allergies" in data, "Allergies must be preserved for safety"
    assert "medications" in data, "Active medications must be preserved for safety"
