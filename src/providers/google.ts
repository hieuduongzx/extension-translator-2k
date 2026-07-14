import { toGoogleCode } from "../languages";
import { fetchWithTimeout } from "./http";
import type { TranslateResult } from "./types";

const ENDPOINT = "https://translate.googleapis.com/translate_a/t";

/**
 * Calls the public (unauthenticated) Google Translate endpoint. This is the
 * same endpoint used by the official Google Translate web extension. It
 * accepts batched text via repeated `q` parameters.
 *
 * Note: this endpoint is unofficial and may rate-limit. For production use,
 * swap to the official Cloud Translation API by reading the API key from
 * `settings.providers.google.apiKey`.
 */
export async function translateGoogle(
  texts: string[],
  source: string,
  target: string
): Promise<TranslateResult> {
  if (texts.length === 0) return { translations: [] };

  const params = new URLSearchParams({
    client: "dict-chrome-ex",
    sl: toGoogleCode(source),
    tl: toGoogleCode(target),
    tbb: "1",
    ie: "UTF-8",
    oe: "UTF-8"
  });

  // Send the texts in the POST body: a 4000-char batch URL-encodes to well
  // over 12 KB, which risks 413/414 rejections when passed as a query string.
  const body = new URLSearchParams();
  for (const t of texts) body.append("q", t);

  const res = await fetchWithTimeout(`${ENDPOINT}?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString()
  });

  if (!res.ok) {
    throw new Error(`Google Translate failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as unknown;
  return parseGoogleResponse(data, texts.length);
}

/**
 * The `dict-chrome-ex` client returns one of these shapes:
 *  - Single string:                    "translation"
 *  - Single string with detection:     ["translation", "lang"]
 *  - Multiple texts:                   [["t1"], ["t2"], ...]
 *  - Multiple with detection:          [[["t1"], "lang1"], [["t2"], "lang2"]]
 */
export function parseGoogleResponse(raw: unknown, expected: number): TranslateResult {
  if (typeof raw === "string") {
    return { translations: [raw] };
  }

  if (!Array.isArray(raw)) {
    throw new Error("Unexpected Google Translate response");
  }

  // ["translation", "detected"]
  if (expected === 1 && typeof raw[0] === "string") {
    return {
      translations: [raw[0]],
      detected: typeof raw[1] === "string" ? raw[1] : undefined
    };
  }

  const translations: string[] = [];
  let detected: string | undefined;

  for (const item of raw) {
    if (typeof item === "string") {
      translations.push(item);
      continue;
    }
    if (!Array.isArray(item)) continue;

    const first = item[0];
    if (typeof first === "string") {
      translations.push(first);
    } else if (Array.isArray(first) && typeof first[0] === "string") {
      translations.push(first[0]);
    }
    if (!detected && typeof item[1] === "string") {
      detected = item[1];
    }
  }

  if (translations.length !== expected) {
    // Degrade gracefully rather than discarding the whole batch. A count
    // mismatch is rare but when it happens we keep whatever segments did
    // come back and pad the rest with empty strings (the engine then leaves
    // those nodes untouched) instead of throwing away good translations.
    if (translations.length > expected) {
      translations.length = expected;
    } else {
      while (translations.length < expected) translations.push("");
    }
  }

  return { translations, detected };
}
