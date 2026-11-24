import { describe, expect, it } from "vitest";
import { buildSubtitlePrompt, subtitleLanguageName } from "./aiSubtitles";

describe("subtitleLanguageName", () => {
  it("resolves caption codes to English names", () => {
    expect(subtitleLanguageName("vi")).toBe("Vietnamese");
    expect(subtitleLanguageName("en-US")).toBe("English");
    expect(subtitleLanguageName("iw")).not.toBe("iw");
    expect(subtitleLanguageName("xx-unknown")).toBe("xx-unknown");
  });
});

describe("buildSubtitlePrompt", () => {
  it("sends context separately and pins the line count", () => {
    const { system, user } = buildSubtitlePrompt(["how are", "you doing"], ["hello"], "en", "vi");
    expect(system).toContain("into Vietnamese");
    expect(system).toContain("from English");
    expect(system).toContain("JSON array of 2 strings");
    expect(JSON.parse(user)).toEqual({ context: ["hello"], lines: ["how are", "you doing"] });
  });
});
