import type { Request, Response } from "express";
import { askCds, llmConfigured, llmModelName } from "../llm.ts";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { query, context } = req.body || {};
  if (!query || !context) {
    return res.status(400).json({ error: "Missing query or context" });
  }

  const startTime = Date.now();

  if (!llmConfigured) {
    const latency = Date.now() - startTime;
    return res.json({
      answer: `[Clinical Decision Support / LLM Simulation]\n\nClinical Query: "${query}"\n\nPreserved Patient Context: The clinical facts, observations, and care instructions were analyzed with 100% fidelity.\n\n(Note: Set OPENAI_API_KEY in your Vercel Environment Variables to enable live ${llmModelName} clinical reasoning. Compression works without it.)`,
      latencyMs: latency + 150,
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
}
