import type { DictionaryEntry } from "../types";
import { fetchWithTimeout } from "./http";

const ENDPOINT = "https://api.dictionaryapi.dev/api/v2/entries";

interface RawDictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition: string; example?: string }[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
  sourceUrls?: string[];
}

/**
 * Looks a word up against the public Free Dictionary API
 * (api.dictionaryapi.dev). The endpoint only ships English content reliably
 * — other languages return 404 most of the time. The caller is expected to
 * fall back to the regular translator when this throws or returns empty.
 */
export async function lookupDictionary(
  word: string,
  lang: string
): Promise<DictionaryEntry[]> {
  const code = lang === "auto" ? "en" : lang;
  const trimmed = word.trim();
  if (!trimmed) return [];

  const url = `${ENDPOINT}/${encodeURIComponent(code)}/${encodeURIComponent(trimmed)}`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Dictionary lookup failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as RawDictionaryEntry[] | { title?: string };
  if (!Array.isArray(data)) return [];

  return data
    .map<DictionaryEntry>((raw) => {
      // Pick the first phonetic that has a text/audio value.
      const phoneticText =
        raw.phonetic ||
        raw.phonetics?.find((p) => p.text)?.text ||
        undefined;
      const audio = raw.phonetics?.find((p) => p.audio)?.audio || undefined;

      const meanings = (raw.meanings ?? [])
        .map((m) => ({
          partOfSpeech: m.partOfSpeech ?? "",
          definitions: (m.definitions ?? [])
            .filter((d) => d?.definition)
            .map((d) => ({ definition: d.definition, example: d.example }))
            .slice(0, 5),
          synonyms: (m.synonyms ?? []).slice(0, 8),
          antonyms: (m.antonyms ?? []).slice(0, 8)
        }))
        .filter((m) => m.definitions.length > 0);

      return {
        word: raw.word,
        phonetic: phoneticText,
        audio,
        source: "free-dictionary",
        meanings,
        sourceUrl: raw.sourceUrls?.[0]
      };
    })
    .filter((entry) => entry.meanings.length > 0);
}
