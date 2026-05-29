import { fetchWithTimeout } from "./http";

/**
 * Public Google Translate text-to-speech endpoint. This is the same backend
 * that produces the familiar "chị Google" Vietnamese voice. It is unofficial
 * and capped at ~200 characters per request, so longer text is split into
 * chunks that are fetched in order and played back-to-back by the caller.
 *
 * Done from the background service worker: the page itself cannot fetch this
 * cross-origin, and the audio comes back as MP3 bytes that we hand to the
 * content script as base64 data URLs for `new Audio()`.
 */
const ENDPOINT = "https://translate.google.com/translate_tts";

/** Hard cap imposed by the endpoint. Stay a little under to be safe. */
const MAX_CHUNK = 190;

/**
 * Map a BCP-47 code to the language code Google TTS expects. Most codes pass
 * through unchanged; only a few need normalizing.
 */
function toTtsCode(lang: string): string {
  const l = lang.toLowerCase().replace("_", "-");
  if (l === "auto" || l === "") return "en";
  if (l.startsWith("zh")) {
    return l.includes("tw") || l.includes("hant") ? "zh-TW" : "zh-CN";
  }
  // Use only the primary subtag for everything else (e.g. "en-US" → "en").
  return l.split("-")[0];
}

/**
 * Split `text` into segments no longer than {@link MAX_CHUNK}, preferring to
 * break on sentence punctuation, then whitespace, then a hard cut as a last
 * resort. Keeps the spoken result natural across chunk boundaries.
 */
export function splitForTts(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const chunks: string[] = [];
  let rest = clean;

  while (rest.length > max) {
    const window = rest.slice(0, max);
    // Prefer the last sentence end, then the last space, within the window.
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("; "),
      window.lastIndexOf(", ")
    );
    if (cut > max * 0.5) {
      cut += 1; // include the punctuation char
    } else {
      const space = window.lastIndexOf(" ");
      cut = space > 0 ? space : max;
    }
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

function buildUrl(chunk: string, lang: string, total: number, idx: number): string {
  const params = new URLSearchParams({
    ie: "UTF-8",
    client: "tw-ob",
    tl: toTtsCode(lang),
    total: String(total),
    idx: String(idx),
    textlen: String(chunk.length),
    q: chunk
  });
  return `${ENDPOINT}?${params.toString()}`;
}

/** Read a fetched MP3 response body into a `data:audio/mpeg;base64,...` URL. */
async function toDataUrl(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // `btoa` is available in the service worker global scope.
  return `data:audio/mpeg;base64,${btoa(binary)}`;
}

/**
 * Synthesize `text` in `lang` via Google Translate TTS. Returns one base64
 * data URL per chunk; the caller plays them in sequence. Throws on network
 * failure or a non-OK response so the caller can fall back to Web Speech.
 */
export async function fetchGoogleTts(text: string, lang: string): Promise<string[]> {
  const chunks = splitForTts(text);
  if (chunks.length === 0) return [];

  const audio: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const url = buildUrl(chunks[i], lang, chunks.length, i);
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "audio/mpeg" }
    });
    if (!res.ok) {
      throw new Error(`Google TTS failed (HTTP ${res.status})`);
    }
    audio.push(await toDataUrl(res));
  }
  return audio;
}
