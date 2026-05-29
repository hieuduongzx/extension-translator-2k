import { BATCH_CHAR_LIMIT, BATCH_SEGMENT_LIMIT } from "./constants";
import type { TextSegment } from "./walker";

export interface SegmentBatch {
  segments: TextSegment[];
  texts: string[];
}

/**
 * Groups segments into batches that respect both the per-request character
 * and segment limits enforced by the providers.
 */
export function batchSegments(segments: TextSegment[]): SegmentBatch[] {
  const batches: SegmentBatch[] = [];
  let current: SegmentBatch = { segments: [], texts: [] };
  let currentChars = 0;

  for (const segment of segments) {
    const len = segment.text.length;

    const wouldExceedChars =
      currentChars + len > BATCH_CHAR_LIMIT && current.segments.length > 0;
    const wouldExceedCount = current.segments.length >= BATCH_SEGMENT_LIMIT;

    if (wouldExceedChars || wouldExceedCount) {
      batches.push(current);
      current = { segments: [], texts: [] };
      currentChars = 0;
    }

    current.segments.push(segment);
    current.texts.push(segment.text);
    currentChars += len;
  }

  if (current.segments.length > 0) batches.push(current);
  return batches;
}
