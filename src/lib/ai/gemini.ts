import { GoogleGenAI, Type } from "@google/genai";

/**
 * ALL AI tasks in this app go through this file, and only to Gemini Flash.
 * Never the Claude API, never any other model.
 */
export const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

// USD per 1M tokens (Gemini 2.5 Flash list price). Override via env if pricing changes.
const PRICE_IN = Number(process.env.GEMINI_PRICE_IN ?? 0.3);
const PRICE_OUT = Number(process.env.GEMINI_PRICE_OUT ?? 2.5);

export type Usage = { model: string; inputTokens: number; outputTokens: number; costUsd: number };

export function costOf(inTok: number, outTok: number): number {
  return (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000;
}

export class GeminiUnavailable extends Error {}

let client: GoogleGenAI | null = null;
function ai() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiUnavailable("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey: key }));
}

export { Type };

/** One JSON-mode call. Retries once on invalid JSON. Throws GeminiUnavailable on outage so callers can degrade gracefully. */
export async function generateJson<T>(args: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<{ data: T; usage: Usage }> {
  let inTok = 0, outTok = 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: MODEL(),
        contents: attempt === 0 ? args.prompt : `${args.prompt}\n\nYour previous reply was not valid JSON for the schema. Reply with valid JSON only.`,
        config: {
          systemInstruction: args.system,
          responseMimeType: "application/json",
          responseSchema: args.schema as never,
          temperature: args.temperature ?? 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      inTok += res.usageMetadata?.promptTokenCount ?? 0;
      outTok += res.usageMetadata?.candidatesTokenCount ?? 0;
      const text = (res.text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      const data = JSON.parse(text) as T;
      return { data, usage: { model: MODEL(), inputTokens: inTok, outputTokens: outTok, costUsd: costOf(inTok, outTok) } };
    } catch (e) {
      lastErr = e;
      if (e instanceof SyntaxError) continue; // invalid JSON: retry once
      const msg = (e as Error).message ?? "";
      if (/503|UNAVAILABLE|overloaded|ECONN|fetch failed|429|RESOURCE_EXHAUSTED|API key/i.test(msg)) {
        if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        throw new GeminiUnavailable(msg);
      }
      throw e;
    }
  }
  throw new GeminiUnavailable(lastErr instanceof Error ? lastErr.message : "Gemini returned invalid JSON twice");
}

export const S = {
  str: { type: Type.STRING },
  strArray: { type: Type.ARRAY, items: { type: Type.STRING } },
  obj: (properties: Record<string, unknown>, required?: string[]) => ({
    type: Type.OBJECT, properties, required: required ?? Object.keys(properties),
  }),
  arr: (items: unknown) => ({ type: Type.ARRAY, items }),
};
