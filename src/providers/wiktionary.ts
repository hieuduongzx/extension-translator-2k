/**
 * Fetches the raw Parsoid HTML for a Wiktionary article. The actual parsing
 * (turning HTML into `DictionaryEntry`) happens in the content script — the
 * service worker doesn't have `DOMParser`, and shipping an HTML parser would
 * be wasteful.
 *
 * Endpoint: vi.wiktionary.org Parsoid REST API.
 */
import { fetchWithTimeout } from "./http";

const ENDPOINT = "https://vi.wiktionary.org/w/rest.php/v1/page";

export async function fetchWiktionaryHtml(word: string): Promise<string> {
  const trimmed = word.trim();
  if (!trimmed) return "";
  const url = `${ENDPOINT}/${encodeURIComponent(trimmed)}/html`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Accept: "text/html" }
  });
  if (res.status === 404) return "";
  if (!res.ok) {
    throw new Error(`Wiktionary lookup failed (HTTP ${res.status})`);
  }
  return await res.text();
}
