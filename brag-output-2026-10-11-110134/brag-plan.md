# Brag Plan: NamanFHIRFOLD

## What is this app?
A task-aware FHIR → LLM context optimizer (Rust core, published as `namanfhirfold` on npm/PyPI) that folds a raw FHIR resource down by 95–99% in tokens while keeping every clinical fact and a provenance ref that can expand back to the original JSON.

## The angle
Show the fold, not the pitch. One real object — the HL7 PHD SpO₂ **alarm** Observation from `demovitalsspo2.json` — is 5,634 characters of FHIR scaffolding for a single number. The video loads that exact file, folds it in front of the viewer, and then shows the same folded data in the three output formats the engine actually emits. Every number on screen is measured, not written by hand: 1,483 → 67 tokens, −95%, 22.1× fewer, 100% fact retention (2/2), and the `in-alarm` flag plus the exact timestamp `2018-11-13T17:59:02-05:00` survive the fold.

## Hook (first 2-3 seconds)
The title lands hard and immediately — "Presenting you NamanFHIRFOLD, developed by Naman Jain" — and behind/beside it the raw demo file is already scrolling in dim mono, its token counter climbing to **1,483**. The hook is the size of the thing that is about to be destroyed.

## Key moments (the middle)
- **The fold itself** (centerpiece): a recreation of the Split Workbench — raw FHIR on the left, empty result pane on the right, a cursor pressing the fold action, and the compact JSON snapping into place. The counter rolls 1,483 → 67 and a **−95%** badge locks in.
- **What survived**: chips arrive one by one — `in-alarm` flag kept · exact timestamp kept · LOINC 2708-6 kept · ref `V1` · **100% fact retention (2/2)**. Deletion is the boring part; the retention is the brag.
- **Three formats, one fold**: three cards slide in carrying the *real* output bytes — compact JSON (67 tok), MedPrompt text (22 tok), FHIRBench markdown table (49 tok) — then a quiet footer: `Rust · npm · Python`.

## Outro / punchline
`expand(V1)` restores the original FHIR, line by line — the safety net, stated once. Then the tagline **"Fold the structure. Keep every detail."** with the name and repo. No CTA shout, no fake urgency.

## User flow worth showing
1. Load `demovitalsspo2.json` (a real PHD numeric SpO₂ alarm Observation).
2. Choose format + profile + token budget in the Split Workbench, then run the fold.
3. Read the folded result with its provenance ref, and expand `V1` back to full FHIR if needed.

## Tone
- Preset: polished
- Creative direction: clinical-instrument precision — near-black lab surface, one emerald signal color, mono data as the hero material
- Interpretation: fewer scenes, longer holds, confidence through restraint; motion is fast-in / hold-out so the data stays readable while the video still feels sharp

## Format: landscape — 1920x1080
## Duration: 24.2

## Visual identity (from the project)
- Background: `#030712` (gray-950) with panel surfaces `#111827` / `#1f2937`
- Accent: `#10b981` / `#34d399` (emerald-500/400) — the app's primary signal color
- Secondary: `#3b82f6` (blue-500, CDS Hooks) and `#a855f7` (purple-500, free query), used only as small mode chips
- Text: `#f9fafb` primary, `#9ca3af` muted, `#6b7280` dim code
- Display font: Inter (semi-bold/bold, tight tracking) — matches the site's sans UI
- Body/mono font: JetBrains Mono — the app's `font-mono` carries every token count, ref and code line
- Strongest visual element: the Split Workbench — two dark panels, a format dropdown, a token budget readout in emerald mono, and the folded result pane

## Share copy (draft)
Loaded a real FHIR SpO₂ alarm — 1,483 tokens. NamanFHIRFOLD folded it to 67 and kept every fact, including the alarm flag. Three output formats, one fold. Fold the structure. Keep every detail.

## Audio direction
- Role: sparse professional accents over a warm bed — a precision instrument, not a hype reel
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (~114.8 BPM, cue preset available)
- Music treatment: start at 0, gentle fade-in over the first 0.6s, bed sits low under mono data, slight lift into the format cards, clean fade-out across the final 1.5s
- Music cue guidance: preset read from bundled `cues/…-vol-11.music-cues.md`; target strong beats **5.80s** (fold scene starts), **12.65s** (format scene starts), **18.56s** (outro tagline), **22.65s / 24.23s** (final lockup). Beat-grid windows for sequential reveals: fold-result chips inside 8.96–12.65s (snap to every other beat); format cards inside 12.65–18.44s. Restraint: keep the bed quiet while mono code is on screen so the numbers read.
- Audio-reactive treatment: subtle — emerald accent glow and the token counter may breathe with bass energy; no waveform bars, no full-scene pulsing
- SFX posture: sparse — a soft key/press for the fold action, one tick per chip arrival, one low resolve on the −95% lock
- Audio-coupled moments: token counter counting down, the fold button press, three format cards arriving one by one, `expand(V1)` restoring lines
- Restraint rule: no swooshes on every cut, no impact hit on the title, never louder than the data

## Storyboard

### Scene 1 — Presenting / the raw cost — 5.8s
Full-bleed near-black frame. "Presenting you" arrives small and centered, then **NamanFHIRFOLD** slides up at display scale, then the credit line "developed by Naman Jain" settles beneath it. Right side (or lower half) fills with dim mono lines from the real `demovitalsspo2.json` — `Observation`, `MDC_PULS_OXIM_SAT_O2`, `interpretation: in-alarm` — while a mono counter climbs to **1,483 tokens** and a caption reads "One SpO₂ alarm. 5,634 characters of FHIR."
Sequential/interaction: yes — title lines arrive in order (Presenting you → NamanFHIRFOLD → developed by Naman Jain), then the token counter counts up and locks
Audio intent: calm, confident arrival; music establishes the bed, no hit on the title
Audio-coupled idea: counter ticks as it climbs to 1,483
Music: warm bed, low
Transition mood: clean crossfade → Scene 2

### Scene 2 — The fold (centerpiece) — 6.85s
Recreation of the Split Workbench. Left panel: real raw FHIR JSON, dim, with the `in-alarm` interpretation visible. Right panel: empty. A cursor moves to the fold/Run action and clicks. Right panel snaps to the real compact JSON output (`vitalSigns: [{ ref: "V1", value: 79, unit: "%", flag: "in-alarm" … }]`). The token counter rolls **1,483 → 67** and a **−95% · 22.1× fewer** badge locks in. Then four chips arrive one by one: `in-alarm kept` · `exact timestamp kept` · `LOINC 2708-6 kept` · `100% fact retention (2/2)`.
Sequential/interaction: yes — simulated click on the fold action, then four retention chips appear one at a time, each held long enough to read
Audio intent: the satisfying mechanical beat of something working
Audio-coupled idea: press on the fold click, one tick per chip arrival, low resolve on the −95% lock
Music: bed continues, small lift under the counter roll
Transition mood: clean slide → Scene 3

### Scene 3 — Three formats, one fold — 5.9s
Headline: "One fold. Three output formats." Three dark cards slide in one after another, each carrying the real emitted bytes:
- **compact JSON** — 67 tok — `"ref": "V1", "value": 79, "flag": "in-alarm"`
- **MedPrompt text** — 22 tok — `[V1] MDC_PULS_OXIM_SAT_O2: 79 % (2018-11-13T17:59:02-05:00)`
- **FHIRBench markdown** — 49 tok — the table row with V1, measure, value, timestamp
Footer line fades in: `Rust core · npm · Python`.
Sequential/interaction: yes — three cards arrive one by one with a tick each, then the platform footer settles
Audio intent: clean, rhythmic, professional; three arrivals should feel like a set completing
Audio-coupled idea: card-by-card sequence on the beat
Music: lift, keep energy steady under the cards
Transition mood: soft crossfade → Scene 4

### Scene 4 — Expand / tagline — 5.67s
A single mono line types out: `expand(V1) → restores original FHIR`, and the full original Observation briefly re-inflates behind it. Then the screen clears to the tagline at display scale: **Fold the structure.** / **Keep every detail.** Lockup beneath: `namanfhirfold` · `developed by Naman Jain` · `github.com/Jain-Naman-V/namanfhirfold`. Long hold.
Sequential/interaction: yes — the expand line types out, then the two tagline halves land in sequence
Audio intent: resolve and settle; the last beat is the lockup, not a bang
Audio-coupled idea: typed characters on the expand line, final soft lock on the name
Music: fade across the last 1.5s, no cut-to-silence
Transition mood: slow crossfade, long hold to end

**Music mood for this video:** polished / warm-professional
**Audio summary:** a low warm bed establishes the scene, sparse ticks carry the fold and the three format arrivals, and everything resolves into a quiet, confident lockup as the music fades.
