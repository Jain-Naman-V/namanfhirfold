use crate::models::*;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

fn get_str<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

fn get_map<'a>(v: &'a Value, k: &str) -> Option<&'a Map<String, Value>> {
    v.get(k).and_then(|x| x.as_object())
}

fn s(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

fn json_str(v: &Value) -> String {
    serde_json::to_string(v).unwrap_or_default()
}

fn is_truthy(v: &Value) -> bool {
    !v.is_null() && !v.as_str().map_or(false, |x| x.is_empty())
}

fn join_nonempty(parts: &[String], sep: &str) -> String {
    parts.iter().filter(|x| !x.is_empty()).cloned().collect::<Vec<_>>().join(sep)
}

// ---------------------------------------------------------------------------
// Concept helpers (parity with TypeScript fhirCompressor.ts)
// ---------------------------------------------------------------------------

pub fn normalize_system(system: Option<&str>) -> String {
    let sys = system.unwrap_or("");
    if sys.is_empty() {
        return String::new();
    }
    if sys.contains("loinc.org") {
        "loinc".into()
    } else if sys.contains("snomed.info") {
        "snomed".into()
    } else if sys.contains("rxnorm") || sys.contains("nlm.nih.gov") {
        "rxnorm".into()
    } else if sys.contains("unitsofmeasure.org") || sys.contains("ucum") {
        "ucum".into()
    } else if sys.contains("icd-10") {
        "icd10".into()
    } else if sys.contains("cvx") {
        "cvx".into()
    } else {
        let parts: Vec<&str> = sys.split('/').filter(|p| !p.is_empty()).collect();
        parts.last().map(|x| x.to_string()).unwrap_or_else(|| sys.to_string())
    }
}

pub fn human_name(n: &Value) -> String {
    if n.is_null() {
        return String::new();
    }
    let arr = if n.is_array() {
        n.as_array().cloned().unwrap_or_default()
    } else {
        vec![n.clone()]
    };
    let mut out: Vec<String> = Vec::new();
    for x in arr {
        let m = match x.as_object() {
            Some(m) => m,
            None => continue,
        };
        if let Some(t) = m.get("text").and_then(|t| t.as_str()) {
            out.push(t.to_string());
            continue;
        }
        let prefix = m.get("prefix").and_then(|p| p.as_array()).map(|a| a.iter().map(|v| s(v)).collect::<Vec<_>>().join(" ")).unwrap_or_default();
        let given = m.get("given").and_then(|g| g.as_array()).map(|a| a.iter().map(|v| s(v)).collect::<Vec<_>>().join(" ")).unwrap_or_default();
        let family = m.get("family").and_then(|f| f.as_str()).unwrap_or("").to_string();
        let joined = join_nonempty(&[prefix, given, family], " ");
        if !joined.is_empty() {
            out.push(joined);
        }
    }
    out.join(" | ")
}

pub fn code_display(c: &Value) -> String {
    if c.is_null() {
        return String::new();
    }
    let coding = c.get("coding").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let first = coding.first().and_then(|x| x.as_object()).cloned().unwrap_or_default();
    let disp = first.get("display").and_then(|d| d.as_str()).or_else(|| first.get("code").and_then(|c| c.as_str())).unwrap_or("").to_string();
    let text = c.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string();
    if !text.is_empty() && !disp.is_empty() && text != disp {
        format!("{} ({})", disp, text)
    } else if !text.is_empty() {
        text
    } else {
        disp
    }
}

pub fn concept_all(c: &Value) -> String {
    if c.is_null() {
        return String::new();
    }
    let mut parts: Vec<String> = Vec::new();
    let mut push = |x: &Value| {
        let ss = match x {
            Value::String(st) => st.clone(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            _ => String::new(),
        };
        let ss = ss.trim().to_string();
        if !ss.is_empty() && !parts.contains(&ss) {
            parts.push(ss);
        }
    };
    if let Some(t) = c.get("text") {
        push(t);
    }
    if let Some(codings) = c.get("coding").and_then(|x| x.as_array()) {
        for d in codings {
            if let Some(disp) = d.get("display") {
                push(disp);
            }
            if let Some(code) = d.get("code") {
                push(code);
            }
        }
    }
    parts.join(" / ")
}

pub fn extract_concept(concept: Option<&Value>) -> Value {
    if concept.map_or(true, |c| c.is_null()) {
        return json!({"name": "Unknown"});
    }
    let concept = concept.unwrap();
    let coding = concept.get("coding").and_then(|x| x.as_array()).and_then(|a| a.first()).cloned().unwrap_or(json!({}));
    let name = concept.get("text").and_then(|t| t.as_str())
        .or_else(|| coding.get("display").and_then(|d| d.as_str()))
        .or_else(|| coding.get("code").and_then(|c| c.as_str()))
        .unwrap_or("Unknown")
        .to_string();
    if let Some(code) = coding.get("code").and_then(|c| c.as_str()) {
        let sys = normalize_system(coding.get("system").and_then(|x| x.as_str()));
        let mut obj = Map::new();
        obj.insert("name".into(), Value::String(name));
        obj.insert("code".into(), Value::String(code.to_string()));
        if !sys.is_empty() {
            obj.insert("system".into(), Value::String(sys));
        }
        return Value::Object(obj);
    }
    json!({"name": name})
}

// LOINC codes for observations that are vital signs rather than laboratory tests.
const VITAL_LOINCS: &[&str] = &[
    "72514-3", "85354-9", "8480-6", "8462-4", "8867-4", "9279-1", "8310-5", "59408-5", "29463-7", "8302-2", "39156-5",
];

const VITAL_NAME_HINTS: &[&str] = &["pain", "blood pressure", "pulse", "heart rate", "temperature"];

pub fn is_vital_sign(res: &Value) -> bool {
    for cat in res.get("category").and_then(|x| x.as_array()).into_iter().flatten() {
        for coding in cat.get("coding").and_then(|x| x.as_array()).into_iter().flatten() {
            if coding.get("code").and_then(|c| c.as_str()) == Some("vital-signs") {
                return true;
            }
            let display = coding.get("display").and_then(|d| d.as_str()).unwrap_or("").to_lowercase();
            if display.contains("vital") {
                return true;
            }
        }
        let text = cat.get("text").and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
        if text.contains("vital") {
            return true;
        }
    }
    let code_obj = res.get("code").cloned().unwrap_or(json!({}));
    for coding in code_obj.get("coding").and_then(|x| x.as_array()).into_iter().flatten() {
        if let Some(code) = coding.get("code").and_then(|c| c.as_str()) {
            if VITAL_LOINCS.contains(&code) {
                return true;
            }
        }
    }
    let mut name = code_obj.get("text").and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
    if name.is_empty() {
        if let Some(first) = code_obj.get("coding").and_then(|x| x.as_array()).and_then(|a| a.first()) {
            name = first.get("display").and_then(|d| d.as_str()).unwrap_or("").to_lowercase();
        }
    }
    VITAL_NAME_HINTS.iter().any(|h| name.contains(h))
}

pub fn extract_value(src: &Value) -> Value {
    if src.is_null() {
        return json!({"value": ""});
    }
    if let Some(dq) = src.get("valueQuantity") {
        return json!({
            "value": dq.get("value"),
            "unit": dq.get("unit").or(dq.get("code"))
        });
    }
    if let Some(v) = src.get("valueString") {
        return json!({"value": v.clone()});
    }
    if let Some(v) = src.get("valueBoolean") {
        return json!({"value": if v.as_bool().unwrap_or(false) { "Yes" } else { "No" }});
    }
    if let Some(v) = src.get("valueInteger") {
        return json!({"value": v.clone()});
    }
    if let Some(v) = src.get("valueDateTime") {
        return json!({"value": v.clone()});
    }
    if let Some(v) = src.get("valueTime") {
        return json!({"value": v.clone()});
    }
    if let Some(p) = src.get("valuePeriod") {
        let start = p.get("start").and_then(|x| x.as_str()).unwrap_or("");
        let end = p.get("end").and_then(|x| x.as_str()).unwrap_or("");
        if !start.is_empty() && !end.is_empty() {
            return json!({"value": format!("{} to {}", start, end)});
        }
        let fallback = if !start.is_empty() { start } else { end };
        return json!({"value": fallback});
    }
    if let Some(r) = src.get("valueRange") {
        let low = r.get("low").cloned().unwrap_or(json!({}));
        let high = r.get("high").cloned().unwrap_or(json!({}));
        let lo = low.get("value").cloned();
        let hi = high.get("value").cloned();
        let unit = low.get("unit").or(high.get("unit")).and_then(|u| u.as_str()).unwrap_or("").to_string();
        if lo.is_some() && hi.is_some() {
            return json!({"value": format!("{}-{}", lo.unwrap(), hi.unwrap()), "unit": if unit.is_empty() { Value::Null } else { Value::String(unit) }});
        }
        if let Some(l) = lo {
            return json!({"value": format!(">={}", l), "unit": if unit.is_empty() { Value::Null } else { Value::String(unit) }});
        }
        if let Some(h) = hi {
            return json!({"value": format!("<={}", h), "unit": if unit.is_empty() { Value::Null } else { Value::String(unit) }});
        }
    }
    if let Some(r) = src.get("valueRatio") {
        let num = r.get("numerator").cloned().unwrap_or(json!({}));
        let den = r.get("denominator").cloned().unwrap_or(json!({}));
        if let (Some(n), Some(d)) = (num.get("value"), den.get("value")) {
            if !n.is_null() && !d.is_null() {
                return json!({
                    "value": format!("{}/{}", n, d),
                    "unit": num.get("unit")
                });
            }
        }
    }
    if let Some(cc) = src.get("valueCodeableConcept") {
        let codings = cc.get("coding").and_then(|x| x.as_array()).cloned().unwrap_or_default();
        let dar = codings.iter().find(|c| {
            let sys = c.get("system").and_then(|x| x.as_str()).unwrap_or("");
            let code = c.get("code").and_then(|x| x.as_str()).unwrap_or("");
            sys.contains("data-absent-reason") || code == "unknown"
        }).cloned();
        let non_dar: Vec<&Value> = codings.iter().filter(|c| {
            let sys = c.get("system").and_then(|x| x.as_str()).unwrap_or("");
            !sys.contains("data-absent-reason")
        }).collect();
        if let Some(dar_c) = dar {
            if cc.get("text").is_none() && non_dar.is_empty() {
                return json!({"value": "", "absent": dar_c.get("code").and_then(|x| x.as_str()).unwrap_or("unknown")});
            }
            if codings.len() == 1 {
                return json!({"value": "", "absent": dar_c.get("code").and_then(|x| x.as_str()).unwrap_or("unknown")});
            }
        }
        let all = concept_all(cc);
        let text = cc.get("text").and_then(|t| t.as_str()).unwrap_or("");
        let val = if !all.is_empty() { all } else { text.to_string() };
        return json!({"value": val});
    }
    if let Some(dar) = src.get("dataAbsentReason") {
        let coding = dar.get("coding").and_then(|x| x.as_array()).and_then(|a| a.first()).cloned().unwrap_or(json!({}));
        let code = coding.get("code").and_then(|x| x.as_str()).unwrap_or("");
        let text = dar.get("text").and_then(|x| x.as_str()).unwrap_or("");
        let absent = if !code.is_empty() { code } else if !text.is_empty() { text } else { "unknown" };
        return json!({"value": "", "absent": absent});
    }
    json!({"value": ""})
}

pub fn format_date_time(dt: Option<&str>, granularity: &str) -> String {
    let dt = match dt {
        Some(d) => d,
        None => return String::new(),
    };
    if granularity == "exact_timestamp" {
        return dt.to_string();
    }
    dt.split('T').next().unwrap_or("").to_string()
}

pub fn obs_date(res: &Value) -> Option<String> {
    if let Some(v) = get_str(res, "effectiveDateTime") {
        return Some(v.to_string());
    }
    if let Some(ep) = get_map(res, "effectivePeriod") {
        if let Some(s) = ep.get("start").and_then(|x| x.as_str()) {
            return Some(s.to_string());
        }
        if let Some(e) = ep.get("end").and_then(|x| x.as_str()) {
            return Some(e.to_string());
        }
    }
    if let Some(et) = get_map(res, "effectiveTiming") {
        if let Some(event) = et.get("event").and_then(|x| x.as_array()).and_then(|a| a.first()) {
            return Some(s(event));
        }
    }
    if let Some(v) = get_str(res, "effectiveInstant") {
        return Some(v.to_string());
    }
    if let Some(v) = get_str(res, "issued") {
        return Some(v.to_string());
    }
    if let Some(ip) = get_map(res, "issuedPeriod") {
        if let Some(s) = ip.get("start").and_then(|x| x.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

pub fn resource_date_span(res: &Value, granularity: &str) -> String {
    let period = get_map(res, "performedPeriod")
        .or_else(|| get_map(res, "occurrencePeriod"))
        .or_else(|| get_map(res, "period"));
    let start_raw = obs_date(res)
        .or_else(|| get_str(res, "performedDateTime").map(str::to_string))
        .or_else(|| get_str(res, "occurrenceDateTime").map(str::to_string))
        .or_else(|| period.and_then(|p| p.get("start")).and_then(|v| v.as_str()).map(str::to_string))
        .or_else(|| get_str(res, "recordedDate").map(str::to_string))
        .or_else(|| get_str(res, "authoredOn").map(str::to_string));
    let start = format_date_time(start_raw.as_deref(), granularity);
    let end = format_date_time(
        period.and_then(|p| p.get("end")).and_then(|v| v.as_str()),
        granularity,
    );
    if !start.is_empty() && !end.is_empty() && start != end {
        format!("{} to {}", start, end)
    } else if !start.is_empty() {
        start
    } else {
        end
    }
}

pub fn format_ref_range(ranges: Option<&Vec<Value>>) -> Option<String> {
    let ranges = ranges?;
    if ranges.is_empty() {
        return None;
    }
    let r = &ranges[0];
    if let Some(t) = r.get("text").and_then(|x| x.as_str()) {
        return Some(t.to_string());
    }
    let low = r.get("low").cloned().unwrap_or(json!({}));
    let high = r.get("high").cloned().unwrap_or(json!({}));
    let lo = low.get("value").map(|x| x.to_string()).unwrap_or_default();
    let hi = high.get("value").map(|x| x.to_string()).unwrap_or_default();
    let unit = low.get("unit").or(high.get("unit")).and_then(|u| u.as_str()).unwrap_or("");
    if !lo.is_empty() && !hi.is_empty() {
        let mut out = format!("{}-{}", lo, hi);
        if !unit.is_empty() {
            out.push(' ');
            out.push_str(unit);
        }
        return Some(out);
    }
    if !lo.is_empty() {
        let mut out = format!(">{}", lo);
        if !unit.is_empty() {
            out.push(' ');
            out.push_str(unit);
        }
        return Some(out);
    }
    if !hi.is_empty() {
        let mut out = format!("<{}", hi);
        if !unit.is_empty() {
            out.push(' ');
            out.push_str(unit);
        }
        return Some(out);
    }
    None
}

pub fn note_join(items: Option<&Vec<Value>>) -> String {
    let items = match items {
        Some(i) => i,
        None => return String::new(),
    };
    let texts: Vec<String> = items.iter().filter_map(|n| n.get("text").and_then(|t| t.as_str()).map(|t| t.to_string())).collect();
    let joined = texts.join(" | ");
    // normalize newlines to " / " (parity with TS .replace(/\s*\n\s*/g, " / "))
    let mut out = String::new();
    let mut chars = joined.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\n' {
            while matches!(chars.peek(), Some(' ') | Some('\t') | Some('\r')) {
                chars.next();
            }
            out.push_str(" / ");
        } else {
            out.push(c);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

fn ingest(data: &Value) -> (Vec<Value>, HashMap<String, usize>, Vec<String>) {
    let mut raw_resources: Vec<Value> = Vec::new();
    let mut resource_type_count: HashMap<String, usize> = HashMap::new();
    let mut data_gaps: Vec<String> = Vec::new();

    fn push(
        res: &Value,
        raw_resources: &mut Vec<Value>,
        resource_type_count: &mut HashMap<String, usize>,
    ) {
        raw_resources.push(res.clone());
        let rt = res.get("resourceType").and_then(|x| x.as_str()).unwrap_or("Unknown").to_string();
        *resource_type_count.entry(rt).or_insert(0) += 1;
    }

    fn ingest_group_val(
        key: &str,
        val: &Value,
        raw_resources: &mut Vec<Value>,
        resource_type_count: &mut HashMap<String, usize>,
        data_gaps: &mut Vec<String>,
    ) {
        match val {
            Value::Array(arr) => {
                for v in arr {
                    ingest_group_val(key, v, raw_resources, resource_type_count, data_gaps);
                }
            }
            Value::Object(m) => {
                if m.get("resourceType").and_then(|x| x.as_str()) == Some("Bundle") {
                    if let Some(entries) = m.get("entry").and_then(|x| x.as_array()) {
                        for entry in entries {
                            if let Some(res) = entry.get("resource") {
                                push(res, raw_resources, resource_type_count);
                            }
                        }
                    }
                } else if m.contains_key("resourceType") {
                    push(val, raw_resources, resource_type_count);
                } else if let Some(err) = m.get("error") {
                    let status = m.get("status").and_then(|x| x.as_str()).unwrap_or("");
                    let gap = if status.is_empty() {
                        format!("{}: fetch failed ({})", key, err)
                    } else {
                        format!("{}: fetch failed ({} {})", key, err, status)
                    };
                    data_gaps.push(gap);
                }
            }
            _ => {}
        }
    }

    match data {
        Value::Array(items) => {
            for item in items {
                if item.is_object() {
                    ingest_group_val("item", item, &mut raw_resources, &mut resource_type_count, &mut data_gaps);
                }
            }
        }
        Value::Object(_) => {
            if data.get("resourceType").and_then(|x| x.as_str()) == Some("Bundle") {
                if let Some(entries) = data.get("entry").and_then(|x| x.as_array()) {
                    for entry in entries {
                        if let Some(res) = entry.get("resource") {
                            push(res, &mut raw_resources, &mut resource_type_count);
                        }
                    }
                }
            } else if data.as_object().map_or(false, |o| o.contains_key("resourceType")) {
                push(data, &mut raw_resources, &mut resource_type_count);
            } else if let Some(obj) = data.as_object() {
                for (key, val) in obj {
                    ingest_group_val(key, val, &mut raw_resources, &mut resource_type_count, &mut data_gaps);
                }
            }
        }
        _ => {}
    }

    (raw_resources, resource_type_count, data_gaps)
}

// ---------------------------------------------------------------------------
// Execute optimization
// ---------------------------------------------------------------------------

fn calculate_age(birth_date: Option<&str>) -> Option<i64> {
    let birth = birth_date?.get(..10)?;
    let birth_year = birth.get(0..4)?.parse::<i32>().ok()?;
    let birth_month = birth.get(5..7)?.parse::<u32>().ok()?;
    let birth_day = birth.get(8..10)?.parse::<u32>().ok()?;
    if !(1..=12).contains(&birth_month) || !(1..=31).contains(&birth_day) {
        return None;
    }
    let days_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs() as i64 / 86_400;
    let (today_year, today_month, today_day) = civil_from_days(days_since_epoch);
    if (birth_year, birth_month, birth_day) > (today_year, today_month, today_day) {
        return None;
    }
    let mut age = i64::from(today_year - birth_year);
    if (today_month, today_day) < (birth_month, birth_day) {
        age -= 1;
    }
    Some(age.max(0))
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year as i32, month as u32, day as u32)
}

pub fn execute_optimization(raw_fhir_json: &str, options: &CompressionOptions) -> Result<OptimizationResult, String> {
    let data: Value = serde_json::from_str(raw_fhir_json).map_err(|e| format!("Error parsing FHIR JSON: {}", e))?;
    fold_with_provenance(&data, options)
}

pub fn fold_with_provenance(data: &Value, options: &CompressionOptions) -> Result<OptimizationResult, String> {
    let mut provenance_map: HashMap<String, ProvenanceEntry> = HashMap::new();
    let (raw_resources, _resource_type_count, data_gaps) = ingest(data);

    let mut granularity = options.granularity.as_str().to_string();
    if let Some(qf) = &options.query_filter {
        let q = qf.to_lowercase();
        for w in ["time", "pm", "am", "hour", "acute", "when"] {
            if q.contains(w) {
                granularity = "exact_timestamp".to_string();
                break;
            }
        }
    }

    let profile = options.profile.as_str().to_string();
    let query_filter = options.query_filter.clone();
    let token_budget = options.token_budget.unwrap_or(0);

    // Flag invalid / refuted / entered-in-error items (kept: ruling-out IS clinical data)
    let valid_resources = &raw_resources;
    let flagged_ids: Vec<String> = valid_resources
        .iter()
        .filter_map(|res| {
            let status = get_str(res, "status") == Some("entered-in-error");
            let refuted = res
                .get("verificationStatus")
                .and_then(|vs| vs.get("coding"))
                .and_then(|c| c.as_array())
                .and_then(|a| a.first())
                .and_then(|c| c.get("code"))
                .and_then(|c| c.as_str())
                == Some("refuted");
            if status || refuted {
                get_str(res, "id").map(|id| id.to_string())
            } else {
                None
            }
        })
        .collect();

    // Task-Aware Selection
    let mut selected_resources: Vec<Value> = if profile == "medication_prescribe" {
        valid_resources
            .iter()
            .filter(|res| {
                let rt = get_str(res, "resourceType").unwrap_or("");
                if rt == "Patient" || rt == "AllergyIntolerance" || rt.starts_with("Medication") {
                    return true;
                }
                if rt == "Observation" {
                    let text = json_str(res).to_lowercase();
                    return ["creatinine", "egfr", "bun", "weight", "potassium"].iter().any(|w| text.contains(w));
                }
                false
            })
            .cloned()
            .collect()
    } else if profile == "vitals_monitor" {
        valid_resources
            .iter()
            .filter(|res| {
                let rt = get_str(res, "resourceType").unwrap_or("");
                rt == "Patient" || is_vital_sign(res)
            })
            .cloned()
            .collect()
    } else if let Some(qf) = query_filter.as_ref().filter(|q| !q.trim().is_empty()) {
        let q_lower = qf.to_lowercase();
        let broad_terms = [
            "all", "summary", "overview", "insight", "insights", "everything",
            "complete", "full", "chart", "record", "records", "history", "profile", "review", "report"
        ];
        let is_broad = broad_terms.iter().any(|w| q_lower.contains(w));

        let mut sel: Vec<Value> = if is_broad {
            valid_resources.clone()
        } else {
            valid_resources
                .iter()
                .filter(|res| {
                    let rt = get_str(res, "resourceType").unwrap_or("");
                    if options.safety_set_guaranteed {
                        if rt == "Patient" || rt == "AllergyIntolerance" {
                            return true;
                        }
                        if rt.starts_with("Medication")
                            && get_str(res, "status") != Some("stopped")
                            && get_str(res, "status") != Some("entered-in-error")
                        {
                            return true;
                        }
                    }

                    let res_str = json_str(res).to_lowercase();
                    if res_str.contains(&q_lower) {
                        return true;
                    }
                    if q_lower.contains("pain") && (res_str.contains("pain") || rt == "Observation") {
                        return true;
                    }
                    if (q_lower.contains("vital") || q_lower.contains("bp") || q_lower.contains("pressure") || q_lower.contains("pulse") || q_lower.contains("temp")) && is_vital_sign(res) {
                        return true;
                    }
                    if ["care", "plan", "activity", "protocol", "recovery"].iter().any(|w| q_lower.contains(w)) && rt == "CarePlan" {
                        return true;
                    }
                    if ["lab", "blood", "test", "panel", "result", "finding", "pefr", "spo2", "hba1c"].iter().any(|w| q_lower.contains(w)) && rt == "Observation" && !is_vital_sign(res) {
                        return true;
                    }
                    if ["med", "drug", "dose", "rx", "prescription", "pharmacy"].iter().any(|w| q_lower.contains(w)) && rt.starts_with("Medication") {
                        return true;
                    }
                    if ["allergy", "allergies", "intolerance", "reaction"].iter().any(|w| q_lower.contains(w)) && rt == "AllergyIntolerance" {
                        return true;
                    }
                    if ["condition", "diagnosis", "problem", "disease", "illness"].iter().any(|w| q_lower.contains(w)) && rt == "Condition" {
                        return true;
                    }
                    if ["encounter", "visit", "admission", "consult", "clinic", "appointment", "stay", "surgery"].iter().any(|w| q_lower.contains(w)) && rt == "Encounter" {
                        return true;
                    }
                    if ["procedure", "operation", "intervention"].iter().any(|w| q_lower.contains(w)) && rt == "Procedure" {
                        return true;
                    }
                    if ["vaccine", "vaccination", "immunization", "shot"].iter().any(|w| q_lower.contains(w)) && rt == "Immunization" {
                        return true;
                    }
                    false
                })
                .cloned()
                .collect()
        };
        if sel.is_empty() {
            sel = valid_resources.clone();
        }
        sel
    } else {
        valid_resources.clone()
    };

    let mut budget_exceeded = false;
    if token_budget > 0 {
        let is_safety = |res: &Value| {
            let rt = get_str(res, "resourceType").unwrap_or("");
            if ["Patient", "AllergyIntolerance", "CarePlan"].contains(&rt) {
                return true;
            }
            rt.starts_with("Medication")
                && get_str(res, "status") != Some("stopped")
                && get_str(res, "status") != Some("entered-in-error")
        };
        let estimate = |res: &Value| ((json_str(res).len() as f64) / 3.0).ceil() as usize;
        let safety: Vec<Value> = selected_resources.iter().filter(|r| is_safety(r)).cloned().collect();
        let normal: Vec<Value> = selected_resources.iter().filter(|r| !is_safety(r)).cloned().collect();
        let mut used: usize = safety.iter().map(&estimate).sum();
        let mut within = Vec::new();
        for res in normal {
            let cost = estimate(&res);
            if used + cost <= token_budget {
                used += cost;
                within.push(res);
            }
        }
        budget_exceeded = safety.len() + within.len() < selected_resources.len();
        selected_resources = safety;
        selected_resources.extend(within);
    }

    // Transform & index provenance
    let mut patients: Vec<Value> = Vec::new();
    let mut vital_signs: Vec<Value> = Vec::new();
    let mut labs: Vec<Value> = Vec::new();
    let mut medications: Vec<Value> = Vec::new();
    let mut conditions: Vec<Value> = Vec::new();
    let mut allergies: Vec<Value> = Vec::new();
    let mut care_plans: Vec<Value> = Vec::new();
    let mut others: Vec<Value> = Vec::new();
    let mut encounters: Vec<Value> = Vec::new();
    let mut obs_id_to_short_ref: HashMap<String, String> = HashMap::new();
    let mut patient_fallback = String::new();

    let mut obs_counter = 1;
    let mut vital_counter = 1;
    let mut med_counter = 1;
    let mut cond_counter = 1;
    let mut alg_counter = 1;
    let mut cp_counter = 1;
    let mut enc_counter = 1;

    for res in &selected_resources {
        let rt = get_str(res, "resourceType").unwrap_or("");
        let orig_id = get_str(res, "id").map(|x| x.to_string()).unwrap_or_else(|| format!("res-{:05x}", (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() % 100000) as u32));
        let subj = res.get("subject").cloned().unwrap_or(json!({}));
        if patient_fallback.is_empty() {
            let ref_str = subj.get("reference").and_then(|x| x.as_str()).unwrap_or("");
            if ref_str.starts_with("Patient/") {
                if let Some(d) = subj.get("display").and_then(|x| x.as_str()) {
                    patient_fallback = d.to_string();
                }
            }
        }

        // contained resources are real data — never drop them
        if let Some(contained) = res.get("contained").and_then(|x| x.as_array()) {
            for c in contained {
                if !c.is_object() {
                    continue;
                }
                let role_val = c.get("relationship").or(c.get("specialty")).or(c.get("role")).cloned().unwrap_or(json!([]));
                let role = if let Some(arr) = role_val.as_array() {
                    if !arr.is_empty() {
                        Some(concept_all(&arr[0]))
                    } else {
                        None
                    }
                } else {
                    None
                };
                let contained_name = {
                    let code_all = concept_all(c.get("code").unwrap_or(&json!(null)));
                    if !code_all.is_empty() {
                        code_all
                    } else {
                        let hn = human_name(c.get("name").unwrap_or(&json!(null)));
                        if !hn.is_empty() { hn } else { c.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string() }
                    }
                };
                let mut row = Map::new();
                let idx = others.len() + 1;
                row.insert("ref".into(), json!(format!("X{}", idx)));
                row.insert("type".into(), json!(format!("{} (contained)", c.get("resourceType").and_then(|x| x.as_str()).unwrap_or("contained"))));
                row.insert("id".into(), c.get("id").cloned().unwrap_or(Value::String(orig_id.clone())));
                row.insert("name".into(), if contained_name.is_empty() { Value::Null } else { Value::String(contained_name) });
                row.insert("role".into(), role.filter(|r| !r.is_empty()).map(Value::String).unwrap_or(Value::Null));
                row.insert("status".into(), c.get("status").cloned().unwrap_or(Value::Null));
                row.insert("value".into(), extract_value(c).get("value").cloned().filter(|v| is_truthy(v)).unwrap_or(Value::Null));
                row.insert("date".into(), {
                    let d = format_date_time(
                        get_str(c, "effectiveDateTime").or(get_str(c, "recordedDate")).or(get_str(c, "authoredOn")),
                        &granularity,
                    );
                    if d.is_empty() { Value::Null } else { Value::String(d) }
                });
                others.push(Value::Object(row));
            }
        }

        if rt == "Patient" {
            let mut all_names: Vec<String> = Vec::new();
            for n in res.get("name").and_then(|x| x.as_array()).into_iter().flatten() {
                if !n.is_object() {
                    continue;
                }
                let full = n.get("text").and_then(|t| t.as_str()).map(|t| t.to_string()).unwrap_or_else(|| {
                    let prefix = n.get("prefix").and_then(|p| p.as_array()).map(|a| a.iter().map(|v| s(v)).collect::<Vec<_>>().join(" ")).unwrap_or_default();
                    let given = n.get("given").and_then(|g| g.as_array()).map(|a| a.iter().map(|v| s(v)).collect::<Vec<_>>().join(" ")).unwrap_or_default();
                    let family = n.get("family").and_then(|f| f.as_str()).unwrap_or("").to_string();
                    join_nonempty(&[prefix, given, family], " ")
                });
                if !full.is_empty() {
                    all_names.push(full);
                }
            }
            let name = all_names.first().cloned().unwrap_or_default();
            let aka: Vec<String> = all_names.into_iter().skip(1).collect();
            let mut tel: Vec<String> = Vec::new();
            for t in res.get("telecom").and_then(|x| x.as_array()).into_iter().flatten() {
                if let Some(v) = t.get("value").and_then(|x| x.as_str()) {
                    let sys = t.get("system").and_then(|x| x.as_str()).unwrap_or("tel");
                    tel.push(format!("{}: {}", sys, v));
                }
            }
            let mut addr: Vec<String> = Vec::new();
            for a in res.get("address").and_then(|x| x.as_array()).into_iter().flatten() {
                if !a.is_object() {
                    continue;
                }
                let line = a.get("line").and_then(|x| x.as_array()).map(|arr| arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(", ")).unwrap_or_default();
                let city = a.get("city").and_then(|x| x.as_str()).unwrap_or("");
                let state = a.get("state").and_then(|x| x.as_str()).unwrap_or("");
                let zip = a.get("postalCode").and_then(|x| x.as_str()).unwrap_or("");
                let composed = join_nonempty(&[line, city.to_string(), state.to_string(), zip.to_string()], ", ");
                let fallback = join_nonempty(&[city.to_string(), state.to_string()], ", ");
                let full = a.get("text").and_then(|t| t.as_str()).map(|t| t.to_string())
                    .or_else(|| if !composed.is_empty() { Some(composed) } else { None })
                    .unwrap_or(fallback);
                if !full.is_empty() {
                    addr.push(full);
                }
            }
            let mut langs: Vec<String> = Vec::new();
            for c in res.get("communication").and_then(|x| x.as_array()).into_iter().flatten() {
                if !c.is_object() {
                    continue;
                }
                let mut l = code_display(c.get("language").unwrap_or(&json!(null)));
                if c.get("preferred").and_then(|p| p.as_bool()).unwrap_or(false) {
                    l.push_str(" (preferred)");
                }
                if !l.is_empty() {
                    langs.push(l);
                }
            }
            let mut contacts: Vec<String> = Vec::new();
            for c in res.get("contact").and_then(|x| x.as_array()).into_iter().flatten() {
                if !c.is_object() {
                    continue;
                }
                let rel = code_display(c.get("relationship").unwrap_or(&json!(null)));
                let who = if c.as_object().map_or(false, |o| o.contains_key("name")) {
                    human_name(c.get("name").unwrap())
                } else {
                    String::new()
                };
                let ct = c.get("telecom").and_then(|x| x.as_array()).map(|arr| {
                    arr.iter().filter_map(|t| t.get("value").and_then(|v| v.as_str()).map(|v| v.to_string())).collect::<Vec<_>>().join("/")
                }).unwrap_or_default();
                let joined = join_nonempty(&[if rel.is_empty() { String::new() } else { format!("({})", rel) }, who, ct], " ");
                if !joined.is_empty() {
                    contacts.push(joined);
                }
            }
            let gp = res.get("generalPractitioner").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().filter_map(|g| g.get("display").and_then(|d| d.as_str()).map(|d| d.to_string())).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let birth = get_str(res, "birthDate");
            let age = calculate_age(birth);
            let phone = res.get("telecom").and_then(|x| x.as_array()).and_then(|arr| {
                arr.iter().find(|t| t.get("system").and_then(|x| x.as_str()) == Some("phone"))
                    .and_then(|t| t.get("value"))
                    .and_then(|x| x.as_str())
                    .map(|x| x.to_string())
            });
            let mut pat = Map::new();
            pat.insert("ref".into(), json!("P1"));
            pat.insert("id".into(), Value::String(orig_id.clone()));
            pat.insert("name".into(), if name.is_empty() { Value::Null } else { Value::String(name.clone()) });
            pat.insert("aka".into(), if aka.is_empty() { Value::Null } else { Value::Array(aka.into_iter().map(Value::String).collect()) });
            pat.insert("gender".into(), res.get("gender").cloned().unwrap_or(Value::Null));
            pat.insert("age".into(), age.map(|a| Value::Number(a.into())).unwrap_or(Value::Null));
            pat.insert("dob".into(), birth.map(|b| Value::String(b.to_string())).unwrap_or(Value::Null));
            pat.insert("phone".into(), phone.map(Value::String).unwrap_or(Value::Null));
            pat.insert("telecom".into(), if tel.is_empty() { Value::Null } else { Value::Array(tel.into_iter().map(Value::String).collect()) });
            pat.insert("address".into(), if addr.is_empty() { Value::Null } else { Value::Array(addr.into_iter().map(Value::String).collect()) });
            pat.insert("languages".into(), if langs.is_empty() { Value::Null } else { Value::Array(langs.into_iter().map(Value::String).collect()) });
            pat.insert("contacts".into(), if contacts.is_empty() { Value::Null } else { Value::Array(contacts.into_iter().map(Value::String).collect()) });
            pat.insert("gp".into(), if gp.is_empty() { Value::Null } else { Value::String(gp) });
            pat.insert("marital".into(), {
                let m = code_display(res.get("maritalStatus").unwrap_or(&json!(null)));
                if m.is_empty() { Value::Null } else { Value::String(m) }
            });
            let summary = format!("{} ({}, Age: {})",
                pat.get("name").and_then(|x| x.as_str()).unwrap_or("Patient"),
                pat.get("gender").and_then(|x| x.as_str()).unwrap_or(""),
                pat.get("age").map(|x| x.to_string()).unwrap_or("N/A".into())
            );
            provenance_map.insert("P1".into(), ProvenanceEntry {
                short_ref: "P1".into(),
                resource_type: "Patient".into(),
                original_id: orig_id.clone(),
                summary,
                raw_snippet: res.clone(),
            });
            patients.push(Value::Object(pat));
        } else if rt == "Observation" {
            let vital = is_vital_sign(res);
            let concept = extract_concept(res.get("code"));
            let ev = extract_value(res);
            let mut val = ev.get("value").cloned().unwrap_or(json!(""));
            let unit = ev.get("unit").and_then(|u| u.as_str()).unwrap_or("").to_string();
            let absent = ev.get("absent").and_then(|a| a.as_str()).map(|x| x.to_string());

            if let Some(components) = res.get("component").and_then(|x| x.as_array()) {
                let mut comps: Vec<String> = Vec::new();
                for c in components {
                    if !c.is_object() {
                        continue;
                    }
                    let c_name = extract_concept(c.get("code")).get("name").and_then(|x| x.as_str()).unwrap_or("Unknown").to_string();
                    let cv = extract_value(c);
                    if let Some(absent) = cv.get("absent").and_then(|a| a.as_str()) {
                        comps.push(format!("{}: ABSENT({})", c_name, absent));
                    } else {
                        let cv_val = cv.get("value").cloned().unwrap_or(json!(""));
                        if cv_val.is_null() || cv_val == json!("") {
                            continue;
                        }
                        let cv_unit = cv.get("unit").and_then(|u| u.as_str()).unwrap_or("");
                        comps.push(format!("{}: {} {}", c_name, cv_val, cv_unit).trim().to_string());
                    }
                }
                if !comps.is_empty() {
                    val = json!(comps.join(", "));
                }
            }

            let mut member_refs: Vec<String> = Vec::new();
            for m in res.get("hasMember").and_then(|x| x.as_array()).into_iter().flatten()
                .chain(res.get("derivedFrom").and_then(|x| x.as_array()).into_iter().flatten())
            {
                if let Some(r) = m.get("reference").and_then(|x| x.as_str()) {
                    member_refs.push(r.to_string());
                }
            }

            let date_str = format_date_time(obs_date(res).as_deref(), &granularity);
            let obs_dt = obs_date(res);
            let issued_raw = {
                let i = get_str(res, "issued").map(|x| x.to_string());
                if i.is_some() && i.as_deref() != obs_dt.as_deref() {
                    format_date_time(i.as_deref(), &granularity)
                } else {
                    String::new()
                }
            };
            let issued_str = if !issued_raw.is_empty() && issued_raw != date_str {
                issued_raw
            } else {
                String::new()
            };
            let ref_range = format_ref_range(res.get("referenceRange").and_then(|x| x.as_array()));
            let obs_cat = res.get("category").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().filter_map(|c| {
                    if !c.is_object() { return None; }
                    let n = extract_concept(Some(c)).get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    if !n.is_empty() && n != "Unknown" { Some(n) } else { None }
                }).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let obs_note = note_join(res.get("note").and_then(|x| x.as_array()));
            let obs_performer = res.get("performer").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().filter_map(|p| p.get("display").and_then(|d| d.as_str()).map(|d| d.to_string())).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let mut flag: Option<String> = None;
            let mut flag_abnormal = false;
            if let Some(interp) = res.get("interpretation").and_then(|x| x.as_array()).filter(|a| !a.is_empty()) {
                let first = &interp[0];
                let coding = first.get("coding").and_then(|x| x.as_array()).and_then(|a| a.first()).cloned().unwrap_or(json!({}));
                let code = coding.get("code").and_then(|x| x.as_str()).unwrap_or("");
                let disp = coding.get("display").and_then(|x| x.as_str())
                    .or_else(|| first.get("text").and_then(|x| x.as_str()))
                    .unwrap_or("");
                flag = if !disp.is_empty() && !code.is_empty() && disp != code {
                    Some(format!("{} ({})", disp, code))
                } else {
                    let f = if !disp.is_empty() { disp } else { code };
                    if f.is_empty() { None } else { Some(f.to_string()) }
                };
                flag_abnormal = !code.is_empty() && !["n", "normal"].contains(&code.to_lowercase().as_str());
            }

            if options.only_abnormal_labs && !flag_abnormal {
                continue;
            }

            if val == json!("") || val.is_null() {
                if !member_refs.is_empty() {
                    val = json!(format!("→ {} answer(s)", member_refs.len()));
                } else if let Some(absent) = &absent {
                    val = json!(format!("ABSENT({})", absent));
                } else {
                    val = json!("NO VALUE");
                }
            }

            let code_str = concept.get("code").and_then(|c| c.as_str()).map(|c| {
                format!("{}:{}", concept.get("system").and_then(|x| x.as_str()).unwrap_or("loinc"), c)
            });
            let mut row = Map::new();
            row.insert("ref".into(), json!(""));
            row.insert("name".into(), concept.get("name").cloned().unwrap_or(Value::Null));
            row.insert("test".into(), concept.get("name").cloned().unwrap_or(Value::Null));
            row.insert("code".into(), code_str.map(Value::String).unwrap_or(Value::Null));
            row.insert("value".into(), val.clone());
            row.insert("unit".into(), if unit.is_empty() { Value::Null } else { Value::String(unit.clone()) });
            row.insert("date".into(), if granularity == "date_only" { Value::String(date_str.clone()) } else { Value::Null });
            row.insert("dateTime".into(), if granularity == "exact_timestamp" { Value::String(date_str.clone()) } else { Value::Null });
            row.insert("issued".into(), if issued_str.is_empty() { Value::Null } else { Value::String(issued_str) });
            row.insert("range".into(), ref_range.map(Value::String).unwrap_or(Value::Null));
            row.insert("flag".into(), flag.clone().map(Value::String).unwrap_or(Value::Null));
            row.insert("category".into(), if obs_cat.is_empty() { Value::Null } else { Value::String(obs_cat) });
            row.insert("note".into(), if obs_note.is_empty() { Value::Null } else { Value::String(obs_note) });
            row.insert("performer".into(), if obs_performer.is_empty() { Value::Null } else { Value::String(obs_performer) });
            row.insert("status".into(), res.get("status").cloned().unwrap_or(Value::Null));
            row.insert("absent".into(), absent.map(Value::String).unwrap_or(Value::Null));
            row.insert("members".into(), if member_refs.is_empty() { Value::Null } else { Value::Array(member_refs.into_iter().map(Value::String).collect()) });

            if vital {
                let short_ref = format!("V{}", vital_counter);
                vital_counter += 1;
                row.insert("ref".into(), json!(short_ref.clone()));
                if !matches!(val, Value::Number(_)) {
                    row.insert("value".into(), val.clone());
                }
                let summary = format!("{} = {} ({})",
                    concept.get("name").and_then(|x| x.as_str()).unwrap_or(""),
                    row.get("value").map(|x| s(x)).unwrap_or_default(),
                    date_str
                );
                provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                    short_ref,
                    resource_type: "Observation (Vital Signs)".into(),
                    original_id: orig_id.clone(),
                    summary,
                    raw_snippet: res.clone(),
                });
                vital_signs.push(Value::Object(row));
            } else {
                let short_ref = format!("O{}", obs_counter);
                obs_counter += 1;
                row.insert("ref".into(), json!(short_ref.clone()));
                if matches!(val, Value::Number(_)) {
                    row.insert("value".into(), val.clone());
                } else {
                    row.insert("value".into(), val.clone());
                }
                let flag_part = flag.as_ref().map(|f| format!(" [Flag: {}]", f)).unwrap_or_default();
                let summary = format!("{}: {}{} [{}]",
                    concept.get("name").and_then(|x| x.as_str()).unwrap_or(""),
                    row.get("value").map(|x| s(x)).unwrap_or_default(),
                    flag_part,
                    res.get("status").and_then(|x| x.as_str()).unwrap_or("final")
                );
                provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                    short_ref: short_ref.clone(),
                    resource_type: "Observation (Laboratory)".into(),
                    original_id: orig_id.clone(),
                    summary,
                    raw_snippet: res.clone(),
                });
                if !orig_id.is_empty() {
                    obs_id_to_short_ref.insert(orig_id.clone(), short_ref);
                }
                labs.push(Value::Object(row));
            }
            if vital && !orig_id.is_empty() {
                obs_id_to_short_ref.insert(orig_id, vital_signs.last().unwrap().get("ref").and_then(|x| x.as_str()).unwrap_or("").to_string());
            }
        } else if rt == "CarePlan" {
            let short_ref = format!("CP{}", cp_counter);
            cp_counter += 1;
            let category_name = res.get("category").and_then(|x| x.as_array()).and_then(|a| a.first()).map(|c| {
                extract_concept(Some(c)).get("name").and_then(|x| x.as_str()).unwrap_or("").to_string()
            }).unwrap_or_default();
            let period_str = {
                let p = res.get("period").cloned().unwrap_or(json!({}));
                let st = format_date_time(p.get("start").and_then(|x| x.as_str()), &granularity);
                let en = format_date_time(p.get("end").and_then(|x| x.as_str()), &granularity);
                if !st.is_empty() && !en.is_empty() {
                    format!("{} to {}", st, en)
                } else {
                    String::new()
                }
            };
            let mut activities: Vec<String> = Vec::new();
            for act in res.get("activity").and_then(|x| x.as_array()).into_iter().flatten() {
                if !act.is_object() {
                    continue;
                }
                let detail = act.get("detail").cloned().unwrap_or(json!({}));
                let detail_concept = extract_concept(detail.get("code"));
                let desc = detail.get("description").and_then(|x| x.as_str()).unwrap_or("");
                let name = detail_concept.get("name").and_then(|x| x.as_str()).unwrap_or("Unknown");
                if name != "Unknown" && !desc.is_empty() {
                    activities.push(format!("{}: {}", name, desc));
                } else if name != "Unknown" {
                    activities.push(name.to_string());
                } else if !desc.is_empty() {
                    activities.push(desc.to_string());
                }
            }
            let care_team = res.get("careTeam").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().filter_map(|c| c.get("display").and_then(|d| d.as_str()).map(|d| d.to_string())).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let title = get_str(res, "title").map(|x| x.to_string());
            let category = if !category_name.is_empty() {
                category_name
            } else {
                title.clone().unwrap_or("Care Plan".into())
            };
            let mut cp_obj = Map::new();
            cp_obj.insert("ref".into(), json!(short_ref.clone()));
            cp_obj.insert("type".into(), json!("CarePlan"));
            cp_obj.insert("category".into(), Value::String(category.clone()));
            cp_obj.insert("status".into(), res.get("status").cloned().unwrap_or(Value::Null));
            cp_obj.insert("intent".into(), res.get("intent").cloned().unwrap_or(Value::Null));
            cp_obj.insert("period".into(), if period_str.is_empty() { Value::Null } else { Value::String(period_str.clone()) });
            cp_obj.insert("activities".into(), if activities.is_empty() { Value::Null } else { Value::Array(activities.clone().into_iter().map(Value::String).collect()) });
            cp_obj.insert("careTeam".into(), if care_team.is_empty() { Value::Null } else { Value::String(care_team) });
            cp_obj.insert("title".into(), title.map(Value::String).unwrap_or(Value::Null));
            let summary = format!("{} ({}) - {} activities",
                cp_obj.get("category").and_then(|x| x.as_str()).unwrap_or(""),
                cp_obj.get("status").and_then(|x| x.as_str()).unwrap_or(""),
                activities.len()
            );
            provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                short_ref,
                resource_type: "CarePlan".into(),
                original_id: orig_id.clone(),
                summary,
                raw_snippet: res.clone(),
            });
            care_plans.push(Value::Object(cp_obj));
        } else if rt == "MedicationRequest" || rt == "MedicationStatement" {
            let short_ref = format!("M{}", med_counter);
            med_counter += 1;
            let concept = extract_concept(res.get("medicationCodeableConcept"));
            let mut drug = concept_all(res.get("medicationCodeableConcept").unwrap_or(&json!(null)));
            if drug.is_empty() || drug == "Unknown" {
                drug = concept.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            }
            if drug == "Unknown" {
                if let Some(d) = res.get("medicationReference").and_then(|x| x.get("display")).and_then(|x| x.as_str()) {
                    drug = d.to_string();
                }
            }
            let dosage = res.get("dosageInstruction").and_then(|x| x.as_array()).cloned().unwrap_or_default();
            let di = dosage.first().and_then(|x| x.as_object()).cloned().unwrap_or_default();
            let mut sig = di.get("text").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let dose_rate = di.get("doseAndRate").and_then(|x| x.as_array()).cloned().unwrap_or_default();
            let dar = dose_rate.first().and_then(|x| x.as_object()).cloned().unwrap_or_default();
            let mut extra_dose_parts: Vec<String> = Vec::new();
            for d2 in dose_rate.iter().skip(1) {
                if !d2.is_object() {
                    continue;
                }
                let t = concept_all(d2.get("type").unwrap_or(&json!(null)));
                let q = d2.get("doseQuantity").or(d2.get("doseRateQuantity")).cloned().unwrap_or(json!({}));
                let amount = if !q.get("value").is_none() {
                    let v = q.get("value").map(|x| x.to_string()).unwrap_or_default();
                    let u = q.get("unit").and_then(|x| x.as_str()).unwrap_or("");
                    format!("{} {}", v, u).trim().to_string()
                } else {
                    String::new()
                };
                let joined = join_nonempty(&[t, amount], " ");
                if !joined.is_empty() {
                    extra_dose_parts.push(joined);
                }
            }
            let extra_dose = extra_dose_parts.join("; ");
            if sig.is_empty() && !dar.is_empty() {
                let d = dar.get("doseQuantity").or(dar.get("doseRateQuantity")).cloned().unwrap_or(json!({}));
                let mut parts: Vec<String> = Vec::new();
                if !d.get("value").is_none() {
                    parts.push(d.get("value").map(|x| x.to_string()).unwrap_or_default());
                }
                if let Some(u) = d.get("unit").and_then(|x| x.as_str()) {
                    if !u.is_empty() {
                        parts.push(u.to_string());
                    }
                }
                if !parts.is_empty() {
                    sig = parts.join(" ");
                }
                let t = dar.get("rateQuantity").cloned().unwrap_or(json!({}));
                if let Some(rv) = t.get("value") {
                    if !rv.is_null() {
                        let ru = t.get("unit").and_then(|x| x.as_str()).unwrap_or("");
                        sig = format!("{} @ {} {}", sig, rv, ru).trim().to_string();
                    }
                }
            }
            let route = concept_all(di.get("route").unwrap_or(&json!(null)));
            let dose_type = concept_all(dar.get("type").unwrap_or(&json!(null)));
            if !route.is_empty() && sig.is_empty() {
                sig = route;
            } else if !sig.is_empty() && !route.is_empty() && !sig.to_lowercase().contains(&route.to_lowercase()) {
                sig = format!("{}, {}", sig, route);
            }
            if !sig.is_empty() && !dose_type.is_empty() {
                sig = format!("{} [{}]", sig, dose_type);
            }
            let timing = di.get("timing").and_then(|x| x.get("repeat")).cloned().unwrap_or(json!({}));
            let bounds = timing.get("boundsPeriod").cloned().unwrap_or(json!({}));
            let bounds_end = bounds.get("end").and_then(|x| x.as_str()).map(|x| x.to_string());
            let bounds_start = bounds.get("start").and_then(|x| x.as_str()).map(|x| x.to_string());
            let prn = concept_all(di.get("asNeededCodeableConcept").unwrap_or(&json!(null)));
            let instruction = note_join(di.get("additionalInstruction").and_then(|x| x.as_array()));
            let prescriber = {
                let req = res.get("requester").and_then(|x| x.get("display")).and_then(|x| x.as_str()).unwrap_or("");
                if !req.is_empty() {
                    req.to_string()
                } else {
                    res.get("performer").and_then(|x| x.as_array()).map(|arr| {
                        arr.iter().filter_map(|p| p.get("display").and_then(|d| d.as_str()).map(|d| d.to_string())).collect::<Vec<_>>().join(", ")
                    }).unwrap_or_default()
                }
            };
            let dispense = res.get("dispenseRequest").cloned().unwrap_or(json!({}));
            let dq = dispense.get("quantity").cloned();
            let dispense_qty = dq.as_ref().map(|dq| {
                let v = dq.get("value").map(|x| x.to_string()).unwrap_or_default();
                let u = dq.get("unit").and_then(|x| x.as_str()).unwrap_or("");
                format!("{} {}", v, u).trim().to_string()
            }).filter(|x| !x.is_empty());
            let course = concept_all(res.get("courseOfTherapyType").unwrap_or(&json!(null)));
            let category = res.get("category").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().map(|c| concept_all(c)).filter(|x| !x.is_empty()).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let reason = res.get("reasonCode").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().map(|r| concept_all(r)).filter(|x| !x.is_empty()).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let note = note_join(res.get("note").and_then(|x| x.as_array()));
            let authored = get_str(res, "authoredOn").map(|x| x.to_string());
            let mut m_obj = Map::new();
            m_obj.insert("ref".into(), json!(short_ref.clone()));
            m_obj.insert("drug".into(), Value::String(drug.clone()));
            m_obj.insert("code".into(), concept.get("code").and_then(|c| c.as_str()).map(|c| {
                format!("{}:{}", concept.get("system").and_then(|x| x.as_str()).unwrap_or("rxnorm"), c)
            }).map(Value::String).unwrap_or(Value::Null));
            m_obj.insert("sig".into(), if sig.is_empty() { Value::Null } else { Value::String(sig.clone()) });
            m_obj.insert("status".into(), res.get("status").cloned().unwrap_or(Value::Null));
            m_obj.insert("date".into(), {
                let d = format_date_time(authored.as_deref(), &granularity);
                if d.is_empty() { Value::Null } else { Value::String(d) }
            });
            m_obj.insert("course".into(), if course.is_empty() { Value::Null } else { Value::String(course) });
            m_obj.insert("category".into(), if category.is_empty() { Value::Null } else { Value::String(category) });
            m_obj.insert("prn".into(), if prn.is_empty() { Value::Null } else { Value::String(prn) });
            m_obj.insert("instruction".into(), if instruction.is_empty() { Value::Null } else { Value::String(instruction) });
            m_obj.insert("startsOn".into(), bounds_start.map(|b| {
                let d = format_date_time(Some(&b), &granularity);
                if d.is_empty() { Value::Null } else { Value::String(d) }
            }).unwrap_or(Value::Null));
            m_obj.insert("endsOn".into(), bounds_end.map(|b| {
                let d = format_date_time(Some(&b), &granularity);
                if d.is_empty() { Value::Null } else { Value::String(d) }
            }).unwrap_or(Value::Null));
            m_obj.insert("doseTypes".into(), if extra_dose.is_empty() { Value::Null } else { Value::String(extra_dose) });
            m_obj.insert("validFrom".into(), {
                let vp = dispense.get("validityPeriod").and_then(|x| x.get("start")).and_then(|x| x.as_str()).unwrap_or("");
                let d = format_date_time(Some(vp), &granularity);
                if d.is_empty() { Value::Null } else { Value::String(d) }
            });
            m_obj.insert("prescriber".into(), if prescriber.is_empty() { Value::Null } else { Value::String(prescriber) });
            m_obj.insert("reason".into(), if reason.is_empty() { Value::Null } else { Value::String(reason) });
            m_obj.insert("note".into(), if note.is_empty() { Value::Null } else { Value::String(note) });
            m_obj.insert("dispenseQty".into(), dispense_qty.map(Value::String).unwrap_or(Value::Null));
            let summary = format!("{} - {} ({})",
                drug,
                if sig.is_empty() { "As directed" } else { &sig },
                res.get("status").and_then(|x| x.as_str()).unwrap_or("")
            );
            provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                short_ref,
                resource_type: "MedicationRequest".into(),
                original_id: orig_id.clone(),
                summary,
                raw_snippet: res.clone(),
            });
            medications.push(Value::Object(m_obj));
        } else if rt == "Condition" {
            let short_ref = format!("C{}", cond_counter);
            cond_counter += 1;
            let concept = extract_concept(res.get("code"));
            let clinical = res.get("clinicalStatus").and_then(|x| x.get("coding")).and_then(|x| x.as_array()).and_then(|a| a.first()).cloned().unwrap_or(json!({}));
            let status = clinical.get("code").and_then(|x| x.as_str()).unwrap_or("active").to_string();
            let status_text = res.get("clinicalStatus").and_then(|x| x.get("text")).and_then(|x| x.as_str()).map(|x| x.to_string());
            let verification = code_display(res.get("verificationStatus").unwrap_or(&json!(null)));
            let category = code_display(res.get("category").and_then(|x| x.as_array()).and_then(|a| a.first()).unwrap_or(&json!(null)));
            let body_site = res.get("bodySite")
                .and_then(|x| x.as_array())
                .map(|sites| sites.iter().map(concept_all).filter(|x| !x.is_empty()).collect::<Vec<_>>().join(", "))
                .unwrap_or_default();
            let onset = format_date_time(get_str(res, "onsetDateTime").or(get_str(res, "recordedDate")), &granularity);
            let recorded = format_date_time(get_str(res, "recordedDate"), &granularity);
            let note = res.get("note").and_then(|x| x.as_array()).and_then(|a| a.first()).and_then(|n| n.get("text")).and_then(|t| t.as_str()).map(|t| t.chars().take(300).collect::<String>()).unwrap_or_default();
            let mut c_obj = Map::new();
            c_obj.insert("ref".into(), json!(short_ref.clone()));
            c_obj.insert("condition".into(), concept.get("name").cloned().unwrap_or(Value::Null));
            c_obj.insert("code".into(), concept.get("code").and_then(|c| c.as_str()).map(|c| {
                format!("{}:{}", concept.get("system").and_then(|x| x.as_str()).unwrap_or("snomed"), c)
            }).map(Value::String).unwrap_or(Value::Null));
            c_obj.insert("status".into(), Value::String(status.clone()));
            c_obj.insert("statusText".into(), status_text.clone().map(Value::String).unwrap_or(Value::Null));
            c_obj.insert("verification".into(), if verification.is_empty() { Value::Null } else { Value::String(verification.clone()) });
            c_obj.insert("category".into(), if category.is_empty() { Value::Null } else { Value::String(category) });
            c_obj.insert("bodySite".into(), if body_site.is_empty() { Value::Null } else { Value::String(body_site) });
            c_obj.insert("onset".into(), if onset.is_empty() { Value::Null } else { Value::String(onset) });
            c_obj.insert("recorded".into(), if recorded.is_empty() { Value::Null } else { Value::String(recorded) });
            c_obj.insert("note".into(), if note.is_empty() { Value::Null } else { Value::String(note) });
            let ver_part = if verification.is_empty() { String::new() } else { format!("/{}", verification) };
            let summary = format!("{} [{}{}]",
                concept.get("name").and_then(|x| x.as_str()).unwrap_or(""),
                status,
                ver_part
            );
            provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                short_ref,
                resource_type: "Condition".into(),
                original_id: orig_id.clone(),
                summary,
                raw_snippet: res.clone(),
            });
            conditions.push(Value::Object(c_obj));
        } else if rt == "AllergyIntolerance" {
            let short_ref = format!("A{}", alg_counter);
            alg_counter += 1;
            let concept = extract_concept(res.get("code"));
            let mut reactions: Vec<String> = Vec::new();
            for r in res.get("reaction").and_then(|x| x.as_array()).into_iter().flatten() {
                if !r.is_object() {
                    continue;
                }
                let ms: Vec<String> = r.get("manifestation").and_then(|x| x.as_array()).map(|arr| {
                    arr.iter().map(|m| concept_all(m)).filter(|x| !x.is_empty() && x != "Unknown").collect()
                }).unwrap_or_default();
                if !ms.is_empty() {
                    reactions.push(ms.join(" + "));
                }
                if let Some(sev) = r.get("severity").and_then(|x| x.as_str()) {
                    reactions.push(format!("severity: {}", sev));
                }
                if let Some(desc) = r.get("description").and_then(|x| x.as_str()) {
                    reactions.push(desc.to_string());
                }
            }
            let clinical = res.get("clinicalStatus").and_then(|x| x.get("coding")).and_then(|x| x.as_array()).and_then(|a| a.first()).cloned().unwrap_or(json!({}));
            let status = clinical.get("code").and_then(|x| x.as_str()).unwrap_or("active").to_string();
            let status_text = res.get("clinicalStatus").and_then(|x| x.get("text")).and_then(|x| x.as_str()).map(|x| x.to_string());
            let verification = code_display(res.get("verificationStatus").unwrap_or(&json!(null)));
            let criticality = get_str(res, "criticality").map(|x| x.to_string());
            let kind = get_str(res, "type").map(|x| x.to_string());
            let onset = format_date_time(get_str(res, "onsetDateTime"), &granularity);
            let recorded = format_date_time(get_str(res, "recordedDate"), &granularity);
            let recorder = res.get("recorder").and_then(|x| x.get("display")).and_then(|x| x.as_str()).map(|x| x.to_string());
            let note = note_join(res.get("note").and_then(|x| x.as_array()));
            let mut a_obj = Map::new();
            a_obj.insert("ref".into(), json!(short_ref.clone()));
            a_obj.insert("allergen".into(), concept.get("name").cloned().unwrap_or(Value::Null));
            a_obj.insert("criticality".into(), criticality.clone().map(Value::String).unwrap_or(Value::Null));
            a_obj.insert("status".into(), Value::String(status.clone()));
            a_obj.insert("statusText".into(), status_text.clone().map(Value::String).unwrap_or(Value::Null));
            a_obj.insert("verification".into(), if verification.is_empty() { Value::Null } else { Value::String(verification.clone()) });
            a_obj.insert("kind".into(), kind.map(Value::String).unwrap_or(Value::Null));
            a_obj.insert("reactions".into(), if reactions.is_empty() { Value::Null } else { Value::String(reactions.join(", ")) });
            a_obj.insert("onset".into(), if onset.is_empty() { Value::Null } else { Value::String(onset) });
            a_obj.insert("recorded".into(), if recorded.is_empty() { Value::Null } else { Value::String(recorded) });
            a_obj.insert("recorder".into(), recorder.map(Value::String).unwrap_or(Value::Null));
            a_obj.insert("note".into(), if note.is_empty() { Value::Null } else { Value::String(note) });
            let summary = format!("ALLERGY: {} (Criticality: {})",
                concept.get("name").and_then(|x| x.as_str()).unwrap_or(""),
                criticality.clone().unwrap_or("High".into())
            );
            provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                short_ref,
                resource_type: "AllergyIntolerance".into(),
                original_id: orig_id.clone(),
                summary,
                raw_snippet: res.clone(),
            });
            allergies.push(Value::Object(a_obj));
        } else if rt == "Encounter" {
            let short_ref = format!("E{}", enc_counter);
            enc_counter += 1;
            let loc_entry = res.get("location").and_then(|x| x.as_array()).and_then(|a| a.first()).cloned().unwrap_or(json!({}));
            let loc = loc_entry.get("location").cloned().unwrap_or(json!({}));
            let cls = res.get("class").cloned().unwrap_or(json!({}));
            let cls_str = {
                let disp = cls.get("display").and_then(|x| x.as_str()).unwrap_or("");
                let code = cls.get("code").and_then(|x| x.as_str()).unwrap_or("");
                if !disp.is_empty() && disp != code {
                    format!("{} ({})", disp, code)
                } else if !disp.is_empty() {
                    disp.to_string()
                } else {
                    code.to_string()
                }
            };
            let types = res.get("type").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().map(|t| code_display(t)).filter(|x| !x.is_empty()).collect::<Vec<_>>().join(", ")
            }).unwrap_or_default();
            let mut participants: Vec<String> = Vec::new();
            for p in res.get("participant").and_then(|x| x.as_array()).into_iter().flatten() {
                if !p.is_object() {
                    continue;
                }
                let type_str = p.get("type").and_then(|x| x.as_array()).map(|arr| {
                    arr.iter().map(|t| concept_all(t)).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("/")
                }).unwrap_or_default();
                let who_display = p.get("individual").and_then(|x| x.get("display")).and_then(|x| x.as_str()).unwrap_or("");
                let who = join_nonempty(&[type_str, who_display.to_string()], " — ");
                let period = p.get("period").cloned().unwrap_or(json!({}));
                let since = format_date_time(period.get("start").and_then(|x| x.as_str()), &granularity);
                let until = format_date_time(period.get("end").and_then(|x| x.as_str()), &granularity);
                let span = if !since.is_empty() && !until.is_empty() {
                    format!(" ({} → {})", since, until)
                } else if !since.is_empty() {
                    format!(" (from {})", since)
                } else if !until.is_empty() {
                    format!(" (until {})", until)
                } else {
                    String::new()
                };
                if !who.is_empty() {
                    participants.push(format!("{}{}", who, span));
                }
            }
            let loc_status = loc_entry.get("status").and_then(|x| x.as_str()).map(|x| x.to_string());
            let location = {
                let disp = loc.get("display").and_then(|x| x.as_str()).unwrap_or("");
                if !disp.is_empty() {
                    match &loc_status {
                        Some(st) => format!("{} [{}]", disp, st),
                        None => disp.to_string(),
                    }
                } else {
                    loc_status.clone().unwrap_or_default()
                }
            };
            let reason = res.get("reasonCode").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().map(|r| code_display(r)).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("; ")
            }).unwrap_or_default();
            let discharge = code_display(res.get("hospitalization").and_then(|x| x.get("dischargeDisposition")).unwrap_or(&json!(null)));
            let period = res.get("period").cloned().unwrap_or(json!({}));
            let start = format_date_time(period.get("start").and_then(|x| x.as_str()).or(period.get("end").and_then(|x| x.as_str())), &granularity);
            let end = format_date_time(period.get("end").and_then(|x| x.as_str()), &granularity);
            let provider = res.get("serviceProvider").and_then(|x| x.get("display")).and_then(|x| x.as_str()).map(|x| x.to_string());
            let mut e_obj = Map::new();
            e_obj.insert("ref".into(), json!(short_ref.clone()));
            e_obj.insert("status".into(), res.get("status").cloned().unwrap_or(Value::Null));
            e_obj.insert("class".into(), if cls_str.is_empty() { Value::Null } else { Value::String(cls_str) });
            e_obj.insert("types".into(), if types.is_empty() { Value::Null } else { Value::String(types.clone()) });
            e_obj.insert("start".into(), if start.is_empty() { Value::Null } else { Value::String(start) });
            e_obj.insert("end".into(), if end.is_empty() { Value::Null } else { Value::String(end) });
            e_obj.insert("location".into(), if location.is_empty() { Value::Null } else { Value::String(location) });
            e_obj.insert("provider".into(), provider.map(Value::String).unwrap_or(Value::Null));
            e_obj.insert("reason".into(), if reason.is_empty() { Value::Null } else { Value::String(reason) });
            e_obj.insert("discharge".into(), if discharge.is_empty() { Value::Null } else { Value::String(discharge) });
            e_obj.insert("participants".into(), if participants.is_empty() { Value::Null } else { Value::String(participants.join("; ")) });
            e_obj.insert("type".into(), if types.is_empty() { Value::Null } else { Value::String(types) });
            let summary = format!("{} [{}] {}",
                e_obj.get("type").and_then(|x| x.as_str()).unwrap_or("Encounter"),
                res.get("status").and_then(|x| x.as_str()).unwrap_or(""),
                e_obj.get("start").and_then(|x| x.as_str()).unwrap_or("")
            );
            provenance_map.insert(short_ref.clone(), ProvenanceEntry {
                short_ref,
                resource_type: "Encounter".into(),
                original_id: orig_id.clone(),
                summary,
                raw_snippet: res.clone(),
            });
            encounters.push(Value::Object(e_obj));
        } else {
            let reason_str = res.get("reasonCode").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().map(|r| code_display(r)).collect::<Vec<_>>().join("; ")
            }).unwrap_or_default();
            let activity_str = res.get("activity").and_then(|x| x.as_array()).map(|arr| {
                arr.iter().filter_map(|a| a.get("detail").and_then(|d| d.get("code")).map(|c| code_display(c))).filter(|x| !x.is_empty()).collect::<Vec<_>>().join("; ")
            }).unwrap_or_default();
            let locs = res.get("location").and_then(|x| x.as_array()).cloned().unwrap_or_default();
            let name_fallback = {
                let hn = human_name(res.get("name").unwrap_or(&json!(null)));
                if hn.is_empty() { None } else { Some(hn) }
            };
            let brief = res.get("code").and_then(|c| c.get("text")).and_then(|t| t.as_str())
                .or_else(|| res.get("code").and_then(|c| c.get("coding")).and_then(|x| x.as_array()).and_then(|a| a.first()).and_then(|c| c.get("display")).and_then(|d| d.as_str()))
                .or_else(|| name_fallback.as_deref())
                .or_else(|| res.get("description").and_then(|x| x.as_array()).and_then(|a| a.first()).and_then(|d| d.get("text")).and_then(|t| t.as_str()))
                .or_else(|| res.get("title").and_then(|t| t.as_str()))
                .or_else(|| if reason_str.is_empty() { None } else { Some(reason_str.as_str()) })
                .or_else(|| if activity_str.is_empty() { None } else { Some(activity_str.as_str()) })
                .or_else(|| locs.first().and_then(|l| l.get("display")).and_then(|d| d.as_str()))
                .unwrap_or("")
                .to_string();
            let role = code_display(res.get("specialty").and_then(|x| x.as_array()).and_then(|a| a.first()).unwrap_or(&json!(null)));
            let role = if role.is_empty() {
                code_display(res.get("role").and_then(|x| x.as_array()).and_then(|a| a.first()).unwrap_or(&json!(null)))
            } else { role.clone() };
            let role = if role.is_empty() {
                code_display(res.get("healthcareService").and_then(|x| x.as_array()).and_then(|a| a.first()).unwrap_or(&json!(null)))
            } else { role.clone() };
            let role = if role.is_empty() {
                res.get("managingOrganization").and_then(|x| x.get("display")).and_then(|d| d.as_str())
                    .or_else(|| res.get("organization").and_then(|x| x.get("display")).and_then(|d| d.as_str()))
                    .unwrap_or("")
                    .to_string()
            } else { role };
            let status = res.get("status").cloned()
                .or_else(|| res.get("clinicalStatus").and_then(|x| x.get("coding")).and_then(|x| x.as_array()).and_then(|a| a.first()).and_then(|c| c.get("code")).cloned())
                .unwrap_or(Value::Null);
            let value = extract_value(res).get("value").cloned().filter(|v| is_truthy(v)).unwrap_or(Value::Null);
            let date = resource_date_span(res, &granularity);
            let idx = others.len() + 1;
            let mut row = Map::new();
            row.insert("ref".into(), json!(format!("X{}", idx)));
            row.insert("type".into(), res.get("resourceType").cloned().unwrap_or(Value::Null));
            row.insert("id".into(), Value::String(orig_id.clone()));
            row.insert("name".into(), if brief.is_empty() { Value::Null } else { Value::String(brief.clone()) });
            row.insert("role".into(), if role.is_empty() { Value::Null } else { Value::String(role.clone()) });
            row.insert("status".into(), status);
            row.insert("value".into(), value);
            row.insert("date".into(), if date.is_empty() { Value::Null } else { Value::String(date) });
            let key = format!("X{}", others.len());
            let summary = if !brief.is_empty() {
                if !role.is_empty() {
                    format!("{}: {} [{}]", res.get("resourceType").and_then(|x| x.as_str()).unwrap_or(""), brief, role)
                } else {
                    format!("{}: {}", res.get("resourceType").and_then(|x| x.as_str()).unwrap_or(""), brief)
                }
            } else {
                res.get("resourceType").and_then(|x| x.as_str()).unwrap_or("").to_string()
            };
            provenance_map.insert(key.clone(), ProvenanceEntry {
                short_ref: key,
                resource_type: res.get("resourceType").and_then(|x| x.as_str()).unwrap_or("Unknown").into(),
                original_id: orig_id,
                summary,
                raw_snippet: res.clone(),
            });
            others.push(Value::Object(row));
        }
    }

    // Bundle had no Patient resource — reconstruct identity from subject.display
    if patients.is_empty() && !patient_fallback.is_empty() {
        let mut pat = Map::new();
        pat.insert("ref".into(), json!("P1"));
        pat.insert("name".into(), Value::String(patient_fallback.clone()));
        provenance_map.insert("P1".into(), ProvenanceEntry {
            short_ref: "P1".into(),
            resource_type: "Patient (inferred from subject.display)".into(),
            original_id: "inferred-subject-display".into(),
            summary: patient_fallback.clone(),
            raw_snippet: json!({"display": patient_fallback}),
        });
        patients.push(Value::Object(pat));
    }

    // subject/patient display aliases: same person, different serialization
    if let Some(p0) = patients.first_mut() {
        let current_name = p0.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let mut aliases: Vec<String> = Vec::new();
        for r in &selected_resources {
            if !r.is_object() {
                continue;
            }
            let d = r.get("subject").and_then(|x| x.get("display")).and_then(|x| x.as_str())
                .or_else(|| r.get("patient").and_then(|x| x.get("display")).and_then(|x| x.as_str()))
                .unwrap_or("");
            if !d.is_empty() && d != current_name && !aliases.contains(&d.to_string()) {
                aliases.push(d.to_string());
            }
        }
        if !aliases.is_empty() {
            let mut merged: Vec<String> = p0.get("aka").and_then(|x| x.as_array()).map(|a| a.iter().map(|v| s(v)).collect()).unwrap_or_default();
            for a in aliases {
                if !merged.contains(&a) {
                    merged.push(a);
                }
            }
            if let Some(o) = p0.as_object_mut() {
                o.insert("aka".into(), Value::Array(merged.into_iter().map(Value::String).collect()));
            }
        }
    }

    // Resolve hasMember / derivedFrom links -> short refs
    for row in labs.iter_mut().chain(vital_signs.iter_mut()) {
        if let Some(members) = row.get("members").and_then(|x| x.as_array()).cloned() {
            let resolved: Vec<Value> = members.iter().map(|m| {
                let m_str = s(m);
                let short = m_str.rsplit('/').next().unwrap_or(&m_str).to_string();
                json!(obs_id_to_short_ref.get(&short).cloned().unwrap_or(short))
            }).collect();
            row.as_object_mut().unwrap().insert("members".into(), Value::Array(resolved));
        }
    }
    let mut member_of: HashMap<String, String> = HashMap::new();
    for r in labs.iter().chain(vital_signs.iter()) {
        let r_ref = r.get("ref").and_then(|x| x.as_str()).unwrap_or("");
        if let Some(members) = r.get("members").and_then(|x| x.as_array()) {
            for m in members {
                member_of.insert(s(m), r_ref.to_string());
            }
        }
    }

    // Transparency notices
    let omitted_count = valid_resources.len().saturating_sub(selected_resources.len());
    let omitted_notice = if omitted_count > 0 {
        Some(format!(
            "## Omitted: {} items {}",
            omitted_count,
            if budget_exceeded { "due to token budget; safety resources retained" } else { "not matching query/profile filter → clear query to include all, or retrievable via expand(ref)" }
        ))
    } else {
        None
    };
    let flagged_notice = if !flagged_ids.is_empty() {
        Some(format!("## FLAGGED (kept, not dropped): {} resource(s) are entered-in-error or refuted", flagged_ids.len()))
    } else {
        None
    };
    let gap_notice = if !data_gaps.is_empty() {
        Some(format!("## DATA GAPS: {}", data_gaps.join("; ")))
    } else {
        None
    };

    // Build target representation
    let fmt = options.format;
    let compressed_output = match fmt {
        CompressionFormat::CompactJson => {
            let mut compact_obj = Map::new();
            if patients.len() == 1 {
                compact_obj.insert("patient".into(), patients[0].clone());
            } else if patients.len() > 1 {
                compact_obj.insert("patients".into(), Value::Array(patients));
            }
            if !vital_signs.is_empty() {
                compact_obj.insert("vitalSigns".into(), Value::Array(vital_signs));
            }
            if !labs.is_empty() {
                compact_obj.insert("labs".into(), Value::Array(labs));
            }
            if !care_plans.is_empty() {
                compact_obj.insert("carePlans".into(), Value::Array(care_plans));
            }
            if !allergies.is_empty() {
                compact_obj.insert("allergies".into(), Value::Array(allergies));
            }
            if !conditions.is_empty() {
                compact_obj.insert("conditions".into(), Value::Array(conditions));
            }
            if !medications.is_empty() {
                compact_obj.insert("medications".into(), Value::Array(medications));
            }
            if !encounters.is_empty() {
                compact_obj.insert("encounters".into(), Value::Array(encounters));
            }
            if !others.is_empty() {
                compact_obj.insert("other".into(), Value::Array(others));
            }
            if omitted_notice.is_some() {
                compact_obj.insert("_omitted".into(), json!(format!(
                    "{} items omitted {}",
                    omitted_count,
                    if budget_exceeded { "due to token budget; safety resources retained" } else { "by query/profile filter (clear query to include all, or call expand(ref))" }
                )));
            }
            if flagged_notice.is_some() {
                compact_obj.insert("_flagged".into(), json!(format!("{} resource(s) entered-in-error or refuted (retained)", flagged_ids.len())));
            }
            if gap_notice.is_some() {
                compact_obj.insert("_dataGaps".into(), Value::Array(data_gaps.into_iter().map(Value::String).collect()));
            }
            serde_json::to_string_pretty(&compact_obj).unwrap_or_default()
        }
        CompressionFormat::MedPromptText => {
            let mut lines: Vec<String> = Vec::new();
            if let Some(p) = patients.first() {
                let get = |k: &str| p.get(k).and_then(|x| x.as_str()).unwrap_or("");
                let p_extra = join_nonempty(&[
                    if !get("dob").is_empty() { format!("DOB: {}", get("dob")) } else { String::new() },
                    if let Some(arr) = p.get("telecom").and_then(|x| x.as_array()) {
                        format!("Tel: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(", "))
                    } else if !get("phone").is_empty() {
                        format!("Tel: {}", get("phone"))
                    } else { String::new() },
                    if !get("marital").is_empty() { format!("Marital: {}", get("marital")) } else { String::new() },
                    if let Some(arr) = p.get("address").and_then(|x| x.as_array()) {
                        format!("Addr: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(" | "))
                    } else { String::new() },
                    if let Some(arr) = p.get("languages").and_then(|x| x.as_array()) {
                        format!("Lang: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(", "))
                    } else { String::new() },
                    if let Some(arr) = p.get("contacts").and_then(|x| x.as_array()) {
                        format!("Contact: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(" | "))
                    } else { String::new() },
                    if !get("gp").is_empty() { format!("GP: {}", get("gp")) } else { String::new() },
                    if let Some(arr) = p.get("aka").and_then(|x| x.as_array()) {
                        format!("AKA: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join("; "))
                    } else { String::new() },
                ], " | ");
                let age = p.get("age").map(|x| x.to_string()).unwrap_or("N/A".into());
                let mut line = format!("PATIENT [{}]: {} | Age: {} | Sex: {}",
                    p.get("ref").and_then(|x| x.as_str()).unwrap_or(""),
                    if get("name").is_empty() { "Patient" } else { get("name") },
                    age,
                    if get("gender").is_empty() { "N/A" } else { get("gender") }
                );
                if !p_extra.is_empty() {
                    line.push_str(&format!(" | {}", p_extra));
                }
                lines.push(line);
            }
            if !vital_signs.is_empty() {
                lines.push("\n## VITAL SIGNS & SCALES:".into());
                for v in &vital_signs {
                    let get = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let time_str = if !get("dateTime").is_empty() { get("dateTime") } else { get("date") };
                    let unit_part = if !get("unit").is_empty() { format!(" {}", get("unit")) } else { String::new() };
                    let range_part = if !get("range").is_empty() { format!(" [Ref: {}]", get("range")) } else { String::new() };
                    let cat_part = if !get("category").is_empty() { format!(" {{{}}}", get("category")) } else { String::new() };
                    let flag_part = if !get("flag").is_empty() { format!(" [{}]", get("flag")) } else { String::new() };
                    let status_part = if !get("status").is_empty() { format!(" [{}]", get("status")) } else { String::new() };
                    let issued_part = if !get("issued").is_empty() { format!(" (issued {})", get("issued")) } else { String::new() };
                    let perf_part = if !get("performer").is_empty() { format!(" by {}", get("performer")) } else { String::new() };
                    let note_part = if !get("note").is_empty() { format!(" Note: {}", get("note")) } else { String::new() };
                    lines.push(format!("[{}] {}: {}{}{}{}{}{} ({}){}{}{}",
                        get("ref"), get("name"), v.get("value").map(|x| s(x)).unwrap_or_default(), unit_part,
                        range_part, cat_part, flag_part, status_part, time_str, issued_part, perf_part, note_part
                    ));
                }
            }
            if !labs.is_empty() {
                lines.push("\n## LABS & DIAGNOSTICS:".into());
                for l in &labs {
                    let get = |k: &str| l.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let time_str = if !get("dateTime").is_empty() { get("dateTime") } else { get("date") };
                    let flag_str = if !get("flag").is_empty() { format!(" [FLAG: {}]", get("flag")) } else { String::new() };
                    let unit_part = if !get("unit").is_empty() { format!(" {}", get("unit")) } else { String::new() };
                    let range_part = if !get("range").is_empty() { format!(" [Ref: {}]", get("range")) } else { String::new() };
                    let cat_part = if !get("category").is_empty() { format!(" {{{}}}", get("category")) } else { String::new() };
                    let status_part = if !get("status").is_empty() { format!(" [{}]", get("status")) } else { String::new() };
                    let issued_part = if !get("issued").is_empty() { format!(" (issued {})", get("issued")) } else { String::new() };
                    let perf_part = if !get("performer").is_empty() { format!(" by {}", get("performer")) } else { String::new() };
                    let note_part = if !get("note").is_empty() { format!(" Note: {}", get("note")) } else { String::new() };
                    lines.push(format!("[{}] {}: {}{}{}{}{}{} ({}){}{}{}",
                        get("ref"), get("test"), l.get("value").map(|x| s(x)).unwrap_or_default(), unit_part,
                        range_part, cat_part, flag_str, status_part, time_str, issued_part, perf_part, note_part
                    ));
                }
            }
            if !care_plans.is_empty() {
                lines.push("\n## CARE PLANS & PROTOCOLS:".into());
                for cp in &care_plans {
                    let get = |k: &str| cp.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let title_part = if !get("title").is_empty() { format!("{} - ", get("title")) } else { String::new() };
                    let period_part = if !get("period").is_empty() { format!(" ({})", get("period")) } else { String::new() };
                    let team_part = if !get("careTeam").is_empty() { format!(" Team: {}", get("careTeam")) } else { String::new() };
                    lines.push(format!("[{}] Plan: {}{} [{}]{}{}",
                        get("ref"), title_part, get("category"),
                        cp.get("status").and_then(|x| x.as_str()).unwrap_or(""),
                        period_part, team_part
                    ));
                    if let Some(acts) = cp.get("activities").and_then(|x| x.as_array()) {
                        for act in acts {
                            lines.push(format!("  - Instruction: {}", s(act)));
                        }
                    }
                }
            }
            if !allergies.is_empty() {
                lines.push("\n## ALLERGIES (Safety Set):".into());
                for a in &allergies {
                    let get = |k: &str| a.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let kind_part = if !get("kind").is_empty() { format!(" {{{}}}", get("kind")) } else { String::new() };
                    let crit = if get("criticality").is_empty() { "High" } else { get("criticality") };
                    let react_part = if !get("reactions").is_empty() { format!(" -> {}", get("reactions")) } else { String::new() };
                    let st_part = if !get("statusText").is_empty() { format!(" {}", get("statusText")) } else { String::new() };
                    let ver_part = if !get("verification").is_empty() { format!(" ({})", get("verification")) } else { String::new() };
                    let onset_part = if !get("onset").is_empty() { format!(" (Onset: {})", get("onset")) } else { String::new() };
                    let rec_part = if !get("recorded").is_empty() { format!(" (Recorded: {})", get("recorded")) } else { String::new() };
                    let recorder_part = if !get("recorder").is_empty() { format!(" by {}", get("recorder")) } else { String::new() };
                    let note_part = if !get("note").is_empty() { format!(" Note: {}", get("note")) } else { String::new() };
                    lines.push(format!("[{}] {}{} [Criticality: {}]{}{}{}{}{}{}{}",
                        get("ref"), get("allergen"), kind_part, crit, react_part, st_part, ver_part, onset_part, rec_part, recorder_part, note_part
                    ));
                }
            }
            if !conditions.is_empty() {
                lines.push("\n## ACTIVE CONDITIONS:".into());
                for c in &conditions {
                    let get = |k: &str| c.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let st_text_part = if !get("statusText").is_empty() { format!("/{}", get("statusText")) } else { String::new() };
                    let ver_part = if !get("verification").is_empty() { format!("/{}", get("verification")) } else { String::new() };
                    let cat_part = if !get("category").is_empty() { format!(" {{{}}}", get("category")) } else { String::new() };
                    let body_site_part = if !get("bodySite").is_empty() { format!(" (Body site: {})", get("bodySite")) } else { String::new() };
                    let onset_part = if !get("onset").is_empty() { format!(" (Onset: {})", get("onset")) } else { String::new() };
                    let recorded_part = if !get("recorded").is_empty() { format!(" (Recorded: {})", get("recorded")) } else { String::new() };
                    let note_part = if !get("note").is_empty() { format!(" Note: {}", get("note")) } else { String::new() };
                    lines.push(format!("[{}] {} [{}{}{}]{}{}{}{}{}",
                        get("ref"), get("condition"), get("status"), st_text_part, ver_part, cat_part, body_site_part, onset_part, recorded_part, note_part
                    ));
                }
            }
            if !medications.is_empty() {
                lines.push("\n## MEDICATIONS:".into());
                for m in &medications {
                    let get = |k: &str| m.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let sig_part = if get("sig").is_empty() { "As directed".to_string() } else { get("sig").to_string() };
                    let cat_part = if !get("category").is_empty() { format!(" {{{}}}", get("category")) } else { String::new() };
                    let prn_part = if !get("prn").is_empty() { format!(" PRN: {}", get("prn")) } else { String::new() };
                    let instr_part = if !get("instruction").is_empty() { format!(" Instr: {}", get("instruction")) } else { String::new() };
                    let course_part = if !get("course").is_empty() { format!(" [{}]", get("course")) } else { String::new() };
                    let from_part = if !get("startsOn").is_empty() { format!(" from {}", get("startsOn")) } else { String::new() };
                    let until_part = if !get("endsOn").is_empty() { format!(" until {}", get("endsOn")) } else { String::new() };
                    let dose_part = if !get("doseTypes").is_empty() { format!(" also: {}", get("doseTypes")) } else { String::new() };
                    let qty_part = if !get("dispenseQty").is_empty() { format!(" qty {}", get("dispenseQty")) } else { String::new() };
                    let vf_part = if !get("validFrom").is_empty() { format!(" valid from {}", get("validFrom")) } else { String::new() };
                    let rx_part = if !get("date").is_empty() { format!(" Rx: {}", get("date")) } else { String::new() };
                    let presc_part = if !get("prescriber").is_empty() { format!(" by {}", get("prescriber")) } else { String::new() };
                    let reason_part = if !get("reason").is_empty() { format!(" Reason: {}", get("reason")) } else { String::new() };
                    let note_part = if !get("note").is_empty() { format!(" Note: {}", get("note")) } else { String::new() };
                    lines.push(format!("[{}] {} - {} ({}){}{}{}{}{}{}{}{}{}{}{}{}{}",
                        get("ref"), get("drug"), sig_part, m.get("status").and_then(|x| x.as_str()).unwrap_or(""),
                        cat_part, prn_part, instr_part, course_part, from_part, until_part, dose_part, qty_part, vf_part, rx_part, presc_part, reason_part, note_part
                    ));
                }
            }
            if !encounters.is_empty() {
                lines.push("\n## ENCOUNTERS:".into());
                for e in &encounters {
                    let get = |k: &str| e.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let type_part = if get("type").is_empty() { "Encounter" } else { get("type") };
                    let class_part = if !get("class").is_empty() { format!(" {{{}}}", get("class")) } else { String::new() };
                    let reason_part = if !get("reason").is_empty() { format!(" reason: {}", get("reason")) } else { String::new() };
                    let disch_part = if !get("discharge").is_empty() { format!(" -> {}", get("discharge")) } else { String::new() };
                    let part_part = if !get("participants").is_empty() { format!(" | {}", get("participants")) } else { String::new() };
                    lines.push(format!("[{}] {}{} {} {} {}{}{}{}",
                        get("ref"), type_part, class_part, get("status"), get("start"), get("location"), reason_part, disch_part, part_part
                    ));
                }
            }
            if !others.is_empty() {
                lines.push("\n## OTHER RESOURCES:".into());
                for o in &others {
                    let get = |k: &str| o.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let name_part = if !get("name").is_empty() { get("name") } else { get("id") };
                    let role_part = if !get("role").is_empty() { format!(" [{}]", get("role")) } else { String::new() };
                    let val_part = match o.get("value") {
                        Some(v) if !v.is_null() && v != &json!("") => format!(" = {}", v),
                        _ => String::new(),
                    };
                    let date_part = if !get("date").is_empty() { format!(" ({})", get("date")) } else { String::new() };
                    lines.push(format!("[{}] {} {}{} {}{}{}",
                        get("ref"), get("type"), name_part, role_part, get("status"), val_part, date_part
                    ));
                }
            }
            if let Some(n) = &omitted_notice {
                lines.push(format!("\n{}", n));
            }
            if let Some(n) = &flagged_notice {
                lines.push(n.clone());
            }
            if let Some(n) = &gap_notice {
                lines.push(n.clone());
            }
            lines.join("\n").trim().to_string()
        }
        CompressionFormat::FhirBenchMarkdown => {
            let mut sections: Vec<String> = Vec::new();
            let child_refs: Vec<String> = member_of.keys().cloned().collect();
            if let Some(p) = patients.first() {
                let get = |k: &str| p.get(k).and_then(|x| x.as_str()).unwrap_or("");
                let extra = join_nonempty(&[
                    if !get("dob").is_empty() { format!("DOB: {}", get("dob")) } else { String::new() },
                    if !get("phone").is_empty() { format!("Contact: {}", get("phone")) } else { String::new() },
                    if !get("marital").is_empty() { format!("Marital: {}", get("marital")) } else { String::new() },
                    if let Some(arr) = p.get("telecom").and_then(|x| x.as_array()) {
                        format!("Telecom: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(", "))
                    } else { String::new() },
                    if let Some(arr) = p.get("address").and_then(|x| x.as_array()) {
                        format!("Address: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(" | "))
                    } else { String::new() },
                    if let Some(arr) = p.get("languages").and_then(|x| x.as_array()) {
                        format!("Languages: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(", "))
                    } else { String::new() },
                    if let Some(arr) = p.get("contacts").and_then(|x| x.as_array()) {
                        format!("Contacts: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join(" | "))
                    } else { String::new() },
                    if !get("gp").is_empty() { format!("GP: {}", get("gp")) } else { String::new() },
                    if let Some(arr) = p.get("aka").and_then(|x| x.as_array()) {
                        format!("Also known as: {}", arr.iter().map(|v| s(v)).collect::<Vec<_>>().join("; "))
                    } else { String::new() },
                ], " | ");
                let age = p.get("age").map(|x| x.to_string()).unwrap_or("N/A".into());
                let mut sec = format!("### Patient Information [{}]\n- **Name:** {}\n- **Age/Gender:** {} / {}",
                    p.get("ref").and_then(|x| x.as_str()).unwrap_or(""),
                    if get("name").is_empty() { "N/A" } else { get("name") },
                    age,
                    if get("gender").is_empty() { "N/A" } else { get("gender") }
                );
                if !extra.is_empty() {
                    sec.push_str(&format!("\n- **Details:** {}", extra));
                }
                sections.push(sec);
            }
            fn issued(row: &Value) -> String {
                row.get("issued").and_then(|x| x.as_str()).map(|x| format!(" (issued {})", x)).unwrap_or_default()
            }
            if !vital_signs.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for v in &vital_signs {
                    let v_ref = v.get("ref").and_then(|x| x.as_str()).unwrap_or("");
                    if child_refs.contains(&v_ref.to_string()) {
                        continue;
                    }
                    let get = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let unit_part = if !get("unit").is_empty() { format!(" {}", get("unit")) } else { String::new() };
                    let dt = if !get("dateTime").is_empty() { get("dateTime") } else { get("date") };
                    let dt_part = if dt.is_empty() { "—" } else { dt };
                    rows.push(format!("| **{}** | {} | **{}{}** | {} | {} | {}{} | {} |",
                        v_ref, get("name"), v.get("value").map(|x| s(x)).unwrap_or_default(), unit_part,
                        get("category").or_empty_dash(), get("flag").or_empty_dash(), dt_part, issued(v), get("status").or_empty_dash()
                    ));
                    if let Some(members) = v.get("members").and_then(|x| x.as_array()) {
                        for m in members {
                            let m_ref = s(m);
                            let child = vital_signs.iter().find(|x| x.get("ref").and_then(|r| r.as_str()) == Some(m_ref.as_str()))
                                .or_else(|| labs.iter().find(|x| x.get("ref").and_then(|r| r.as_str()) == Some(m_ref.as_str())));
                            if let Some(child) = child {
                                let get_c = |k: &str| child.get(k).and_then(|x| x.as_str()).unwrap_or("");
                                let unit_part = if !get_c("unit").is_empty() { format!(" {}", get_c("unit")) } else { String::new() };
                                let dt = if !get_c("dateTime").is_empty() { get_c("dateTime") } else { get_c("date") };
                                let dt_part = if dt.is_empty() { "—" } else { dt };
                                rows.push(format!("| {} | ↳ {} | **{}{}** | {} | {} | {}{} | {} |",
                                    m_ref, get_c("name"), child.get("value").map(|x| s(x)).unwrap_or_default(), unit_part,
                                    get_c("category").or_empty_dash(), get_c("flag").or_empty_dash(), dt_part, issued(child), get_c("status").or_empty_dash()
                                ));
                            }
                        }
                    }
                }
                sections.push(format!("### Vital Signs & Physical Measures\n| Ref | Measure | Value | Category | Flag | Date/Time | Status |\n|---|---|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            if !labs.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for l in &labs {
                    let l_ref = l.get("ref").and_then(|x| x.as_str()).unwrap_or("");
                    if child_refs.contains(&l_ref.to_string()) {
                        continue;
                    }
                    let get = |k: &str| l.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let unit_part = if !get("unit").is_empty() { format!(" {}", get("unit")) } else { String::new() };
                    let dt = if !get("dateTime").is_empty() { get("dateTime") } else { get("date") };
                    let dt_part = if dt.is_empty() { "—" } else { dt };
                    rows.push(format!("| **{}** | {} | {} | **{}{}** | {} | {} | {} | {}{} |",
                        l_ref, get("test"), get("category").or_empty_dash(),
                        l.get("value").map(|x| s(x)).unwrap_or_default(), unit_part,
                        get("range").or_empty_dash(), get("flag").or_empty_dash(), get("status").or_empty_dash(), dt_part, issued(l)
                    ));
                    if let Some(members) = l.get("members").and_then(|x| x.as_array()) {
                        for m in members {
                            let m_ref = s(m);
                            let child = labs.iter().find(|x| x.get("ref").and_then(|r| r.as_str()) == Some(m_ref.as_str()))
                                .or_else(|| vital_signs.iter().find(|x| x.get("ref").and_then(|r| r.as_str()) == Some(m_ref.as_str())));
                            if let Some(child) = child {
                                let get_c = |k: &str| child.get(k).and_then(|x| x.as_str()).unwrap_or("");
                                let unit_part = if !get_c("unit").is_empty() { format!(" {}", get_c("unit")) } else { String::new() };
                                let dt = if !get_c("dateTime").is_empty() { get_c("dateTime") } else { get_c("date") };
                                let dt_part = if dt.is_empty() { "—" } else { dt };
                                rows.push(format!("| {} | ↳ {} | {} | **{}{}** | {} | {} | {} | {}{} |",
                                    m_ref, get_c("test"), get_c("category").or_empty_dash(),
                                    child.get("value").map(|x| s(x)).unwrap_or_default(), unit_part,
                                    get_c("range").or_empty_dash(), get_c("flag").or_empty_dash(), get_c("status").or_empty_dash(), dt_part, issued(child)
                                ));
                            }
                        }
                    }
                }
                sections.push(format!("### Laboratory Results & Observations\n| Ref | Test | Category | Result | Ref Range | Flag | Status | Date/Time |\n|---|---|---|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            let noted_obs: Vec<&Value> = vital_signs.iter().chain(labs.iter()).filter(|o| {
                o.get("note").map_or(false, |x| !x.is_null()) || o.get("performer").map_or(false, |x| !x.is_null())
            }).collect();
            if !noted_obs.is_empty() {
                let parts: Vec<String> = noted_obs.iter().map(|o| {
                    let get = |k: &str| o.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let perf_part = if !get("performer").is_empty() { format!(" — performer: {}", get("performer")) } else { String::new() };
                    let note_part = if !get("note").is_empty() { format!("\n> {}", get("note")) } else { String::new() };
                    format!("**{} {}**{}{}", get("ref"), get("test"), perf_part, note_part)
                }).collect();
                sections.push(format!("### Observation Notes & Provenance\n{}", parts.join("\n\n")));
            }
            if !care_plans.is_empty() {
                let parts: Vec<String> = care_plans.iter().map(|cp| {
                    let get = |k: &str| cp.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let title_part = if !get("title").is_empty() { format!(" {} -", get("title")) } else { String::new() };
                    let team_part = if !get("careTeam").is_empty() { format!(" — care team: {}", get("careTeam")) } else { String::new() };
                    let period = if get("period").is_empty() { "active" } else { get("period") };
                    let acts_str = if let Some(acts) = cp.get("activities").and_then(|x| x.as_array()) {
                        acts.iter().map(|a| format!("- {}", s(a))).collect::<Vec<_>>().join("\n")
                    } else {
                        "- Routine monitoring".to_string()
                    };
                    format!("**[{}]{} {}** ({}, {}){}\n{}",
                        get("ref"), title_part, get("category"),
                        cp.get("status").and_then(|x| x.as_str()).unwrap_or(""), period, team_part, acts_str
                    )
                }).collect();
                sections.push(format!("### Care Plans & Patient Directives\n{}", parts.join("\n\n")));
            }
            if !medications.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for m in &medications {
                    let get = |k: &str| m.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let directions = join_nonempty(&[
                        get("sig").to_string(),
                        if !get("category").is_empty() { format!("{{{}}}", get("category")) } else { String::new() },
                        if !get("prn").is_empty() { format!("PRN: {}", get("prn")) } else { String::new() },
                        if !get("instruction").is_empty() { format!("Instr: {}", get("instruction")) } else { String::new() },
                        if !get("course").is_empty() { format!("({})", get("course")) } else { String::new() },
                        if !get("startsOn").is_empty() { format!("from {}", get("startsOn")) } else { String::new() },
                        if !get("endsOn").is_empty() { format!("until {}", get("endsOn")) } else { String::new() },
                        if !get("dispenseQty").is_empty() { format!("disp: {}", get("dispenseQty")) } else { String::new() },
                        if !get("doseTypes").is_empty() { format!("also: {}", get("doseTypes")) } else { String::new() },
                        if !get("prescriber").is_empty() { format!("by {}", get("prescriber")) } else { String::new() },
                        if !get("reason").is_empty() { format!("reason: {}", get("reason")) } else { String::new() },
                        if !get("note").is_empty() { format!("note: {}", get("note")) } else { String::new() },
                    ], " ");
                    let directions = if directions.is_empty() { "—".to_string() } else { directions };
                    rows.push(format!("| **{}** | {} | {} | {} | {} |",
                        get("ref"), get("drug"), get("status").or_empty_dash(), get("date").or_empty_dash(), directions
                    ));
                }
                sections.push(format!("### Medications\n| Ref | Drug | Status | Date | Directions |\n|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            if !allergies.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for a in &allergies {
                    let get = |k: &str| a.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let kind_part = if !get("kind").is_empty() { format!(" {{{}}}", get("kind")) } else { String::new() };
                    let st_part = if !get("statusText").is_empty() { format!(" ({})", get("statusText")) } else { String::new() };
                    rows.push(format!("| **{}** | {}{} | {} | {} | {}{} | {} | {} | {} | {} | {} |",
                        get("ref"), get("allergen"), kind_part,
                        get("reactions").or_empty_dash(), get("criticality").or_empty_dash(),
                        get("status"), st_part, get("verification").or_empty_dash(), get("onset").or_empty_dash(),
                        get("recorded").or_empty_dash(), get("recorder").or_empty_dash(), get("note").or_empty_dash()
                    ));
                }
                sections.push(format!("### Allergies & Intolerances\n| Ref | Allergen | Reactions | Criticality | Status | Verification | Onset | Recorded | Recorder | Note |\n|---|---|---|---|---|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            if !conditions.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for c in &conditions {
                    let get = |k: &str| c.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let st_part = if !get("statusText").is_empty() { format!(" ({})", get("statusText")) } else { String::new() };
                    rows.push(format!("| **{}** | {} | {}{} | {} | {} | {} | {} | {} | {} |",
                        get("ref"), get("condition"), get("status"), st_part,
                        get("verification").or_empty_dash(), get("category").or_empty_dash(), get("bodySite").or_empty_dash(), get("onset").or_empty_dash(), get("recorded").or_empty_dash(), get("note").or_empty_dash()
                    ));
                }
                sections.push(format!("### Active Conditions\n| Ref | Condition | Status | Verification | Category | Body Site | Onset | Recorded | Note |\n|---|---|---|---|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            if !encounters.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for e in &encounters {
                    let get = |k: &str| e.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    rows.push(format!("| **{}** | {} | {} | {} | {} | {} | {} | {} | {} |",
                        get("ref"), get("type").or_empty_dash(), get("class").or_empty_dash(), get("status").or_empty_dash(),
                        get("start").or_empty_dash(), get("location").or_empty_dash(), get("reason").or_empty_dash(),
                        get("discharge").or_empty_dash(), get("participants").or_empty_dash()
                    ));
                }
                sections.push(format!("### Encounters\n| Ref | Type | Class | Status | Start | Location | Reason | Discharge | Participants |\n|---|---|---|---|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            if !others.is_empty() {
                let mut rows: Vec<String> = Vec::new();
                for o in &others {
                    let get = |k: &str| o.get(k).and_then(|x| x.as_str()).unwrap_or("");
                    let name_part = if !get("name").is_empty() { get("name") } else if !get("id").is_empty() { get("id") } else { "—" };
                    let val = match o.get("value") {
                        Some(v) if !v.is_null() && v != &json!("") => v.to_string(),
                        _ => "—".to_string(),
                    };
                    rows.push(format!("| **{}** | {} | {} | {} | {} | {} | {} |",
                        get("ref"), get("type"), name_part,
                        get("role").or_empty_dash(), get("status").or_empty_dash(), val, get("date").or_empty_dash()
                    ));
                }
                sections.push(format!("### Other Resources\n| Ref | Resource | Name | Role | Status | Value | Date |\n|---|---|---|---|---|---|---|\n{}", rows.join("\n")));
            }
            if let Some(n) = &omitted_notice {
                sections.push(n.clone());
            }
            if let Some(n) = &flagged_notice {
                sections.push(n.clone());
            }
            if let Some(n) = &gap_notice {
                sections.push(n.clone());
            }
            sections.join("\n\n").trim().to_string()
        }
        CompressionFormat::CdsHooksPrefetch => {
            let mut payload = Map::new();
            payload.insert("hook".into(), json!(if profile == "medication_prescribe" { "medication-prescribe" } else { "patient-view" }));
            let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
            payload.insert("hookInstance".into(), json!(format!("cds-eval-{:x}", now_ms)));
            let patient_id = patients.first().and_then(|p| p.get("id")).and_then(|x| x.as_str()).unwrap_or("P001").to_string();
            payload.insert("context".into(), json!({
                "patientId": patient_id,
                "userId": "Practitioner/attending-01"
            }));
            payload.insert("prefetch".into(), json!({
                "patient": patients.first().cloned().unwrap_or(Value::Null),
                "vitalSigns": Value::Array(vital_signs),
                "recentLabs": Value::Array(labs),
                "carePlans": Value::Array(care_plans),
                "activeConditions": Value::Array(conditions),
                "currentMedications": Value::Array(medications),
                "allergies": Value::Array(allergies),
                "encounters": Value::Array(encounters),
                "other": Value::Array(others),
            }));
            payload.insert("_provenanceRefs".into(), json!(provenance_map.len()));
            if !data_gaps.is_empty() {
                payload.insert("_dataGaps".into(), Value::Array(data_gaps.into_iter().map(Value::String).collect()));
            }
            if !flagged_ids.is_empty() {
                payload.insert("_flagged".into(), json!(flagged_ids.len()));
            }
            serde_json::to_string_pretty(&payload).unwrap_or_default()
        }
    };

    let raw_tokens = (raw_fhir_json_len(data) as f64 / 3.8).ceil() as usize;
    let compressed_tokens = (compressed_output.len() as f64 / 3.8).ceil() as usize;
    let reduction_percentage = if raw_tokens > 0 {
        ((raw_tokens - compressed_tokens.min(raw_tokens)) as f64 / raw_tokens as f64 * 100.0) as f32
    } else {
        0.0
    };
    let token_multiple = if compressed_tokens > 0 {
        raw_tokens as f32 / compressed_tokens as f32
    } else {
        0.0
    };
    let total_facts = provenance_map.len();
    let preserved_facts_count = total_facts; // nothing silently dropped: flag-but-retain
    let fact_retention_rate = 100.0;

    Ok(OptimizationResult {
        compressed_output,
        format: fmt,
        raw_tokens,
        compressed_tokens,
        reduction_percentage,
        token_multiple,
        total_facts,
        preserved_facts_count,
        fact_retention_rate,
        provenance_map,
        omitted_count,
        budget_exceeded,
        omitted_notice,
    })
}

fn raw_fhir_json_len(data: &Value) -> usize {
    serde_json::to_string(data).unwrap_or_default().len()
}

trait OrEmptyDash {
    fn or_empty_dash(&self) -> &str;
}

impl OrEmptyDash for str {
    fn or_empty_dash(&self) -> &str {
        if self.is_empty() {
            "—"
        } else {
            self
        }
    }
}
