import type { Request, Response } from "express";
import { compressFhir } from "../src/services/fhirCompressor.ts";
import { CompressionOptions } from "../src/types/fhir.ts";
import { sanitizePublicCompressionResponse, toPublicCompressionResult } from "../src/services/publicCompressionResult.ts";

function authorize(req: Request, res: Response): boolean {
  const token = process.env.NAMANFHIRFOLD_API_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== "production") return true;
    res.status(503).json({ error: "API authentication is not configured" });
    return false;
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }
  if (!authorize(req, res)) return;

  try {
    const { fhir, options } = req.body || {};
    if (!fhir) {
      return res.status(400).json({ error: "Missing FHIR payload" });
    }

    // Check Vercel Service Binding: NAMANFHIRFOLD_URL
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
            ...(sanitizePublicCompressionResponse(pyData) as object),
            engine: "namanfhirfold-python-service",
            source: "vercel-service-binding",
          });
        }
      } catch (bindErr) {
        console.warn("NAMANFHIRFOLD_URL service call failed, falling back to TypeScript engine:", bindErr);
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
    return res.json(toPublicCompressionResult(result));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to compress FHIR payload" });
  }
}
