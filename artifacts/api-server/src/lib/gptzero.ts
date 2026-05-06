import { logger } from "./logger";

export interface GPTZeroSentence {
  text: string;
  /** Per-sentence AI probability in [0, 1]. */
  generatedProb: number;
}

export interface GPTZeroResult {
  /** Aggregate AI probability for the document, in [0, 1]. */
  aiScore: number;
  /** Predicted top class — typically "human", "ai", or "mixed". */
  aiClass: string;
  /** Per-sentence breakdown for inline highlighting. May be empty. */
  sentences: GPTZeroSentence[];
  /** Raw provider response (truncated by caller if persisted). */
  raw: unknown;
}

const ENDPOINT = "https://api.gptzero.me/v2/predict/text";

/**
 * Send a piece of writing to GPTZero. Returns null when the API key is
 * missing or the request fails — callers must treat that as "score
 * unavailable" rather than fail the user action.
 */
export async function checkWithGPTZero(
  document: string,
): Promise<GPTZeroResult | null> {
  const apiKey = process.env.GPTZERO_API_KEY;
  if (!apiKey) {
    logger.warn("GPTZERO_API_KEY not set; skipping AI check");
    return null;
  }
  if (!document.trim()) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify({ document, multilingual: false }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: text.slice(0, 500) },
        "GPTZero non-OK response",
      );
      return null;
    }
    const json: unknown = await res.json();
    return parseGPTZeroResponse(json);
  } catch (err) {
    logger.warn({ err }, "GPTZero request failed");
    return null;
  }
}

function parseGPTZeroResponse(json: unknown): GPTZeroResult | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const documents = root.documents;
  if (!Array.isArray(documents) || documents.length === 0) return null;
  const doc = documents[0] as Record<string, unknown>;

  const probs = doc.class_probabilities as Record<string, number> | undefined;
  const predicted = doc.predicted_class as string | undefined;

  let aiScore: number | undefined;
  if (probs && typeof probs.ai === "number") aiScore = probs.ai;
  else if (typeof doc.completely_generated_prob === "number")
    aiScore = doc.completely_generated_prob as number;
  if (typeof aiScore !== "number" || Number.isNaN(aiScore)) return null;

  const sentences: GPTZeroSentence[] = [];
  const sArr = doc.sentences;
  if (Array.isArray(sArr)) {
    for (const s of sArr) {
      if (!s || typeof s !== "object") continue;
      const text = (s as Record<string, unknown>).sentence;
      const prob = (s as Record<string, unknown>).generated_prob;
      if (typeof text === "string" && typeof prob === "number") {
        sentences.push({ text, generatedProb: clamp(prob, 0, 1) });
      }
    }
  }

  return {
    aiScore: clamp(aiScore, 0, 1),
    aiClass: predicted ?? (aiScore >= 0.5 ? "ai" : "human"),
    sentences,
    raw: json,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
