import { describe, expect, it } from "vitest";
import type { RealtimeToken } from "@soniox/client";
import { TranscriptBuilder } from "./transcript";

type TokenInit = Partial<RealtimeToken> & { text: string };

function orig(text: string, extra: Partial<RealtimeToken> = {}): RealtimeToken {
  return token({ text, translation_status: "original", is_final: true, language: "en", ...extra });
}

function trans(text: string, extra: Partial<RealtimeToken> = {}): RealtimeToken {
  return token({ text, translation_status: "translation", is_final: true, ...extra });
}

function token(init: TokenInit): RealtimeToken {
  return { confidence: 1, is_final: false, ...init };
}

describe("TranscriptBuilder", () => {
  it("appends final tokens once and replaces the non-final tail", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("Hello"), orig(" wor", { is_final: false })]);
    expect(builder.snapshot().current).toMatchObject({ text: "Hello wor", translatedText: "" });
    expect(builder.snapshot().isFinal).toBe(false);

    // Next response re-sends only the new tail; the final "Hello" must stay.
    builder.ingest([orig(" world", { is_final: false })]);
    expect(builder.snapshot().current?.text).toBe("Hello world");

    builder.ingest([orig(" world"), trans("Xin chào thế giới")]);
    const snapshot = builder.snapshot();
    expect(snapshot.current).toMatchObject({
      text: "Hello world",
      translatedText: "Xin chào thế giới"
    });
    expect(snapshot.isFinal).toBe(true);
    expect(snapshot.history).toEqual([]);
  });

  it("closes a line at the first original token after an endpoint and its translation", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("Hi there.")]);
    builder.markEndpoint();
    builder.ingest([trans("Chào bạn.")]);
    builder.ingest([orig("Next one")]);

    const { history, current } = builder.snapshot();
    expect(history).toEqual([
      { id: 1, text: "Hi there.", translatedText: "Chào bạn.", speaker: undefined }
    ]);
    expect(current).toMatchObject({ id: 2, text: "Next one" });
  });

  it("keeps late translation with its line instead of the next utterance", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("First.")]);
    builder.markEndpoint();
    // The next utterance is finalized before the first one's translation.
    builder.ingest([orig(" Second.")]);
    builder.ingest([trans("Thứ nhất. Thứ hai.")]);

    const { history, current } = builder.snapshot();
    expect(history).toEqual([]);
    expect(current).toMatchObject({
      text: "First. Second.",
      translatedText: "Thứ nhất. Thứ hai."
    });
  });

  it("does not split mid-utterance chunks without a boundary", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("Hello"), trans("Xin chào")]);
    builder.ingest([orig(" everyone"), trans(" mọi người")]);
    expect(builder.snapshot().history).toHaveLength(0);
    expect(builder.snapshot().current).toMatchObject({
      text: "Hello everyone",
      translatedText: "Xin chào mọi người"
    });
  });

  it("closes long sentences at the next translation boundary", () => {
    const builder = new TranscriptBuilder("vi");
    const sentence = "This is a long sentence that keeps going well past sixty chars.";
    builder.ingest([orig(sentence), trans("Câu dài.")]);
    builder.ingest([orig(" And more")]);
    const { history, current } = builder.snapshot();
    expect(history.map((line) => line.text)).toEqual([sentence]);
    expect(current?.text).toBe("And more");
  });

  it("splits on speaker change and labels speakers in order", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("Question?", { speaker: "7" }), trans("Câu hỏi?")]);
    builder.ingest([orig("Answer.", { speaker: "3" }), trans("Trả lời.")]);
    const { history, current } = builder.snapshot();
    expect(history).toEqual([
      { id: 1, text: "Question?", translatedText: "Câu hỏi?", speaker: "Speaker 1" }
    ]);
    expect(current).toMatchObject({ text: "Answer.", speaker: "Speaker 2" });
  });

  it("shows speech already in the target language without waiting for a translation", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("Xin chào.", { language: "vi" })]);
    expect(builder.snapshot().current?.translatedText).toBe("Xin chào.");
    builder.markEndpoint();
    builder.ingest([orig("Tiếp theo", { language: "vi" })]);
    expect(builder.snapshot().history).toEqual([
      { id: 1, text: "Xin chào.", translatedText: "Xin chào.", speaker: undefined }
    ]);
  });

  it("flush closes the open line and drops the tail; clear empties everything", () => {
    const builder = new TranscriptBuilder("vi");
    builder.ingest([orig("Done"), trans("Xong"), orig(" maybe", { is_final: false })]);
    expect(builder.flush()).toBe(true);
    expect(builder.snapshot()).toEqual({
      history: [{ id: 1, text: "Done", translatedText: "Xong", speaker: undefined }],
      current: null,
      isFinal: true
    });
    builder.clear();
    expect(builder.isEmpty).toBe(true);
  });

  it("caps history at 50 lines", () => {
    const builder = new TranscriptBuilder("vi");
    for (let i = 0; i < 60; i++) {
      builder.ingest([orig(`Line ${i}.`), trans(`Dòng ${i}.`)]);
      builder.markEndpoint();
    }
    builder.flush();
    const { history } = builder.snapshot();
    expect(history).toHaveLength(50);
    expect(history[0].text).toBe("Line 10.");
    expect(history[49].text).toBe("Line 59.");
  });

  it("reports no change for an identical non-final tail", () => {
    const builder = new TranscriptBuilder("vi");
    expect(builder.ingest([orig("Hel", { is_final: false })])).toBe(true);
    expect(builder.ingest([orig("Hel", { is_final: false })])).toBe(false);
  });
});
