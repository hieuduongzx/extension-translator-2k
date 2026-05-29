import { describe, expect, it } from "vitest";
import { normalizeSelection } from "./selectionText";

describe("normalizeSelection", () => {
  it("collapses single newlines from inline widgets into spaces", () => {
    // The reported case: an icon/badge widget split the sentence with `\n`s.
    const raw =
      "This will be the leveling setup I'll be using to level then swap to\n" +
      "Gemling Legionnaire\n" +
      "in maps once I've gone through the new alt quality gems.";
    expect(normalizeSelection(raw)).toBe(
      "This will be the leveling setup I'll be using to level then swap to " +
        "Gemling Legionnaire in maps once I've gone through the new alt quality gems."
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
    expect(normalizeSelection("line one\r\nline two")).toBe("line one line two");
  });

  it("collapses surrounding tabs/spaces around the break", () => {
    expect(normalizeSelection("a \t\n\t b")).toBe("a b");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeSelection("  \n hello \n  ")).toBe("hello");
  });

  it("leaves clean single-line text untouched", () => {
    expect(normalizeSelection("just a sentence")).toBe("just a sentence");
  });

  it("keeps multi-paragraph layout while flattening inline breaks", () => {
    const raw = "Intro line with\nan icon here.\n\nNext real paragraph.";
    expect(normalizeSelection(raw)).toBe(
      "Intro line with an icon here.\n\nNext real paragraph."
    );
  });
});
