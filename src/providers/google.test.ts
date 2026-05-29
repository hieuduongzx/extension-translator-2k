import { describe, expect, it } from "vitest";
import { parseGoogleResponse } from "./google";

describe("parseGoogleResponse", () => {
  it("parses a single bare string", () => {
    expect(parseGoogleResponse("xin chào", 1)).toEqual({
      translations: ["xin chào"]
    });
  });

  it("parses a single string with detected language", () => {
    expect(parseGoogleResponse(["xin chào", "en"], 1)).toEqual({
      translations: ["xin chào"],
      detected: "en"
    });
  });

  it("parses multiple plain-string segments", () => {
    expect(parseGoogleResponse(["a", "b", "c"], 3)).toEqual({
      translations: ["a", "b", "c"],
      detected: undefined
    });
  });

  it("parses nested array segments with detection", () => {
    const raw = [
      [["t1"], "en"],
      [["t2"], "en"]
    ];
    expect(parseGoogleResponse(raw, 2)).toEqual({
      translations: ["t1", "t2"],
      detected: "en"
    });
  });

  it("pads with empty strings when fewer segments come back", () => {
    const result = parseGoogleResponse(["only-one"], 3);
    expect(result.translations).toEqual(["only-one", "", ""]);
  });

  it("truncates when more segments come back than expected", () => {
    const result = parseGoogleResponse(["a", "b", "c", "d"], 2);
    expect(result.translations).toEqual(["a", "b"]);
  });

  it("throws on a non-array, non-string payload", () => {
    expect(() => parseGoogleResponse({ unexpected: true }, 2)).toThrow(
      /Unexpected Google Translate response/
    );
  });
});
