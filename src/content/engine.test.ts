import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  dedupeRoots,
  isSegmentCurrent,
  sameEngineConfig,
  onlyTranslationClassChanged
} from "./engine";
import type { TextSegment } from "./walker";
import type { DisplayMode, ProviderId } from "../types";

// `dedupeRoots` compares against `Node.ELEMENT_NODE`; tests run in Node env.
beforeAll(() => {
  vi.stubGlobal("Node", { ELEMENT_NODE: 1, TEXT_NODE: 3 });
});

function segment(nodeValue: string | null, text: string, connected = true): TextSegment {
  return {
    node: { nodeValue, parentNode: {}, isConnected: connected } as Text,
    text
  };
}

describe("isSegmentCurrent", () => {
  it("accepts an unchanged connected text snapshot", () => {
    expect(isSegmentCurrent(segment("  current  ", "current"))).toBe(true);
  });

  it("rejects stale and detached text snapshots", () => {
    expect(isSegmentCurrent(segment("new", "old"))).toBe(false);
    expect(isSegmentCurrent(segment("old", "old", false))).toBe(false);
  });
});

function config(overrides: Partial<Parameters<typeof sameEngineConfig>[0]> = {}) {
  return {
    provider: "google" as ProviderId,
    displayMode: "replace" as DisplayMode,
    source: "auto",
    target: "vi",
    ...overrides
  };
}

describe("sameEngineConfig", () => {
  it("treats identical configs as equal", () => {
    expect(sameEngineConfig(config(), config())).toBe(true);
  });

  it("detects a change in any translation-affecting field", () => {
    expect(sameEngineConfig(config(), config({ provider: "bing" }))).toBe(false);
    expect(sameEngineConfig(config(), config({ displayMode: "bilingual" }))).toBe(false);
    expect(sameEngineConfig(config(), config({ source: "en" }))).toBe(false);
    expect(sameEngineConfig(config(), config({ target: "ja" }))).toBe(false);
  });
});

/**
 * Fake node tree: `contains` follows the parent chain, matching the DOM
 * contract (an element contains itself).
 */
function node(id: string, parent: FakeNode | null = null): FakeNode {
  const self: FakeNode = {
    id,
    parent,
    parentElement: parent,
    nodeType: 1,
    isConnected: true,
    contains(other: FakeNode | null) {
      for (let cur = other; cur; cur = cur.parent) if (cur === self) return true;
      return false;
    }
  };
  return self;
}

interface FakeNode {
  id: string;
  parent: FakeNode | null;
  parentElement: FakeNode | null;
  nodeType: number;
  isConnected: boolean;
  contains(other: FakeNode | null): boolean;
}

const asNodes = (nodes: FakeNode[]): Node[] => nodes as unknown as Node[];

describe("dedupeRoots", () => {
  it("drops nodes contained by another pending node", () => {
    // One SPA render pushes a container plus each new child; walking all of
    // them re-traverses the same subtree repeatedly.
    const container = node("container");
    const childA = node("a", container);
    const childB = node("b", container);
    const result = dedupeRoots(asNodes([container, childA, childB]));
    expect(result).toEqual([container]);
  });

  it("keeps disjoint subtrees", () => {
    const left = node("left");
    const right = node("right");
    const result = dedupeRoots(asNodes([left, right]));
    expect(result).toHaveLength(2);
  });

  it("collapses a duplicate of the same element to one entry", () => {
    // A childList mutation and an attribute mutation can both queue one
    // container; `contains` is true for self so it can't separate duplicates.
    const el = node("only");
    expect(dedupeRoots(asNodes([el, el]))).toEqual([el]);
  });

  it("skips detached nodes", () => {
    const detached = node("gone");
    detached.isConnected = false;
    expect(dedupeRoots(asNodes([detached]))).toEqual([]);
  });

  it("resolves a text node to its parent element", () => {
    const parent = node("parent");
    const text = node("text", parent);
    text.nodeType = 3;
    (text as unknown as { parentElement: FakeNode }).parentElement = parent;
    expect(dedupeRoots(asNodes([text]))).toEqual([parent]);
  });
});

describe("onlyTranslationClassChanged", () => {
  it("ignores loading marker additions and removals", () => {
    expect(onlyTranslationClassChanged("page", "page wt-translating")).toBe(true);
    expect(onlyTranslationClassChanged("wt-translating page", "page")).toBe(true);
    expect(onlyTranslationClassChanged(null, "wt-translating")).toBe(true);
  });

  it("keeps page class changes even when a loading marker changes too", () => {
    expect(onlyTranslationClassChanged("hidden wt-translating", "visible")).toBe(false);
    expect(onlyTranslationClassChanged("page", "page expanded wt-translating")).toBe(false);
  });
});
