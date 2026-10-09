use serde_json::Value;

/// Prefix table mapping verbose canonical URLs to compact system identifiers
pub fn normalize_system(system: &str) -> &'static str {
    if system.contains("loinc.org") {
        "loinc"
    } else if system.contains("snomed.info") {
        "snomed"
    } else if system.contains("rxnorm") || system.contains("nlm.nih.gov") {
        "rxnorm"
    } else if system.contains("unitsofmeasure.org") || system.contains("ucum") {
        "ucum"
    } else if system.contains("icd-10") {
        "icd10"
    } else if system.contains("cvx") {
        "cvx"
    } else {
        ""
    }
}

/// Checks whether an Observation is a vital-sign (Pain, BP, HR, etc.) vs Laboratory
pub fn is_vital_sign(resource: &Value) -> bool {
    // 1. Check category code
    if let Some(categories) = resource.get("category").and_then(|c| c.as_array()) {
        for cat in categories {
            if let Some(codings) = cat.get("coding").and_then(|cd| cd.as_array()) {
                for c in codings {
                    if let Some(code) = c.get("code").and_then(|s| s.as_str()) {
                        if code == "vital-signs" {
                            return true;
                        }
                    }
                    if let Some(display) = c.get("display").and_then(|s| s.as_str()) {
                        if display.to_lowercase().contains("vital") {
                            return true;
                        }
                    }
                }
            }
        }
    }

    // 2. Check LOINC codes for vital signs
    if let Some(code_obj) = resource.get("code") {
        if let Some(codings) = code_obj.get("coding").and_then(|c| c.as_array()) {
            for c in codings {
                if let Some(code) = c.get("code").and_then(|s| s.as_str()) {
                    match code {
                        "72514-3" | // Pain severity verbal numeric rating
                        "85354-9" | // Blood pressure panel
                        "8480-6"  | // Systolic BP
                        "8462-4"  | // Diastolic BP
                        "8867-4"  | // Heart rate
                        "9279-1"  | // Respiratory rate
                        "8310-5"  | // Body temperature
                        "59408-5" | // Oxygen saturation SpO2
                        "29463-7" | // Body weight
                        "8302-2"  | // Body height
                        "39156-5"   // BMI
                        => return true,
                        _ => {}
                    }
                }
            }
        }
        if let Some(text) = code_obj.get("text").and_then(|t| t.as_str()) {
            let t_lower = text.to_lowercase();
            if t_lower.contains("pain") || t_lower.contains("blood pressure") || t_lower.contains("pulse") {
                return true;
            }
        }
    }

    false
}

/// Extracts primary display name and normalized code
pub fn extract_concept(concept_obj: &Value) -> (String, Option<String>) {
    let coding = concept_obj.get("coding").and_then(|c| c.as_array()).and_then(|arr| arr.first());
    
    let text = concept_obj.get("text").and_then(|t| t.as_str())
        .or_else(|| coding.and_then(|c| c.get("display")?.as_str()))
        .or_else(|| coding.and_then(|c| c.get("code")?.as_str()))
        .unwrap_or("Unknown")
        .to_string();

    let code_str = coding.and_then(|c| {
        let code = c.get("code")?.as_str()?;
        let sys = c.get("system").and_then(|s| s.as_str()).map(normalize_system).unwrap_or("");
        if sys.is_empty() {
            Some(code.to_string())
        } else {
            Some(format!("{}:{}", sys, code))
        }
    });

    (text, code_str)
}
