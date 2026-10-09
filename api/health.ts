import type { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  let pythonServiceStatus = "not_configured";
  const pythonServiceUrl = process.env.NAMANFHIRFOLD_URL;

  if (pythonServiceUrl) {
    try {
      const targetUrl = new URL("/", pythonServiceUrl).toString();
      const pyRes = await fetch(targetUrl);
      pythonServiceStatus = pyRes.ok ? "connected" : "unhealthy";
    } catch {
      pythonServiceStatus = "unreachable";
    }
  }

  return res.json({
    status: "ok",
    runtime: "vercel-serverless",
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    services: {
      app: "healthy",
      namanfhirfold_binding: pythonServiceStatus,
    },
  });
}
