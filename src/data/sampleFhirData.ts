/**
 * Realistic FHIR R4 Test Payloads
 * Includes user's exact Hemoglobin example, Minor Surgery CarePlan with clinical activities, 20-Lab Panel, and Full Inpatient CDS Bundle.
 */

// Post-Operative CarePlan with Clinical Instructions (User's Exact Example)
export const SAMPLE_CAREPLAN_SURGERY = {
  resourceType: "CarePlan",
  id: "cp-minor-surgery-001",
  meta: {
    profile: ["http://hl7.org/fhir/StructureDefinition/CarePlan"],
    versionId: "2",
    lastUpdated: "2023-02-13T14:22:18Z"
  },
  text: {
    status: "generated",
    div: "<div xmlns=\"http://www.w3.org/1999/xhtml\">Post-operative care management plan following minor surgical procedure.</div>"
  },
  status: "completed",
  intent: "order",
  category: [
    {
      coding: [
        {
          system: "http://snomed.info/sct",
          code: "385805005",
          display: "Minor surgery care management"
        }
      ],
      text: "Minor surgery care management"
    }
  ],
  title: "Minor Surgery Recovery Plan",
  description: "Post-procedural recovery and physical restriction protocol",
  subject: {
    reference: "Patient/P001",
    display: "Rajesh Kumar Sharma"
  },
  encounter: {
    reference: "Encounter/enc-surg-001"
  },
  period: {
    start: "2023-02-13",
    end: "2023-03-02"
  },
  careTeam: [
    {
      reference: "Practitioner/surg-dr-01",
      display: "Dr. Ananya Roy, MD"
    }
  ],
  activity: [
    {
      detail: {
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "281036007",
              display: "Recommendation to rest"
            }
          ],
          text: "Recommendation to rest"
        },
        status: "completed",
        description: "Mandatory rest for 72 hours; avoid heavy lifting or strenuous activity."
      }
    },
    {
      detail: {
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "416471007",
              display: "Recommendation to limit sexual activity"
            }
          ],
          text: "Recommendation to limit sexual activity"
        },
        status: "completed",
        description: "Abstain from sexual intercourse for 2 weeks post-procedure to facilitate wound healing."
      }
    }
  ]
};

export const SAMPLE_HEMOGLOBIN = {
  resourceType: "Observation",
  id: "obs-hb-001",
  meta: {
    profile: [
      "http://hl7.org/fhir/StructureDefinition/Observation"
    ]
  },
  status: "final",
  category: [
    {
      coding: [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "laboratory",
          "display": "Laboratory"
        }
      ]
    }
  ],
  code: {
    coding: [
      {
        system: "http://loinc.org",
        code: "718-7",
        display: "Hemoglobin [Mass/volume] in Blood"
      }
    ],
    text: "Hemoglobin"
  },
  subject: {
    reference: "Patient/P001"
  },
  effectiveDateTime: "2026-10-08T10:30:00+05:30",
  issued: "2026-10-08T10:35:00+05:30",
  valueQuantity: {
    value: 13.5,
    unit: "g/dL",
    system: "http://unitsofmeasure.org",
    code: "g/dL"
  },
  referenceRange: [
    {
      low: {
        value: 13.0,
        unit: "g/dL"
      },
      high: {
        value: 17.0,
        unit: "g/dL"
      }
    }
  ]
};

// 20 Lab Tests (Complete Blood Count + Comprehensive Metabolic Panel)
export const SAMPLE_20_LAB_PANEL = {
  resourceType: "Bundle",
  id: "bundle-labs-20",
  type: "collection",
  entry: [
    {
      fullUrl: "urn:uuid:obs-1",
      resource: {
        resourceType: "Observation",
        id: "obs-1",
        meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Observation"] },
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
        code: { coding: [{ system: "http://loinc.org", code: "718-7", display: "Hemoglobin" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 13.5, unit: "g/dL", system: "http://unitsofmeasure.org", code: "g/dL" },
        referenceRange: [{ low: { value: 13.0, unit: "g/dL" }, high: { value: 17.0, unit: "g/dL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-2",
      resource: {
        resourceType: "Observation",
        id: "obs-2",
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
        code: { coding: [{ system: "http://loinc.org", code: "6690-2", display: "WBC Count" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 7.2, unit: "K/uL", system: "http://unitsofmeasure.org", code: "10*3/uL" },
        referenceRange: [{ low: { value: 4.5, unit: "K/uL" }, high: { value: 11.0, unit: "K/uL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-3",
      resource: {
        resourceType: "Observation",
        id: "obs-3",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "777-3", display: "Platelets" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 250, unit: "K/uL", system: "http://unitsofmeasure.org", code: "10*3/uL" },
        referenceRange: [{ low: { value: 150, unit: "K/uL" }, high: { value: 450, unit: "K/uL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-4",
      resource: {
        resourceType: "Observation",
        id: "obs-4",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "789-8", display: "RBC Count" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 4.8, unit: "M/uL", system: "http://unitsofmeasure.org", code: "10*6/uL" },
        referenceRange: [{ low: { value: 4.3, unit: "M/uL" }, high: { value: 5.9, unit: "M/uL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-5",
      resource: {
        resourceType: "Observation",
        id: "obs-5",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "4544-3", display: "Hematocrit" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 42.0, unit: "%", system: "http://unitsofmeasure.org", code: "%" },
        referenceRange: [{ low: { value: 39.0, unit: "%" }, high: { value: 49.0, unit: "%" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-6",
      resource: {
        resourceType: "Observation",
        id: "obs-6",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "2345-7", display: "Glucose Fasting" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 142, unit: "mg/dL", system: "http://unitsofmeasure.org", code: "mg/dL" },
        referenceRange: [{ low: { value: 70, unit: "mg/dL" }, high: { value: 99, unit: "mg/dL" } }],
        interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "H", display: "High" }] }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-7",
      resource: {
        resourceType: "Observation",
        id: "obs-7",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "2160-0", display: "Creatinine" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 1.4, unit: "mg/dL", system: "http://unitsofmeasure.org", code: "mg/dL" },
        referenceRange: [{ low: { value: 0.6, unit: "mg/dL" }, high: { value: 1.2, unit: "mg/dL" } }],
        interpretation: [{ coding: [{ code: "H", display: "High" }] }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-8",
      resource: {
        resourceType: "Observation",
        id: "obs-8",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "2951-2", display: "Sodium" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 139, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        referenceRange: [{ low: { value: 135, unit: "mmol/L" }, high: { value: 145, unit: "mmol/L" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-9",
      resource: {
        resourceType: "Observation",
        id: "obs-9",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "2823-3", display: "Potassium" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 4.3, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        referenceRange: [{ low: { value: 3.5, unit: "mmol/L" }, high: { value: 5.1, unit: "mmol/L" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-10",
      resource: {
        resourceType: "Observation",
        id: "obs-10",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "3094-0", display: "BUN (Blood Urea Nitrogen)" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 24, unit: "mg/dL", system: "http://unitsofmeasure.org", code: "mg/dL" },
        referenceRange: [{ low: { value: 7, unit: "mg/dL" }, high: { value: 20, unit: "mg/dL" } }],
        interpretation: [{ coding: [{ code: "H", display: "High" }] }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-11",
      resource: {
        resourceType: "Observation",
        id: "obs-11",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "48642-3", display: "eGFR" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 54, unit: "mL/min/1.73m2", system: "http://unitsofmeasure.org", code: "mL/min/1.73m2" },
        referenceRange: [{ low: { value: 60, unit: "mL/min/1.73m2" } }],
        interpretation: [{ coding: [{ code: "L", display: "Low" }] }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-12",
      resource: {
        resourceType: "Observation",
        id: "obs-12",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "4548-4", display: "Hemoglobin A1c" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 8.4, unit: "%", system: "http://unitsofmeasure.org", code: "%" },
        referenceRange: [{ low: { value: 4.0, unit: "%" }, high: { value: 5.6, unit: "%" } }],
        interpretation: [{ coding: [{ code: "H", display: "High" }] }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-13",
      resource: {
        resourceType: "Observation",
        id: "obs-13",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "17861-6", display: "Calcium" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 9.4, unit: "mg/dL", system: "http://unitsofmeasure.org", code: "mg/dL" },
        referenceRange: [{ low: { value: 8.6, unit: "mg/dL" }, high: { value: 10.3, unit: "mg/dL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-14",
      resource: {
        resourceType: "Observation",
        id: "obs-14",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "2075-0", display: "Chloride" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 102, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        referenceRange: [{ low: { value: 96, unit: "mmol/L" }, high: { value: 106, unit: "mmol/L" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-15",
      resource: {
        resourceType: "Observation",
        id: "obs-15",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "2028-9", display: "CO2 (Bicarbonate)" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 23, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        referenceRange: [{ low: { value: 22, unit: "mmol/L" }, high: { value: 29, unit: "mmol/L" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-16",
      resource: {
        resourceType: "Observation",
        id: "obs-16",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "1742-6", display: "ALT (Alanine Aminotransferase)" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 28, unit: "U/L", system: "http://unitsofmeasure.org", code: "U/L" },
        referenceRange: [{ low: { value: 7, unit: "U/L" }, high: { value: 56, unit: "U/L" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-17",
      resource: {
        resourceType: "Observation",
        id: "obs-17",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "1920-8", display: "AST (Aspartate Aminotransferase)" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 22, unit: "U/L", system: "http://unitsofmeasure.org", code: "U/L" },
        referenceRange: [{ low: { value: 10, unit: "U/L" }, high: { value: 40, unit: "U/L" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-18",
      resource: {
        resourceType: "Observation",
        id: "obs-18",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "1975-2", display: "Total Bilirubin" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 0.8, unit: "mg/dL", system: "http://unitsofmeasure.org", code: "mg/dL" },
        referenceRange: [{ low: { value: 0.2, unit: "mg/dL" }, high: { value: 1.2, unit: "mg/dL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-19",
      resource: {
        resourceType: "Observation",
        id: "obs-19",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "1751-7", display: "Albumin" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 4.1, unit: "g/dL", system: "http://unitsofmeasure.org", code: "g/dL" },
        referenceRange: [{ low: { value: 3.5, unit: "g/dL" }, high: { value: 5.0, unit: "g/dL" } }]
      }
    },
    {
      fullUrl: "urn:uuid:obs-20",
      resource: {
        resourceType: "Observation",
        id: "obs-20",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "6768-6", display: "Alkaline Phosphatase" }] },
        subject: { reference: "Patient/P001" },
        effectiveDateTime: "2026-10-08T08:00:00Z",
        valueQuantity: { value: 68, unit: "U/L", system: "http://unitsofmeasure.org", code: "U/L" },
        referenceRange: [{ low: { value: 44, unit: "U/L" }, high: { value: 147, unit: "U/L" } }]
      }
    }
  ]
};

// Full CDS Inpatient Bundle: Patient + Conditions + Medications + Labs + Allergies
export const SAMPLE_FULL_CDS_BUNDLE = {
  resourceType: "Bundle",
  id: "cds-inpatient-001",
  type: "collection",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "P001",
        name: [{ family: "Sharma", given: ["Rajesh", "Kumar"] }],
        gender: "male",
        birthDate: "1962-04-15"
      }
    },
    {
      resource: {
        resourceType: "Condition",
        id: "cond-1",
        clinicalStatus: { coding: [{ code: "active" }] },
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "44054006", display: "Type 2 Diabetes Mellitus" }]
        },
        onsetDateTime: "2015-06-12"
      }
    },
    {
      resource: {
        resourceType: "Condition",
        id: "cond-2",
        clinicalStatus: { coding: [{ code: "active" }] },
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "38341003", display: "Essential Hypertension" }]
        },
        onsetDateTime: "2018-09-20"
      }
    },
    {
      resource: {
        resourceType: "AllergyIntolerance",
        id: "alg-1",
        criticality: "high",
        clinicalStatus: { coding: [{ code: "active" }] },
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "373270004", display: "Penicillin G" }]
        },
        reaction: [{ manifestation: [{ text: "Anaphylaxis and respiratory distress" }], severity: "severe" }]
      }
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "med-1",
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
          coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "860975", display: "Metformin hydrochloride 500 MG Oral Tablet" }]
        },
        dosageInstruction: [{ text: "500 mg orally twice daily with meals" }]
      }
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "med-2",
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
          coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "314076", display: "Lisinopril 10 MG Oral Tablet" }]
        },
        dosageInstruction: [{ text: "10 mg orally once daily in the morning" }]
      }
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "med-3",
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
          coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "617314", display: "Atorvastatin 20 MG Oral Tablet" }]
        },
        dosageInstruction: [{ text: "20 mg orally once daily at bedtime" }]
      }
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-a1c",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "4548-4", display: "Hemoglobin A1c" }] },
        effectiveDateTime: "2026-10-08",
        valueQuantity: { value: 8.4, unit: "%" },
        referenceRange: [{ low: { value: 4.0, unit: "%" }, high: { value: 5.6, unit: "%" } }],
        interpretation: [{ coding: [{ code: "H", display: "High" }] }]
      }
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-bp",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood Pressure Panel" }] },
        effectiveDateTime: "2026-10-08",
        component: [
          { code: { coding: [{ code: "8480-6", display: "Systolic" }] }, valueQuantity: { value: 148, unit: "mmHg" } },
          { code: { coding: [{ code: "8462-4", display: "Diastolic" }] }, valueQuantity: { value: 92, unit: "mmHg" } }
        ],
        interpretation: [{ coding: [{ code: "H", display: "Stage 2 Hypertension" }] }]
      }
    },
    {
      resource: {
        resourceType: "Observation",
        id: "obs-egfr",
        status: "final",
        code: { coding: [{ system: "http://loinc.org", code: "48642-3", display: "eGFR" }] },
        effectiveDateTime: "2026-10-08",
        valueQuantity: { value: 52, unit: "mL/min/1.73m2" },
        referenceRange: [{ low: { value: 60, unit: "mL/min/1.73m2" } }],
        interpretation: [{ coding: [{ code: "L", display: "Stage 3a CKD" }] }]
      }
    }
  ]
};
