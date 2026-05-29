import type { ProviderId } from "./types";

/**
 * Translation cache that survives MV3 service-worker shutdowns.
 *
 * The worker is killed after ~30s idle, so a plain in-memory `Map` (the old
 * approach) lost every cached translation between activations. We keep a fast
 * in-memory layer for the current activation AND persist to
 * `chrome.storage.local` so warm translations survive restarts.
 *
 * Persistence is debounced: rapid `set()` calls during a page translation are
 * coalesced into a single storage write to avoid hammering the disk.
 */

interface CacheEntry {
  text: string;
  detected?: string;
  expiresAt: number;
}

const STORAGE_KEY = "web-translator:cache";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_CACHE_ENTRIES = 5000;
const PERSIST_DEBOUNCE_MS = 2000;

const memory = new Map<string, CacheEntry>();
let loaded = false;
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function cacheKey(provider: ProviderId, target: string, text: string): string {
  return `${provider}::${target}::${text}`;
}

/** Hydrate the in-memory map from storage once per worker activation. */
async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] as Record<string, CacheEntry> | undefined;
      const now = Date.now();
      if (stored) {
        for (const [key, entry] of Object.entries(stored)) {
          if (entry && entry.expiresAt > now) memory.set(key, entry);
        }
      }
    } catch {
      // Storage unavailable; fall back to memory-only operation.
    } finally {
      loaded = true;
    }
  })();
  return loadPromise;
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, PERSIST_DEBOUNCE_MS);
}

async function persistNow(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [key, entry] of memory) obj[key] = entry;
    await chrome.storage.local.set({ [STORAGE_KEY]: obj });
  } catch {
    // Quota or context errors are non-fatal; memory cache still works.
  }
}

export interface CacheReadResult {
  translations: (string | null)[];
  detected?: string;
}

export async function readCache(
  provider: ProviderId,
  target: string,
  texts: string[]
): Promise<CacheReadResult> {
  await ensureLoaded();
  const now = Date.now();
  let detected: string | undefined;
  const translations = texts.map((text) => {
    const key = cacheKey(provider, target, text);
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < now) {
      memory.delete(key);
      return null;
    }
    if (!detected && entry.detected) detected = entry.detected;
    return entry.text;
  });
  return { translations, detected };
}

export async function writeCache(
  provider: ProviderId,
  target: string,
  inputs: string[],
  outputs: string[],
  detected?: string
): Promise<void> {
  await ensureLoaded();
  const expiresAt = Date.now() + CACHE_TTL_MS;
  for (let i = 0; i < inputs.length; i++) {
    if (outputs[i] === undefined) continue;
    memory.set(cacheKey(provider, target, inputs[i]), {
      text: outputs[i],
      detected,
      expiresAt
    });
  }

  if (memory.size > MAX_CACHE_ENTRIES) {
    const overflow = memory.size - MAX_CACHE_ENTRIES;
    let removed = 0;
    for (const key of memory.keys()) {
      memory.delete(key);
      if (++removed >= overflow) break;
    }
  }

  schedulePersist();
}

/** Clears both the in-memory and persisted cache. */
export async function clearCache(): Promise<void> {
  memory.clear();
  dirty = false;
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
