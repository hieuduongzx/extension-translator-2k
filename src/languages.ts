export interface Language {
  code: string;
  name: string;
  native: string;
}

/**
 * Curated list of common languages supported by both Google Translate and
 * Microsoft Translator. The codes use BCP-47 forms accepted by both APIs.
 */
export const LANGUAGES: Language[] = [
  { code: "auto", name: "Detect language", native: "Auto" },
  { code: "en", name: "English", native: "English" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "zh-CN", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "fil", name: "Filipino", native: "Filipino" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "ta", name: "Tamil", native: "தமிழ்" }
];

export function getLanguageName(code: string): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.native ?? code;
}

/**
 * Returns the English name of a language, used when building AI prompts
 * ("Translate into Vietnamese"). Falls back to the code for unknown values
 * and returns "the detected language" for "auto".
 */
export function getLanguageEnglishName(code: string): string {
  if (code === "auto") return "the source language (auto-detect)";
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.name ?? code;
}

/**
 * Microsoft Translator uses a slightly different code for Chinese variants and
 * does not support "auto" as an explicit code (auto-detect happens when `from`
 * is omitted from the query string).
 */
export function toMicrosoftCode(code: string): string | null {
  if (code === "auto") return null;
  if (code === "zh-CN") return "zh-Hans";
  if (code === "zh-TW") return "zh-Hant";
  return code;
}

/** Google Translate accepts the codes as-is, including "auto". */
export function toGoogleCode(code: string): string {
  return code;
}
