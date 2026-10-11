import { GoogleGenAI, Type } from "@google/genai";

/**
 * ALL AI tasks in this app go through this file, and only to Gemini Flash.
 * Never the Claude API, never any other model.
 *
 * Google retires Flash versions for new API users over time, so we try GEMINI_MODEL first and then fall back
 * through the rolling "latest" alias and other Flash models. The first one that works is remembered.
 */
const FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
export const modelChain = (): string[] => [...new Set([process.env.GEMINI_MODEL, ...FALLBACKS].filter((m): m is string => !!m))];
let working: string | null = null;
const noThinking = new Set<string>();
export const MODEL = () => working ?? modelChain()[0];

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

const isModelGone = (m: string) => /NOT_FOUND|404|no longer available|not found for API version|is not supported for generateContent/i.test(m);
const isThinkingError = (m: string) => /thinking/i.test(m) && /(400|INVALID_ARGUMENT|not supported|cannot|can't)/i.test(m);

/** One JSON-mode call. Retries on invalid JSON, falls back across models, and throws GeminiUnavailable on outage so callers can degrade gracefully. */
export async function generateJson<T>(args: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<{ data: T; usage: Usage }> {
  let inTok = 0, outTok = 0;
  let lastErr: unknown;
  const chain = working ? [working, ...modelChain().filter((m) => m !== working)] : modelChain();
  let mi = 0, jsonTries = 0, transient = 0;
  for (let step = 0; step < 10 && mi < chain.length; step++) {
    const model = chain[mi];
    try {
      const res = await ai().models.generateContent({
        model,
        contents: jsonTries === 0 ? args.prompt : `${args.prompt}\n\nYour previous reply was not valid JSON for the schema. Reply with valid JSON only.`,
        config: {
          systemInstruction: args.system,
          responseMimeType: "application/json",
          responseSchema: args.schema as never,
          temperature: args.temperature ?? 0.3,
          ...(noThinking.has(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });
      inTok += res.usageMetadata?.promptTokenCount ?? 0;
      outTok += res.usageMetadata?.candidatesTokenCount ?? 0;
      const text = (res.text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      const data = JSON.parse(text) as T;
      working = model;
      return { data, usage: { model, inputTokens: inTok, outputTokens: outTok, costUsd: costOf(inTok, outTok) } };
    } catch (e) {
      lastErr = e;
      if (e instanceof SyntaxError) { if (++jsonTries >= 2) break; continue; } // invalid JSON: retry once
      const msg = (e as Error).message ?? "";
      if (isModelGone(msg)) { mi++; continue; } // this Flash version is not available to us: try the next
      if (isThinkingError(msg) && !noThinking.has(model)) { noThinking.add(model); continue; }
      if (/503|UNAVAILABLE|overloaded|ECONN|fetch failed|429|RESOURCE_EXHAUSTED|API key/i.test(msg)) {
        if (++transient >= 2) throw new GeminiUnavailable(msg);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
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
