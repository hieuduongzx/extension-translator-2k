/**
 * Lightweight Vietnamese-friendly search helper.
 * Normalizes diacritics and case so queries like "phim tat" match "phím tắt".
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Returns true when `query` is empty or when it is contained in any of the
 * provided `keywords` after normalization.
 */
export function matchesSearch(query: string, ...keywords: (string | undefined)[]): boolean {
  const normalized = normalizeSearch(query);
  if (normalized.length === 0) return true;
  return keywords.some((kw) => normalizeSearch(kw ?? "").includes(normalized));
}
