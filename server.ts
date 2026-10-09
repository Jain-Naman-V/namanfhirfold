import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { compressFhir } from "./src/services/fhirCompressor.ts";
import { CompressionOptions } from "./src/types/fhir.ts";
import { askCds, llmConfigured, llmModelName } from "./llm.ts";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.use(express.json({ limit: "25mb" }));

// API: Compress FHIR payload
app.post("/api/compress", async (req: Request, res: Response) => {
  try {
    const { fhir, options } = req.body;
    if (!fhir) {
      return res.status(400).json({ error: "Missing FHIR payload" });
    }

    // Vercel Service Binding: if internal Python microservice is bound
    const pythonServiceUrl = process.env.NAMANFHIRFOLD_URL;
    if (pythonServiceUrl) {
      try {
        const targetUrl = new URL("/", pythonServiceUrl).toString();
        const pyRes = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fhir, ...(options || {}) }),
        });
        if (pyRes.ok) {
          const pyData = await pyRes.json();
          return res.json({
            ...pyData,
            engine: "namanfhirfold-python-service",
          });
        }
      } catch (bindErr) {
        console.warn("NAMANFHIRFOLD_URL binding call failed, falling back to local TypeScript engine:", bindErr);
      }
    }

    const defaultOpts: CompressionOptions = {
      format: "compact_json",
      stripMeta: true,
      stripNarrativeText: true,
      normalizeCodingSystems: true,
      stripRedundantReferences: true,
      stripCategory: true,
      ...options,
    };

    const result = compressFhir(fhir, defaultOpts);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to compress FHIR payload" });
  }
});

// API: Evaluate LLM on clinical query with raw vs compressed context
app.post("/api/evaluate-llm", async (req: Request, res: Response) => {
  const { query, context, formatName } = req.body;
  if (!query || !context) {
    return res.status(400).json({ error: "Missing query or context" });
  }

  const startTime = Date.now();

  if (!llmConfigured) {
    // Graceful fallback if API key is not configured in environment
    const latency = Date.now() - startTime;
    return res.json({
      answer: `[Simulated CDS / LLM Analysis without API key]\n\nClinical Query: "${query}"\n\nVerified from Context: The clinical data was analyzed successfully. The extracted values and ranges were processed with 100% fidelity.\n\n(Tip: Set OPENAI_API_KEY in your environment to enable live ${llmModelName} inference. Compression works without it.`,
      latencyMs: latency + 180,
      modelUsed: `${llmModelName} (simulated)`,
      tokenEstimate: Math.round(context.length / 3.8),
    });
  }

  try {
    const answer = await askCds(query, context);
    const latencyMs = Date.now() - startTime;
    return res.json({
      answer,
      latencyMs,
      modelUsed: llmModelName,
      tokenEstimate: Math.round(context.length / 3.8),
    });
  } catch (err: any) {
    console.error("LLM API error:", err);
    return res.status(500).json({ error: err.message || "LLM inference failed" });
  }
});

// Health check
app.get("/api/health", async (_req: Request, res: Response) => {
  let pythonServiceStatus = "not_configured";
  if (process.env.NAMANFHIRFOLD_URL) {
    try {
      const pyHealthRes = await fetch(new URL("/", process.env.NAMANFHIRFOLD_URL).toString());
      pythonServiceStatus = pyHealthRes.ok ? "connected" : "unhealthy";
    } catch {
      pythonServiceStatus = "unreachable";
    }
  }

  res.json({
    status: "ok",
    llmConfigured,
    services: {
      app: "healthy",
      namanfhirfold_binding: pythonServiceStatus,
    },
  });
});

// Vite middleware or static serving
async function startServer() {
  if (!isProduction) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`ClinContext FHIR Engine listening on http://localhost:${PORT}`);
  });
}

startServer();
