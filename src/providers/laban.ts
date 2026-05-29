/**
 * Fetches the raw search-results HTML from Laban Dictionary's Anh-Việt
 * endpoint. Parsing happens in the content script (we don't ship a DOM
 * parser to the service worker). The endpoint is public web HTML; we use
 * the same URL the user would visit in a browser.
 */
import { fetchWithTimeout } from "./http";

const ENDPOINT = "https://dict.laban.vn/find";

export async function fetchLabanHtml(word: string): Promise<string> {
  const trimmed = word.trim();
  if (!trimmed) return "";
  // type=1 → Anh-Việt (English → Vietnamese)
  const url = `${ENDPOINT}?type=1&query=${encodeURIComponent(trimmed)}`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi,en;q=0.9"
    }
  });
  if (!res.ok) {
    throw new Error(`Laban lookup failed (HTTP ${res.status})`);
  }
  return await res.text();
}
