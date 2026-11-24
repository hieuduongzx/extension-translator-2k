import { toGoogleCode } from "../languages";
import { discardResponse, fetchWithRetry } from "./http";
import { failedMask, type TranslateResult } from "./types";

const ENDPOINT = "https://translate.googleapis.com/translate_a/t";
const GOOGLE_ATTEMPT_TIMEOUT_MS = 12_000;
const GOOGLE_TOTAL_BUDGET_MS = 30_000;

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

  // The public endpoint 429s / 5xx's / stalls now and then. Without retries
  // a single blip failed the whole batch (up to 80 segments) on the page.
  const res = await fetchWithRetry(`${ENDPOINT}?${params.toString()}`, {
    timeoutMs: GOOGLE_TOTAL_BUDGET_MS,
    attemptTimeoutMs: GOOGLE_ATTEMPT_TIMEOUT_MS,
    attempts: 3,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString()
  });

  if (!res.ok) {
    discardResponse(res);
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
    return {
      translations: Array.from({ length: expected }, (_, index) => (index === 0 ? raw : "")),
      // Only slot 0 got a translation; the rest are padding, not results.
      failed: failedMask(Array.from({ length: expected }, (_, index) => index !== 0))
    };
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
  const failed: boolean[] = [];
  let detected: string | undefined;

  for (let i = 0; i < expected; i++) {
    const item = raw[i];
    if (typeof item === "string") {
      translations.push(item);
      failed.push(false);
      continue;
    }
    if (!Array.isArray(item)) {
      // Missing or malformed slot: padded to keep alignment, but not a result.
      translations.push("");
      failed.push(true);
      continue;
    }

    const first = item[0];
    if (typeof first === "string") {
      translations.push(first);
      failed.push(false);
    } else if (Array.isArray(first) && typeof first[0] === "string") {
      translations.push(first[0]);
      failed.push(false);
    } else {
      translations.push("");
      failed.push(true);
    }
    if (!detected && typeof item[1] === "string") {
      detected = item[1];
    }
  }

  return { translations, detected, failed: failedMask(failed) };
}
