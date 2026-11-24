import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCache, writeCache } from "./cache";
import { translateWith } from "./providers";
import { MAX_CONCURRENT_PROVIDER_CALLS, translateCached } from "./translation";
import { DEFAULT_SETTINGS } from "./types";

vi.mock("./cache", () => ({ readCache: vi.fn(), writeCache: vi.fn() }));
vi.mock("./providers", () => ({ providerCacheKey: () => "google:v2", translateWith: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe("translateCached", () => {
  it("requests repeated uncached text once and restores original order", async () => {
    vi.mocked(readCache).mockResolvedValue({
      translations: [null, "Đã lưu", null],
      detected: "en"
    });
    vi.mocked(translateWith).mockResolvedValue({ translations: ["Xin chào", "Tạm biệt"] });
    const result = await translateCached(
      "google",
      ["Hello", "Cached", "Hello", "Bye"],
      "auto",
      "vi",
      DEFAULT_SETTINGS
    );
    expect(translateWith).toHaveBeenCalledWith(
      "google",
      ["Hello", "Bye"],
      "auto",
      "vi",
      DEFAULT_SETTINGS
    );
    expect(result).toEqual({
      translations: ["Xin chào", "Đã lưu", "Xin chào", "Tạm biệt"],
      detected: "en"
    });
    expect(writeCache).toHaveBeenCalledTimes(1);
  });

  it("serves a warm batch without a provider call", async () => {
    vi.mocked(readCache).mockResolvedValue({ translations: ["Xin chào"] });
    expect(
      (await translateCached("google", ["Hello", "Hello"], "en", "vi", DEFAULT_SETTINGS))
        .translations
    ).toEqual(["Xin chào", "Xin chào"]);
    expect(translateWith).not.toHaveBeenCalled();
  });

  it("expands failed slots to blanks so no duplicate is marked translated", async () => {
    vi.mocked(readCache).mockResolvedValue({ translations: [null, null] });
    vi.mocked(translateWith).mockResolvedValue({
      translations: ["Hello", "Được"],
      failed: [true, false]
    });
    expect(
      (await translateCached("google", ["Hello", "OK", "Hello"], "en", "vi", DEFAULT_SETTINGS))
        .translations
    ).toEqual(["", "Được", ""]);
    expect(writeCache).toHaveBeenCalledWith(
      "google:v2",
      "en",
      "vi",
      ["Hello", "OK"],
      ["Hello", "Được"],
      undefined,
      [true, false]
    );
  });

  it("retries only the failed slots once and fills them in", async () => {
    vi.mocked(readCache).mockResolvedValue({ translations: [null, null, null] });
    vi.mocked(translateWith)
      .mockResolvedValueOnce({ translations: ["Một", "", "Ba"], failed: [false, true, false] })
      .mockResolvedValueOnce({ translations: ["Hai"] });
    const result = await translateCached(
      "bing",
      ["One", "Two", "Three"],
      "en",
      "vi",
      DEFAULT_SETTINGS
    );
    expect(translateWith).toHaveBeenNthCalledWith(2, "bing", ["Two"], "en", "vi", DEFAULT_SETTINGS);
    expect(result.translations).toEqual(["Một", "Hai", "Ba"]);
  });

  it("preserves detected language from a retry when attempt 1 failed every slot", async () => {
    vi.mocked(readCache).mockResolvedValue({ translations: [null] });
    vi.mocked(translateWith)
      .mockResolvedValueOnce({ translations: [""], failed: [true] })
      .mockResolvedValueOnce({ translations: ["Xin chào"], detected: "en" });
    const result = await translateCached("bing", ["Hello"], "auto", "vi", DEFAULT_SETTINGS);
    expect(result).toEqual({ translations: ["Xin chào"], detected: "en" });
  });

  it("keeps partial results when the retry throws", async () => {
    vi.mocked(readCache).mockResolvedValue({ translations: [null, null] });
    vi.mocked(translateWith)
      .mockResolvedValueOnce({ translations: ["Một", ""], failed: [false, true] })
      .mockRejectedValueOnce(new Error("HTTP 429"));
    const result = await translateCached("google", ["One", "Two"], "en", "vi", DEFAULT_SETTINGS);
    expect(result.translations).toEqual(["Một", ""]);
  });

  it("never runs more provider calls at once than the global cap", async () => {
    vi.mocked(readCache).mockImplementation(async (_p, _s, _t, texts) => ({
      translations: texts.map(() => null)
    }));
    let running = 0;
    let peak = 0;
    vi.mocked(translateWith).mockImplementation(async (_p, texts) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return { translations: texts.map((t) => `vi:${t}`) };
    });
    const calls = Array.from({ length: MAX_CONCURRENT_PROVIDER_CALLS * 3 }, (_, i) =>
      translateCached("google", [`t${i}`], "en", "vi", DEFAULT_SETTINGS)
    );
    const results = await Promise.all(calls);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_PROVIDER_CALLS);
    expect(results.map((r) => r.translations[0])).toEqual(
      Array.from({ length: MAX_CONCURRENT_PROVIDER_CALLS * 3 }, (_, i) => `vi:t${i}`)
    );
  });
});
