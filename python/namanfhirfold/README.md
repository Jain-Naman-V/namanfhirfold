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
