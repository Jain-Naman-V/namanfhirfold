# Hyperframes Composition Brief: NamanFHIRFOLD

## Objective
Create a short launch-style brag video for NamanFHIRFOLD that shows the optimizer actually folding a real FHIR resource, and names every output format it produces.

## Output
- Composition directory: `/home/naman/Music/fhiroptimizer/brag-output-2026-10-11-110134/composition/`
- Rendered video: `/home/naman/Music/fhiroptimizer/brag-output-2026-10-11-110134/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24.2s (scene seams on the beat grid: 0 → 5.80 → 12.65 → 18.44 → 24.23)

## Source Material
- Project root: `/home/naman/Music/fhiroptimizer`
- Primary files read: `README.md`, `PRODUCT.md`, `index.html`, `src/index.css`, `src/components/SplitWorkbench.tsx`, `src/components/FhirTabularViewer.tsx`, `packages/namanfhirfold/src/fhirCompressor.ts`, `packages/namanfhirfold/src/fhir.ts`, `python/namanfhirfold/namanfhirfold/core.py`, `demovitalsspo2.json`
- Product name: NamanFHIRFOLD
- Tagline / strongest claim: "Fold the structure. Keep every detail." · "Input Tokens −85% to −94%" · "Fact Retention 100% goal"
- Key UI or visual moment to recreate: the **Split Workbench** — two dark panels (raw FHIR left, folded result right), a format dropdown, an emerald mono token-budget readout, and the fold/Run action. Recreate it faithfully from `src/components/SplitWorkbench.tsx` (gray-900 panels, gray-800 borders, emerald-500/400 signal, blue-500 for CDS Hooks, purple-500 for free query, mono for every number).
- Copy that must appear verbatim:
  - "Presenting you NamanFHIRFOLD, developed by Naman Jain"
  - "Fold the structure. Keep every detail."
  - "github.com/Jain-Naman-V/namanfhirfold"

### Measured numbers to use on screen (run locally against `demovitalsspo2.json`, do not invent)
- Raw input: 5,634 characters → **1,483 tokens**
- `compact_json` → **67 tokens**, −95%, **22.1× fewer**, 1.4 ms
- `medprompt_text` → **22 tokens**, −99%, **67.4× fewer**
- `fhirbench_markdown` → **49 tokens**, −97%, **30.3× fewer**
- Fact retention **100% (2/2)** on every format
- Preserved fields: `in-alarm` interpretation, exact timestamp `2018-11-13T17:59:02-05:00`, LOINC `2708-6`, MDC code `MDC_PULS_OXIM_SAT_O2`, provenance ref `V1`
- Stripped (real `strippedFields`): `meta.profile/versionId/lastUpdated`, `text.div`, `coding[].system` URLs, `subject.reference`, `search.mode` + bundle wrapper

### Real folded output bytes (use exactly)
`compact_json`:
```
{
  "vitalSigns": [
    {
      "ref": "V1",
      "name": "MDC_PULS_OXIM_SAT_O2",
      "code": "urn:iso:std:iso:11073:10101:150456",
      "value": 79,
      "unit": "%",
      "dateTime": "2018-11-13T17:59:02-05:00",
      "flag": "in-alarm"
    }
  ]
}
```
`medprompt_text`:
```
## VITAL SIGNS & SCALES:
[V1] MDC_PULS_OXIM_SAT_O2: 79 % (2018-11-13T17:59:02-05:00)
```
`fhirbench_markdown`:
```
### Vital Signs & Physical Measures
| Ref | Measure | Value | Date/Time | Status |
|---|---|---|---|---|
| **V1** | MDC_PULS_OXIM_SAT_O2 | **79 %** | 2018-11-13T17:59:02-05:00 | Normal |
```
Demo source: HL7 PHD `Observation-numeric-spo2-alarm` (`https://build.fhir.org/ig/HL7/phd/branches/FHIR-R6/en/Observation-numeric-spo2-alarm.html`).

## Creative Direction
- Tone preset: polished
- Creative direction: clinical-instrument precision — near-black lab surface, one emerald signal color, mono data as the hero material
- Interpretation: 4 scenes with long holds; motion is fast-in / hold-out so mono data stays readable while cuts stay sharp. No decoration that does not carry product information.
- Angle: Show the fold, not the pitch. Load the real demo file, fold it on camera, then show the same folded data in the three formats the engine actually emits. Every number is measured from a real local run.
- Hook: the title lands hard in the first second ("Presenting you NamanFHIRFOLD, developed by Naman Jain") while the raw file fills the frame and its token counter climbs to 1,483.
- Outro / punchline: `expand(V1)` restores the original FHIR, then "Fold the structure. Keep every detail." with the name and repo.
- Avoid:
  - Generic SaaS language ("supercharge", "seamless", "empower")
  - Abstract filler visuals, color washes, particle systems
  - Unrelated visual redesign — this must read as the same product the README describes
  - Invented metrics — only the measured numbers above

## Visual Identity
- Background: `#030712` (gray-950); panels `#111827` (gray-900) with `#1f2937` (gray-800) borders
- Text: `#f9fafb` primary, `#9ca3af` muted, `#6b7280` dim code, `#374151` panel chrome
- Accent: `#10b981` (emerald-500) / `#34d399` (emerald-400); secondary chips `#3b82f6` (blue-500, CDS Hooks), `#a855f7` (purple-500, free query), used sparingly
- Display font: Inter (fallback system UI sans) — tight tracking, medium/bold
- Body font: JetBrains Mono (fallback `ui-monospace, SFMono-Regular, Menlo, monospace`) — every token count, ref, timestamp and code line
- Visual references from the project: Split Workbench two-pane layout and its format dropdown + token-budget readout; the emerald-on-dark chip language (`bg-emerald-500/10 border-emerald-500/40 text-emerald-300`); the tabular viewer's table styling for the FHIRBench card

## Storyboard
Use the storyboard in `/home/naman/Music/fhiroptimizer/brag-output-2026-10-11-110134/brag-plan.md` as the creative contract.

Scene summary:
1. Presenting / the raw cost — 5.80s — title lockup plus the real raw demo JSON in dim mono and a counter climbing to **1,483 tokens** with the caption "One SpO₂ alarm. 5,634 characters of FHIR."
2. The fold (centerpiece) — 6.85s — Split Workbench recreation; simulated click on the fold action; the real `compact_json` output snaps in; counter rolls **1,483 → 67**; **−95% · 22.1× fewer** badge locks; retention chips arrive one by one.
3. Three formats, one fold — 5.79s — "One fold. Three output formats." Three cards carrying the real output bytes for `compact_json` (67 tok), `medprompt_text` (22 tok), `fhirbench_markdown` (49 tok); footer `Rust core · npm · Python`.
4. Expand / tagline — 5.79s — `expand(V1) → restores original FHIR` types out; tagline "Fold the structure. / Keep every detail."; lockup `namanfhirfold` · `developed by Naman Jain` · `github.com/Jain-Naman-V/namanfhirfold`.

## Audio
- Audio role: sparse professional accents over a warm bed
- Audio arc: bed establishes under the title, stays low and quiet while mono data is on screen, lifts slightly for the three format cards, resolves into a quiet lockup
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (87.62s, ~114.84 BPM) — already copied to `composition/assets/music/`
- Music treatment: starts at 0 with a ~0.6s fade-in, sits low under code, slight lift into scene 3, clean fade-out across the final 1.5s (no cut-to-silence)
- Music cue guidance: bundled preset at `composition/assets/music/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.json` (`beats[]` + `strongCues[]`). Strong-cue locks targeted: **5.80s** (fold scene starts), **12.65s** (formats scene starts), **22.65s** (final lockup). Beat-grid sequential windows: retention chips 9.50 / 10.54 / 11.60s; format cards 13.18 / 14.22 / 15.28s. Treat as optional hints — readability wins.
- Audio-reactive treatment: subtle — emerald accent glow and the token-counter presence may breathe with bass/RMS; no waveform bars, no full-scene pulsing, no strobing
- Audio-coupled moments:
  - Scene 1 — token counter counting up to 1,483
  - Scene 2 — simulated fold-button press, then the −95% lock, then one tick per retention chip
  - Scene 3 — three format cards arriving one by one, then the platform footer
  - Scene 4 — typed characters on the `expand(V1)` line, soft final lock on the name
- SFX selection guidance: use `<skill-dir>/assets/sfx/sfx-analysis.md` as the selection guide; prefer low high-frequency-risk files. Key/press for the fold click, soft ticks for chips and cards, one low resolve for the −95% lock. No swoosh on every cut, no impact hit on the title.
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: music is already in `<output-dir>/composition/assets/music/`; Hyperframes copies any selected SFX into the same `assets/` tree.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project — the Split Workbench recreation is the centerpiece and must be recognizable.
- Keep all text readable in the final render: mono code at a size that survives 1080p, long holds on every line the viewer is expected to read.
- Keep the video within 15-25 seconds (target 24.2s).
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Ignore cues that hurt readability, scene pacing, or the product story.
- Lock at most 1–3 major moments to strong cues (5.80s, 12.65s, 22.65s).
- Use SFX to support motion and interaction; restraint when the edit is already busy.
- Honor the music fade-in and fade-out treatment.
- Consider the audio-reactive workflow for subtle glow/breath on emerald accents; skip it if extraction is unavailable and note that rather than blocking.
- Use local assets for audio and any required runtime/media dependencies.
- Run `hyperframes check` before render — it is brag's single gate.
- Keep creation and rendering local. Remote or publishing workflows require a separate explicit user request.
