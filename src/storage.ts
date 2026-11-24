import {
  DEFAULT_SETTINGS,
  isAIProvider,
  isCustomProvider,
  customProviderId,
  type AIProviderId,
  type CustomModel,
  type ProviderId,
  type Settings
} from "./types";
import { LANGUAGES } from "./languages";

export const SETTINGS_KEY = "web-translator:settings";

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (!stored) return { ...DEFAULT_SETTINGS };
  return mergeSettings(stored);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Direct storage mutation used only by the service worker's serialized queue. */
export async function applySettingsPatch(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = mergeSettings({ ...current, ...patch });
  await saveSettings(next);
  return next;
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
  const response = (await chrome.runtime.sendMessage({ type: "update-settings", patch })) as
    { settings?: Settings; error?: string } | undefined;
  if (!response?.settings) {
    throw new Error(response?.error ?? "Couldn't save settings");
  }
  return mergeSettings(response.settings);
}

/** Remove secrets before settings cross the service-worker/content-script boundary. */
export function sanitizeSettingsForContent(settings: Settings): Settings {
  return {
    ...settings,
    customModels: settings.customModels.map((model) => ({
      ...model,
      endpoint: "",
      apiKey: "",
      model: ""
    })),
    providers: {
      google: {},
      ai: {
        "auto-free": { ...settings.providers.ai["auto-free"], apiKey: "" }
      }
    }
  };
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
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
      model: typeof m.model === "string" ? m.model : "",
      noReasoning: m.noReasoning === true
    });
  }
  return models;
}

const BUILTIN_PROVIDERS: ProviderId[] = ["google", "bing", "auto-free"];
const VALID_LANGUAGES = new Set(LANGUAGES.map((language) => language.code));
const VALID_AUTO_RULES = new Set(["always", "never", "ask"]);

/** Retired built-in AI backend ids that map to the current default AI model. */
const RETIRED_AI_PROVIDERS = new Set([
  "gemma",
  "qwen",
  "hy3",
  "mimo",
  "mistral",
  "ling",
  "deepseek",
  "gpt-oss"
]);

function isValidProvider(id: string): id is ProviderId {
  return BUILTIN_PROVIDERS.includes(id as ProviderId) || isCustomProvider(id);
}

function resolveProvider(raw: unknown, customModels: CustomModel[]): ProviderId {
  if (typeof raw !== "string" || !raw) return DEFAULT_SETTINGS.provider;
  if (raw === "microsoft") return "bing";
  // Retired bundled AI backends: migrate to the current default AI model.
  if (RETIRED_AI_PROVIDERS.has(raw)) return DEFAULT_SETTINGS.aiProvider;
  if (raw === "lingva" || raw === "mymemory") return DEFAULT_SETTINGS.provider;
  if (!isValidProvider(raw)) return DEFAULT_SETTINGS.provider;
  if (isCustomProvider(raw)) {
    const exists = customModels.some((m) => customProviderId(m.id) === raw);
    return exists ? raw : DEFAULT_SETTINGS.provider;
  }
  return raw;
}

function resolveAIProvider(raw: unknown, customModels: CustomModel[]): AIProviderId {
  if (typeof raw !== "string" || !raw) return DEFAULT_SETTINGS.aiProvider;
  if (RETIRED_AI_PROVIDERS.has(raw)) return DEFAULT_SETTINGS.aiProvider;
  if (!isAIProvider(raw as ProviderId)) return DEFAULT_SETTINGS.aiProvider;
  if (isCustomProvider(raw as ProviderId)) {
    const exists = customModels.some((m) => customProviderId(m.id) === raw);
    return exists ? (raw as AIProviderId) : DEFAULT_SETTINGS.aiProvider;
  }
  return raw as AIProviderId;
}

export function firstEnabledProvider(
  customModels: CustomModel[],
  disabled: ReadonlySet<ProviderId>
): ProviderId {
  const candidates: ProviderId[] = [
    ...BUILTIN_PROVIDERS,
    ...customModels.map((m) => customProviderId(m.id))
  ];
  return candidates.find((id) => !disabled.has(id)) ?? DEFAULT_SETTINGS.provider;
}

export function firstEnabledAIProvider(
  customModels: CustomModel[],
  disabled: ReadonlySet<ProviderId>
): AIProviderId {
  const candidates: AIProviderId[] = [
    "auto-free",
    ...customModels.map((m) => customProviderId(m.id))
  ];
  return candidates.find((id) => !disabled.has(id)) ?? DEFAULT_SETTINGS.aiProvider;
}

export function mergeSettings(stored: Partial<Settings> & { provider?: string }): Settings {
  const customModels = sanitizeCustomModels(stored.customModels);

  const provider = resolveProvider(stored.provider, customModels);
  const quickProvider = resolveProvider(stored.quickProvider as string | undefined, customModels);

  // Built-in AI backends are fixed: always use the bundled defaults and ignore
  // any stored overrides.
  const ai: Settings["providers"]["ai"] = {
    "auto-free": { ...DEFAULT_SETTINGS.providers.ai["auto-free"] }
  };

  const aiProvider = resolveAIProvider(stored.aiProvider as string | undefined, customModels);

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

  const displayMode: Settings["displayMode"] =
    stored.displayMode === "bilingual" || stored.displayMode === "replace"
      ? stored.displayMode
      : DEFAULT_SETTINGS.displayMode;
  const sourceLang =
    typeof stored.sourceLang === "string" && VALID_LANGUAGES.has(stored.sourceLang)
      ? stored.sourceLang
      : DEFAULT_SETTINGS.sourceLang;
  const targetLang =
    typeof stored.targetLang === "string" &&
    stored.targetLang !== "auto" &&
    VALID_LANGUAGES.has(stored.targetLang)
      ? stored.targetLang
      : DEFAULT_SETTINGS.targetLang;
  const autoRule = VALID_AUTO_RULES.has(stored.autoRule ?? "")
    ? (stored.autoRule as Settings["autoRule"])
    : DEFAULT_SETTINGS.autoRule;
  const hostRules = Object.fromEntries(
    Object.entries(stored.hostRules ?? {}).filter(
      ([host, rule]) => host.length > 0 && VALID_AUTO_RULES.has(rule)
    )
  ) as Settings["hostRules"];

  const disabledProviders = Array.isArray(stored.disabledProviders)
    ? [...new Set(stored.disabledProviders.filter((p): p is ProviderId => typeof p === "string"))]
    : DEFAULT_SETTINGS.disabledProviders;

  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    provider,
    quickProvider,
    aiProvider,
    aiTranslationMode,
    dictionaryMode,
    displayMode,
    sourceLang,
    targetLang,
    autoRule,
    disabledProviders,
    showSelectionOriginal:
      typeof stored.showSelectionOriginal === "boolean"
        ? stored.showSelectionOriginal
        : DEFAULT_SETTINGS.showSelectionOriginal,
    uiTheme:
      stored.uiTheme === "system" || stored.uiTheme === "light" || stored.uiTheme === "dark"
        ? stored.uiTheme
        : DEFAULT_SETTINGS.uiTheme,
    selectionPopupTheme:
      stored.selectionPopupTheme === "dark" || stored.selectionPopupTheme === "light"
        ? stored.selectionPopupTheme
        : DEFAULT_SETTINGS.selectionPopupTheme,
    selectionTrigger:
      typeof stored.selectionTrigger === "boolean"
        ? stored.selectionTrigger
        : DEFAULT_SETTINGS.selectionTrigger,
    selectionHoverDelayMs:
      typeof stored.selectionHoverDelayMs === "number" &&
      Number.isFinite(stored.selectionHoverDelayMs)
        ? Math.min(2000, Math.max(0, Math.round(stored.selectionHoverDelayMs)))
        : DEFAULT_SETTINGS.selectionHoverDelayMs,
    dictionaryInPopup:
      typeof stored.dictionaryInPopup === "boolean"
        ? stored.dictionaryInPopup
        : DEFAULT_SETTINGS.dictionaryInPopup,
    youtubeSubtitle:
      typeof stored.youtubeSubtitle === "boolean"
        ? stored.youtubeSubtitle
        : DEFAULT_SETTINGS.youtubeSubtitle,
    youtubeSubtitleLang:
      typeof stored.youtubeSubtitleLang === "string" &&
      stored.youtubeSubtitleLang !== "auto" &&
      VALID_LANGUAGES.has(stored.youtubeSubtitleLang)
        ? stored.youtubeSubtitleLang
        : DEFAULT_SETTINGS.youtubeSubtitleLang,
    youtubeSubtitleAutoOn:
      typeof stored.youtubeSubtitleAutoOn === "boolean"
        ? stored.youtubeSubtitleAutoOn
        : DEFAULT_SETTINGS.youtubeSubtitleAutoOn,
    youtubeSubtitleBilingual:
      typeof stored.youtubeSubtitleBilingual === "boolean"
        ? stored.youtubeSubtitleBilingual
        : DEFAULT_SETTINGS.youtubeSubtitleBilingual,
    customModels,
    hostRules,
    providers: {
      google: {
        ...DEFAULT_SETTINGS.providers.google,
        ...(stored.providers?.google ?? {})
      },
      ai
    }
  };

  // Never allow a disabled provider to stay selected for a translation task.
  const disabled = new Set(merged.disabledProviders);
  if (disabled.has(merged.provider)) {
    merged.provider = firstEnabledProvider(customModels, disabled);
  }
  if (disabled.has(merged.quickProvider)) {
    merged.quickProvider = firstEnabledProvider(customModels, disabled);
  }
  if (disabled.has(merged.aiProvider)) {
    merged.aiProvider = firstEnabledAIProvider(customModels, disabled);
  }

  return merged;
}
