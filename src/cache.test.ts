import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache, readCache, writeCache } from "./cache";

/**
 * Stub `chrome.storage.local` with an in-memory map so the cache module can be
 * exercised under Node without a browser. The cache also keeps an in-memory
 * layer, so we mostly assert its behaviour rather than persistence.
 */
function installChromeStub() {
  const store = new Map<string, unknown>();
  const storageLocal = {
    get: async (key: string | string[] | Record<string, unknown>) => {
      const keys = Array.isArray(key) ? key : typeof key === "string" ? [key] : Object.keys(key);
      const out: Record<string, unknown> = {};
      for (const k of keys) if (store.has(k)) out[k] = store.get(k);
      return out;
    },
    set: async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
    },
    remove: async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) store.delete(k);
    }
  };
  const chromeStub = { storage: { local: storageLocal, session: storageLocal } };
  vi.stubGlobal("chrome", chromeStub);
  return { store, chromeStub };
}

describe("cache", () => {
  beforeEach(() => {
    installChromeStub();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    return clearCache();
  });

  it("returns cached translations for known texts", async () => {
    await writeCache("google", "en", "vi", ["hello"], ["xin chào"]);
    const { translations } = await readCache("google", "en", "vi", ["hello"]);
    expect(translations).toEqual(["xin chào"]);
  });

  it("returns null slots for cache misses", async () => {
    const { translations } = await readCache("google", "en", "vi", ["miss"]);
    expect(translations).toEqual([null]);
  });

  it("drops entries whose TTL has expired", async () => {
    await writeCache("google", "en", "vi", ["hello"], ["xin chào"]);
    await vi.advanceTimersByTimeAsync(2000);
    // 8 days later — past the 7-day TTL.
    vi.setSystemTime(new Date("2026-01-09T00:00:00Z"));
    const { translations } = await readCache("google", "en", "vi", ["hello"]);
    expect(translations).toEqual([null]);
    await vi.advanceTimersByTimeAsync(2000);
    const persisted = await chrome.storage.local.get("web-translator:cache");
    expect(persisted["web-translator:cache"]).toEqual({});
  });

  it("expires entries exactly at the TTL boundary", async () => {
    await writeCache("google", "en", "vi", ["hello"], ["xin chào"]);
    vi.setSystemTime(new Date("2026-01-08T00:00:00Z"));
    const { translations } = await readCache("google", "en", "vi", ["hello"]);
    expect(translations).toEqual([null]);
  });

  it("scopes cache entries by provider and target", async () => {
    await writeCache("google", "en", "vi", ["hello"], ["xin chào"]);
    await writeCache("google", "en", "es", ["hello"], ["hola"]);
    const viResult = await readCache("google", "en", "vi", ["hello"]);
    const esResult = await readCache("google", "en", "es", ["hello"]);
    expect(viResult.translations).toEqual(["xin chào"]);
    expect(esResult.translations).toEqual(["hola"]);
  });

  it("scopes cache entries by source language", async () => {
    await writeCache("google", "ja", "vi", ["度"], ["độ"]);
    const enResult = await readCache("google", "en", "vi", ["度"]);
    const jaResult = await readCache("google", "ja", "vi", ["度"]);
    expect(enResult.translations).toEqual([null]);
    expect(jaResult.translations).toEqual(["độ"]);
  });

  it("does not cache empty outputs or provider-flagged failures", async () => {
    await writeCache(
      "google",
      "en",
      "vi",
      ["hello", "world", "tere"],
      ["", "world", "tere"],
      undefined,
      [false, true, false]
    );
    const { translations } = await readCache("google", "en", "vi", ["hello", "world", "tere"]);
    // "hello" → "" is an empty result; "world" was flagged by the provider as
    // padding. Both must stay uncached so they retry.
    expect(translations[0]).toBeNull();
    expect(translations[1]).toBeNull();
    // "tere" legitimately translates to itself and is NOT flagged, so it caches.
    expect(translations[2]).toBe("tere");
  });

  it("caches a translation that legitimately equals its source", async () => {
    // Proper nouns, "OK", and pages already written in the target language all
    // round-trip unchanged. Treating that as a failure (the old behaviour) meant
    // the engine re-requested those segments on every mutation pass forever.
    await writeCache("google", "en", "vi", ["Windows", "OK"], ["Windows", "OK"]);
    const { translations } = await readCache("google", "en", "vi", ["Windows", "OK"]);
    expect(translations).toEqual(["Windows", "OK"]);
  });

  it("evicts least-recently-used entries first when over capacity", async () => {
    // The cap is 5000. Writing 5001 produces one eviction. To keep the test
    // fast and robust against cap tweaks, exercise the LRU ordering with a
    // smaller, fixed overflow and assert the oldest untouched entry is gone
    // while a recently read one survives.
    const CAP = 5000;
    // Fill the cache.
    for (let i = 0; i < CAP; i++) {
      await writeCache("google", "en", "vi", [`k${i}`], [`v${i}`]);
    }
    // Touch the oldest entry so it becomes most-recently-used.
    const oldest = await readCache("google", "en", "vi", ["k0"]);
    expect(oldest.translations).toEqual(["v0"]);

    // Overflow by one. The new least-recently-used is `k1` (k0 was just
    // promoted to MRU), so k1 should be the one dropped.
    await writeCache("google", "en", "vi", ["overflow"], ["ov"]);

    const k0 = await readCache("google", "en", "vi", ["k0"]);
    const k1 = await readCache("google", "en", "vi", ["k1"]);
    const overflow = await readCache("google", "en", "vi", ["overflow"]);
    expect(k0.translations).toEqual(["v0"]); // protected by recent read
    expect(overflow.translations).toEqual(["ov"]); // just written
    expect(k1.translations).toEqual([null]); // evicted as LRU
  });

  it("skips caching oversized single entries so storage quota is protected", async () => {
    const huge = "x".repeat(10_000);
    await writeCache("google", "en", "vi", [huge], [huge]);
    const { translations } = await readCache("google", "en", "vi", [huge]);
    expect(translations).toEqual([null]);
  });

  it("halves the cache and retries once when storage.set hits QuotaExceededError", async () => {
    const { chromeStub } = installChromeStub();
    let setCalls = 0;
    const origSet = chromeStub.storage.local.set;
    chromeStub.storage.local.set = async (obj: Record<string, unknown>) => {
      setCalls++;
      if (setCalls === 1) throw new Error("QUOTA_BYTES quota exceeded");
      return origSet(obj);
    };

    await writeCache("google", "en", "vi", ["a", "b", "c", "d"], ["1", "2", "3", "4"]);
    await vi.advanceTimersByTimeAsync(2000);

    expect(setCalls).toBe(2);
    const persisted = (await chrome.storage.local.get("web-translator:cache"))[
      "web-translator:cache"
    ] as Record<string, unknown>;
    expect(Object.keys(persisted).length).toBe(2);
  });
});
