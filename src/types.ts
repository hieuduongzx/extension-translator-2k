/** Built-in providers shipped with the extension. */
export type BuiltinProviderId = "google" | "bing" | "gemma";
/**
 * A user-added custom model. Encoded as `custom:<modelId>` so the provider id
 * stays a plain string everywhere it already flows (messages, cache keys, …).
 */
export type CustomProviderId = `custom:${string}`;
export type ProviderId = BuiltinProviderId | CustomProviderId;

/**
 * Providers that talk to an OpenAI-compatible chat-completions endpoint:
 * the bundled `gemma` plus every user-added custom model.
 */
export type AIProviderId = "gemma" | CustomProviderId;

const CUSTOM_PREFIX = "custom:";

export function isCustomProvider(id: string): id is CustomProviderId {
  return id.startsWith(CUSTOM_PREFIX);
}

/** Build a provider id from a custom model's stable id. */
export function customProviderId(modelId: string): CustomProviderId {
  return `${CUSTOM_PREFIX}${modelId}`;
}

/** Extract the custom model id back out of a `custom:<id>` provider id. */
export function customModelId(id: CustomProviderId): string {
  return id.slice(CUSTOM_PREFIX.length);
}

export function isAIProvider(id: ProviderId): id is AIProviderId {
  return id === "gemma" || isCustomProvider(id);
}

export type DisplayMode = "bilingual" | "replace";

export type AutoRule = "always" | "never" | "ask";

/** How the in-page dictionary lookup popup is triggered. */
export type DictionaryMode = "doubleclick" | "alt-doubleclick" | "off";

/**
 * Connection settings for an OpenAI-compatible chat-completions endpoint.
 * Used directly for the fixed `gemma` backend and embedded in each
 * {@link CustomModel}.
 */
export interface AIProviderConfig {
  /** Base URL ending at `/v1` (the provider appends `/chat/completions`). */
  endpoint: string;
  apiKey: string;
  /** Model name sent in the request body. */
  model: string;
}

/**
 * A user-defined AI model. The user can add any number of these; each one
 * shows up as a selectable provider in the popups and is editable in Settings.
 */
export interface CustomModel extends AIProviderConfig {
  /** Stable unique id (generated once, used to form the `custom:<id>` id). */
  id: string;
  /** Friendly display name shown in the provider pickers. */
  name: string;
}

export interface ProviderSettings {
  google: {
    /** No key required for the public endpoint, kept for future official Cloud API support. */
    apiKey?: string;
  };
  /** Fixed developer-provided AI backend(s). Currently just Gemma. */
  ai: { gemma: AIProviderConfig };
}

export interface Settings {
  /** The main translation service used for full-page translation. */
  provider: ProviderId;
  /**
   * Provider used when selecting text on a page and opening the in-page
   * translation popup (quick/bôi đen). Independent of `provider` so the user
   * can keep e.g. Google for page translation while using an AI model for
   * fast, context-aware snippet translation.
   */
  quickProvider: ProviderId;
  /**
   * The dedicated AI provider used by the on-demand "AI translation" button in
   * the selection popup. Always an AI provider, independent of `provider` so
   * the user can keep Google/Bing as the main service while still pulling an AI
   * rendition on demand.
   */
  aiProvider: AIProviderId;
  /**
   * How the on-demand "AI translation" button in the selection popup presents
   * its result:
   *  - "below"   — show the AI rendition in its own section under the main
   *    translation so the two can be compared (default).
   *  - "replace" — overwrite the main translation with the AI rendition.
   */
  aiTranslationMode: "below" | "replace";
  /**
   * User-added AI models. Each becomes a selectable `custom:<id>` provider in
   * the popups and is editable in Settings. Empty by default.
   */
  customModels: CustomModel[];
  displayMode: DisplayMode;
  sourceLang: string; // "auto" or BCP-47 code
  targetLang: string;
  autoRule: AutoRule;
  /** Per-host overrides keyed by hostname. */
  hostRules: Record<string, AutoRule>;
  providers: ProviderSettings;
  /**
   * When the right-click "Translate selection" popup opens, also show the
   * original text alongside the translation. Defaults to false (translation
   * only) for a cleaner reading experience.
   */
  showSelectionOriginal: boolean;
  /** Visual theme for the in-page selection popup. */
  selectionPopupTheme: "dark" | "light";
  /**
   * When enabled, a small floating icon appears next to text the user just
   * selected. Clicking it opens the translation popup. Default `true` for
   * easier access without the right-click menu.
   */
  selectionTrigger: boolean;
  /**
   * How the dictionary lookup popup (definitions, phonetic, examples) is
   * triggered:
   *  - "doubleclick"     — double-click a single word opens the dictionary.
   *  - "alt-doubleclick" — hold Alt and double-click a word (default).
   *  - "off"             — dictionary lookup disabled.
   * Falls back to the translation popup when the word is not found.
   */
  dictionaryMode: DictionaryMode;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "google",
  quickProvider: "gemma",
  aiProvider: "gemma",
  aiTranslationMode: "below",
  customModels: [],
  displayMode: "bilingual",
  sourceLang: "auto",
  targetLang: "vi",
  autoRule: "ask",
  hostRules: {},
  providers: {
    google: {},
    ai: {
      gemma: {
        endpoint: "http://103.38.236.38:21000/v1",
        apiKey: "sk-066e7a483a1bee68-j4hdwb-4eec9401",
        model: "gemma-4-31b-it"
      }
    }
  },
  showSelectionOriginal: false,
  selectionPopupTheme: "light",
  selectionTrigger: true,
  dictionaryMode: "alt-doubleclick"
};

export interface TranslateRequestMessage {
  type: "translate";
  texts: string[];
  source: string;
  target: string;
  provider: ProviderId;
}

export interface TranslateResponseMessage {
  type: "translate-response";
  translations: string[];
  detected?: string;
  error?: string;
}

export interface ToggleMessage {
  type: "toggle";
}

export interface GetStatusMessage {
  type: "get-status";
}

export interface TranslateSelectionMessage {
  type: "translate-selection";
  text: string;
}

/**
 * Translate the page's current selection in place (Alt+S), mirroring the
 * whole-page replace/bilingual rendering but scoped to the highlighted nodes.
 * Carries no text: the content script reads the live DOM selection itself so
 * it can operate on the actual text nodes rather than a flattened string.
 */
export interface TranslateSelectionInlineMessage {
  type: "translate-selection-inline";
}

export interface StatusMessage {
  type: "status";
  active: boolean;
  count?: number;
  pending?: number;
}

export interface ApplySettingsMessage {
  type: "apply-settings";
  settings: Settings;
}

export interface DictionaryRequestMessage {
  type: "dictionary";
  word: string;
  /** BCP-47 code; only "en" is supported by the public dictionary endpoint. */
  lang: string;
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  audio?: string;
  /**
   * Where this entry came from. `laban` and `wiktionary` entries already
   * carry Vietnamese definitions written by editors (highest quality).
   * `free-dictionary` entries carry English definitions that may be
   * machine-translated into `definitionVi` after the fact.
   */
  source: "vdict" | "laban" | "wiktionary" | "free-dictionary";
  meanings: {
    partOfSpeech: string;
    definitions: {
      definition: string;
      example?: string;
      /** Set when `source === "free-dictionary"` and translation succeeded. */
      definitionVi?: string;
      exampleVi?: string;
    }[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
  sourceUrl?: string;
}

export interface DictionaryResponseMessage {
  type: "dictionary-response";
  entries: DictionaryEntry[];
  error?: string;
}

export interface WiktionaryRequestMessage {
  type: "wiktionary";
  word: string;
}

export interface WiktionaryResponseMessage {
  type: "wiktionary-response";
  /** Raw Parsoid HTML, or empty string when the page does not exist. */
  html: string;
  error?: string;
}

export interface LabanRequestMessage {
  type: "laban";
  word: string;
}

export interface LabanResponseMessage {
  type: "laban-response";
  /** Raw HTML from `dict.laban.vn/find?type=1&query=...`, empty when no result. */
  html: string;
  error?: string;
}

export interface VdictRequestMessage {
  type: "vdict";
  word: string;
}

export interface VdictResponseMessage {
  type: "vdict-response";
  /** Raw HTML from `vdict.com/<word>,1,0,0.html`, empty when no result. */
  html: string;
  error?: string;
}

/**
 * Ask the background worker to synthesize speech for `text` in `lang` using
 * Google Translate's public TTS endpoint (the familiar "chị Google" voice).
 * Done in the background to avoid page CORS and because the audio bytes come
 * back as a data URL the content script can play with `new Audio()`.
 */
export interface TtsRequestMessage {
  type: "tts";
  text: string;
  /** BCP-47 code; mapped to a Google TTS language code in the provider. */
  lang: string;
}

export interface TtsResponseMessage {
  type: "tts-response";
  /** `data:audio/mpeg;base64,...` chunks, one per ~200-char segment. */
  audio: string[];
  error?: string;
}

export type RuntimeMessage =
  | TranslateRequestMessage
  | TranslateResponseMessage
  | ToggleMessage
  | GetStatusMessage
  | TranslateSelectionMessage
  | TranslateSelectionInlineMessage
  | StatusMessage
  | ApplySettingsMessage
  | DictionaryRequestMessage
  | DictionaryResponseMessage
  | WiktionaryRequestMessage
  | WiktionaryResponseMessage
  | LabanRequestMessage
  | LabanResponseMessage
  | VdictRequestMessage
  | VdictResponseMessage
  | TtsRequestMessage
  | TtsResponseMessage;
