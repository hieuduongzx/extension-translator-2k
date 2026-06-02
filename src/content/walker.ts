import { MIN_TEXT_LENGTH, SKIP_TAGS } from "./constants";

export interface TextSegment {
  node: Text;
  text: string;
}

/**
 * Walks the DOM rooted at `root` and collects translatable text nodes.
 * Skips nodes inside non-content tags, contenteditable regions, hidden
 * elements, and nodes that have already been translated.
 *
 * `isTranslated` lets the engine skip individual text nodes it has already
 * processed. This is per-node (not per-parent) so sibling text nodes inside a
 * partially-translated element — e.g. the " B" in `<p>A <b>x</b> B</p>` — are
 * still picked up on later mutation passes.
 */
export function collectSegments(
  root: Node,
  isTranslated: (node: Text) => boolean = () => false
): TextSegment[] {
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return acceptTextNode(node as Text, isTranslated);
    }
  });

  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    segments.push({ node: textNode, text: textNode.nodeValue!.trim() });
    current = walker.nextNode();
  }

  return segments;
}

/**
 * Collects translatable text nodes that intersect the user's current
 * selection. Whole text nodes touching the selection are translated (matching
 * the in-place engine, which always operates on entire text nodes), so a
 * partially-highlighted paragraph still translates cleanly. Used by the
 * "translate selection in place" shortcut (Alt+S).
 */
export function collectSelectionSegments(
  isTranslated: (node: Text) => boolean = () => false
): TextSegment[] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return [];

  const segments: TextSegment[] = [];
  const seen = new Set<Text>();

  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    if (range.collapsed) continue;

    const ancestor = range.commonAncestorContainer;
    const root =
      ancestor.nodeType === Node.ELEMENT_NODE
        ? (ancestor as Element)
        : ancestor.parentElement;
    if (!root) continue;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const textNode = node as Text;
        if (!range.intersectsNode(textNode)) return NodeFilter.FILTER_REJECT;
        return acceptTextNode(textNode, isTranslated);
      }
    });

    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      if (!seen.has(textNode)) {
        seen.add(textNode);
        segments.push({ node: textNode, text: textNode.nodeValue!.trim() });
      }
      current = walker.nextNode();
    }
  }

  return segments;
}

/**
 * Shared accept/reject logic for a single text node, used by both the
 * full-document and selection-scoped collectors.
 */
function acceptTextNode(node: Text, isTranslated: (node: Text) => boolean): number {
  const parent = node.parentElement;
  if (!parent) return NodeFilter.FILTER_REJECT;
  if (isTranslated(node)) return NodeFilter.FILTER_REJECT;
  if (!isTranslatableElement(parent)) return NodeFilter.FILTER_REJECT;

  const text = node.nodeValue;
  if (!text) return NodeFilter.FILTER_REJECT;
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) return NodeFilter.FILTER_REJECT;
  if (!hasLetters(trimmed)) return NodeFilter.FILTER_REJECT;

  return NodeFilter.FILTER_ACCEPT;
}

export function isTranslatableElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return false;
  // Note: we intentionally do NOT reject by the parent `data-wt-translated`
  // attribute. Per-node dedup is handled by the engine's WeakSet so sibling
  // text nodes inside a partially-translated element stay translatable.
  if (element.closest("[contenteditable=\"true\"]")) return false;
  if (element.closest("[translate=\"no\"]")) return false;
  if (element.classList.contains("notranslate")) return false;
  if (element.closest(".notranslate")) return false;
  if (element.closest(".wt-bilingual-line")) return false;
  if (element.closest(".wt-loading-marker")) return false;
  if (element.closest("[data-wt-selection-popup=\"true\"]")) return false;
  if (element.closest(".wt-selection-popup")) return false;
  if (element.closest(".wt-error-banner")) return false;

  // Skip elements rendered with no box (display:none, visibility:hidden, etc.)
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;

  return true;
}

const LETTER_PATTERN = /\p{L}/u;

/**
 * True when the text contains at least one real letter. Number-only nodes
 * ("2024", "12.5", "$3,000") carry no translatable content, so we skip them
 * to avoid wasting provider requests.
 */
function hasLetters(text: string): boolean {
  return LETTER_PATTERN.test(text);
}
