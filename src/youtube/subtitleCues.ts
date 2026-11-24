/**
 * Pure logic for the YouTube "AI" subtitle mode: turn YouTube's `json3`
 * timed-text into readable subtitle segments, group them into translation
 * chunks, and decide which chunk to translate next based on where the viewer
 * is in the video ("translate ahead while watching").
 *
 * Times are in milliseconds throughout.
 */

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Chunk {
  /** Index of the first segment (inclusive). */
  from: number;
  /** Index after the last segment (exclusive). */
  to: number;
  start: number;
  end: number;
}

interface Json3Seg {
  utf8?: string;
  tOffsetMs?: number;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: Json3Seg[];
}

interface Word {
  start: number;
  /** Latest time the word may still be on screen (its caption event's end). */
  until: number;
  text: string;
}

/** A segment is closed once it reaches this many characters… */
const MAX_SEGMENT_CHARS = 90;
/** …or spans this long… */
const MAX_SEGMENT_MS = 6500;
/** …or when the speaker pauses this long before the next word. */
const PAUSE_MS = 1200;
/** Past this length a comma is a good enough place to break. */
const SOFT_BREAK_CHARS = 55;
/** Keep a short line on screen at least this long (unless the next one starts). */
const MIN_DISPLAY_MS = 1200;
/** How long the last word of a line lingers after it is spoken. */
const WORD_TAIL_MS = 600;

const SENTENCE_END = /[.!?。！？…]["'”’)\]]*$/u;
const SOFT_END = /[,;:，、；：]$/u;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Scripts written without spaces between words (CJK, Thai, …). */
const NO_SPACE_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * Append an ASR word. The first word of each caption event comes without a
 * leading space, so add one unless the text is in a script without spaces.
 */
function joinWord(text: string, word: string): string {
  if (!text || /\s$/.test(text) || /^\s/.test(word)) return text + word;
  const last = text.slice(-1);
  const first = word.charAt(0);
  if (NO_SPACE_SCRIPT.test(last) || NO_SPACE_SCRIPT.test(first)) return text + word;
  return `${text} ${word}`;
}

/** Parse a `json3` timed-text body. Auto-generated (ASR) tracks are re-segmented into sentences. */
export function parseJson3(body: string, asr: boolean): Segment[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const raw = (data as { events?: unknown } | null)?.events;
  const events = (Array.isArray(raw) ? raw : []) as Json3Event[];
  const withText = events.filter(
    (e) => Array.isArray(e.segs) && e.segs.some((s) => clean(s.utf8 ?? "") !== "")
  );
  return asr ? segmentWords(collectWords(withText)) : collectCues(withText);
}

/** Human-made tracks: each event is already a display line. */
function collectCues(events: Json3Event[]): Segment[] {
  const cues = events
    .map((e) => {
      const start = e.tStartMs ?? 0;
      return {
        start,
        end: start + (e.dDurationMs ?? 0),
        text: clean((e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
      };
    })
    .filter((c) => c.text !== "")
    .sort((a, b) => a.start - b.start);
  return finalizeTimes(cues);
}

/** ASR tracks: flatten every event into timed words. */
function collectWords(events: Json3Event[]): Word[] {
  const words: Word[] = [];
  for (const e of events) {
    const start = e.tStartMs ?? 0;
    const until = start + (e.dDurationMs ?? 0);
    for (const seg of e.segs ?? []) {
      const text = (seg.utf8 ?? "").replace(/\n/g, " ");
      if (text.trim() === "") continue;
      words.push({ start: start + (seg.tOffsetMs ?? 0), until, text });
    }
  }
  return words.sort((a, b) => a.start - b.start);
}

function segmentWords(words: Word[]): Segment[] {
  const out: Segment[] = [];
  let text = "";
  let start = 0;
  let lastWordEnd = 0;

  const flush = (): void => {
    const t = clean(text);
    if (t) out.push({ start, end: lastWordEnd, text: t });
    text = "";
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    const candidate = clean(joinWord(text, w.text));
    // Starting this word would make the line too long: close the line first.
    if (text && (candidate.length > MAX_SEGMENT_CHARS || w.start - start > MAX_SEGMENT_MS)) {
      flush();
    }
    if (!text) start = w.start;
    text = text ? joinWord(text, w.text) : w.text.trimStart();
    const pause = next ? next.start - w.start > PAUSE_MS : true;
    // A word stays up until the next one is spoken, or briefly after a pause.
    let wordEnd = next && !pause ? next.start : w.start + WORD_TAIL_MS;
    if (w.until > w.start) wordEnd = Math.min(wordEnd, Math.max(w.until, w.start + WORD_TAIL_MS));
    lastWordEnd = Math.max(lastWordEnd, wordEnd);

    const current = clean(text);
    if (
      SENTENCE_END.test(current) ||
      pause ||
      (current.length >= SOFT_BREAK_CHARS && SOFT_END.test(current))
    ) {
      flush();
    }
  }
  flush();
  return finalizeTimes(out);
}

/** No overlaps, and short lines get a minimum display time when there is room. */
function finalizeTimes(segments: Segment[]): Segment[] {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const nextStart = segments[i + 1]?.start ?? Number.POSITIVE_INFINITY;
    let end = Math.max(s.end, Math.min(s.start + MIN_DISPLAY_MS, nextStart));
    if (end > nextStart && nextStart > s.start) end = nextStart;
    s.end = end;
  }
  return segments;
}

/** Group consecutive segments into translation requests. */
export function planChunks(segments: Segment[], maxSegments = 14, maxChars = 1400): Chunk[] {
  const chunks: Chunk[] = [];
  let from = 0;
  let chars = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i].text.length;
    if (i > from && (i - from >= maxSegments || chars + len > maxChars)) {
      chunks.push(makeChunk(segments, from, i));
      from = i;
      chars = 0;
    }
    chars += len;
  }
  if (from < segments.length) chunks.push(makeChunk(segments, from, segments.length));
  return chunks;
}

function makeChunk(segments: Segment[], from: number, to: number): Chunk {
  return { from, to, start: segments[from].start, end: segments[to - 1].end };
}

/** Index of the segment on screen at `time`, or -1. */
export function findSegmentAt(segments: Segment[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found !== -1 && time < segments[found].end ? found : -1;
}

/** Index of the chunk playing at `time`, or the next one to come; -1 past the end. */
export function chunkIndexAt(chunks: Chunk[], time: number): number {
  for (let i = 0; i < chunks.length; i++) {
    if (time < chunks[i].end) return i;
  }
  return -1;
}

export type ChunkStatus = "idle" | "pending" | "done" | "failed";

export interface ChunkState {
  status: ChunkStatus;
  attempts: number;
  /** Earliest wall-clock time a failed chunk may be retried. */
  retryAt: number;
}

export interface ScheduleOptions {
  /** Translate chunks starting up to this far ahead of the playhead. */
  lookaheadMs: number;
  /** Maximum chunks in flight at once. */
  maxInflight: number;
  /** Give up on a chunk after this many failed attempts. */
  maxAttempts: number;
}

export const DEFAULT_SCHEDULE: ScheduleOptions = {
  lookaheadMs: 3 * 60_000,
  maxInflight: 2,
  maxAttempts: 3
};

/**
 * Which chunks to start translating now. The chunk under the playhead always
 * comes first, then the ones after it in order while they are within the
 * look-ahead window — so a seek immediately re-prioritises around the new
 * position and translation keeps running ahead of playback.
 */
export function pickChunks(
  chunks: Chunk[],
  states: ChunkState[],
  time: number,
  now: number,
  options: ScheduleOptions = DEFAULT_SCHEDULE
): number[] {
  const inflight = states.filter((s) => s.status === "pending").length;
  let budget = options.maxInflight - inflight;
  if (budget <= 0) return [];
  const first = chunkIndexAt(chunks, time);
  if (first === -1) return [];
  const picked: number[] = [];
  for (let i = first; i < chunks.length && budget > 0; i++) {
    if (i > first && chunks[i].start > time + options.lookaheadMs) break;
    const s = states[i];
    const ready =
      s.status === "idle" ||
      (s.status === "failed" && s.attempts < options.maxAttempts && now >= s.retryAt);
    if (ready) {
      picked.push(i);
      budget--;
    }
  }
  return picked;
}

/** Base language subtag, lower-cased (`en-US` → `en`, `zh-Hans` → `zh`). */
export function baseLang(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0];
}

/** Lines that must be translated ahead of the playhead before playing. */
export const BUFFER_LINES = 10;

export interface BufferStatus {
  /** Lines in the window that are settled (translated, or given up on). */
  done: number;
  total: number;
  ready: boolean;
}

/** First segment still to be shown at `time` (current or next), or -1. */
function upcomingIndex(segments: Segment[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].end > time) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
}

/**
 * How much of the next `lines` subtitle lines is ready. Playback waits until
 * the whole window is ready so fast dialogue doesn't outrun the translation.
 */
export function bufferStatus(
  segments: Segment[],
  isSettled: (index: number) => boolean,
  time: number,
  lines: number
): BufferStatus {
  const start = upcomingIndex(segments, time);
  if (start === -1) return { done: 0, total: 0, ready: true };
  const end = Math.min(segments.length, start + lines);
  let done = 0;
  for (let i = start; i < end; i++) if (isSettled(i)) done++;
  return { done, total: end - start, ready: done === end - start };
}

/** True when a line due on screen within `leadMs` is still untranslated. */
export function stallAhead(
  segments: Segment[],
  isSettled: (index: number) => boolean,
  time: number,
  leadMs: number
): boolean {
  const start = upcomingIndex(segments, time);
  if (start === -1) return false;
  for (let i = start; i < segments.length && segments[i].start <= time + leadMs; i++) {
    if (!isSettled(i)) return true;
  }
  return false;
}
