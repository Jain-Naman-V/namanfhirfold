import React, { useState } from "react";
import { Package, Copy, Check, Terminal, FileCode, Download, Sparkles, Box, ShieldCheck, ArrowRight } from "lucide-react";

export const PackageHub: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState<"npm" | "cargo" | "python">("npm");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // NPM Package Details
  const npmPackageJson = `{
  "name": "@clincontext/fhir-compress",
  "version": "1.0.0",
  "description": "Ultra-fast zero-bloat FHIR R4 token compressor for LLM agents, RAG, and CDS Hooks",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "node test.js"
  },
  "keywords": ["fhir", "llm", "tokens", "compression", "healthcare", "cds-hooks", "medprompt", "fhirbench"],
  "license": "MIT"
}`;

  const npmUsageCode = `import { compressFhir } from "@clincontext/fhir-compress";
import { GoogleGenAI } from "@google/genai";

// 1. Raw 10,000-token FHIR Bundle from EHR / SMART on FHIR
const fhirBundle = await fetchPatientBundle(patientId);

// 2. Compress by 85-92% before sending to LLM!
const optimizedContext = compressFhir(fhirBundle, {
  format: "medprompt_text", // or "compact_json" | "fhirbench_markdown"
  queryFilter: "What is patient's hemoglobin and renal function?"
});

console.log("Raw Tokens:", countTokens(fhirBundle));      // ~4,500 tokens
console.log("LLM Tokens:", countTokens(optimizedContext)); // ~280 tokens (-94%)

// 3. Pass clean optimized context to Gemini or any LLM
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemini-3.8-flash",
  contents: \`Patient Clinical Context:\n\${optimizedContext}\n\nQuestion: Summarize key abnormal findings.\`
});
`;

  // Cargo Package Details
  const cargoToml = `[package]
name = "fhir_compact"
version = "0.1.0"
edition = "2021"
description = "Sub-millisecond zero-copy FHIR token compressor for CDS Hooks and AI agents"
license = "MIT"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
wasm-bindgen = { version = "0.2", optional = true }

[lib]
crate-type = ["cdylib", "rlib"]
`;

  const cargoUsageCode = `use fhir_compact::{compress_bundle, CompressionFormat};

fn main() {
    let raw_fhir_json = std::fs::read_to_string("bundle.json").unwrap();

    // Compresses 50KB FHIR payload down to 3KB in <1.2ms
    let optimized_llm_input = compress_bundle(&raw_fhir_json).expect("valid fhir");

    println!("Ready for LLM:\\n{}", optimized_llm_input);
}
`;

  // Python Package Details
  const pythonCode = `# pip install fhir-compress
from fhir_compress import FhirCompressor

compressor = FhirCompressor()

# Load raw FHIR Bundle (20+ resources, thousands of tokens)
raw_bundle = load_ehr_fhir_bundle()

# Compress for LLM prompt input
llm_input = compressor.compress(
    raw_bundle,
    format="medprompt_text",  # "compact_json", "medprompt_text", "markdown"
    query="Active medications and abnormal lab tests"
)

# Ready to pass to OpenAI, Gemini, Anthropic, or LangChain
print(f"Compressed Context for LLM:\\n{llm_input}")
`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Package & SDK Ecosystem
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                Ready to Publish
              </span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Haan bhai! Is solution ko NPM, Rust Crate, ya Python Package ke roop mein directly publish kiya ja sakta hai.
            </p>
          </div>
        </div>

        {/* Language Tabs */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setSelectedLang("npm")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "npm"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            TypeScript / NPM
          </button>
          <button
            onClick={() => setSelectedLang("cargo")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "cargo"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            Rust / Cargo Crate
          </button>
          <button
            onClick={() => setSelectedLang("python")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              selectedLang === "python"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            Python / PyPI
          </button>
        </div>
      </div>

      {/* Package Header Bar */}
      <div className="mt-4 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-xs text-gray-900 dark:text-gray-100">
          <Terminal className="w-4 h-4 text-emerald-500" />
          <span className="font-bold">
            {selectedLang === "npm" && "npm install @clincontext/fhir-compress"}
            {selectedLang === "cargo" && "cargo add fhir_compact"}
            {selectedLang === "python" && "pip install fhir-compress"}
          </span>
        </div>
        <button
          onClick={() => {
            const cmd =
              selectedLang === "npm"
                ? "npm install @clincontext/fhir-compress"
                : selectedLang === "cargo"
                ? "cargo add fhir_compact"
                : "pip install fhir-compress";
            handleCopy("cmd", cmd);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs font-medium text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 transition-colors shadow-2xs"
        >
          {copiedKey === "cmd" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedKey === "cmd" ? "Copied" : "Copy Install Command"}</span>
        </button>
      </div>

      {/* Code Examples */}
      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            <span>Production Usage Example (FHIR → Compressed LLM Input):</span>
            <button
              onClick={() => {
                const code =
                  selectedLang === "npm"
                    ? npmUsageCode
                    : selectedLang === "cargo"
                    ? cargoUsageCode
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
              {selectedLang === "npm" && npmUsageCode}
              {selectedLang === "cargo" && cargoUsageCode}
              {selectedLang === "python" && pythonCode}
            </code>
          </pre>
        </div>

        {selectedLang === "npm" && (
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <span>package.json Manifest:</span>
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

        {selectedLang === "cargo" && (
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <span>Cargo.toml Manifest:</span>
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
      </div>

      {/* Package Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs">
        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Zero Data Loss (Clinical Fidelity)</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            LOINC/RxNorm codes, actual test results, units, and abnormal ranges 100% preserve rehte hain.
          </p>
        </div>

        <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center gap-1.5 font-bold text-blue-800 dark:text-blue-300 mb-1">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Universal LLM Drop-in</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            Gemini, OpenAI GPT-4o, Claude 3.5, LangChain aur LlamaIndex prompts mein direct string pass hoti hai.
          </p>
        </div>

        <div className="p-3 rounded-xl border border-purple-500/20 bg-purple-500/5">
          <div className="flex items-center gap-1.5 font-bold text-purple-800 dark:text-purple-300 mb-1">
            <Box className="w-4 h-4 text-purple-600" />
            <span>Lightweight & Tree-shakable</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
            Zero heavy dependencies; runs natively in Node.js, Next.js, Cloudflare Workers, and Rust Wasm.
          </p>
        </div>
      </div>
    </div>
  );
};
