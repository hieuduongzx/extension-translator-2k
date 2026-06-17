import { describe, expect, it } from "vitest";
import { normalizeSelection } from "./selectionText";

describe("normalizeSelection", () => {
  it("preserves single newlines for line-by-line translation", () => {
    const raw =
      "This will be the leveling setup I'll be using to level then swap to\n" +
      "Gemling Legionnaire\n" +
      "in maps once I've gone through the new alt quality gems.";
    expect(normalizeSelection(raw)).toBe(
      "This will be the leveling setup I'll be using to level then swap to\n" +
        "Gemling Legionnaire\n" +
        "in maps once I've gone through the new alt quality gems."
    );
  });

  it("preserves real paragraph breaks (blank lines)", () => {
    const raw = "First paragraph.\n\nSecond paragraph.";
    expect(normalizeSelection(raw)).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("treats 3+ consecutive newlines as a single paragraph break", () => {
    const raw = "A\n\n\n\nB";
    expect(normalizeSelection(raw)).toBe("A\n\nB");
  });

  it("normalizes CRLF line endings", () => {
    expect(normalizeSelection("line one\r\nline two")).toBe("line one\nline two");
  });

  it("trims whitespace around newlines", () => {
    expect(normalizeSelection("a \t\n\t b")).toBe("a\nb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeSelection("  \n hello \n  ")).toBe("hello");
  });

  it("leaves clean single-line text untouched", () => {
    expect(normalizeSelection("just a sentence")).toBe("just a sentence");
  });

  it("keeps multi-paragraph layout with line breaks", () => {
    const raw = "Intro line with\nan icon here.\n\nNext real paragraph.";
    expect(normalizeSelection(raw)).toBe(
      "Intro line with\nan icon here.\n\nNext real paragraph."
    );
  });

  it("preserves line breaks in multi-line selections", () => {
    const raw = "第一行\n第二行\n第三行";
    expect(normalizeSelection(raw)).toBe("第一行\n第二行\n第三行");
  });

  it("preserves line breaks with mixed content", () => {
    const raw = "Header\nitem 1\nitem 2\nitem 3";
    expect(normalizeSelection(raw)).toBe("Header\nitem 1\nitem 2\nitem 3");
  });
});
