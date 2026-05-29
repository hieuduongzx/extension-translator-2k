import { describe, expect, it } from "vitest";
import { parseAIContent } from "./ai";

describe("parseAIContent", () => {
  const inputs2 = ["Hello", "World"];

  it("parses a plain JSON array", () => {
    expect(parseAIContent('["Xin chào", "Thế giới"]', inputs2)).toEqual([
      "Xin chào",
      "Thế giới"
    ]);
  });

  it("strips ```json fences", () => {
    const content = '```json\n["Xin chào", "Thế giới"]\n```';
    expect(parseAIContent(content, inputs2)).toEqual(["Xin chào", "Thế giới"]);
  });

  it("strips bare ``` fences", () => {
    const content = '```\n["A", "B"]\n```';
    expect(parseAIContent(content, inputs2)).toEqual(["A", "B"]);
  });

  it("extracts the first [...] block from surrounding prose", () => {
    const content = 'Sure! Here you go: ["Một", "Hai"] — hope that helps.';
    expect(parseAIContent(content, inputs2)).toEqual(["Một", "Hai"]);
  });

  it("pads with originals when the model returns too few items", () => {
    expect(parseAIContent('["Chỉ một"]', inputs2)).toEqual(["Chỉ một", "World"]);
  });

  it("truncates when the model returns too many items", () => {
    expect(parseAIContent('["A", "B", "C"]', inputs2)).toEqual(["A", "B"]);
  });

  it("coerces non-string array items to strings", () => {
    expect(parseAIContent("[1, 2]", inputs2)).toEqual(["1", "2"]);
  });

  it("uses the raw reply for a single input when not an array", () => {
    expect(parseAIContent("Xin chào", ["Hello"])).toEqual(["Xin chào"]);
  });

  it("returns originals unchanged when multi-input reply is unparseable", () => {
    expect(parseAIContent("not json at all", inputs2)).toEqual(inputs2);
  });
});
