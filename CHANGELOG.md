# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project ships three packages released together under one version:

| Package | Registry | Path |
| --- | --- | --- |
| `namanfhirfold` (Rust) | [crates.io](https://crates.io/crates/namanfhirfold) | `crates/namanfhirfold` |
| `namanfhirfold` (npm) | [npm](https://www.npmjs.com/package/namanfhirfold) | `packages/namanfhirfold` |
| `namanfhirfold` (Python) | [PyPI](https://pypi.org/project/namanfhirfold/) | `python/namanfhirfold` |

## [Unreleased]

### Added

- GitHub Actions CI (Rust, Python, TypeScript) and Dependabot configuration.

## [0.1.0] - 2026-10-11

First public release. Initial stable API across all three packages.

### Added

- **`fold` / `compressFhir` / `optimize`** — task-aware compression of a FHIR R4
  Bundle into an LLM-ready payload, targeting 85–94% token reduction while
  retaining clinical facts.
- **`expand`** — on-demand decompression. Every short reference (`P1`, `V1`,
  `O1`, `M1`, `C1`, `A1`, `CP1`) resolves back to the full original resource
  through a local provenance map.
- **Provenance map** — carried on every result
  (`OptimizationResult.provenance_map`, `CompressionResult.provenanceMap`,
  `FoldResult.provenance_map`) so no detail is lost by compression.
- **Short-ref listing** — Rust `short_refs(result)` and Python
  `FoldResult.short_refs` enumerate every reference in a result. TypeScript has
  no helper; use `Object.keys(result.provenanceMap)`.
- **CDS Hooks profiles** — `free_query`, `medication_prescribe`,
  `vitals_monitor`, `patient_view`, plus `acute_inpatient` in the Rust and
  TypeScript packages (Python 0.1.0 omits `acute_inpatient`).
- **Timestamp granularity** — `exact_timestamp` or `date_only`.
- **Vital-sign detection** — observations are classified by LOINC code and
  display-name hints and bucketed separately as vitals (`V{n}` refs), so a
  vitals-focused prompt can prefetch them alone. The classifier is public in
  Rust (`profiles::is_vital_sign`) and Python (`namanfhirfold.core.is_vital_sign`
  — not re-exported at package top level); TypeScript keeps it module-private.

### Package differences

The core behaviour is identical across languages; the public surface differs
slightly. Pin to this version and pick the names for your runtime:

| Concept | Rust | TypeScript | Python |
| --- | --- | --- | --- |
| Entry point | `optimize` | `compressFhir` | `fold` |
| Decompress | `expand` / `expand_from_result` | `expand` / `expandFromBundle` | `expand` / `expand_from_map` |
| List refs | `short_refs` | `Object.keys(result.provenanceMap)` | `FoldResult.short_refs` |
| Output key for vitals | `vitalSigns` | `vitalSigns` | `vital_signs` |
| Output key for observations | `observations` | `observations` | `observations` |
| CDS profiles | 5 (`acute_inpatient` included) | 5 (`acute_inpatient` included) | 4 (no `acute_inpatient`) |
| `compact_json` | ✅ | ✅ | ✅ |
| `medprompt_text` | ✅ | ✅ | ✅ |
| `fhirbench_markdown` | ✅ | ✅ | — (`markdown`) |
| `cds_hooks_prefetch` | ✅ | ✅ | — |
| `markdown` | — | — | ✅ |

### Notes

- **Provenance map size.** The map holds a full copy of every referenced
  resource, so it can approach the size of the input bundle. Keep it local to
  the process that compressed the bundle; do not ship it with the compressed
  payload.
- **Decompression is on demand, not self-contained.** The compressed payload is
  not a standalone codec — `expand` needs the provenance map produced by the
  matching `fold` call.
- **Clinical claims.** Token-reduction figures are benchmarks on sample bundles,
  not a guarantee for every input. This package is a data-transport utility; it
  is not a medical device and makes no diagnostic or treatment claims.

[Unreleased]: https://github.com/Jain-Naman-V/namanfhirfold/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Jain-Naman-V/namanfhirfold/releases/tag/v0.1.0
