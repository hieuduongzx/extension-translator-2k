import { describe, expect, it } from "vitest";
import { batchSegments } from "./batching";
import { BATCH_CHAR_LIMIT, BATCH_SEGMENT_LIMIT } from "./constants";
import type { TextSegment } from "./walker";

/** Build a fake segment; the DOM `node` is irrelevant to batching. */
function seg(text: string): TextSegment {
  return { node: {} as Text, text };
}

describe("batchSegments", () => {
  it("returns no batches for an empty input", () => {
    expect(batchSegments([])).toEqual([]);
  });

  it("keeps small inputs in a single batch", () => {
    const segments = [seg("one"), seg("two"), seg("three")];
    const batches = batchSegments(segments);
    expect(batches).toHaveLength(1);
    expect(batches[0].texts).toEqual(["one", "two", "three"]);
  });

  it("splits when the segment count limit is exceeded", () => {
    const segments = Array.from({ length: BATCH_SEGMENT_LIMIT + 5 }, (_, i) =>
      seg(`s${i}`)
    );
    const batches = batchSegments(segments);
    expect(batches).toHaveLength(2);
    expect(batches[0].segments).toHaveLength(BATCH_SEGMENT_LIMIT);
    expect(batches[1].segments).toHaveLength(5);
  });

  it("splits when the character limit is exceeded", () => {
    const big = "x".repeat(BATCH_CHAR_LIMIT - 10);
    const segments = [seg(big), seg("y".repeat(50))];
    const batches = batchSegments(segments);
    expect(batches).toHaveLength(2);
  });

  it("never drops or reorders segments across batches", () => {
    const segments = Array.from({ length: 200 }, (_, i) => seg(`seg-${i}`));
    const batches = batchSegments(segments);
    const flattened = batches.flatMap((b) => b.texts);
    expect(flattened).toEqual(segments.map((s) => s.text));
  });

  it("keeps an oversized lone segment in its own batch", () => {
    const huge = seg("z".repeat(BATCH_CHAR_LIMIT * 2));
    const batches = batchSegments([huge]);
    expect(batches).toHaveLength(1);
    expect(batches[0].texts[0]).toBe(huge.text);
  });
});
