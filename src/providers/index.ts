import {
  customModelId,
  isAIProvider,
  isCustomProvider,
  type AIProviderConfig,
  type ProviderId,
  type Settings
} from "../types";
import { translateAI } from "./ai";
import { translateBing } from "./bing";
import { translateGoogle } from "./google";
import type { TranslateResult } from "./types";

/**
 * Resolve the connection config for an AI provider id: the fixed `gemma`
 * backend, or a user-added custom model looked up by its id. Throws a friendly
 * error when a custom model referenced by settings no longer exists (e.g. it
 * was deleted while still selected).
 */
function resolveAIConfig(provider: ProviderId, settings: Settings): AIProviderConfig {
  if (isCustomProvider(provider)) {
    const id = customModelId(provider);
    const model = settings.customModels.find((m) => m.id === id);
    if (!model) {
      throw new Error("Mô hình tuỳ chỉnh không còn tồn tại. Vui lòng chọn lại.");
    }
    return { endpoint: model.endpoint, apiKey: model.apiKey, model: model.model };
  }
  if (provider === "qwen") {
    return settings.providers.ai.qwen;
  }
  if (provider === "hy3") {
    return settings.providers.ai.hy3;
  }
  return settings.providers.ai.gemma;
}

export async function translateWith(
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

export { translateAI, translateBing, translateGoogle };
export type { TranslateResult };
