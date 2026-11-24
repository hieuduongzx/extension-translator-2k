import { afterEach, describe, expect, it, vi } from "vitest";
import { pickVoice } from "./tts";
import { splitForTts } from "../providers/googleTts";

describe("pickVoice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers English female voices and does not mistake 'female' for 'male'", () => {
    const voices = [
      { name: "Microsoft David", lang: "en-US" },
      { name: "Google UK English Male", lang: "en-GB" },
      { name: "Google UK English Female", lang: "en-GB" }
    ] as SpeechSynthesisVoice[];
    vi.stubGlobal("window", {
      speechSynthesis: {
        getVoices: () => voices
      }
    });

    expect(pickVoice("en")?.name).toBe("Google UK English Female");
  });
});

describe("splitForTts", () => {
  it("never splits a UTF-16 surrogate pair on a hard cut", () => {
    const source = `${"a".repeat(9)}😀tail`;
    const chunks = splitForTts(source, 10);
    expect(chunks.join("")).toBe(source);
    expect(chunks.every((chunk) => !/[\uD800-\uDBFF]$/u.test(chunk))).toBe(true);
  });

  it("prefers CJK sentence punctuation when splitting long CJK text", () => {
    const source = "これはテストです。次の文も長くて分割される必要があります。";
    const chunks = splitForTts(source, 14);
    expect(chunks[0]).toBe("これはテストです。");
    expect(chunks.join("")).toBe(source);
  });
});
