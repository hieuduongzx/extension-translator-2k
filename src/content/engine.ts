import { batchSegments, type SegmentBatch } from "./batching";
import {
  BATCH_CONCURRENCY,
  BILINGUAL_CLASS,
  FONT_PATCH_ATTR,
  GENERIC_FONT_FAMILIES,
  ORIGINAL_ATTR,
  TRANSLATED_ATTR,
  TRANSLATED_FONT_FALLBACK,
  TRANSLATING_CLASS
} from "./constants";
import { sendTranslateRequest } from "./messaging";
import { ensureStyles } from "./styles";
import { yieldToPage } from "./scheduling";
import {
  collectSegmentsAsync,
  collectSelectionSegments,
  isTranslatableElement,
  withCollectCache,
  type TextSegment
} from "./walker";
import type { DisplayMode, ProviderId } from "../types";

export interface EngineConfig {
  provider: ProviderId;
  displayMode: DisplayMode;
  source: string;
  target: string;
}

interface AppliedRecord {
  segment: TextSegment;
  originalText: string;
  injectedNode?: Node;
}

export function isSegmentCurrent(segment: TextSegment): boolean {
  return segment.node.isConnected && segment.node.nodeValue?.trim() === segment.text;
}

/**
 * True when two engine configs would render identical output.
 *
 * Every settings write — from any tab, the popup, or the options page —
 * broadcasts to every tab. Re-enabling the engine there is destructive: it
 * restores the whole DOM to the original text and re-requests every batch. So a
 * theme toggle in the in-page selection popup, or a hover-delay tweak, used to
 * re-translate every open tab. Only these four fields change what the engine
 * renders, so only they justify that work.
 */
export function sameEngineConfig(a: EngineConfig, b: EngineConfig): boolean {
  return (
    a.provider === b.provider &&
    a.displayMode === b.displayMode &&
    a.source === b.source &&
    a.target === b.target
  );
}

/**
 * Owns the lifecycle of an "active" page translation: collects nodes,
 * dispatches batches to the background, applies translations to the DOM,
 * and observes future mutations for SPA-style updates.
 */
export class TranslationEngine {
  private active = false;
  /**
   * Bumped on every enable()/disable(). Batch workers capture the generation
   * they were started under and bail once it changes, so re-enabling with a
   * new config can't let stale in-flight batches apply old-config translations
   * on top of the fresh run.
   */
  private generation = 0;
  private config: EngineConfig;
  private records: AppliedRecord[] = [];
  private observer?: MutationObserver;
  private pendingFlush?: number;
  private pendingNodes = new Set<Node>();
  /**
   * Elements whose watched attributes changed since the last flush. Kept apart
   * from `pendingNodes` because these still need a visibility check: most such
   * mutations are hidden→hidden churn we must not walk.
   */
  private pendingAttributeNodes = new Set<Element>();
  private mutationFlushRunning = false;
  private pendingBatches = 0;
  /**
   * Text nodes we've already translated this session. Tracked per-node (not
   * via a parent attribute) so sibling text nodes inside the same element are
   * still translated on later mutation passes.
   */
  private translatedNodes = new WeakSet<Text>();
  private appliedValues = new WeakMap<Text, string>();
  /**
   * Last `style` attribute string written by `patchFont`, so our own font-stack
   * write is skipped by the attribute observer without permanently ignoring
   * subsequent page style changes (e.g. `display: none` → `display: block`).
   */
  private patchedFontStyle = new WeakMap<Element, string>();
  /**
   * Ref-count of in-flight batches touching each element, so the "translating"
   * underline only clears once the *last* batch covering that element resolves
   * (sibling text nodes can land in different batches).
   */
  private translatingCount = new Map<Element, number>();
  private onProgress?: (state: { active: boolean; count: number; pending: number }) => void;
  private onError?: (message: string) => void;

  constructor(config: EngineConfig) {
    this.config = config;
  }

  setProgressHandler(
    fn: (state: { active: boolean; count: number; pending: number }) => void
  ): void {
    this.onProgress = fn;
  }

  setErrorHandler(fn: (message: string) => void): void {
    this.onError = fn;
  }

  isActive(): boolean {
    return this.active;
  }

  getConfig(): EngineConfig {
    return this.config;
  }

  /** Invalidate selection-only requests when settings or user intent changes. */
  cancelPending(): void {
    this.generation++;
    this.pendingBatches = 0;
    this.clearTranslating();
    this.emitProgress();
  }

  async enable(config: EngineConfig): Promise<void> {
    // Frames without a body (about:blank, srcdoc shells) have nothing to
    // translate and would make `observer.observe(document.body)` throw.
    if (!document.body) return;
    this.config = config;
    if (this.active) {
      // Reset and re-translate with the new config.
      this.disable({ keepStyles: true });
    }
    this.active = true;
    this.generation++;
    const generation = this.generation;
    this.emitProgress();
    ensureStyles();
    this.startObserver();
    this.mutationFlushRunning = true;
    try {
      await this.translateRoot(document.body);
    } finally {
      if (generation === this.generation) {
        this.mutationFlushRunning = false;
        if (this.active && this.hasPendingNodes()) this.scheduleFlush();
      }
    }
    this.emitProgress();
  }

  /**
   * Translate only the text nodes inside the user's current selection,
   * in-place, without enabling whole-page mode or the mutation observer. Used
   * by the Alt+S shortcut. Records are tracked so a later full toggle-off
   * restores these segments along with everything else.
   */
  async translateSelection(config: EngineConfig): Promise<void> {
    if (!this.active) this.cancelPending();
    const generation = this.generation;
    this.config = config;
    ensureStyles();
    const segments = collectSelectionSegments((n) => this.translatedNodes.has(n));
    if (segments.length === 0) return;
    const batches = batchSegments(segments);
    await this.runBatches(batches, () => generation !== this.generation);
    this.emitProgress();
  }

  /**
   * Note: the shared stylesheet is intentionally left in place — it also
   * styles the selection/dictionary popups and the error banner, which may be
   * open while page translation toggles off. The sheet is inert when unused.
   */
  disable(_opts: { keepStyles?: boolean } = {}): void {
    this.active = false;
    this.generation++;
    this.pendingBatches = 0;
    this.mutationFlushRunning = false;
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.pendingFlush !== undefined) {
      window.clearTimeout(this.pendingFlush);
      this.pendingFlush = undefined;
    }
    this.pendingNodes.clear();
    this.pendingAttributeNodes.clear();
    this.restoreAll();
    this.emitProgress();
  }

  private async translateRoot(root: Node): Promise<void> {
    const generation = this.generation;
    const cancelled = () => !this.active || generation !== this.generation;
    const segments = await collectSegmentsAsync(
      root,
      (n) => this.translatedNodes.has(n),
      cancelled
    );
    if (segments.length === 0) return;
    // Viewport priority: batch the segments the user can currently see first,
    // then everything else. On long pages this gets visible text translated in
    // the first couple of requests instead of after the whole document.
    const { visible, hidden } = await partitionByViewport(segments, cancelled);
    if (cancelled()) return;
    const batches = [...batchSegments(visible), ...batchSegments(hidden)];
    await this.runBatches(batches);
  }

  /**
   * Dispatches batches to the background with a bounded concurrency pool so a
   * single slow request can't stall the whole page, while still capping the
   * number of simultaneous provider calls to stay rate-limit friendly.
   *
   * `cancelled` decides when to bail mid-flight. For whole-page mode that's
   * "engine was disabled"; for the selection shortcut there's no active state,
   * so it never cancels (the few selected batches just run to completion).
   */
  private async runBatches(batches: SegmentBatch[], cancelled?: () => boolean): Promise<void> {
    const generation = this.generation;
    const config = { ...this.config };
    const isCancelled = cancelled ?? (() => !this.active || generation !== this.generation);
    this.pendingBatches += batches.length;
    this.emitProgress();
    // Report each distinct error message at most once per run. When a provider
    // is down every batch fails with the same message; without this the error
    // banner would be re-triggered dozens of times on a text-heavy page.
    const reportedErrors = new Set<string>();
    const reportError = (message: string): void => {
      if (reportedErrors.has(message)) return;
      reportedErrors.add(message);
      this.onError?.(message);
    };
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < batches.length) {
        if (isCancelled()) return;
        const batch = batches[cursor++];
        const markedElements = this.markTranslating(batch.segments);
        try {
          const response = await sendTranslateRequest({
            type: "translate",
            texts: batch.texts,
            source: config.source,
            target: config.target,
            provider: config.provider
          });
          if (isCancelled()) return;
          if (response.error) {
            reportError(response.error);
            continue;
          }
          // A partial provider reply must not look like a completed page.
          if (
            response.translations.some((text) => !text) ||
            response.translations.length < batch.texts.length
          ) {
            reportError("Some text could not be translated. Try again or choose another service.");
          }
          // Even cache hits can resolve together; limit DOM work per task.
          for (let start = 0; start < batch.segments.length; start += 20) {
            if (isCancelled()) return;
            this.applyBatch(
              batch.segments.slice(start, start + 20),
              response.translations.slice(start, start + 20)
            );
            await yieldToPage();
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!isCancelled()) reportError(message);
        } finally {
          if (generation === this.generation) {
            this.unmarkTranslating(markedElements);
            this.pendingBatches--;
            this.emitProgress();
          }
        }
      }
    };

    const poolSize = Math.min(BATCH_CONCURRENCY, batches.length);
    try {
      await Promise.all(Array.from({ length: poolSize }, () => worker()));
    } finally {
      if (generation === this.generation) {
        this.pendingBatches -= batches.length - cursor;
        this.emitProgress();
      }
    }
  }

  /**
   * Mark the parent of every text node in a batch that's about to be
   * dispatched with a static "translating" underline. Ref-counted so
   * overlapping batches don't clear each other's marker early.
   */
  private markTranslating(segments: TextSegment[]): Element[] {
    const marked: Element[] = [];
    for (const segment of segments) {
      const el = segment.node.parentElement;
      if (!el) continue;
      marked.push(el);
      const next = (this.translatingCount.get(el) ?? 0) + 1;
      this.translatingCount.set(el, next);
      if (next === 1) el.classList.add(TRANSLATING_CLASS);
    }
    return marked;
  }

  private unmarkTranslating(elements: Element[]): void {
    for (const el of elements) {
      const remaining = (this.translatingCount.get(el) ?? 1) - 1;
      if (remaining > 0) {
        this.translatingCount.set(el, remaining);
      } else {
        this.translatingCount.delete(el);
        el.classList.remove(TRANSLATING_CLASS);
      }
    }
  }

  /** Defensive sweep: drop any lingering translating markers on teardown. */
  private clearTranslating(): void {
    for (const el of this.translatingCount.keys()) {
      el.classList.remove(TRANSLATING_CLASS);
    }
    this.translatingCount.clear();
  }

  /**
   * Applies a batch in two phases — all computed-style reads first, then all
   * DOM writes — so the browser recalculates style once per batch instead of
   * once per segment (interleaved read/write forces a recalc every iteration).
   */
  private applyBatch(segments: TextSegment[], translations: string[]): void {
    interface Pending {
      segment: TextSegment;
      translated: string;
      parent: HTMLElement;
      inline: boolean;
      computedFont: string;
    }

    // Phase 1: reads only.
    const pending: Pending[] = [];
    const inlineByParent = new Map<HTMLElement, boolean>();
    const fontByParent = new Map<HTMLElement, string>();
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const translated = translations[i];
      if (!translated) continue;
      if (this.translatedNodes.has(segment.node)) continue;
      const parent = segment.node.parentElement;
      if (!parent || !segment.node.parentNode) continue;
      if (!isSegmentCurrent(segment)) continue;
      if (translated.trim() === segment.text.trim()) {
        // The provider returned text identical to the source. That's a real
        // result, not a failure — proper nouns, "OK", or a page already in the
        // target language. Mark the node done so the walker stops offering it;
        // otherwise every mutation pass re-requested these segments forever.
        // (Genuine failures arrive as "" and are filtered out above.)
        this.translatedNodes.add(segment.node);
        this.appliedValues.set(segment.node, segment.node.nodeValue ?? "");
        continue;
      }

      let inline = false;
      let computedFont = "";
      if (this.config.displayMode === "replace") {
        computedFont = fontByParent.get(parent) ?? window.getComputedStyle(parent).fontFamily;
        fontByParent.set(parent, computedFont);
      } else {
        inline = inlineByParent.get(parent) ?? isInlineParent(parent);
        inlineByParent.set(parent, inline);
      }
      pending.push({ segment, translated, parent, inline, computedFont });
    }

    // Phase 2: writes only.
    for (const item of pending) {
      const record = this.applyToSegment(item.segment, item.translated, item);
      if (record) this.records.push(record);
    }
  }

  private applyToSegment(
    segment: TextSegment,
    translated: string,
    layout: { parent: HTMLElement; inline: boolean; computedFont: string }
  ): AppliedRecord | null {
    const parent = layout.parent;

    // Mark this specific text node as done so the walker skips it on future
    // passes, without blocking its sibling text nodes.
    this.translatedNodes.add(segment.node);

    if (this.config.displayMode === "replace") {
      const original = segment.node.nodeValue ?? "";
      const leadingWs = original.match(/^\s*/)?.[0] ?? "";
      const trailingWs = original.match(/\s*$/)?.[0] ?? "";
      segment.node.nodeValue = `${leadingWs}${translated}${trailingWs}`;
      this.appliedValues.set(segment.node, segment.node.nodeValue);
      parent.setAttribute(TRANSLATED_ATTR, "true");
      parent.setAttribute(ORIGINAL_ATTR, segment.text);
      // The page's own font may lack Vietnamese diacritics (common with
      // script-specific webfonts, e.g. Japanese-only). Append a fallback stack
      // so missing glyphs resolve instead of rendering as tofu.
      this.patchFont(parent, layout.computedFont);
      return { segment, originalText: original };
    }

    // Bilingual: keep the original text node and inject the translation
    // alongside it. We use a block element when the parent looks block-like
    // and an inline element otherwise.
    const inline = layout.inline;
    const wrapper = document.createElement(inline ? "span" : "div");
    wrapper.className = inline ? "wt-bilingual-inline" : BILINGUAL_CLASS;
    wrapper.setAttribute("translate", "no");
    // Ensure injected translation has a Vietnamese-capable glyph source even if
    // a page stylesheet tries to force its own font on our element.
    wrapper.style.setProperty("font-family", TRANSLATED_FONT_FALLBACK, "important");
    wrapper.textContent = translated;
    segment.node.after(wrapper);
    this.appliedValues.set(segment.node, segment.node.nodeValue ?? "");
    return { segment, originalText: segment.node.nodeValue ?? "", injectedNode: wrapper };
  }

  /**
   * Make sure the element's font stack can render Vietnamese diacritics.
   *
   * We take the page's computed font-family and splice our Vietnamese-capable
   * fonts in *before* the first CSS generic (sans-serif, system-ui, …). That
   * ordering matters: per-glyph fallback walks the list left-to-right, and on
   * CJK-locale machines a bare generic resolves to a CJK font missing the
   * Vietnamese glyphs — so anything after the generic is never reached. Applied
   * with `!important` so it also wins over page rules that use `!important`.
   * The original inline declaration is stashed for exact restore. Idempotent.
   */
  private patchFont(el: HTMLElement, computedFont: string): void {
    if (el.hasAttribute(FONT_PATCH_ATTR)) return;
    // Stash both the value and its priority so restore is exact.
    const prevValue = el.style.getPropertyValue("font-family");
    const prevPriority = el.style.getPropertyPriority("font-family");
    el.setAttribute(
      FONT_PATCH_ATTR,
      prevPriority ? `${prevValue}\u0000${prevPriority}` : prevValue
    );

    const computed = computedFont || prevValue;
    el.style.setProperty("font-family", mergeFontStack(computed), "important");
    this.patchedFontStyle.set(el, el.getAttribute("style") ?? "");
  }

  private restoreFont(el: HTMLElement | null): void {
    if (!el || !el.hasAttribute(FONT_PATCH_ATTR)) return;
    const stored = el.getAttribute(FONT_PATCH_ATTR) ?? "";
    const [value, priority] = stored.split("\u0000");
    if (value) {
      el.style.setProperty("font-family", value, priority || "");
    } else {
      el.style.removeProperty("font-family");
    }
    el.removeAttribute(FONT_PATCH_ATTR);
    this.patchedFontStyle.delete(el);
  }

  private restoreAll(): void {
    for (const record of this.records) {
      try {
        if (record.injectedNode?.parentNode) {
          record.injectedNode.parentNode.removeChild(record.injectedNode);
        }
        if (record.segment.node.parentNode) {
          record.segment.node.nodeValue = record.originalText;
        }
        const parent = record.segment.node.parentElement;
        parent?.removeAttribute(TRANSLATED_ATTR);
        parent?.removeAttribute(ORIGINAL_ATTR);
        this.restoreFont(parent);
      } catch {
        // ignore nodes that have been detached by the page
      }
    }
    this.records = [];
    // Forget per-node translation state so a re-enable starts fresh.
    this.translatedNodes = new WeakSet<Text>();
    this.appliedValues = new WeakMap<Text, string>();
    this.clearTranslating();
  }

  private forgetChangedNode(node: Text): void {
    const parent = node.parentElement;
    this.translatedNodes.delete(node);
    this.appliedValues.delete(node);
    const kept: AppliedRecord[] = [];
    for (const record of this.records) {
      if (record.segment.node !== node) {
        kept.push(record);
        continue;
      }
      record.injectedNode?.parentNode?.removeChild(record.injectedNode);
    }
    this.records = kept;
    if (parent && !this.records.some((record) => record.segment.node.parentElement === parent)) {
      parent.removeAttribute(TRANSLATED_ATTR);
      parent.removeAttribute(ORIGINAL_ATTR);
      this.restoreFont(parent);
    }
  }

  private startObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      if (!this.active) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;
              // Skip our own bilingual wrappers and explicitly opt-out elements
              // so inserting translations never schedules a redundant flush.
              if (
                el.getAttribute("translate") === "no" ||
                el.classList.contains(BILINGUAL_CLASS) ||
                el.classList.contains("wt-bilingual-inline")
              ) {
                return;
              }
              this.pendingNodes.add(node);
            } else if (node.nodeType === Node.TEXT_NODE) {
              this.pendingNodes.add(node);
            }
          });
        } else if (mutation.type === "attributes") {
          this.queueAttributeTarget(mutation);
        } else if (mutation.type === "characterData" && mutation.target.parentElement) {
          const textNode = mutation.target as Text;
          const appliedValue = this.appliedValues.get(textNode);
          if (appliedValue === textNode.nodeValue) continue;
          if (appliedValue !== undefined) this.forgetChangedNode(textNode);
          this.pendingNodes.add(mutation.target.parentElement);
        }
      }
      if (this.hasPendingNodes()) this.scheduleFlush();
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      // The walker correctly skips subtrees that render no box, so text inside a
      // collapsed menu / closed modal / inactive tab panel is left alone. Those
      // are usually revealed by flipping a class, an inline style, `hidden`, or
      // `open` — with no childList change at all — so without watching these
      // attributes the revealed text would never get translated.
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class", "style", "hidden", "open", "aria-expanded", "aria-hidden"]
    });
  }

  /**
   * Record an element whose attributes changed, for a visibility check later.
   *
   * Deliberately does *no* style reads here: this callback can fire hundreds of
   * times per frame on a page with hover/class churn, and `checkVisibility()`
   * forces a style recalc. The "is it visible now?" filter happens once per
   * flush instead (see `flushNodes`), where we're about to read style anyway.
   *
   * Our own `patchFont` inline-style writes are skipped so applying a batch
   * can't schedule a redundant re-scan of itself.
   */
  private queueAttributeTarget(mutation: MutationRecord): void {
    const el = mutation.target as Element;
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    if (
      mutation.attributeName === "class" &&
      onlyTranslationClassChanged(mutation.oldValue, el.getAttribute("class"))
    )
      return;
    if (
      mutation.attributeName === "style" &&
      this.patchedFontStyle.has(el) &&
      this.patchedFontStyle.get(el) === (el.getAttribute("style") ?? "")
    ) {
      return;
    }
    this.pendingAttributeNodes.add(el);
  }

  private scheduleFlush(): void {
    if (this.pendingFlush !== undefined) return;
    this.pendingFlush = window.setTimeout(() => {
      this.pendingFlush = undefined;
      if (this.mutationFlushRunning) return;
      const nodes = this.drainPendingNodes();
      if (nodes.length === 0) return;
      this.mutationFlushRunning = true;
      const generation = this.generation;
      void this.flushNodes(nodes).finally(() => {
        if (generation === this.generation) {
          this.mutationFlushRunning = false;
          if (this.active && this.hasPendingNodes()) this.scheduleFlush();
        }
      });
    }, 250);
  }

  private hasPendingNodes(): boolean {
    return this.pendingNodes.size > 0 || this.pendingAttributeNodes.size > 0;
  }

  /**
   * Take everything queued since the last flush.
   *
   * Attribute-mutation targets are filtered here rather than in the observer
   * callback: `isTranslatableElement` reads computed style, and doing that
   * inside the callback would force a recalc on every class toggle on a busy
   * page. Batching the check into the flush pays it once per element, and only
   * for elements that survived 250ms of coalescing.
   */
  private drainPendingNodes(): Node[] {
    const nodes = Array.from(this.pendingNodes);
    this.pendingNodes.clear();

    if (this.pendingAttributeNodes.size > 0) {
      const revealed = Array.from(this.pendingAttributeNodes);
      this.pendingAttributeNodes.clear();
      withCollectCache(() => {
        for (const el of revealed) {
          if (!el.isConnected) continue;
          if (!isTranslatableElement(el)) continue;
          nodes.push(el);
        }
      });
    }
    return nodes;
  }

  private async flushNodes(nodes: Node[]): Promise<void> {
    if (!this.active || nodes.length === 0) return;
    // SPA hygiene: drop records whose nodes the page has since detached (they
    // can never be restored) so long-lived feeds don't grow memory unboundedly.
    // Remove any still-connected bilingual wrapper before discarding its record
    // so orphaned wrappers aren't left behind permanently.
    if (this.records.length > 500) {
      const kept: AppliedRecord[] = [];
      for (const r of this.records) {
        if (r.segment.node.isConnected) {
          kept.push(r);
        } else {
          r.injectedNode?.parentNode?.removeChild(r.injectedNode);
        }
      }
      this.records = kept;
    }
    const segments: TextSegment[] = [];
    const seen = new Set<Text>();
    const generation = this.generation;
    const cancelled = () => !this.active || generation !== this.generation;
    for (const root of dedupeRoots(nodes)) {
      if (cancelled()) return;
      for (const segment of await collectSegmentsAsync(
        root,
        (n) => this.translatedNodes.has(n),
        cancelled
      )) {
        if (seen.has(segment.node)) continue;
        seen.add(segment.node);
        segments.push(segment);
      }
    }
    if (cancelled() || segments.length === 0) return;

    const { visible, hidden } = await partitionByViewport(segments, cancelled);
    if (cancelled()) return;
    const batches = [...batchSegments(visible), ...batchSegments(hidden)];
    await this.runBatches(batches);
  }

  private emitProgress(): void {
    this.onProgress?.({
      active: this.active,
      count: this.records.length,
      pending: this.pendingBatches
    });
  }
}

const INLINE_TAGS = new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "CITE",
  "EM",
  "I",
  "MARK",
  "Q",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U"
]);

function isInlineParent(parent: Element): boolean {
  if (INLINE_TAGS.has(parent.tagName)) return true;
  const display = window.getComputedStyle(parent).display;
  return display.startsWith("inline");
}

/**
 * Reduce a batch of mutation targets to the minimal set of roots to walk.
 *
 * A single SPA render can push dozens of nodes from the same subtree into
 * `pendingNodes` (a container plus each of its new children). Walking all of
 * them re-traverses the same elements repeatedly — the text-node dedup in
 * `flushNodes` only kicks in *after* that work is already done. Dropping any
 * node that is contained by another keeps the result identical while walking
 * each subtree once.
 *
 * Check ancestor membership instead of comparing every pair: busy feeds can
 * queue thousands of disjoint nodes in a single flush.
 */
export function dedupeRoots(nodes: Node[]): Node[] {
  const roots = new Set<Node>();
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const root = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!root) continue;
    roots.add(root);
  }

  const minimal: Node[] = [];
  for (const candidate of roots) {
    let covered = false;
    for (let ancestor = candidate.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (roots.has(ancestor)) {
        covered = true;
        break;
      }
    }
    if (!covered) minimal.push(candidate);
  }
  return minimal;
}

/**
 * Splits segments into "visible in (or near) the current viewport" and the
 * rest, reading each parent's bounding rect at most once. A one-viewport
 * bottom margin is included so content the user is about to scroll into is
 * also part of the priority pass.
 */
async function partitionByViewport(
  segments: TextSegment[],
  cancelled: () => boolean
): Promise<{
  visible: TextSegment[];
  hidden: TextSegment[];
}> {
  const viewportBottom = window.innerHeight * 2;
  const inView = new Map<Element, boolean>();
  const visible: TextSegment[] = [];
  const hidden: TextSegment[] = [];
  let started = performance.now();
  for (const segment of segments) {
    if (cancelled()) break;
    if (performance.now() - started >= 8) {
      await yieldToPage();
      started = performance.now();
      if (cancelled()) break;
    }
    const parent = segment.node.parentElement;
    if (!parent) {
      hidden.push(segment);
      continue;
    }
    let hit = inView.get(parent);
    if (hit === undefined) {
      const rect = parent.getBoundingClientRect();
      hit = rect.bottom > 0 && rect.top < viewportBottom;
      inView.set(parent, hit);
    }
    (hit ? visible : hidden).push(segment);
  }
  return { visible, hidden };
}

/** Ignore our loading marker while preserving real page class changes. */
export function onlyTranslationClassChanged(before: string | null, after: string | null): boolean {
  const pageClasses = (value: string | null) =>
    (value ?? "")
      .split(/\s+/)
      .filter((name) => name && name !== TRANSLATING_CLASS)
      .sort()
      .join(" ");
  return pageClasses(before) === pageClasses(after);
}

/**
 * Merge the Vietnamese-capable fallback into an existing font stack so missing
 * diacritic glyphs always resolve. The fallback fonts are inserted *before*
 * the first CSS generic family (sans-serif, system-ui, …) because per-glyph
 * fallback stops at the generic — on a CJK-locale machine that generic is a
 * CJK font without Vietnamese glyphs, so anything after it is unreachable.
 *
 * Example (JA locale):
 *   in:  "Yu Gothic", sans-serif
 *   out: "Yu Gothic", "Segoe UI", Roboto, …, sans-serif
 */
function mergeFontStack(computed: string): string {
  const stack = splitFontFamily(computed);
  // Already patched? (defensive — patchFont guards via the attribute too)
  if (stack.some((f) => /noto sans|segoe ui|liberation sans/i.test(f))) {
    return computed || TRANSLATED_FONT_FALLBACK;
  }

  const fallback = splitFontFamily(TRANSLATED_FONT_FALLBACK);
  const genericIndex = stack.findIndex((f) =>
    GENERIC_FONT_FAMILIES.has(stripQuotes(f).toLowerCase())
  );

  if (genericIndex === -1) {
    // No generic present: just append the fallback after the page fonts.
    return [...stack, ...fallback].join(", ");
  }

  // Splice the fallback fonts in just before the first generic.
  const head = stack.slice(0, genericIndex);
  const tail = stack.slice(genericIndex); // keep the page's generic(s) last
  // Drop the trailing generic from `fallback` to avoid duplicating it.
  const fallbackNoGeneric = fallback.filter(
    (f) => !GENERIC_FONT_FAMILIES.has(stripQuotes(f).toLowerCase())
  );
  return [...head, ...fallbackNoGeneric, ...tail].join(", ");
}

/** Split a font-family declaration into individual, trimmed families. */
function splitFontFamily(value: string): string[] {
  return value
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "").trim();
}
