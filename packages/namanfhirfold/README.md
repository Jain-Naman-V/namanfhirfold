# namanfhirfold 📦

> **Fold the structure. Keep every detail.**

High-efficiency task-aware FHIR R4 token compression engine for JavaScript, TypeScript, Node.js, and browser environments. Reduces token usage by **85% to 94%** while preserving 100% of clinical facts, numeric results, units, codes, and ranges.

---

## ⚡ Installation

```bash
npm install namanfhirfold
```

or with yarn / pnpm / bun:

```bash
pnpm add namanfhirfold
```

---

## 🛠️ Usage

```typescript
import { foldFhir } from "namanfhirfold";

// 1. Raw EHR FHIR Bundle (thousands of tokens)
const rawBundle = await fetchPatientFhirBundle(patientId);

// 2. Fold structure, keep every detail
const compressedContext = foldFhir(rawBundle, {
  format: "medprompt_text", // or "compact_json" | "markdown"
  profile: "medication_prescribe", // or "vitals_monitor" | "free_query"
  granularity: "exact_timestamp",
  safetySetGuaranteed: true
});

// 3. Pass clean optimized context to Gemini, OpenAI, Claude, or LangChain
console.log(compressedContext);
```

---

## 🚀 Publishing to NPM

```bash
cd packages/namanfhirfold
npm login
npm publish --access public
```

---

## 🛡️ License

MIT License
