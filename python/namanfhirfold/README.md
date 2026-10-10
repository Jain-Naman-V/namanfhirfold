# namanfhirfold 🐍

> **Fold the structure. Keep every detail.**

Task-aware FHIR R4 token compression engine for Python. Shrinks verbose EHR bundles by **85% to 94%** for OpenAI, Gemini, Anthropic Claude, LangChain, and LlamaIndex agents while strictly preserving clinical facts, codes, units, and ranges.

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

# 2. Fold the structure, keep every detail
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

Every fold emits a short reference per retained resource and stores the **full original
resource** in the provenance map, so the round-trip is lossless.

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
