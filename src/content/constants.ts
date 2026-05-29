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
export const BILINGUAL_CLASS = "wt-bilingual-line";
export const STYLE_ELEMENT_ID = "web-translator-styles";

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
