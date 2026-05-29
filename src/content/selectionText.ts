/**
 * Cleans up the raw `Selection.toString()` text before translating.
 *
 * When a selection spans inline widgets (icons, badges, pills rendered as
 * inline-block/flex elements), the browser inserts `\n` characters around
 * each widget. With the popup's `white-space: pre-wrap` rendering this makes
 * a single sentence wrap onto many lines and splits widget labels into their
 * own translation segments.
 *
 * We collapse runs of single line breaks (plus the surrounding inline
 * whitespace) into a single space, while preserving genuine paragraph breaks
 * — represented by a blank line, i.e. two or more consecutive newlines.
 */
export function normalizeSelection(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    // Protect real paragraph breaks (2+ newlines) with a placeholder.
    .replace(/[ \t]*\n[ \t]*\n[ \t]*(?:\n[ \t]*)*/g, "\u0000")
    // Any remaining single newline is an inline-widget artifact → space.
    .replace(/[ \t]*\n[ \t]*/g, " ")
    // Restore paragraph breaks.
    .replace(/\u0000/g, "\n\n")
    // Collapse leftover runs of spaces/tabs.
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
