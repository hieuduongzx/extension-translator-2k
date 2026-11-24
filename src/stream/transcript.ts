import type { RealtimeToken } from "@soniox/client";

/** One subtitle line: an utterance (or sentence) and its translation. */
export interface TranscriptLine {
  /** Stable id; the open line keeps its id when it moves into history. */
  id: number;
  text: string;
  translatedText: string;
  /** Display label such as "Speaker 1", when diarization identified one. */
  speaker?: string;
}

export interface TranscriptSnapshot {
  history: TranscriptLine[];
  current: TranscriptLine | null;
  /** True when the open line has no non-final (still changing) tokens. */
  isFinal: boolean;
}

interface Segment {
  id: number;
  original: string;
  translation: string;
  speaker?: string;
  language?: string;
  lastKind: "original" | "translation" | null;
  endpointSeen: boolean;
}

const MAX_HISTORY = 50;
/** A sentence end only closes a line once it is at least this long. */
const SENTENCE_MIN_CHARS = 60;
/** Lines this long close at the next safe point even without a pause. */
const SOFT_MAX_CHARS = 220;
/** Last-resort cap when translation never arrives (e.g. unsupported pair). */
const HARD_MAX_CHARS = 480;
const SENTENCE_END = /[.!?。！？…؟।]["'”’»)\]]*$/u;

function baseLanguage(code: string | undefined): string | undefined {
  return code?.toLowerCase().split(/[-_]/)[0];
}

/**
 * Turns the Soniox real-time token stream into subtitle lines.
 *
 * Soniox sends each final token exactly once and re-sends the non-final tail
 * on every response, so final tokens are appended and the tail is replaced.
 * Translation tokens follow the original tokens they translate, chunk by
 * chunk, so a line can only be closed safely right after translation tokens
 * (a translation → original transition). Lines close there once the speaker
 * paused (endpoint), changed, finished a long sentence, or the line got long.
 * When translation is late the next utterance joins the line instead of
 * stealing its translation.
 */
export class TranscriptBuilder {
  private history: TranscriptLine[] = [];
  private segment: Segment;
  private tailOriginal = "";
  private tailTranslation = "";
  private tailSpeaker: string | undefined;
  private tailLanguage: string | undefined;
  private nextId = 1;
  private readonly speakerLabels = new Map<string, string>();
  private readonly target: string | undefined;

  constructor(targetLanguage: string) {
    this.target = baseLanguage(targetLanguage);
    this.segment = this.createSegment();
  }

  /** Apply one Soniox result. Returns whether the visible text changed. */
  ingest(tokens: readonly RealtimeToken[]): boolean {
    let changed = false;
    let tailOriginal = "";
    let tailTranslation = "";
    let tailSpeaker: string | undefined;
    let tailLanguage: string | undefined;

    for (const token of tokens) {
      if (!token.text) continue;
      const isTranslation = token.translation_status === "translation";

      if (!token.is_final) {
        if (isTranslation) {
          tailTranslation += token.text;
        } else {
          tailOriginal += token.text;
          tailSpeaker ??= token.speaker;
          tailLanguage ??= token.language;
        }
        continue;
      }

      changed = true;
      if (isTranslation) {
        this.segment.translation += token.text;
        this.segment.lastKind = "translation";
        continue;
      }

      if (this.shouldCloseBefore(token)) this.closeSegment();
      const segment = this.segment;
      segment.original += token.text;
      segment.speaker ??= token.speaker;
      if (token.language) segment.language = token.language;
      segment.lastKind = "original";
    }

    if (
      tailOriginal !== this.tailOriginal ||
      tailTranslation !== this.tailTranslation ||
      tailSpeaker !== this.tailSpeaker
    ) {
      changed = true;
    }
    this.tailOriginal = tailOriginal;
    this.tailTranslation = tailTranslation;
    this.tailSpeaker = tailSpeaker;
    this.tailLanguage = tailLanguage;
    return changed;
  }

  /** The speaker paused (`<end>`) or a manual finalize completed (`<fin>`). */
  markEndpoint(): void {
    if (this.segment.original.trim()) this.segment.endpointSeen = true;
  }

  /** Close the open line (session ended or went idle) and drop the tail. */
  flush(): boolean {
    const hadTail = Boolean(this.tailOriginal || this.tailTranslation);
    const closed = this.closeSegment();
    this.tailOriginal = "";
    this.tailTranslation = "";
    this.tailSpeaker = undefined;
    this.tailLanguage = undefined;
    return closed || hadTail;
  }

  /** Forget every line (the overlay was cleared after a long silence). */
  clear(): void {
    this.history = [];
    this.segment = this.createSegment();
    this.tailOriginal = "";
    this.tailTranslation = "";
    this.tailSpeaker = undefined;
    this.tailLanguage = undefined;
  }

  get isEmpty(): boolean {
    return (
      this.history.length === 0 &&
      !this.segment.original.trim() &&
      !this.segment.translation.trim() &&
      !this.tailOriginal.trim() &&
      !this.tailTranslation.trim()
    );
  }

  snapshot(): TranscriptSnapshot {
    const segment = this.segment;
    const text = (segment.original + this.tailOriginal).trim();
    const translation = (segment.translation + this.tailTranslation).trim();
    const language = segment.language ?? this.tailLanguage;
    const current =
      text || translation
        ? {
            id: segment.id,
            text,
            translatedText: this.expectsTranslation(language) ? translation : translation || text,
            speaker: this.labelFor(segment.speaker ?? this.tailSpeaker)
          }
        : null;
    return {
      history: this.history.slice(),
      current,
      isFinal: !this.tailOriginal && !this.tailTranslation
    };
  }

  private shouldCloseBefore(token: RealtimeToken): boolean {
    const segment = this.segment;
    const original = segment.original.trimEnd();
    if (!original) return false;

    const length = original.length;
    const speakerChanged =
      token.speaker !== undefined &&
      segment.speaker !== undefined &&
      token.speaker !== segment.speaker;
    const atBoundary =
      segment.endpointSeen ||
      speakerChanged ||
      length >= SOFT_MAX_CHARS ||
      (length >= SENTENCE_MIN_CHARS && SENTENCE_END.test(original));
    if (!atBoundary) return false;

    if (segment.lastKind === "translation") return true;
    if (!this.expectsTranslation(segment.language)) return true;
    return length >= HARD_MAX_CHARS;
  }

  /** Speech already in the target language gets no translation tokens. */
  private expectsTranslation(language: string | undefined): boolean {
    return !language || baseLanguage(language) !== this.target;
  }

  private closeSegment(): boolean {
    const segment = this.segment;
    const text = segment.original.trim();
    const translation = segment.translation.trim();
    this.segment = this.createSegment();
    if (!text && !translation) return false;

    this.history.push({
      id: segment.id,
      text,
      translatedText: translation || text,
      speaker: this.labelFor(segment.speaker)
    });
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }
    return true;
  }

  private createSegment(): Segment {
    return {
      id: this.nextId++,
      original: "",
      translation: "",
      lastKind: null,
      endpointSeen: false
    };
  }

  private labelFor(speaker: string | undefined): string | undefined {
    if (!speaker) return undefined;
    let label = this.speakerLabels.get(speaker);
    if (!label) {
      label = `Speaker ${this.speakerLabels.size + 1}`;
      this.speakerLabels.set(speaker, label);
    }
    return label;
  }
}
