import { describe, expect, it } from "vitest";
import { splitProviderText } from "./index";

describe("splitProviderText", () => {
  it("keeps every chunk within the provider limit and reconstructs the source", () => {
    const source = `${"word ".repeat(1200)}tail`;
    const parts = splitProviderText(source, 100);
    expect(parts.every((part) => part.text.length <= 100)).toBe(true);
    expect(parts.map((part) => part.text + part.separatorAfter).join("")).toBe(source);
  });

  it("does not split a UTF-16 surrogate pair", () => {
    const source = `${"a".repeat(9)}😀tail`;
    const parts = splitProviderText(source, 10);
    expect(parts.map((part) => part.text + part.separatorAfter).join("")).toBe(source);
    expect(parts.every((part) => !/[\uD800-\uDBFF]$/u.test(part.text))).toBe(true);
  });

  it("does not emit a whitespace-only leading chunk for indented CJK paragraphs", () => {
    const source = `\n    ${"漢".repeat(150)}`;
    const parts = splitProviderText(source, 50);
    expect(parts.map((part) => part.text + part.separatorAfter).join("")).toBe(source);
    expect(parts.every((part) => part.text.trim().length > 0)).toBe(true);
  });
});
