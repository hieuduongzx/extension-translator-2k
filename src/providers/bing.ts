import { toMicrosoftCode } from "../languages";
import { fetchWithTimeout } from "./http";
import type { TranslateResult } from "./types";

/**
 * Public Bing Translator endpoint used by https://www.bing.com/translator.
 * It does NOT require an API key, but requires a short-lived `token` + `key`
 * pair plus the `IG`/`IID` request identifiers obtained by scraping the
 * translator HTML page. The token typically lives ~30 minutes.
 *
 * Each `ttranslatev3` request only accepts a single `text` field. We translate
 * an array sequentially with a small concurrency cap to balance speed and
 * rate-limit safety.
 */

interface BingSession {
  ig: string;
  iid: string;
  key: string;
  token: string;
  /** Epoch millis when the token becomes unusable. */
  expiresAt: number;
  /** Number of requests made on this iid; Bing increments per call. */
  count: number;
}

const TRANSLATOR_URL = "https://www.bing.com/translator";
const TRANSLATE_URL = "https://www.bing.com/ttranslatev3";

let cachedSession: BingSession | null = null;
let pendingSession: Promise<BingSession> | null = null;

const CONCURRENCY = 4;
const TOKEN_SAFETY_MS = 60_000; // refresh 60s before stated expiry

async function getSession(force = false): Promise<BingSession> {
  if (!force && cachedSession && cachedSession.expiresAt - Date.now() > TOKEN_SAFETY_MS) {
    return cachedSession;
  }
  if (pendingSession) return pendingSession;
  pendingSession = bootstrapSession()
    .then((session) => {
      cachedSession = session;
      return session;
    })
    .finally(() => {
      pendingSession = null;
    });
  return pendingSession;
}

async function bootstrapSession(): Promise<BingSession> {
  const res = await fetchWithTimeout(TRANSLATOR_URL, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    credentials: "include"
  });
  if (!res.ok) {
    throw new Error(`Failed to load Bing Translator (HTTP ${res.status})`);
  }
  const html = await res.text();

  const parsed = parseBootstrapTokens(html);
  if (!parsed) {
    throw new Error("Bing Translator bootstrap failed: missing tokens");
  }
  return {
    ig: parsed.ig,
    iid: parsed.iid,
    key: parsed.key,
    token: parsed.token,
    expiresAt: Date.now() + parsed.ttlMs,
    count: 0
  };
}

/**
 * Extract the IG / IID / abuse-prevention token trio from the Bing Translator
 * HTML page. Exposed for unit testing — the regex anchors are the brittle
 * part of the Bing integration and this function makes them testable without
 * a network round-trip. Returns `null` when any required piece is missing or
 * the helper tuple is malformed.
 */
export function parseBootstrapTokens(
  html: string
): { ig: string; iid: string; key: string; token: string; ttlMs: number } | null {
  const ig = match(html, /IG:"([^"]+)"/);
  const iid = match(html, /data-iid="([^"]+)"/);
  const helper = match(html, /var params_AbusePreventionHelper\s*=\s*\[([^\]]+)\]/);
  if (!ig || !iid || !helper) return null;

  // helper looks like: 1234567890,"abcd...token...",3600000
  const parts = helper.split(",").map((p) => p.trim());
  const key = parts[0]?.replace(/"/g, "");
  const token = parts[1]?.replace(/"/g, "");
  const ttlMs = Number(parts[2]?.replace(/[^0-9]/g, "")) || 30 * 60 * 1000;
  if (!key || !token) return null;
  return { ig, iid, key, token, ttlMs };
}

function match(input: string, pattern: RegExp): string | null {
  const m = input.match(pattern);
  return m ? m[1] : null;
}

export function toBingCode(code: string): string {
  if (code === "auto") return "auto-detect";
  // Bing accepts the same Microsoft-style codes (zh-Hans, zh-Hant, fil, ...).
  return toMicrosoftCode(code) ?? code;
}

interface BingResponseItem {
  translations?: { text: string; to: string }[];
  detectedLanguage?: { language: string; score: number };
}

async function translateOne(
  text: string,
  source: string,
  target: string,
  session: BingSession
): Promise<{ text: string; detected?: string; needsRefresh?: boolean; rateLimited?: boolean }> {
  const url = `${TRANSLATE_URL}?isVertical=1&&IG=${session.ig}&IID=${session.iid}.${session.count}`;
  const body = new URLSearchParams({
    fromLang: toBingCode(source),
    text,
    to: toBingCode(target),
    token: session.token,
    key: session.key,
    tryFetchingGenderDebiasedTranslations: "true"
  });

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    credentials: "include",
    body: body.toString()
  });

  if (!res.ok) {
    // 429 is rate limiting — re-scraping the session would only add traffic.
    // Signal the caller to back off and retry with the same token instead.
    if (res.status === 429) {
      return { text: "", rateLimited: true };
    }
    if (res.status === 400 || res.status === 401) {
      return { text: "", needsRefresh: true };
    }
    throw new Error(`Bing translate failed (HTTP ${res.status})`);
  }

  // Bing returns either an array on success or `{ statusCode, errorMessage }`
  // on auth/quota issues.
  const data = (await res.json()) as BingResponseItem[] | { statusCode: number };
  if (!Array.isArray(data)) {
    return { text: "", needsRefresh: true };
  }
  const item = data[0];
  const translation = item?.translations?.[0]?.text ?? "";
  return { text: translation, detected: item?.detectedLanguage?.language };
}

export async function translateBing(
  texts: string[],
  source: string,
  target: string
): Promise<TranslateResult> {
  if (texts.length === 0) return { translations: [] };

  const targetCode = toBingCode(target);
  if (targetCode === "auto-detect") {
    throw new Error("Bing Translator requires an explicit target language");
  }

  let session = await getSession();
  const results: string[] = new Array(texts.length).fill("");
  let detected: string | undefined;
  let rateLimitHit = false;

  // Limited concurrency worker pool.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < texts.length) {
      const idx = cursor++;
      const text = texts[idx];
      session.count++;
      let attempt = 0;
      while (attempt < 3) {
        const {
          text: translated,
          detected: detectedLang,
          needsRefresh,
          rateLimited
        } = await translateOne(text, source, target, session);
        if (rateLimited) {
          rateLimitHit = true;
          if (attempt < 2) {
            // Exponential backoff before retrying with the SAME session —
            // re-scraping the token under rate limiting only doubles traffic.
            await delay(600 * 2 ** attempt);
            attempt++;
            continue;
          }
          break;
        }
        if (needsRefresh && attempt === 0) {
          // Refresh token once and retry this segment.
          session = await getSession(true);
          attempt++;
          continue;
        }
        if (!translated && attempt === 0) {
          // Retry once on empty result before giving up.
          attempt++;
          continue;
        }
        results[idx] = translated;
        if (!detected && detectedLang) detected = detectedLang;
        break;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, texts.length) }, () => worker());
  await Promise.all(workers);

  // Surface total failure instead of silently returning untranslated text.
  if (results.every((r) => r === "")) {
    throw new Error(
      rateLimitHit
        ? "Bing translate failed (HTTP 429): rate limited"
        : "Bing translate failed: no translations returned"
    );
  }

  return { translations: results, detected };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
