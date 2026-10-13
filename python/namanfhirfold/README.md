# namanfhirfold 🐍

> **Optimize clinical context for fewer tokens.**

FHIR clinical-context/token optimization SDK for Python. Converts verbose EHR bundles into compact LLM-ready context while retaining the clinical fields covered by the supported contract and regression fixtures.

### Input and output

- Input: a FHIR R4 resource or Bundle as a Python `dict` or JSON string.
- Output: a compact `str` from `fold()`, or a `FoldResult` from `fold_with_provenance()` containing compact output, short references, and an in-process provenance map.
- Formats: `compact_json`, `medprompt_text`, `fhirbench_markdown`, and `cds_hooks_prefetch`.
- `token_budget=0` or `None` means unlimited selection; a positive budget emits an omission notice when resources cannot fit.

---

## ⚡ Quickstart

```bash
pip install namanfhirfold
```

```python
from namanfhirfold import fold, FoldOptions, CdsProfile

# 1. Raw FHIR Bundle (thousands of tokens)
with open("patient_bundle.json") as f:
    raw_bundle = f.read()

# 2. Optimize the clinical context for an LLM
compressed_output = fold(
    raw_bundle,
    profile=CdsProfile.VITALS_MONITOR,  # or MEDICATION_PRESCRIBE, PATIENT_VIEW, FREE_QUERY
    format="compact_json",               # or "medprompt_text", "markdown"
    safety_set_guaranteed=True
)

print(f"Compressed LLM Input:\n{compressed_output}")
```

---

## 🔓 Decompression: `expand(ref)`

Every fold emits a short reference per retained resource and can store the original
resource in the local provenance map for trusted expansion. The compact output is a
task-aware representation, not a substitute for the canonical FHIR source.

| Ref | Resource |
|---|---|
| `P1` | `Patient` (always one) |
| `V1`, `V2`, … | Vital-sign `Observation` |
| `O1`, `O2`, … | Other `Observation` (labs, etc.) |
| `M1`, … | `Medication` / `MedicationRequest` |
| `C1`, … | `Condition` |
| `A1`, … | `AllergyIntolerance` |
| `CP1`, … | `CarePlan` |

```python
from namanfhirfold import fold_with_provenance, expand

result = fold_with_provenance(raw_bundle)

print(result.output)       # compact, LLM-ready string
print(result.short_refs)   # e.g. ['P1', 'V1', 'O1', 'M1', 'C1', 'A1', 'CP1']

# Preferred: reuse the map you already hold
original = result.expand("O1")   # dict | None
print(original["id"])            # "obs-gluc"

# One-shot convenience (re-folds each call — prefer result.expand() in hot paths)
same = expand(raw_bundle, "O1")
```

> ⚠️ **Keep the map local.** The provenance map stores whole resources and can be as large as
> your input bundle. Send only `result.output` to the LLM; expand refs from your own process.
> Unknown refs return `None` instead of raising.

---

## 🚀 Publishing to PyPI

```bash
cd python/namanfhirfold
python -m pip install --upgrade build twine
python -m build
python -m twine upload dist/*
```

---

## 🛡️ License

MIT License. Designed for clinical systems and open healthcare innovation.
