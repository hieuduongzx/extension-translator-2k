import { batchSegments, type SegmentBatch } from "./batching";
import { BATCH_CONCURRENCY, BILINGUAL_CLASS, ORIGINAL_ATTR, TRANSLATED_ATTR } from "./constants";
import { sendTranslateRequest } from "./messaging";
import { ensureStyles, removeStyles } from "./styles";
import { collectSegments, type TextSegment } from "./walker";
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
   */
  private async runBatches(batches: SegmentBatch[]): Promise<void> {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < batches.length) {
        if (!this.active) return;
        const batch = batches[cursor++];
        this.inflight++;
        this.emitProgress();
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
          if (!this.active) return;
          this.applyBatch(batch.segments, response.translations);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.onError?.(message);
        } finally {
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
      return { segment, originalText: original };
    }

    // Bilingual: keep the original text node and inject the translation
    // alongside it. We use a block element when the parent looks block-like
    // and an inline element otherwise.
    const inline = isInlineParent(parent);
    const wrapper = document.createElement(inline ? "span" : "div");
    wrapper.className = inline ? "wt-bilingual-inline" : BILINGUAL_CLASS;
    wrapper.setAttribute("translate", "no");
    wrapper.textContent = translated;
    segment.node.after(wrapper);
    return { segment, originalText: segment.node.nodeValue ?? "", injectedNode: wrapper };
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
        record.segment.node.parentElement?.removeAttribute(TRANSLATED_ATTR);
        record.segment.node.parentElement?.removeAttribute(ORIGINAL_ATTR);
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
