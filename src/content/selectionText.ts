/**
 * Cleans up the raw `Selection.toString()` text before translating.
 *
 * Preserves single newlines so the popup can translate line-by-line.
 * Collapses paragraph breaks (2+ newlines) into a single blank line and
 * trims stray whitespace around line breaks.
 */
export function normalizeSelection(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    // Collapse 2+ newlines (with optional whitespace between) into \n\n.
    .replace(/[ \t]*\n(?:[ \t]*\n[ \t]*)+/g, "\n\n")
    // Trim whitespace around each newline.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    // Collapse runs of spaces/tabs (not newlines).
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
