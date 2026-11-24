import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectSegmentsAsync,
  hasSkippedAncestor,
  isTranslatableElement,
  withCollectCache
} from "./walker";
import { yieldToPage } from "./scheduling";

vi.mock("./scheduling", () => ({ yieldToPage: vi.fn(async () => undefined) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(yieldToPage).mockReset();
});

function element(tagName: string, parentElement: Element | null = null): Element {
  return { tagName, parentElement } as Element;
}

describe("hasSkippedAncestor", () => {
  it("skips descendants of code and preformatted content", () => {
    expect(hasSkippedAncestor(element("SPAN", element("CODE")))).toBe(true);
    expect(hasSkippedAncestor(element("EM", element("SPAN", element("PRE"))))).toBe(true);
    expect(hasSkippedAncestor(element("text", element("svg")))).toBe(true);
  });

  it("allows ordinary nested content", () => {
    expect(hasSkippedAncestor(element("SPAN", element("P")))).toBe(false);
  });
});

describe("collectSegmentsAsync", () => {
  function page(values: string[]) {
    const parent = fakeElement();
    const nodes = values.map(
      (nodeValue) => ({ nodeValue, parentElement: parent, isConnected: true }) as unknown as Text
    );
    let cursor = 0;
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 });
    vi.stubGlobal("document", {
      createTreeWalker: () => ({ nextNode: () => nodes[cursor++] ?? null })
    });
    return { parent, nodes };
  }

  it("yields while scanning large pages and preserves text order", async () => {
    const { nodes } = page(Array.from({ length: 600 }, (_, index) => `Text ${index}`));
    const segments = await collectSegmentsAsync({} as Node);
    expect(segments.map((item) => item.node)).toEqual(nodes);
    expect(yieldToPage).toHaveBeenCalled();
  });

  it("yields even when all text is skipped", async () => {
    page(Array.from({ length: 600 }, () => "1234"));
    expect(await collectSegmentsAsync({} as Node)).toEqual([]);
    expect(yieldToPage).toHaveBeenCalled();
  });

  it("discards collected results if cancelled during a yield", async () => {
    page(Array.from({ length: 600 }, () => "Hello"));
    let cancelled = false;
    vi.mocked(yieldToPage).mockImplementation(async () => {
      cancelled = true;
    });
    expect(
      await collectSegmentsAsync(
        {} as Node,
        () => false,
        () => cancelled
      )
    ).toEqual([]);
  });

  it("refreshes visibility after a yield and skips detached or translated nodes", async () => {
    const { parent, nodes } = page(Array.from({ length: 600 }, () => "Hello"));
    nodes[0] = Object.assign(nodes[0], { isConnected: false });
    vi.mocked(yieldToPage).mockImplementation(async () => {
      parent.checkVisibility = () => false;
    });
    const segments = await collectSegmentsAsync({} as Node, (node) => node === nodes[1]);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length).toBeLessThan(250);
    expect(segments.some((item) => item.node === nodes[0] || item.node === nodes[1])).toBe(false);
  });
});

interface FakeElement extends Element {
  visibilityCalls: number;
  closestCalls: number;
}

/**
 * Minimal stand-in for a rendered element. Only the members
 * `isTranslatableElement` touches are implemented, plus call counters so the
 * memo can be asserted without a real DOM.
 */
function fakeElement(options: { visible?: boolean; editable?: boolean } = {}): FakeElement {
  const el = {
    tagName: "P",
    parentElement: null,
    isContentEditable: options.editable ?? false,
    visibilityCalls: 0,
    closestCalls: 0,
    closest() {
      el.closestCalls++;
      return null;
    },
    checkVisibility() {
      el.visibilityCalls++;
      return options.visible ?? true;
    }
  };
  return el as unknown as FakeElement;
}

describe("isTranslatableElement", () => {
  it("uses checkVisibility so hidden subtrees are skipped", () => {
    // `display` does not inherit, so reading getComputedStyle(el).display can
    // never see that an *ancestor* is display:none. checkVisibility can.
    const hidden = fakeElement({ visible: false });
    expect(isTranslatableElement(hidden)).toBe(false);
    expect(hidden.visibilityCalls).toBe(1);

    expect(isTranslatableElement(fakeElement({ visible: true }))).toBe(true);
  });

  it("rejects editable regions without consulting visibility", () => {
    const editable = fakeElement({ editable: true });
    expect(isTranslatableElement(editable)).toBe(false);
    expect(editable.visibilityCalls).toBe(0);
  });

  it("performs a single merged ancestor lookup", () => {
    // Previously six separate closest()/classList checks walked the tree.
    const el = fakeElement();
    isTranslatableElement(el);
    expect(el.closestCalls).toBe(1);
  });
});

describe("withCollectCache", () => {
  it("memoizes the per-element result inside one pass", () => {
    const el = fakeElement();
    withCollectCache(() => {
      isTranslatableElement(el);
      isTranslatableElement(el);
      isTranslatableElement(el);
    });
    expect(el.visibilityCalls).toBe(1);
    expect(el.closestCalls).toBe(1);
  });

  it("shares one memo across nested passes", () => {
    const el = fakeElement();
    withCollectCache(() => {
      isTranslatableElement(el);
      withCollectCache(() => {
        isTranslatableElement(el);
      });
      isTranslatableElement(el);
    });
    expect(el.visibilityCalls).toBe(1);
  });

  it("does not retain the memo across passes", () => {
    // Style and DOM structure change between flushes, so a stale memo would
    // keep translating an element that has since been hidden.
    const el = fakeElement();
    withCollectCache(() => isTranslatableElement(el));
    withCollectCache(() => isTranslatableElement(el));
    expect(el.visibilityCalls).toBe(2);
  });

  it("clears the memo even when the callback throws", () => {
    const el = fakeElement();
    expect(() =>
      withCollectCache(() => {
        isTranslatableElement(el);
        throw new Error("boom");
      })
    ).toThrow("boom");
    withCollectCache(() => isTranslatableElement(el));
    expect(el.visibilityCalls).toBe(2);
  });

  it("returns the callback's value", () => {
    expect(withCollectCache(() => 42)).toBe(42);
  });
});
