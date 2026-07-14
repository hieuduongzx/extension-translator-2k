/**
 * Tags whose textual content should never be translated. The content script
 * walks the DOM and skips any descendant of these elements.
 */
export const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "VAR",
  "TT",
  "SVG",
  "MATH",
  "CANVAS",
  "TEMPLATE",
  "IFRAME",
  "VIDEO",
  "AUDIO",
  "PICTURE",
  "OBJECT",
  "EMBED"
]);

/** Marker class added to elements so we don't re-translate them. */
export const TRANSLATED_ATTR = "data-wt-translated";
export const ORIGINAL_ATTR = "data-wt-original";
/** Stores an element's original inline font-family so it can be restored. */
export const FONT_PATCH_ATTR = "data-wt-orig-font";
export const BILINGUAL_CLASS = "wt-bilingual-line";
/** Applied to the parent of a text node while its batch is in flight. */
export const TRANSLATING_CLASS = "wt-translating";
export const STYLE_ELEMENT_ID = "web-translator-styles";

/**
 * Fonts known to carry full Vietnamese diacritics across the major desktop and
 * mobile platforms. Ordered so a platform-native option comes first.
 *
 * Deliberately ends with `sans-serif` only as the very last resort and is
 * inserted *before* any generic the page already uses (see `patchFont`): on
 * CJK-locale machines a bare `sans-serif` resolves to a CJK font that often
 * lacks the Vietnamese precomposed glyphs (ư, ơ, ệ…), which is the exact case
 * that produces tofu. Putting real Vietnamese-capable fonts ahead of the
 * generic guarantees per-glyph fallback finds one of them first.
 */
export const TRANSLATED_FONT_FALLBACK =
  '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", Tahoma, sans-serif';

/**
 * CSS generic font keywords. Our Vietnamese fallback must never sit *after*
 * one of these in a font stack, or per-glyph fallback resolves a missing glyph
 * against the system generic (possibly a CJK font) and never reaches our
 * fonts.
 */
export const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong"
]);

/** Heuristic: skip text shorter than this (after trim). */
export const MIN_TEXT_LENGTH = 2;

/** Maximum characters per provider request. */
export const BATCH_CHAR_LIMIT = 4000;

/** Maximum number of segments per provider request. */
export const BATCH_SEGMENT_LIMIT = 80;

/**
 * Maximum number of translation batches dispatched to the background at once.
 * Bounded so a stalled request can't block the page while staying gentle on
 * the public provider endpoints' rate limits.
 */
export const BATCH_CONCURRENCY = 4;
