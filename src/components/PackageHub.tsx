import React, { useState } from "react";
import { Package, Copy, Check, Terminal, FileCode, Download, Sparkles, Box, ShieldCheck, ArrowRight, UploadCloud, CheckCircle2 } from "lucide-react";

export const PackageHub: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState<"npm" | "cargo" | "python" | "publish">("cargo");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // NPM Package Details
  const npmPackageJson = `{
  "name": "namanfhirfold",
  "version": "0.1.0",
  "description": "Fold the structure. Keep every detail. Task-aware FHIR R4 token compression engine for CDS Hooks and LLMs.",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "keywords": ["fhir", "llm", "tokens", "compression", "healthcare", "cds-hooks", "medprompt", "fhirbench"],
  "author": "Naman <naman@scanbo.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/naman/namanfhirfold"
  }
}`;

  const npmUsageCode = `import { foldFhir } from "namanfhirfold";
import { GoogleGenAI } from "@google/genai";

// 1. Raw 10,000-token FHIR Bundle from EHR / SMART on FHIR
const fhirBundle = await fetchPatientBundle(patientId);

// 2. "Fold the structure. Keep every detail." — Compress by 85-94% before sending to LLM!
const optimizedContext = foldFhir(fhirBundle, {
  format: "compact_json", // or "medprompt_text" | "markdown"
  profile: "vitals_monitor", // or "medication_prescribe" | "free_query"
  granularity: "exact_timestamp",
  safetySetGuaranteed: true
});

console.log("Raw Tokens:", countTokens(fhirBundle));      // ~4,500 tokens
console.log("LLM Tokens:", countTokens(optimizedContext)); // ~280 tokens (-94% reduction)

// 3. Pass clean optimized context to Gemini or any LLM agent
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemini-3.8-flash",
  contents: \`Patient Clinical Context:\n\${optimizedContext}\n\nQuestion: Summarize key abnormal findings.\`
});
`;

  // Cargo Package Details
  const cargoToml = `[package]
name = "namanfhirfold"
version = "0.1.0"
edition = "2021"
authors = ["Naman <naman@scanbo.com>"]
description = "Fold the structure. Keep every detail. Task-aware FHIR R4 token compression engine for CDS Hooks and LLMs"
license = "MIT"
readme = "README.md"
repository = "https://github.com/naman/namanfhirfold"
keywords = ["fhir", "llm", "tokens", "healthcare", "cds-hooks"]

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
chrono = { version = "0.4", features = ["serde"], default-features = false }
wasm-bindgen = { version = "0.2", optional = true }

[lib]
crate-type = ["cdylib", "rlib"]

[features]
default = []
wasm = ["wasm-bindgen"]
`;

  const cargoUsageCode = `use namanfhirfold::{optimize, CompressionOptions, CdsProfile, Granularity};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let raw_fhir_json = std::fs::read_to_string("patient_bundle.json")?;

    // Sub-millisecond (<1.2ms) zero-copy token reduction
    // "Fold the structure. Keep every detail."
    let result = optimize(&raw_fhir_json, &CompressionOptions {
        profile: CdsProfile::VitalsMonitor,
        granularity: Granularity::ExactTimestamp,
        token_budget: Some(800),
        safety_set_guaranteed: true,
        ..Default::default()
    })?;

    println!("Original Tokens: {}", result.raw_tokens);
    println!("Optimized Tokens: {}", result.compressed_tokens);
    println!("Reduced by: {}%", result.reduction_percentage);
    println!("Clinical Facts Retained: {}/{}", result.retained_facts_count, result.total_facts_count);
    
    // Ready to inject directly into LLM prompt
    println!("\nLLM Prompt Context:\n{}", result.compressed_output);
    Ok(())
}
`;

  // Python Package Details
  const pythonCode = `# pip install namanfhirfold
from namanfhirfold import fold, CdsProfile, Granularity

# 1. Load raw FHIR Bundle (20+ resources, thousands of tokens)
with open("patient_bundle.json", "r") as f:
    raw_bundle = f.read()

# 2. "Fold the structure. Keep every detail."
llm_input = fold(
    raw_bundle,
    format="compact_json",         # or "medprompt_text", "markdown"
    profile=CdsProfile.VITALS_MONITOR,
    granularity=Granularity.EXACT_TIMESTAMP,
    safety_set_guaranteed=True
)

# 3. Ready to pass to OpenAI, Gemini, Anthropic, LangChain, or LlamaIndex
print(f"Compressed Context for LLM:\\n{llm_input}")
`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold">
            🦀
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="font-mono text-orange-600 dark:text-orange-400">namanfhirfold</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                Ready to Publish
              </span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 italic font-medium">
              "Fold the structure. Keep every detail." — Clear purpose, memorable, immediately recognizable to healthcare developers.
            </p>
          </div>
        </div>

        {/* Language Tabs */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setSelectedLang("cargo")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "cargo"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            🦀 Rust / Cargo
          </button>
          <button
            onClick={() => setSelectedLang("npm")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "npm"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            📦 TypeScript / NPM
          </button>
          <button
            onClick={() => setSelectedLang("python")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "python"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            🐍 Python / PyPI
          </button>
          <button
            onClick={() => setSelectedLang("publish")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "publish"
                ? "bg-emerald-600 text-white shadow-xs font-bold"
                : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            }`}
          >
            🚀 Publish Guide
          </button>
        </div>
      </div>

      {/* Package Header Bar */}
      {selectedLang !== "publish" && (
        <div className="mt-4 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-gray-900 dark:text-gray-100">
            <Terminal className="w-4 h-4 text-emerald-500" />
            <span className="font-bold">
              {selectedLang === "cargo" && "cargo add namanfhirfold"}
              {selectedLang === "npm" && "npm install namanfhirfold"}
              {selectedLang === "python" && "pip install namanfhirfold"}
            </span>
          </div>
          <button
            onClick={() => {
              const cmd =
                selectedLang === "cargo"
                  ? "cargo add namanfhirfold"
                  : selectedLang === "npm"
                  ? "npm install namanfhirfold"
                  : "pip install namanfhirfold";
              handleCopy("cmd", cmd);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs font-medium text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 transition-colors shadow-2xs"
          >
            {copiedKey === "cmd" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === "cmd" ? "Copied" : "Copy Install Command"}</span>
          </button>
        </div>
      )}

      {/* Code Examples & Content */}
      <div className="mt-4 space-y-4">
        {selectedLang !== "publish" && (
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <span>Production Usage Example (FHIR → LLM Context):</span>
              <button
                onClick={() => {
                  const code =
                    selectedLang === "cargo"
                      ? cargoUsageCode
                      : selectedLang === "npm"
                      ? npmUsageCode
                      : pythonCode;
                  handleCopy("usage", code);
                }}
                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                {copiedKey === "usage" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === "usage" ? "Copied" : "Copy Example"}</span>
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-gray-950 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800">
              <code>
                {selectedLang === "cargo" && cargoUsageCode}
                {selectedLang === "npm" && npmUsageCode}
                {selectedLang === "python" && pythonCode}
              </code>
            </pre>
          </div>
        )}

        {selectedLang === "cargo" && (
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <span>Cargo.toml Manifest (/crates/namanfhirfold/Cargo.toml):</span>
              <button
                onClick={() => handleCopy("cargo", cargoToml)}
                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                {copiedKey === "cargo" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === "cargo" ? "Copied" : "Copy Cargo.toml"}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-gray-950 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800">
              <code>{cargoToml}</code>
            </pre>
          </div>
        )}

        {selectedLang === "npm" && (
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <span>package.json Manifest (/packages/namanfhirfold/package.json):</span>
              <button
                onClick={() => handleCopy("pkg", npmPackageJson)}
                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                {copiedKey === "pkg" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === "pkg" ? "Copied" : "Copy package.json"}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-gray-950 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800">
              <code>{npmPackageJson}</code>
            </pre>
          </div>
        )}

        {/* Publish Guide Tab */}
        {selectedLang === "publish" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/20">
              <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-600" />
                Step-by-Step Publishing Guide for <code className="font-mono">namanfhirfold</code>
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                All package directory manifests and source codes are completely configured. Here are the exact commands to publish across all 3 registries:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Crates.io */}
              <div className="p-3.5 rounded-xl border border-orange-500/20 bg-orange-500/5">
                <div className="font-bold text-orange-800 dark:text-orange-300 text-xs mb-1 flex items-center gap-1.5">
                  <span>🦀 1. Crates.io (Rust)</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2">
                  Directory: <code>/crates/namanfhirfold</code>
                </p>
                <div className="p-2.5 rounded-lg bg-gray-950 text-[11px] font-mono text-gray-200 space-y-1">
                  <div className="text-gray-500"># Login to Crates.io</div>
                  <div>cargo login</div>
                  <div className="text-gray-500 pt-1"># Test & publish</div>
                  <div>cargo publish --dry-run</div>
                  <div>cargo publish</div>
                </div>
              </div>

              {/* NPM */}
              <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5">
                <div className="font-bold text-red-800 dark:text-red-300 text-xs mb-1 flex items-center gap-1.5">
                  <span>📦 2. NPM (TypeScript/JS)</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2">
                  Directory: <code>/packages/namanfhirfold</code>
                </p>
                <div className="p-2.5 rounded-lg bg-gray-950 text-[11px] font-mono text-gray-200 space-y-1">
                  <div className="text-gray-500"># Login to npm</div>
                  <div>npm login</div>
                  <div className="text-gray-500 pt-1"># Build & publish</div>
                  <div>cd packages/namanfhirfold</div>
                  <div>npm publish --access public</div>
                </div>
              </div>

              {/* PyPI */}
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <div className="font-bold text-blue-800 dark:text-blue-300 text-xs mb-1 flex items-center gap-1.5">
                  <span>🐍 3. PyPI (Python)</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2">
                  Directory: <code>/python/namanfhirfold</code>
                </p>
                <div className="p-2.5 rounded-lg bg-gray-950 text-[11px] font-mono text-gray-200 space-y-1">
                  <div className="text-gray-500"># Build wheel</div>
                  <div>cd python/namanfhirfold</div>
                  <div>python -m build</div>
                  <div className="text-gray-500 pt-1"># Upload to PyPI</div>
                  <div>twine upload dist/*</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Package Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs">
        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Fold the Structure</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            Strips repetitive JSON hierarchies, 80-char URI schemas, narrative HTML, and redundant subject cross-references.
          </p>
        </div>

        <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center gap-1.5 font-bold text-blue-800 dark:text-blue-300 mb-1">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Keep Every Detail</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            100% of LOINC/RxNorm codes, numerical values, UCUM units, abnormal flags, and ranges stay intact.
          </p>
        </div>

        <div className="p-3 rounded-xl border border-orange-500/20 bg-orange-500/5">
          <div className="flex items-center gap-1.5 font-bold text-orange-800 dark:text-orange-300 mb-1">
            <Box className="w-4 h-4 text-orange-600" />
            <span>Sub-Millisecond Engine</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            Rust zero-copy deserialization executes in &lt;1.2ms, ready for Actix, Axum, Wasm, Node.js, and Python.
          </p>
        </div>
      </div>
    </div>
  );
};
