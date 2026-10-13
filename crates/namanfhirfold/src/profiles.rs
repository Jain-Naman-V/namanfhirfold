use serde_json::Value;

const SYSTEM_HINTS: &[(&str, &str)] = &[
    ("loinc.org", "loinc"),
    ("snomed.info", "snomed"),
    ("rxnorm", "rxnorm"),
    ("nlm.nih.gov", "rxnorm"),
    ("unitsofmeasure.org", "ucum"),
    ("ucum", "ucum"),
    ("icd-10", "icd10"),
    ("cvx", "cvx"),
];

/// Prefix table mapping verbose canonical URLs to compact system identifiers.
/// Unknown systems fall back to the last path segment (or the full string),
/// matching TS `normalizeSystem` exactly.
pub fn normalize_system(system: &str) -> String {
    if system.is_empty() {
        return String::new();
    }
    for (needle, name) in SYSTEM_HINTS {
        if system.contains(needle) {
            return name.to_string();
        }
    }
    let parts: Vec<&str> = system.split('/').filter(|p| !p.is_empty()).collect();
    parts
        .last()
        .map(|s| s.to_string())
        .unwrap_or_else(|| system.to_string())
}

const VITAL_LOINCS: &[&str] = &[
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

const VITAL_NAME_HINTS: &[&str] = &[
    "pain",
    "blood pressure",
    "pulse",
    "heart rate",
    "temperature",
];

/// Checks whether an Observation is a vital-sign (Pain, BP, HR, etc.) vs Laboratory
pub fn is_vital_sign(resource: &Value) -> bool {
    // 1. Check FHIR category
    if let Some(categories) = resource.get("category").and_then(|c| c.as_array()) {
        for cat in categories {
            for coding in cat.get("coding").and_then(|cd| cd.as_array()).into_iter().flatten() {
                if coding.get("code").and_then(|s| s.as_str()) == Some("vital-signs") {
                    return true;
                }
                if let Some(display) = coding.get("display").and_then(|s| s.as_str()) {
                    if display.to_lowercase().contains("vital") {
                        return true;
                    }
                }
            }
            if let Some(text) = cat.get("text").and_then(|t| t.as_str()) {
                if text.to_lowercase().contains("vital") {
                    return true;
                }
            }
        }
    }

    // 2. Check LOINC codes for vital signs
    let code_obj = resource.get("code");
    if let Some(code_obj) = code_obj {
        if let Some(codings) = code_obj.get("coding").and_then(|c| c.as_array()) {
            for c in codings {
                if let Some(code) = c.get("code").and_then(|s| s.as_str()) {
                    if VITAL_LOINCS.contains(&code) {
                        return true;
                    }
                }
            }
        }
    }

    // 3. Name-hint fallback (text, then first coding display)
    let mut name = String::new();
    if let Some(code_obj) = code_obj {
        if let Some(text) = code_obj.get("text").and_then(|t| t.as_str()) {
            name = text.to_lowercase();
        }
        if name.is_empty() {
            if let Some(first) = code_obj
                .get("coding")
                .and_then(|c| c.as_array())
                .and_then(|a| a.first())
            {
                if let Some(d) = first.get("display").and_then(|s| s.as_str()) {
                    name = d.to_lowercase();
                }
            }
        }
    }
    VITAL_NAME_HINTS.iter().any(|h| name.contains(h))
}

/// Extracts primary display name, optional code and system from a CodeableConcept
pub fn extract_concept(concept: &Value) -> (String, Option<String>, Option<String>) {
    if concept.is_null() || !concept.is_object() {
        return ("Unknown".to_string(), None, None);
    }
    let coding = concept
        .get("coding")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first());
    let name = concept
        .get("text")
        .and_then(|t| t.as_str())
        .or_else(|| coding.and_then(|c| c.get("display").and_then(|s| s.as_str())))
        .or_else(|| coding.and_then(|c| c.get("code").and_then(|s| s.as_str())))
        .unwrap_or("Unknown")
        .to_string();
    if let Some(c) = coding {
        if let Some(code) = c.get("code").and_then(|s| s.as_str()) {
            let system = c
                .get("system")
                .and_then(|s| s.as_str())
                .map(normalize_system)
                .unwrap_or_default();
            let system_opt = if system.is_empty() { None } else { Some(system) };
            return (name, Some(code.to_string()), system_opt);
        }
    }
    (name, None, None)
}
