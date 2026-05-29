/**
 * Shared types and helpers for the Soniox real-time stream translator UI.
 * These mirror the runtime state the background `streamBackground.ts` module
 * exposes through `chrome.runtime.sendMessage` and `chrome.storage.local`.
 */

/** Runtime state reported by the stream background worker. */
export interface StreamRuntimeState {
  isActive: boolean;
  isPaused: boolean;
  targetLang: string;
  statusMessage: string;
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  apiKey: string;
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
  apiKey: string;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
}

export const STREAM_STATE_KEY = "streamTranslatorState";
export const STREAM_SETTINGS_KEY = "streamTranslatorSettings";

export const DEFAULT_STREAM_STATE: StreamRuntimeState = {
  isActive: false,
  isPaused: false,
  targetLang: "vi",
  statusMessage: "Sẵn sàng dịch. Mở một video hoặc stream rồi bấm bắt đầu.",
  fontScale: 100,
  opacity: 85,
  showSource: true,
  showSpeaker: false,
  apiKey: "",
  displayMode: "transcript",
  autoScroll: true
};

export interface StreamLanguageOption {
  value: string;
  label: string;
  short: string;
  flag: string;
}

/**
 * Languages Soniox one-way translation supports well. Kept intentionally short
 * and aligned with the original stream-translator picker.
 */
export const STREAM_LANGUAGE_OPTIONS: StreamLanguageOption[] = [
  { value: "vi", label: "Tiếng Việt", short: "VI", flag: "🇻🇳" },
  { value: "en", label: "English", short: "EN", flag: "🇺🇸" },
  { value: "es", label: "Español", short: "ES", flag: "🇪🇸" },
  { value: "fr", label: "Français", short: "FR", flag: "🇫🇷" },
  { value: "de", label: "Deutsch", short: "DE", flag: "🇩🇪" },
  { value: "ja", label: "日本語", short: "JA", flag: "🇯🇵" },
  { value: "ko", label: "한국어", short: "KO", flag: "🇰🇷" },
  { value: "zh", label: "中文", short: "ZH", flag: "🇨🇳" }
];

/** Send a typed message to the stream background and return the next state. */
export async function sendStreamMessage(
  message: Record<string, unknown>
): Promise<StreamRuntimeState | undefined> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      | StreamRuntimeState
      | undefined;
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
export function watchStreamState(
  callback: (state: StreamRuntimeState) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== "local") return;
    const next = changes[STREAM_STATE_KEY]?.newValue as StreamRuntimeState | undefined;
    if (next) callback(next);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
