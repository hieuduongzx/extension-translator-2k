import { describe, expect, it } from "vitest";
import {
  getLanguageName,
  LANGUAGES,
  toGoogleCode,
  toMicrosoftCode
} from "./languages";

describe("toMicrosoftCode", () => {
  it("returns null for auto-detect (Bing omits `from`)", () => {
    expect(toMicrosoftCode("auto")).toBeNull();
  });

  it("maps Chinese variants to Microsoft script codes", () => {
    expect(toMicrosoftCode("zh-CN")).toBe("zh-Hans");
    expect(toMicrosoftCode("zh-TW")).toBe("zh-Hant");
  });

  it("passes other codes through unchanged", () => {
    expect(toMicrosoftCode("vi")).toBe("vi");
    expect(toMicrosoftCode("en")).toBe("en");
  });
});

describe("toGoogleCode", () => {
  it("passes every code through unchanged, including auto", () => {
    expect(toGoogleCode("auto")).toBe("auto");
    expect(toGoogleCode("zh-CN")).toBe("zh-CN");
    expect(toGoogleCode("vi")).toBe("vi");
  });
});

describe("getLanguageName", () => {
  it("returns the native name for a known code", () => {
    expect(getLanguageName("vi")).toBe("Tiếng Việt");
  });

  it("falls back to the code itself when unknown", () => {
    expect(getLanguageName("xx")).toBe("xx");
  });
});

describe("LANGUAGES", () => {
  it("has no duplicate codes", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes the default target (vi) and English", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).toContain("vi");
    expect(codes).toContain("en");
  });
});
