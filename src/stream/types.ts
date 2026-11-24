/**
 * Shared types and helpers for the Soniox real-time stream translator UI.
 * These mirror the runtime state the background `streamBackground.ts` module
 * exposes through `chrome.runtime.sendMessage` and `chrome.storage.local`.
 */

/**
 * When the translator pauses itself (closing the billed Soniox session):
 * - `unfocused`: the captured tab is hidden or its window loses focus
 * - `hidden`: only when the captured tab is hidden (switched away, minimized)
 * - `off`: never
 */
export type StreamAutoPauseMode = "unfocused" | "hidden" | "off";

export const STREAM_AUTO_PAUSE_MODES: readonly StreamAutoPauseMode[] = [
  "unfocused",
  "hidden",
  "off"
];

/** Runtime state reported by the stream background worker. */
export interface StreamRuntimeState {
  revision: number;
  isActive: boolean;
  isPaused: boolean;
  /** No audio for a while: the Soniox session is closed until sound returns. */
  isStandby: boolean;
  autoPause: StreamAutoPauseMode;
  targetLang: string;
  statusMessage: string;
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  hasApiKey: boolean;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
  error?: string;
}

/** Persisted overlay settings (mirrors `streamTranslatorSettings`). */
export interface StreamOverlaySettings {
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
  autoPause: StreamAutoPauseMode;
}

export const STREAM_STATE_KEY = "streamTranslatorState";
export const STREAM_SETTINGS_KEY = "streamTranslatorSettings";

export const DEFAULT_STREAM_STATE: StreamRuntimeState = {
  revision: 0,
  isActive: false,
  isPaused: false,
  isStandby: false,
  autoPause: "unfocused",
  targetLang: "vi",
  statusMessage: "Ready to translate. Open a video or stream, then press start.",
  fontScale: 100,
  opacity: 85,
  showSource: true,
  showSpeaker: false,
  hasApiKey: false,
  displayMode: "transcript",
  autoScroll: true
};

export interface StreamLanguageOption {
  value: string;
  label: string;
  short: string;
}

/** Most-used targets first, then the rest of Soniox's list by English name. */
const STREAM_LANGUAGES: [code: string, native: string][] = [
  ["vi", "Tiếng Việt"],
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["zh", "中文"],
  ["af", "Afrikaans"],
  ["sq", "Shqip"],
  ["ar", "العربية"],
  ["az", "Azərbaycanca"],
  ["eu", "Euskara"],
  ["be", "Беларуская"],
  ["bn", "বাংলা"],
  ["bs", "Bosanski"],
  ["bg", "Български"],
  ["ca", "Català"],
  ["hr", "Hrvatski"],
  ["cs", "Čeština"],
  ["da", "Dansk"],
  ["nl", "Nederlands"],
  ["et", "Eesti"],
  ["fi", "Suomi"],
  ["gl", "Galego"],
  ["el", "Ελληνικά"],
  ["gu", "ગુજરાતી"],
  ["he", "עברית"],
  ["hi", "हिन्दी"],
  ["hu", "Magyar"],
  ["id", "Bahasa Indonesia"],
  ["it", "Italiano"],
  ["kn", "ಕನ್ನಡ"],
  ["kk", "Қазақ тілі"],
  ["lv", "Latviešu"],
  ["lt", "Lietuvių"],
  ["mk", "Македонски"],
  ["ms", "Bahasa Melayu"],
  ["ml", "മലയാളം"],
  ["mr", "मराठी"],
  ["no", "Norsk"],
  ["fa", "فارسی"],
  ["pl", "Polski"],
  ["pt", "Português"],
  ["pa", "ਪੰਜਾਬੀ"],
  ["ro", "Română"],
  ["ru", "Русский"],
  ["sr", "Српски"],
  ["sk", "Slovenčina"],
  ["sl", "Slovenščina"],
  ["sw", "Kiswahili"],
  ["sv", "Svenska"],
  ["tl", "Tagalog"],
  ["ta", "தமிழ்"],
  ["te", "తెలుగు"],
  ["th", "ไทย"],
  ["tr", "Türkçe"],
  ["uk", "Українська"],
  ["ur", "اردو"],
  ["cy", "Cymraeg"]
];

/**
 * Every target language Soniox real-time translation accepts
 * (https://docs.soniox.com/translation/supported-languages).
 */
export const STREAM_LANGUAGE_OPTIONS: StreamLanguageOption[] = STREAM_LANGUAGES.map(
  ([value, label]) => ({ value, label, short: value.toUpperCase() })
);

const STREAM_LANGUAGE_CODES = new Set(STREAM_LANGUAGE_OPTIONS.map((option) => option.value));

/**
 * Map a stored or requested language code to a Soniox target code, or `null`
 * when Soniox can't translate into it. Folds the web translator's Chinese
 * variants (`zh-CN` / `zh-TW`) into Soniox's single `zh`.
 */
export function normalizeStreamTargetLanguage(value: string): string | null {
  const code = value === "zh-CN" || value === "zh-TW" ? "zh" : value;
  return STREAM_LANGUAGE_CODES.has(code) ? code : null;
}

/** Send a typed message to the stream background and return the next state. */
export async function sendStreamMessage(
  message: Record<string, unknown>
): Promise<StreamRuntimeState | undefined> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as StreamRuntimeState | undefined;
    return response;
  } catch {
    return undefined;
  }
}

/** Fetch the current stream runtime state from the background worker. */
export async function getStreamState(): Promise<StreamRuntimeState | undefined> {
  return sendStreamMessage({ type: "GET_TRANSLATION_STATE" });
}

/**
 * Subscribe to live stream-state changes via `chrome.storage.local`. Returns an
 * unsubscribe function.
 */
export function watchStreamState(callback: (state: StreamRuntimeState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== "local") return;
    const next = changes[STREAM_STATE_KEY]?.newValue as StreamRuntimeState | undefined;
    if (next) callback(next);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
