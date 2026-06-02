import { batchSegments, type SegmentBatch } from "./batching";
import { BATCH_CONCURRENCY, BILINGUAL_CLASS, FONT_PATCH_ATTR, GENERIC_FONT_FAMILIES, LOADING_MARKER_CLASS, ORIGINAL_ATTR, TRANSLATED_ATTR, TRANSLATED_FONT_FALLBACK } from "./constants";
import { sendTranslateRequest } from "./messaging";
import { ensureStyles, removeStyles } from "./styles";
import { collectSegments, collectSelectionSegments, type TextSegment } from "./walker";
import type {
  DisplayMode,
  ProviderId
} from "../types";

interface EngineConfig {
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

/**
 * Owns the lifecycle of an "active" page translation: collects nodes,
 * dispatches batches to the background, applies translations to the DOM,
 * and observes future mutations for SPA-style updates.
 */
export class TranslationEngine {
  private active = false;
  private config: EngineConfig;
  private records: AppliedRecord[] = [];
  private observer?: MutationObserver;
  private pendingFlush?: number;
  private pendingNodes = new Set<Node>();
  private inflight = 0;
  /**
   * Text nodes we've already translated this session. Tracked per-node (not
   * via a parent attribute) so sibling text nodes inside the same element are
   * still translated on later mutation passes.
   */
  private translatedNodes = new WeakSet<Text>();
  private onProgress?: (state: { active: boolean; count: number; pending: number }) => void;
  private onError?: (message: string) => void;

  constructor(config: EngineConfig) {
    this.config = config;
  }

  setProgressHandler(fn: (state: { active: boolean; count: number; pending: number }) => void): void {
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

  async enable(config: EngineConfig): Promise<void> {
    this.config = config;
    if (this.active) {
      // Reset and re-translate with the new config.
      this.disable({ keepStyles: true });
    }
    this.active = true;
    ensureStyles();
    this.startObserver();
    await this.translateRoot(document.body);
    this.emitProgress();
  }

  /**
   * Translate only the text nodes inside the user's current selection,
   * in-place, without enabling whole-page mode or the mutation observer. Used
   * by the Alt+S shortcut. Records are tracked so a later full toggle-off
   * restores these segments along with everything else.
   */
  async translateSelection(config: EngineConfig): Promise<void> {
    this.config = config;
    ensureStyles();
    const segments = collectSelectionSegments((n) => this.translatedNodes.has(n));
    if (segments.length === 0) return;
    const batches = batchSegments(segments);
    await this.runBatches(batches, () => false);
    this.emitProgress();
  }

  disable(opts: { keepStyles?: boolean } = {}): void {
    if (!this.active && this.records.length === 0) {
      if (!opts.keepStyles) removeStyles();
      return;
    }
    this.active = false;
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.pendingFlush !== undefined) {
      window.clearTimeout(this.pendingFlush);
      this.pendingFlush = undefined;
    }
    this.pendingNodes.clear();
    this.restoreAll();
    if (!opts.keepStyles) removeStyles();
    this.emitProgress();
  }

  private async translateRoot(root: Node): Promise<void> {
    const segments = collectSegments(root, (n) => this.translatedNodes.has(n));
    if (segments.length === 0) return;
    const batches = batchSegments(segments);
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
  private async runBatches(
    batches: SegmentBatch[],
    cancelled: () => boolean = () => !this.active
  ): Promise<void> {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < batches.length) {
        if (cancelled()) return;
        const batch = batches[cursor++];
        this.inflight++;
        this.emitProgress();
        // Show a per-batch loading indicator next to the text being translated
        // so the user can see exactly which segments are in flight.
        const markers = this.showLoadingMarkers(batch.segments);
        try {
          const response = await sendTranslateRequest({
            type: "translate",
            texts: batch.texts,
            source: this.config.source,
            target: this.config.target,
            provider: this.config.provider
          });
          if (response.error) {
            this.onError?.(response.error);
            continue;
          }
          if (cancelled()) return;
          this.applyBatch(batch.segments, response.translations);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.onError?.(message);
        } finally {
          this.removeLoadingMarkers(markers);
          this.inflight--;
          this.emitProgress();
        }
      }
    };

    const poolSize = Math.min(BATCH_CONCURRENCY, batches.length);
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
  }

  private applyBatch(segments: TextSegment[], translations: string[]): void {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const translated = translations[i];
      if (!translated) continue;
      if (!segment.node.parentNode) continue;
      if (translated.trim() === segment.text.trim()) continue;

      const record = this.applyToSegment(segment, translated);
      if (record) this.records.push(record);
    }
  }

  /**
   * Inject a small animated "translating…" indicator right after each text
   * node in the batch. Returns the created marker elements so they can be
   * removed once the batch resolves. Markers are inert (`translate="no"`,
   * pointer-events none) and skipped by the walker so they never get picked up
   * as translatable content.
   */
  private showLoadingMarkers(segments: TextSegment[]): HTMLElement[] {
    const markers: HTMLElement[] = [];
    for (const segment of segments) {
      const parent = segment.node.parentNode;
      if (!parent) continue;
      const marker = document.createElement("span");
      marker.className = LOADING_MARKER_CLASS;
      marker.setAttribute("translate", "no");
      marker.setAttribute("aria-hidden", "true");
      marker.innerHTML =
        '<span class="wt-loading-dot"></span><span class="wt-loading-dot"></span><span class="wt-loading-dot"></span>';
      try {
        segment.node.after(marker);
        markers.push(marker);
      } catch {
        // Node may have been detached by the page between collect and request.
      }
    }
    return markers;
  }

  private removeLoadingMarkers(markers: HTMLElement[]): void {
    for (const marker of markers) {
      marker.remove();
    }
  }

  private applyToSegment(segment: TextSegment, translated: string): AppliedRecord | null {
    const parent = segment.node.parentElement;
    if (!parent) return null;

    // Mark this specific text node as done so the walker skips it on future
    // passes, without blocking its sibling text nodes.
    this.translatedNodes.add(segment.node);

    if (this.config.displayMode === "replace") {
      const original = segment.node.nodeValue ?? "";
      const leadingWs = original.match(/^\s*/)?.[0] ?? "";
      const trailingWs = original.match(/\s*$/)?.[0] ?? "";
      segment.node.nodeValue = `${leadingWs}${translated}${trailingWs}`;
      parent.setAttribute(TRANSLATED_ATTR, "true");
      parent.setAttribute(ORIGINAL_ATTR, segment.text);
      // The page's own font may lack Vietnamese diacritics (common with
      // script-specific webfonts, e.g. Japanese-only). Append a fallback stack
      // so missing glyphs resolve instead of rendering as tofu.
      this.patchFont(parent);
      return { segment, originalText: original };
    }

    // Bilingual: keep the original text node and inject the translation
    // alongside it. We use a block element when the parent looks block-like
    // and an inline element otherwise.
    const inline = isInlineParent(parent);
    const wrapper = document.createElement(inline ? "span" : "div");
    wrapper.className = inline ? "wt-bilingual-inline" : BILINGUAL_CLASS;
    wrapper.setAttribute("translate", "no");
    // Ensure injected translation has a Vietnamese-capable glyph source even if
    // a page stylesheet tries to force its own font on our element.
    wrapper.style.setProperty("font-family", TRANSLATED_FONT_FALLBACK, "important");
    wrapper.textContent = translated;
    segment.node.after(wrapper);
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
  private patchFont(el: HTMLElement): void {
    if (el.hasAttribute(FONT_PATCH_ATTR)) return;
    // Stash both the value and its priority so restore is exact.
    const prevValue = el.style.getPropertyValue("font-family");
    const prevPriority = el.style.getPropertyPriority("font-family");
    el.setAttribute(FONT_PATCH_ATTR, prevPriority ? `${prevValue}\u0000${prevPriority}` : prevValue);

    const computed = window.getComputedStyle(el).fontFamily || prevValue;
    el.style.setProperty("font-family", mergeFontStack(computed), "important");
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
  }

  private startObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      if (!this.active) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              this.pendingNodes.add(node);
            }
          });
        } else if (mutation.type === "characterData" && mutation.target.parentElement) {
          this.pendingNodes.add(mutation.target.parentElement);
        }
      }
      this.scheduleFlush();
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private scheduleFlush(): void {
    if (this.pendingFlush !== undefined) return;
    this.pendingFlush = window.setTimeout(() => {
      this.pendingFlush = undefined;
      const nodes = Array.from(this.pendingNodes);
      this.pendingNodes.clear();
      void this.flushNodes(nodes);
    }, 250);
  }

  private async flushNodes(nodes: Node[]): Promise<void> {
    if (!this.active || nodes.length === 0) return;
    const segments: TextSegment[] = [];
    for (const node of nodes) {
      if (!node.isConnected) continue;
      const root = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!root) continue;
      segments.push(...collectSegments(root, (n) => this.translatedNodes.has(n)));
    }
    if (segments.length === 0) return;

    const batches = batchSegments(segments);
    await this.runBatches(batches);
  }

  private emitProgress(): void {
    this.onProgress?.({
      active: this.active,
      count: this.records.length,
      pending: this.inflight
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
