import {
  DEFAULT_SETTINGS,
  customProviderId,
  isCustomProvider,
  type AIProviderId,
  type CustomModel,
  type ProviderId,
  type Settings
} from "./types";

const SETTINGS_KEY = "web-translator:settings";

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (!stored) return { ...DEFAULT_SETTINGS };
  return mergeSettings(stored);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area !== "local" || !(SETTINGS_KEY in changes)) return;
    const next = changes[SETTINGS_KEY]?.newValue as Partial<Settings> | undefined;
    callback(next ? mergeSettings(next) : { ...DEFAULT_SETTINGS });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Drop malformed entries and coerce each custom model to known fields. */
function sanitizeCustomModels(raw: unknown): CustomModel[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const models: CustomModel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Partial<CustomModel>;
    const id = typeof m.id === "string" ? m.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      name: typeof m.name === "string" ? m.name : "",
      endpoint: typeof m.endpoint === "string" ? m.endpoint : "",
      apiKey: typeof m.apiKey === "string" ? m.apiKey : "",
      model: typeof m.model === "string" ? m.model : ""
    });
  }
  return models;
}

export function mergeSettings(stored: Partial<Settings> & { provider?: string }): Settings {
  const customModels = sanitizeCustomModels(stored.customModels);
  const customIds = new Set(customModels.map((m) => customProviderId(m.id)));

  const isValidProvider = (id: string): id is ProviderId =>
    id === "google" ||
    id === "bing" ||
    id === "gemma" ||
    (isCustomProvider(id) && customIds.has(id));

  const raw = stored.provider as string | undefined;
  let provider: ProviderId = DEFAULT_SETTINGS.provider;
  if (raw === "microsoft") provider = "bing"; // legacy migration
  // Discontinued providers fall back to the default.
  else if (raw === "lingva" || raw === "mymemory") provider = DEFAULT_SETTINGS.provider;
  else if (raw && isValidProvider(raw)) provider = raw;

  // `gemma` is a fixed developer-provided backend: always use the bundled
  // default and ignore any stored overrides.
  const ai: Settings["providers"]["ai"] = {
    gemma: { ...DEFAULT_SETTINGS.providers.ai.gemma }
  };

  // The dedicated AI provider must be `gemma` or an existing custom model;
  // fall back to the default otherwise (e.g. the model was deleted).
  const rawAI = stored.aiProvider as string | undefined;
  const aiProvider: AIProviderId =
    rawAI === "gemma" || (rawAI && isCustomProvider(rawAI) && customIds.has(rawAI))
      ? (rawAI as AIProviderId)
      : DEFAULT_SETTINGS.aiProvider;

  // The AI translation presentation mode falls back to the default for any
  // value outside the known set.
  const aiTranslationMode: Settings["aiTranslationMode"] =
    stored.aiTranslationMode === "replace" || stored.aiTranslationMode === "below"
      ? stored.aiTranslationMode
      : DEFAULT_SETTINGS.aiTranslationMode;

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    provider,
    aiProvider,
    aiTranslationMode,
    customModels,
    hostRules: { ...DEFAULT_SETTINGS.hostRules, ...(stored.hostRules ?? {}) },
    providers: {
      google: {
        ...DEFAULT_SETTINGS.providers.google,
        ...(stored.providers?.google ?? {})
      },
      ai
    }
  };
}
