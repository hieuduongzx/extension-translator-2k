import {
  customModelId,
  isAIProvider,
  isCustomProvider,
  type AIProviderConfig,
  type AIProviderId,
  type ProviderId,
  type Settings
} from "../types";
import { translateAI, AI_CHUNK_CHAR_LIMIT } from "./ai";
import { translateBing } from "./bing";
import { translateGoogle } from "./google";
import { failedMask, type TranslateResult } from "./types";
import { BATCH_CHAR_LIMIT } from "../content/constants";

/**
 * Resolve the connection config for an AI provider id: a bundled backend, or a
 * user-added custom model looked up by its id. Throws a friendly error when a
 * custom model referenced by settings no longer exists.
 */
export function resolveAIConfig(provider: AIProviderId, settings: Settings): AIProviderConfig {
  if (isCustomProvider(provider)) {
    const id = customModelId(provider);
    const model = settings.customModels.find((m) => m.id === id);
    if (!model) {
      throw new Error("Custom model no longer exists. Please choose again.");
    }
    return {
      endpoint: model.endpoint,
      apiKey: model.apiKey,
      model: model.model,
      noReasoning: model.noReasoning,
      reasoningEffort: model.reasoningEffort
    };
  }
  return settings.providers.ai[provider];
}

export async function translateWith(
  provider: ProviderId,
  texts: string[],
  source: string,
  target: string,
  settings: Settings
): Promise<TranslateResult> {
  if (texts.length === 0) return { translations: [] };
  const providerLimit = isAIProvider(provider) ? AI_CHUNK_CHAR_LIMIT : BATCH_CHAR_LIMIT;
  const allFitIndividually = texts.every((text) => text.length <= providerLimit);
  if (allFitIndividually) {
    // AI already chunks and runs a parallel worker pool inside `translateAI`.
    if (
      isAIProvider(provider) ||
      texts.reduce((total, text) => total + text.length, 0) <= providerLimit
    ) {
      return translateDirect(provider, texts, source, target, settings);
    }
  }

  // Re-pack normal-sized segments into sub-batches bounded by `providerLimit`
  // instead of degrading the whole array into N sequential 1-item HTTP calls,
  // and split only individual segments that exceed `providerLimit`.
  const translations: string[] = new Array(texts.length).fill("");
  const failed: boolean[] = new Array(texts.length).fill(false);
  let detected: string | undefined;
  let lastError: unknown;
  let anySucceeded = false;

  const flushBatch = async (indices: number[]): Promise<void> => {
    if (indices.length === 0) return;
    const batchTexts = indices.map((i) => texts[i]);
    try {
      const result = await translateDirect(provider, batchTexts, source, target, settings);
      if (!detected && result.detected) detected = result.detected;
      indices.forEach((origIndex, j) => {
        const bad = Boolean(result.failed?.[j]) || !result.translations[j];
        translations[origIndex] = bad ? "" : result.translations[j];
        failed[origIndex] = bad;
        if (!bad) anySucceeded = true;
      });
    } catch (err) {
      lastError = err;
      for (const origIndex of indices) failed[origIndex] = true;
    }
  };

  let pendingIndices: number[] = [];
  let pendingChars = 0;

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (text.length <= providerLimit) {
      if (pendingIndices.length > 0 && pendingChars + text.length > providerLimit) {
        await flushBatch(pendingIndices);
        pendingIndices = [];
        pendingChars = 0;
      }
      pendingIndices.push(i);
      pendingChars += text.length;
      continue;
    }

    if (pendingIndices.length > 0) {
      await flushBatch(pendingIndices);
      pendingIndices = [];
      pendingChars = 0;
    }

    const parts = splitProviderText(text, providerLimit);
    const translatedParts: string[] = [];
    let partsFailed = false;
    for (const part of parts) {
      if (part.text.trim() === "") {
        translatedParts.push(part.text + part.separatorAfter);
        continue;
      }
      try {
        const result = await translateDirect(provider, [part.text], source, target, settings);
        const translated = result.translations[0];
        if (!translated || result.failed?.[0]) {
          partsFailed = true;
          break;
        }
        translatedParts.push(translated + part.separatorAfter);
        if (!detected && result.detected) detected = result.detected;
      } catch (err) {
        lastError = err;
        partsFailed = true;
        break;
      }
    }
    translations[i] = partsFailed ? "" : translatedParts.join("");
    failed[i] = partsFailed;
    if (!partsFailed) anySucceeded = true;
  }

  if (pendingIndices.length > 0) {
    await flushBatch(pendingIndices);
  }

  if (!anySucceeded && lastError) throw lastError;
  return { translations, detected, failed: failedMask(failed) };
}

async function translateDirect(
  provider: ProviderId,
  texts: string[],
  source: string,
  target: string,
  settings: Settings
): Promise<TranslateResult> {
  if (isAIProvider(provider)) {
    return translateAI(texts, source, target, resolveAIConfig(provider, settings));
  }
  switch (provider) {
    case "google":
      return translateGoogle(texts, source, target);
    case "bing":
      return translateBing(texts, source, target);
    default:
      return translateGoogle(texts, source, target);
  }
}

export interface ProviderTextPart {
  text: string;
  separatorAfter: string;
}

/** Split a single oversized node without cutting surrogate pairs or whitespace. */
export function splitProviderText(text: string, limit = BATCH_CHAR_LIMIT): ProviderTextPart[] {
  if (text.length <= limit) return [{ text, separatorAfter: "" }];
  const parts: ProviderTextPart[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + limit);
    if (end < text.length) {
      // Find the last whitespace inside [start, end] that still leaves at least
      // one non-whitespace character in the chunk (avoids leading-space splits).
      let ws = -1;
      for (let i = end; i > start; i--) {
        if (/\s/u.test(text[i])) {
          ws = i;
          break;
        }
      }
      if (ws > start && /\S/u.test(text.slice(start, ws))) {
        end = ws;
      }
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    if (end <= start) end = Math.min(text.length, start + limit);
    let separatorEnd = end;
    while (separatorEnd < text.length && /\s/u.test(text[separatorEnd])) separatorEnd++;
    parts.push({ text: text.slice(start, end), separatorAfter: text.slice(end, separatorEnd) });
    start = separatorEnd;
  }
  return parts;
}

export function providerCacheKey(provider: ProviderId, settings: Settings): string {
  if (!isAIProvider(provider)) return provider === "google" ? "google:v2" : provider;
  const config = resolveAIConfig(provider, settings);
  return `${provider}:${config.endpoint.trim()}:${config.model.trim()}`;
}

export { translateAI, translateBing, translateGoogle };
export type { TranslateResult };
