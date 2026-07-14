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
    // 8 days later — past the 7-day TTL.
    vi.setSystemTime(new Date("2026-01-09T00:00:00Z"));
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

  it("does not cache empty or unchanged outputs (failure sentinels)", async () => {
    await writeCache("google", "en", "vi", ["hello", "world"], ["", "world"]);
    const { translations } = await readCache("google", "en", "vi", ["hello", "world"]);
    expect(translations).toEqual([null, null]);
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
});
