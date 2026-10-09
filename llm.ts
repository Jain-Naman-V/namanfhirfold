// OpenAI-compatible CDS inference (works with OpenAI, Azure-compatible proxies,
// Ollama, vLLM, LM Studio, etc. — anything exposing /chat/completions).

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const llmConfigured = !!OPENAI_API_KEY;
export const llmModelName = OPENAI_MODEL;

const SYSTEM_PROMPT =
  "You are a clinical decision support assistant. Be accurate, concise, and clinically rigorous.";

function buildPrompt(query: string, context: string): string {
  return `You are an expert Clinical Decision Support (CDS) reasoning engine.
Analyze the following patient context and answer the clinical query precisely and concisely.

Patient Clinical Context:
${context}

Clinical Query:
${query}

Instructions:
1. Provide a direct, factual clinical answer based only on the provided context.
2. Note any abnormal values, dosages, or contraindications clearly.
3. Be concise and clinician-ready.`;
}

export async function askCds(
  query: string,
  context: string
): Promise<string> {
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(query, context) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "No response generated.";
}
