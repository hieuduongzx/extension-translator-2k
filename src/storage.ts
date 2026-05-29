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

/**
 * Apply a partial update to the stored settings, merging over the **freshest**
 * value in storage rather than a possibly-stale in-memory snapshot.
 *
 * This avoids a read-modify-write race: several contexts (the popup, the
 * options page, and every tab's content script) can each hold their own
 * `Settings` copy. Writing a full snapshot from a stale copy would silently
 * revert fields changed elsewhere (e.g. an in-page popup persisting `provider`
 * would clobber an `autoRule`/`hostRules` change made in the popup). Routing
 * single-field changes through here keeps the unrelated fields intact.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = { ...current, ...patch };
  await saveSettings(next);
  return next;
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

/**
 * Shallow diff of two settings objects: returns only the top-level keys whose
 * value changed (by reference / strict equality). Used so UI writes touch just
 * the fields the user actually changed, avoiding clobbering concurrent writes.
 */
export function diffSettings(prev: Settings, next: Settings): Partial<Settings> {
  const patch: Partial<Settings> = {};
  (Object.keys(next) as (keyof Settings)[]).forEach((key) => {
    if (next[key] !== prev[key]) {
      (patch as Record<keyof Settings, unknown>)[key] = next[key];
    }
  });
  return patch;
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

  // Dictionary trigger mode. Validate against the known set and migrate the
  // legacy `dictionaryOnDoubleClick` boolean (true → "doubleclick").
  const rawDict = (stored as { dictionaryMode?: string }).dictionaryMode;
  const legacyDoubleClick = (stored as { dictionaryOnDoubleClick?: boolean })
    .dictionaryOnDoubleClick;
  const dictionaryMode: Settings["dictionaryMode"] =
    rawDict === "doubleclick" || rawDict === "alt-doubleclick" || rawDict === "off"
      ? rawDict
      : typeof legacyDoubleClick === "boolean"
        ? legacyDoubleClick
          ? "doubleclick"
          : "off"
        : DEFAULT_SETTINGS.dictionaryMode;

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    provider,
    aiProvider,
    aiTranslationMode,
    dictionaryMode,
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
