import { describe, expect, it } from "vitest";
import {
  bufferStatus,
  chunkIndexAt,
  findSegmentAt,
  parseJson3,
  pickChunks,
  planChunks,
  stallAhead,
  type ChunkState,
  type Segment
} from "./subtitleCues";

const json3 = (events: unknown[]): string => JSON.stringify({ wireMagic: "pb3", events });

describe("parseJson3 (human captions)", () => {
  it("keeps each event as a line and trims overlaps", () => {
    const segs = parseJson3(
      json3([
        { tStartMs: 0, dDurationMs: 0, id: 1 }, // window definition, no text
        { tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: "Hello\nthere" }] },
        { tStartMs: 3500, dDurationMs: 2000, segs: [{ utf8: "General Kenobi" }] }
      ]),
      false
    );
    expect(segs).toEqual([
      { start: 1000, end: 3500, text: "Hello there" },
      { start: 3500, end: 5500, text: "General Kenobi" }
    ]);
  });

  it("returns nothing for malformed bodies", () => {
    expect(parseJson3("not json", false)).toEqual([]);
    expect(parseJson3("{}", true)).toEqual([]);
  });
});

describe("parseJson3 (auto-generated captions)", () => {
  it("joins words into a sentence and breaks on pauses", () => {
    const segs = parseJson3(
      json3([
        {
          tStartMs: 0,
          dDurationMs: 4000,
          segs: [
            { utf8: "so" },
            { utf8: " today", tOffsetMs: 300 },
            { utf8: " we", tOffsetMs: 600 }
          ]
        },
        { tStartMs: 1500, aAppend: 1, dDurationMs: 10, segs: [{ utf8: "\n" }] },
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [
            { utf8: "build" },
            { utf8: " a", tOffsetMs: 200 },
            { utf8: " robot", tOffsetMs: 400 }
          ]
        },
        // 3 s pause, then a new thought
        {
          tStartMs: 4400,
          dDurationMs: 2000,
          segs: [{ utf8: "first" }, { utf8: " step", tOffsetMs: 300 }]
        }
      ]),
      true
    );
    expect(segs.map((s) => s.text)).toEqual(["so today we build a robot", "first step"]);
    expect(segs[0].start).toBe(0);
    expect(segs[0].end).toBeLessThanOrEqual(segs[1].start);
    expect(segs[1].start).toBe(4400);
  });

  it("does not insert spaces into Japanese", () => {
    const segs = parseJson3(
      json3([
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "今日は" }] },
        { tStartMs: 500, dDurationMs: 2000, segs: [{ utf8: "晴れです" }] }
      ]),
      true
    );
    expect(segs.map((s) => s.text)).toEqual(["今日は晴れです"]);
  });

  it("breaks at sentence punctuation", () => {
    const segs = parseJson3(
      json3([
        {
          tStartMs: 0,
          dDurationMs: 3000,
          segs: [
            { utf8: "Hi." },
            { utf8: " I'm", tOffsetMs: 300 },
            { utf8: " Sam.", tOffsetMs: 600 }
          ]
        }
      ]),
      true
    );
    expect(segs.map((s) => s.text)).toEqual(["Hi.", "I'm Sam."]);
  });

  it("caps very long run-on speech", () => {
    const words = Array.from({ length: 60 }, (_, i) => ({ utf8: " word", tOffsetMs: i * 200 }));
    const segs = parseJson3(json3([{ tStartMs: 0, dDurationMs: 20000, segs: words }]), true);
    expect(segs.length).toBeGreaterThan(2);
    for (const s of segs) expect(s.text.length).toBeLessThanOrEqual(90);
  });
});

const seg = (start: number, end: number, text = "x"): Segment => ({ start, end, text });

describe("findSegmentAt", () => {
  const segments = [seg(0, 1000), seg(2000, 3000), seg(3000, 4000)];
  it("finds the active line", () => {
    expect(findSegmentAt(segments, 500)).toBe(0);
    expect(findSegmentAt(segments, 3000)).toBe(2);
  });
  it("returns -1 in gaps and outside", () => {
    expect(findSegmentAt(segments, 1500)).toBe(-1);
    expect(findSegmentAt(segments, 5000)).toBe(-1);
    expect(findSegmentAt([], 0)).toBe(-1);
  });
});

describe("planChunks", () => {
  it("splits by segment count and characters", () => {
    const segments = Array.from({ length: 30 }, (_, i) => seg(i * 1000, i * 1000 + 900, "abc"));
    const chunks = planChunks(segments, 14, 1400);
    expect(chunks.map((c) => [c.from, c.to])).toEqual([
      [0, 14],
      [14, 28],
      [28, 30]
    ]);
    expect(chunks[1].start).toBe(14_000);
    const byChars = planChunks(segments, 100, 10);
    expect(byChars.every((c) => c.to - c.from <= 3)).toBe(true);
  });
});

describe("pickChunks", () => {
  // 10 chunks of 30 s each.
  const chunks = Array.from({ length: 10 }, (_, i) => ({
    from: i,
    to: i + 1,
    start: i * 30_000,
    end: (i + 1) * 30_000
  }));
  const idle = (): ChunkState[] => chunks.map(() => ({ status: "idle", attempts: 0, retryAt: 0 }));
  const opts = { lookaheadMs: 60_000, maxInflight: 2, maxAttempts: 3 };

  it("starts with the chunk under the playhead", () => {
    expect(pickChunks(chunks, idle(), 95_000, 0, opts)).toEqual([3, 4]);
    expect(chunkIndexAt(chunks, 95_000)).toBe(3);
  });

  it("re-prioritises after a seek and skips finished chunks", () => {
    const states = idle();
    states[7].status = "done";
    expect(pickChunks(chunks, states, 7 * 30_000 + 1, 0, opts)).toEqual([8, 9]);
  });

  it("respects the in-flight limit", () => {
    const states = idle();
    states[0].status = "pending";
    expect(pickChunks(chunks, states, 0, 0, opts)).toEqual([1]);
    states[1].status = "pending";
    expect(pickChunks(chunks, states, 0, 0, opts)).toEqual([]);
  });

  it("stops at the look-ahead window", () => {
    const states = idle();
    states[0].status = "done";
    states[1].status = "done";
    states[2].status = "done";
    // Playhead at 0: chunk 3 starts at 90 s, beyond the 60 s window.
    expect(pickChunks(chunks, states, 0, 0, opts)).toEqual([]);
  });

  it("retries failed chunks after their back-off, up to the attempt limit", () => {
    const states = idle();
    states[0] = { status: "failed", attempts: 1, retryAt: 5000 };
    states[1].status = "done";
    states[2].status = "done";
    expect(pickChunks(chunks, states, 0, 1000, opts)).toEqual([]);
    expect(pickChunks(chunks, states, 0, 6000, opts)).toEqual([0]);
    states[0].attempts = 3;
    expect(pickChunks(chunks, states, 0, 6000, opts)).toEqual([]);
  });
});

describe("bufferStatus / stallAhead", () => {
  const segments = Array.from({ length: 20 }, (_, i) => seg(i * 2000, i * 2000 + 1800));

  it("counts the settled lines in the window from the playhead", () => {
    const settled = (i: number) => i < 5;
    expect(bufferStatus(segments, settled, 0, 10)).toEqual({ done: 5, total: 10, ready: false });
    expect(bufferStatus(segments, () => true, 0, 10).ready).toBe(true);
    // Near the end the window shrinks.
    expect(bufferStatus(segments, () => true, 37_000, 10)).toEqual({
      done: 2,
      total: 2,
      ready: true
    });
    expect(bufferStatus(segments, () => false, 60_000, 10).ready).toBe(true);
  });

  it("flags a stall only when an untranslated line is about to show", () => {
    const settled = (i: number) => i < 3;
    expect(stallAhead(segments, settled, 1000, 1000)).toBe(false);
    expect(stallAhead(segments, settled, 5500, 1000)).toBe(true);
    expect(stallAhead(segments, settled, 4500, 1000)).toBe(false);
  });
});
