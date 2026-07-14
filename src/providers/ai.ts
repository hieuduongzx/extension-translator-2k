import { getLanguageEnglishName } from "../languages";
import type { AIProviderConfig } from "../types";
import { fetchWithTimeout } from "./http";
import type { TranslateResult } from "./types";

/**
 * Generic translator for any OpenAI-compatible chat-completions endpoint
 * (e.g. Groq GPT-OSS, vLLM, Ollama's OpenAI shim, custom gateways, etc.).
 *
 * Segment alignment is the tricky part: we must return exactly as many
 * translations as inputs, in order. We ask the model to translate a numbered
 * JSON array and return a JSON array of the same length, then validate and
 * fall back gracefully if the shape is off.
 */

const AI_TIMEOUT_MS = 60_000;
const AI_MAX_TOKENS = 4096; // models are slower than the public MT endpoints
/**
 * The content engine batches up to ~4000 chars per request — sized for the
 * public MT endpoints. Translated output for a batch that big easily exceeds
 * `max_tokens`, truncating the JSON array so nothing parses. Chunk AI requests
 * down to a size whose output comfortably fits.
 */
const AI_CHUNK_CHAR_LIMIT = 1500;
const AI_CHUNK_SEGMENT_LIMIT = 25;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string } | string;
}

export async function translateAI(
  texts: string[],
  source: string,
  target: string,
  config: AIProviderConfig
): Promise<TranslateResult> {
  if (texts.length === 0) return { translations: [] };
  if (!config.endpoint) throw new Error("AI provider endpoint is not configured");
  if (!config.model) throw new Error("AI provider model is not configured");

  const chunks = chunkTexts(texts);
  if (chunks.length === 1) return translateAIChunk(chunks[0], source, target, config);

  const translations: string[] = [];
  for (const chunk of chunks) {
    const result = await translateAIChunk(chunk, source, target, config);
    translations.push(...result.translations);
  }
  return { translations };
}

/** Greedily packs texts into chunks bounded by char and segment limits. */
function chunkTexts(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (
      current.length > 0 &&
      (chars + text.length > AI_CHUNK_CHAR_LIMIT || current.length >= AI_CHUNK_SEGMENT_LIMIT)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function translateAIChunk(
  texts: string[],
  source: string,
  target: string,
  config: AIProviderConfig
): Promise<TranslateResult> {
  const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
  const sourceName = source === "auto" ? "" : ` from ${getLanguageEnglishName(source)}`;
  const targetName = getLanguageEnglishName(target);

  const systemPrompt =
    `You are a professional translator. Translate each string in the user's ` +
    `JSON array${sourceName} into ${targetName}. ` +
    `Preserve meaning, tone, formatting and any inline punctuation. ` +
    `Do NOT translate code, URLs, or proper nouns that should stay as-is. ` +
    `Respond with ONLY a JSON array of the translated strings, in the same ` +
    `order and with exactly the same number of elements as the input. ` +
    `Do not add comments, keys, or markdown fences.`;

  const userPrompt = JSON.stringify(texts);

  const res = await fetchWithTimeout(url, {
    method: "POST",
    timeoutMs: AI_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      stream: false,
      max_tokens: AI_MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as ChatCompletionResponse;
      const e = body.error;
      detail = typeof e === "string" ? e : (e?.message ?? "");
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(`AI translate failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("AI provider returned an empty response");
  }

  return { translations: parseAIContent(content, texts) };
}

/**
 * Extracts the translated strings from the model's reply. Tries to parse a
 * JSON array first (the requested format); if the model wrapped it in prose
 * or markdown fences, we strip those and retry. As a last resort for a single
 * input we treat the whole reply as the translation.
 *
 * Always returns an array of exactly `inputs.length` strings: missing slots
 * fall back to the original text so the engine leaves those nodes untouched.
 */
export function parseAIContent(content: string, inputs: string[]): string[] {
  const expected = inputs.length;
  const parsed = tryParseJSONArray(content);

  if (parsed) {
    const out = parsed.slice(0, expected).map((v) => (typeof v === "string" ? v : String(v)));
    while (out.length < expected) out.push(inputs[out.length] ?? "");
    return out;
  }

  // Couldn't parse an array. For a single segment, use the raw reply.
  if (expected === 1) return [content.trim()];

  // Otherwise we can't safely realign; return originals unchanged.
  return [...inputs];
}

/** Best-effort JSON-array extraction tolerant of markdown fences / stray prose. */
function tryParseJSONArray(content: string): unknown[] | null {
  const trimmed = content.trim();

  const direct = safeParseArray(trimmed);
  if (direct) return direct;

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const inner = safeParseArray(fenced[1].trim());
    if (inner) return inner;
  }

  // Grab the first [...] block in the text.
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const inner = safeParseArray(trimmed.slice(start, end + 1));
    if (inner) return inner;
  }

  return null;
}

function safeParseArray(text: string): unknown[] | null {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
