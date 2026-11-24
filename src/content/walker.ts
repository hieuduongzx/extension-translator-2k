import { MIN_TEXT_LENGTH, SKIP_TAGS } from "./constants";
import { yieldToPage } from "./scheduling";

export interface TextSegment {
  node: Text;
  text: string;
}

/**
 * Per-collect memo for {@link isTranslatableElement}.
 *
 * The check costs ~7 tree walks per call (`hasSkippedAncestor` plus several
 * `closest()` lookups plus a visibility read), and a single paragraph routinely
 * has many text nodes sharing one parent. Mutation flushes re-walk the same
 * subtrees repeatedly, so caching per element for the duration of one collect
 * removes most of that work. Reset between collects because page style and DOM
 * structure can change in between.
 */
let translatableCache: Map<Element, boolean> | null = null;

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
  return withCollectCache(() => {
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
  });
}

/** True when `node` is still attached inside `root` (safe against minimal DOM stubs). */
function isInsideRoot(root: Node, node: Node | null): boolean {
  if (!node) return false;
  if (node === root) return true;
  if (typeof root.contains === "function") return root.contains(node);
  return node.isConnected !== false;
}

/** Snapshot connected following siblings along `node`'s ancestor chain for yield recovery. */
function snapshotResumeCandidates(node: Node, root: Node): Node[] {
  const candidates: Node[] = [];
  for (let cur: Node | null = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nextSibling) candidates.push(cur.nextSibling);
  }
  return candidates;
}

/** Scan long pages cooperatively, including slices with only rejected text. */
export async function collectSegmentsAsync(
  root: Node,
  isTranslated: (node: Text) => boolean = () => false,
  cancelled: () => boolean = () => false
): Promise<TextSegment[]> {
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let done = false;
  let resumeCandidates: Node[] = [];
  let pendingResumeText: Text | null = null;

  while (!done) {
    if (cancelled()) return [];
    // If an SPA removed `walker.currentNode` while we yielded, TreeWalker's
    // nextNode() would hit a detached parent and terminate early. Reposition
    // onto the nearest surviving sibling in `root` so the rest of the page is
    // still scanned.
    if (
      walker.currentNode &&
      walker.currentNode !== root &&
      !isInsideRoot(root, walker.currentNode)
    ) {
      const nextAnchor = resumeCandidates.find((candidate) => isInsideRoot(root, candidate));
      if (!nextAnchor) break;
      walker.currentNode = nextAnchor;
      pendingResumeText = nextAnchor.nodeType === Node.TEXT_NODE ? (nextAnchor as Text) : null;
    }

    withCollectCache(() => {
      const started = performance.now();
      if (pendingResumeText) {
        const node = pendingResumeText;
        pendingResumeText = null;
        if (node.isConnected && acceptTextNode(node, isTranslated) === NodeFilter.FILTER_ACCEPT) {
          segments.push({ node, text: node.nodeValue!.trim() });
        }
      }
      for (let visited = 0; visited < 250; visited++) {
        const node = walker.nextNode() as Text | null;
        if (!node) {
          done = true;
          break;
        }
        if (node.isConnected && acceptTextNode(node, isTranslated) === NodeFilter.FILTER_ACCEPT) {
          segments.push({ node, text: node.nodeValue!.trim() });
        }
        if (performance.now() - started >= 8) break;
      }
    });
    if (!done) {
      resumeCandidates = snapshotResumeCandidates(walker.currentNode, root);
      await yieldToPage();
    }
  }
  return cancelled() ? [] : segments;
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

  return withCollectCache(() => {
    const segments: TextSegment[] = [];
    const seen = new Set<Text>();

    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (range.collapsed) continue;

      const ancestor = range.commonAncestorContainer;
      const root =
        ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
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
  });
}

/**
 * Run `fn` with an {@link isTranslatableElement} memo installed.
 *
 * Callers that walk a subtree should always go through this: without it every
 * text node re-pays the full ancestor/visibility check.
 *
 * Reentrant on purpose — an outer call's memo is reused by inner ones, so a
 * flush that walks several sibling roots shares one memo across all of them
 * (their ancestor chains overlap heavily). Only the outermost call clears it, so
 * the memo never outlives a single synchronous pass and can't go stale against
 * later DOM or style changes.
 */
export function withCollectCache<T>(fn: () => T): T {
  if (translatableCache) return fn();
  translatableCache = new Map();
  try {
    return fn();
  } finally {
    translatableCache = null;
  }
}

/**
 * Shared accept/reject logic for a single text node, used by both the
 * full-document and selection-scoped collectors.
 */
function acceptTextNode(node: Text, isTranslated: (node: Text) => boolean): number {
  const parent = node.parentElement;
  if (!parent) return NodeFilter.FILTER_REJECT;
  if (isTranslated(node)) return NodeFilter.FILTER_REJECT;

  // Cheap text checks before the (much more expensive) element checks.
  const text = node.nodeValue;
  if (!text) return NodeFilter.FILTER_REJECT;
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) return NodeFilter.FILTER_REJECT;
  if (!hasLetters(trimmed)) return NodeFilter.FILTER_REJECT;

  if (!isTranslatableElement(parent)) return NodeFilter.FILTER_REJECT;

  return NodeFilter.FILTER_ACCEPT;
}

/**
 * Selectors that opt an element (or any ancestor) out of translation. Merged
 * into a single `closest()` call: one tree walk instead of six.
 */
const SKIP_ANCESTOR_SELECTOR = [
  '[translate="no"]',
  ".notranslate",
  ".wt-bilingual-line",
  '[data-wt-selection-popup="true"]',
  ".wt-selection-popup",
  ".wt-error-banner"
].join(",");

export function isTranslatableElement(element: Element): boolean {
  const cached = translatableCache?.get(element);
  if (cached !== undefined) return cached;
  const result = computeTranslatable(element);
  translatableCache?.set(element, result);
  return result;
}

function computeTranslatable(element: Element): boolean {
  if (hasSkippedAncestor(element)) return false;
  // Note: we intentionally do NOT reject by the parent `data-wt-translated`
  // attribute. Per-node dedup is handled by the engine's WeakSet so sibling
  // text nodes inside a partially-translated element stay translatable.
  // `isContentEditable` covers every editable form (`contenteditable`,
  // `contenteditable=""`, `="true"`, `="plaintext-only"`, and inherited
  // editability) — rewriting user drafts in replace mode would lose data.
  if ((element as HTMLElement).isContentEditable) return false;
  if (element.closest(SKIP_ANCESTOR_SELECTOR)) return false;

  if (!isRendered(element)) return false;

  return true;
}

/**
 * True when the element actually renders a box.
 *
 * `checkVisibility` is the only correct check here: reading
 * `getComputedStyle(el).display` only describes *this* element, and `display`
 * does not inherit, so a child of `display:none` still computes to `block`.
 * That made the old guard miss entire hidden subtrees — collapsed menus, closed
 * modals, inactive tab panels — and translate all of them. `checkVisibility`
 * also covers `content-visibility` and `opacity: 0` subtrees.
 *
 * Requires Chrome 105+ (`contentVisibilityAuto`/`opacityProperty` options
 * landed in 106); the manifest sets `minimum_chrome_version: 116`. The
 * `getComputedStyle` path is kept as a fallback for non-Chrome hosts and for
 * unit tests running against a stubbed DOM.
 */
function isRendered(element: Element): boolean {
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({
      checkVisibilityCSS: true,
      contentVisibilityAuto: true,
      opacityProperty: false
    });
  }
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function hasSkippedAncestor(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (SKIP_TAGS.has(current.tagName.toUpperCase())) return true;
  }
  return false;
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
