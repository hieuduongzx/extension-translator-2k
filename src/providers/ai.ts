import { getLanguageEnglishName } from "../languages";
import type { AIProviderConfig, ReasoningEffort } from "../types";
import { fetchWithRetry } from "./http";
import { failedMask, type TranslateResult } from "./types";

/**
 * Generic translator for any OpenAI-compatible chat-completions endpoint
 * (e.g. vLLM, Ollama's OpenAI shim, custom gateways, etc.).
 *
 * Segment alignment is the tricky part: we must return exactly as many
 * translations as inputs, in order. We ask the model to translate a numbered
 * JSON array and return a JSON array of the same length, then validate and
 * fall back gracefully if the shape is off.
 */

const AI_TIMEOUT_MS = 60_000;
const AI_MAX_TOKENS = 8192;
/**
 * The content engine batches up to ~4000 chars per request — sized for the
 * public MT endpoints. LLMs handle much bigger payloads, so instead of slicing
 * each engine batch into many tiny round-trips we chunk only when a single
 * batch exceeds what one request can comfortably translate. Translated output
 * for a chunk this size still fits well inside `max_tokens` (the reply is a
 * JSON array, so the characters roughly mirror the input length).
 */
export const AI_CHUNK_CHAR_LIMIT = 6000;
const AI_CHUNK_SEGMENT_LIMIT = 80;
/**
 * How many chunks of one batch to translate in parallel. The content engine
 * already runs a few batches at once (see BATCH_CONCURRENCY), so this multiplies
 * with it — keep it modest to stay friendly to the gateway's rate limits while
 * still collapsing a multi-chunk batch from N sequential round-trips into ~1.
 */
const AI_CHUNK_CONCURRENCY = 3;

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
  if (!config.endpoint.trim()) throw new Error("AI provider endpoint is not configured");
  if (!config.model.trim()) throw new Error("AI provider model is not configured");

  const chunks = chunkTexts(texts);
  if (chunks.length === 1) return translateAIChunk(chunks[0], source, target, config);

  // Translate chunks with a bounded worker pool instead of one-at-a-time: a
  // 4000-char batch splits into a few chunks, and running them sequentially
  // made every batch as slow as the sum of its chunks. A chunk that fails is
  // recorded as null and padded with its originals below, so one failed chunk
  // never discards the ones that already succeeded.
  const results: (TranslateResult | null)[] = new Array(chunks.length).fill(null);
  const errors: string[] = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < chunks.length) {
      const i = cursor++;
      try {
        results[i] = await translateAIChunk(chunks[i], source, target, config);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        results[i] = null;
      }
    }
  };
  const poolSize = Math.min(AI_CHUNK_CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  // Every chunk failed: surface the error rather than silently returning the
  // untranslated page.
  if (results.every((r) => r === null)) {
    throw new Error(errors[0] ?? "AI translate failed");
  }

  const translations: string[] = [];
  const failed: boolean[] = [];
  let detected: string | undefined;
  for (let i = 0; i < chunks.length; i++) {
    const result = results[i];
    if (result) {
      translations.push(...result.translations);
      for (let j = 0; j < result.translations.length; j++) {
        failed.push(result.failed?.[j] ?? false);
      }
      if (!detected && result.detected) detected = result.detected;
    } else {
      // Failed chunk: pad with the originals so overall alignment holds, and
      // flag every slot so the caller retries them instead of caching the
      // untranslated text as if it were a result.
      translations.push(...chunks[i]);
      for (let j = 0; j < chunks[i].length; j++) failed.push(true);
    }
  }
  return { translations, detected, failed: failedMask(failed) };
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
  const detectMode = source === "auto";
  const sourceName = detectMode ? "" : ` from ${getLanguageEnglishName(source)}`;
  const targetName = getLanguageEnglishName(target);

  const common =
    `You are a professional translator. Translate each string in the user's ` +
    `JSON array${sourceName} into ${targetName}. ` +
    `Preserve meaning, tone, formatting and any inline punctuation. ` +
    `Do NOT translate code, URLs, or proper nouns that should stay as-is. `;

  // When the source language is auto, ask the model to also report the detected
  // language so the UI can show it and TTS knows which voice to use. We keep the
  // plain-array contract for the (far more common) explicit-source path to
  // minimise the chance of the model breaking segment alignment.
  const systemPrompt = detectMode
    ? common +
      `Respond with ONLY a JSON object of the form ` +
      `{"detected":"<code>","translations":[...]} where "detected" is the ` +
      `ISO 639-1 code (e.g. en, ja, vi) of the source language and ` +
      `"translations" has the translated strings in the same order and with ` +
      `exactly the same number of elements as the input. ` +
      `Do not add comments or markdown fences.`
    : common +
      `Respond with ONLY a JSON array of the translated strings, in the same ` +
      `order and with exactly the same number of elements as the input. ` +
      `Do not add comments, keys, or markdown fences.`;

  const content = await chatCompletion(config, systemPrompt, JSON.stringify(texts));

  return detectMode ? parseAIWithDetection(content, texts) : parseAIResult(content, texts);
}

/**
 * If a backend rejects a request with HTTP 400 due to `reasoning` /
 * `reasoning_effort`, compute a compatible effort to retry once with.
 */
function fallbackReasoningEffort(
  current: ReasoningEffort | undefined,
  detail: string
): { retry: boolean; effort: ReasoningEffort | undefined } {
  if (!/reasoning/i.test(detail)) return { retry: false, effort: current };
  // Models such as gpt-oss only accept `low` / `medium` / `high`, rejecting `none`.
  if (current !== "low" && /reasoning[_.]?effort/i.test(detail) && /\blow\b/i.test(detail)) {
    return { retry: true, effort: "low" };
  }
  // Backend rejected the `reasoning` field altogether — retry once without it.
  if (current !== undefined) {
    return { retry: true, effort: undefined };
  }
  return { retry: false, effort: current };
}

/**
 * One non-streaming chat-completions round-trip. Returns the reply text, or
 * throws with the backend's error detail on HTTP failure / empty reply.
 */
export async function chatCompletion(
  config: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  assertSecureAIConfig(config);
  const endpointUrl = new URL(config.endpoint.trim());
  endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/+$/, "")}/chat/completions`;
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };

  let effort: ReasoningEffort | undefined =
    config.reasoningEffort ?? (config.noReasoning ? "none" : undefined);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithRetry(endpointUrl.toString(), {
      method: "POST",
      redirect: "error",
      timeoutMs: AI_TIMEOUT_MS,
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        stream: false,
        max_tokens: AI_MAX_TOKENS,
        ...(effort ? { reasoning: { effort } } : {}),
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
      if (res.status === 400 && attempt === 0) {
        const fallback = fallbackReasoningEffort(effort, detail);
        if (fallback.retry) {
          effort = fallback.effort;
          continue;
        }
      }
      throw new Error(`AI translate failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("AI provider returned an empty response");
    }
    return content;
  }

  throw new Error("AI translate failed");
}

/** Plain http:// is allowed — the bundled gateway has no TLS. See SECURITY.md. */
export function assertSecureAIConfig(config: AIProviderConfig): void {
  const endpoint = config.endpoint.trim();
  if (!endpoint) {
    throw new Error("AI endpoint is not configured.");
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("AI endpoint is invalid.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("AI endpoint must use http:// or https://.");
  }
}

/**
 * Extracts the translated strings from the model's reply. Tries to parse a
 * JSON array first (the requested format); if the model wrapped it in prose
 * or markdown fences, we strip those and retry. As a last resort for a single
 * input we treat the whole reply as the translation, unless it looks like a
 * JSON reply we failed to read.
 *
 * Always returns an array of exactly `inputs.length` strings: missing slots
 * fall back to the original text so the engine leaves those nodes untouched.
 */
export function parseAIContent(content: string, inputs: string[]): string[] {
  return parseAIResult(content, inputs).translations;
}

/**
 * Same as {@link parseAIContent} but also reports which slots are padding
 * rather than real translations, so the caller can retry exactly those.
 */
/**
 * Strip `<think>...</think>` reasoning blocks emitted by thinking models
 * (DeepSeek-R1, Qwen3, Ollama reasoning models, etc.) before parsing JSON/prose.
 */
function stripReasoningTags(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

export function parseAIResult(content: string, inputs: string[]): TranslateResult {
  const cleaned = stripReasoningTags(content);
  if (!cleaned) {
    return { translations: [...inputs], failed: inputs.map(() => true) };
  }
  const parsed = tryParseJSONArray(cleaned, inputs.length > 1);
  // A single input whose "array" isn't one string was most likely prose with
  // brackets in it ("Chương [3]"); let the raw-reply path below handle it.
  const isSingleString = parsed?.length === 1 && typeof parsed[0] === "string";
  if (parsed && (inputs.length > 1 || isSingleString)) return alignToInputs(parsed, inputs);

  // Couldn't parse an array. For a single segment, use the raw reply, but never
  // a JSON-looking one (`{"translation": …}`, a fenced block): caching that as
  // page text would show raw JSON for days.
  if (inputs.length === 1 && !/^\s*(?:[[{]|```)/.test(cleaned)) {
    return { translations: [cleaned] };
  }

  // Otherwise we can't safely realign; return originals unchanged and flag
  // every slot so none of them get cached as a result.
  return { translations: [...inputs], failed: inputs.map(() => true) };
}

/**
 * Parse the auto-detect object reply `{"detected": "...", "translations": [...]}`.
 * If the model ignored the object contract and returned a bare array (or prose),
 * we fall back to the array parser and simply report no detected language.
 */
function parseAIWithDetection(content: string, inputs: string[]): TranslateResult {
  const cleaned = stripReasoningTags(content);
  const obj = tryParseJSONObject(cleaned);
  if (obj && Array.isArray(obj.translations)) {
    const raw = typeof obj.detected === "string" ? obj.detected.trim().toLowerCase() : "";
    return {
      ...alignToInputs(obj.translations, inputs),
      detected: raw || undefined
    };
  }
  return parseAIResult(cleaned, inputs);
}

/**
 * Align a parsed array to exactly `inputs.length` strings.
 *
 * A count mismatch means the model merged or split segments somewhere, and
 * there is no telling where: keeping the head would shift every later
 * translation onto the wrong node (and cache it). So every slot falls back to
 * its original and is flagged. A non-string item is flagged the same way.
 */
function alignToInputs(parsed: unknown[], inputs: string[]): TranslateResult {
  if (parsed.length !== inputs.length) {
    return { translations: [...inputs], failed: inputs.map(() => true) };
  }
  const failed = parsed.map((v) => typeof v !== "string");
  const translations = parsed.map((v, i) => (typeof v === "string" ? v : inputs[i]));
  return { translations, failed: failedMask(failed) };
}

/** Best-effort JSON-array extraction tolerant of markdown fences / stray prose. */
function tryParseJSONArray(content: string, allowSubslice = true): unknown[] | null {
  const trimmed = content.trim();

  const direct = safeParseArray(trimmed);
  if (direct) return direct;

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const inner = safeParseArray(fenced[1].trim());
    if (inner) return inner;
  }

  if (!allowSubslice) return null;

  // Grab the first [...] block in the text; if preamble brackets confuse a
  // naive first-to-last slice, walk balanced [...] candidates from the end.
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const inner = safeParseArray(trimmed.slice(start, end + 1));
    if (inner) return inner;
    for (const candidate of findBalancedBlocks(trimmed, "[", "]")) {
      const parsed = safeParseArray(candidate);
      if (parsed) return parsed;
    }
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

interface AIObjectReply {
  detected?: unknown;
  translations?: unknown;
}

/** Best-effort JSON-object extraction tolerant of markdown fences / stray prose. */
function tryParseJSONObject(content: string): AIObjectReply | null {
  const trimmed = content.trim();

  const direct = safeParseObject(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    const inner = safeParseObject(fenced[1].trim());
    if (inner) return inner;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const inner = safeParseObject(trimmed.slice(start, end + 1));
    if (inner) return inner;
    for (const candidate of findBalancedBlocks(trimmed, "{", "}")) {
      const parsed = safeParseObject(candidate);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Return top-level balanced JSON bracket blocks in reverse order (preferring the final reply). */
function findBalancedBlocks(text: string, open: "[" | "{", close: "]" | "}"): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === close && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        blocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return blocks.reverse();
}

function safeParseObject(text: string): AIObjectReply | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as AIObjectReply)
      : null;
  } catch {
    return null;
  }
}
