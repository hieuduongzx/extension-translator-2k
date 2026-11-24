import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

describe("Vietnamese search normalization", () => {
  it("normalizes đ in addition to combining accents", () => {
    expect(normalizeSearch("Độ mờ nền")).toBe("do mo nen");
    expect(matchesSearch("dat lai", "Đặt lại vị trí overlay")).toBe(true);
  });
});
