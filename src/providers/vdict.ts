/**
 * Fetches the search-results HTML from VDict's Anh-Việt page.
 *
 * VDict URL scheme: `vdict.com/<word>,1,0,0.html` — the four numbers are
 * `<dict_id>,<unused>,<unused>,<unused>` where `1` = English-Vietnamese.
 * Parsing happens in the content script.
 */
import { fetchWithTimeout } from "./http";

const ENDPOINT = "https://vdict.com";

export async function fetchVdictHtml(word: string): Promise<string> {
  const trimmed = word.trim();
  if (!trimmed) return "";
  const url = `${ENDPOINT}/${encodeURIComponent(trimmed)},1,0,0.html`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi,en;q=0.9"
    }
  });
  if (res.status === 404) return "";
  if (!res.ok) {
    throw new Error(`VDict lookup failed (HTTP ${res.status})`);
  }
  return await res.text();
}
