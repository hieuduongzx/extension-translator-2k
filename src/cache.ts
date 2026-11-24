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
 *
 * Eviction is LRU: `readCache` re-inserts touched entries to move them to the
 * most-recently-used end of the Map, so the overflow trim in `writeCache`
 * drops the least-recently-used entries first.
 */

interface CacheEntry {
  text: string;
  detected?: string;
  expiresAt: number;
}

const STORAGE_KEY = "web-translator:cache";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_CACHE_ENTRIES = 5000;
/**
 * Skip caching huge single entries and cap total stored characters well below
 * Chrome's 10 MB `chrome.storage.local` quota so settings / API keys never hit
 * `QuotaExceededError`.
 */
const MAX_ENTRY_CHARS = 16_000;
const MAX_CACHE_CHARS = 4_000_000;
const PERSIST_DEBOUNCE_MS = 2000;

const memory = new Map<string, CacheEntry>();
let totalChars = 0;
let loaded = false;
let loadPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let cacheGeneration = 0;
let storageQueue: Promise<void> = Promise.resolve();

function entrySize(key: string, entry: CacheEntry): number {
  return key.length + entry.text.length;
}

function setEntry(key: string, entry: CacheEntry): void {
  const existing = memory.get(key);
  if (existing) {
    totalChars -= entrySize(key, existing);
    // Delete before re-inserting so overwrites also move the key to the MRU end.
    memory.delete(key);
  }
  memory.set(key, entry);
  totalChars += entrySize(key, entry);
}

function deleteEntry(key: string): void {
  const existing = memory.get(key);
  if (!existing) return;
  totalChars -= entrySize(key, existing);
  memory.delete(key);
}

function trimToBudget(maxEntries = MAX_CACHE_ENTRIES, maxChars = MAX_CACHE_CHARS): void {
  if (memory.size <= maxEntries && totalChars <= maxChars) return;
  for (const key of memory.keys()) {
    deleteEntry(key);
    if (memory.size <= maxEntries && totalChars <= maxChars) break;
  }
}

function enqueueStorageOp(op: () => Promise<void>): Promise<void> {
  const next = storageQueue.then(op, op);
  storageQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function cacheKey(provider: string, source: string, target: string, text: string): string {
  return `${provider}::${source}::${target}::${text}`;
}

/** Hydrate the in-memory map from storage once per worker activation. */
async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  const gen = cacheGeneration;
  const task = (async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      // Discard stale hydration if `clearCache()` ran while storage read was in flight.
      if (gen !== cacheGeneration) return;
      const stored = result[STORAGE_KEY] as Record<string, CacheEntry> | undefined;
      const now = Date.now();
      let removedExpired = false;
      if (stored) {
        for (const [key, entry] of Object.entries(stored)) {
          if (entry && typeof entry.text === "string" && entry.expiresAt > now) {
            if (entrySize(key, entry) <= MAX_ENTRY_CHARS) {
              setEntry(key, entry);
            } else {
              removedExpired = true;
            }
          } else {
            removedExpired = true;
          }
        }
        const beforeTrim = memory.size;
        trimToBudget();
        if (memory.size < beforeTrim) removedExpired = true;
      }
      if (removedExpired) schedulePersist();
    } catch {
      // Storage unavailable; fall back to memory-only operation.
    } finally {
      if (gen === cacheGeneration) {
        loaded = true;
        loadPromise = null;
      }
    }
  })();
  loadPromise = task;
  return task;
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, PERSIST_DEBOUNCE_MS);
}

function serializeMemory(): Record<string, CacheEntry> {
  const obj: Record<string, CacheEntry> = {};
  for (const [key, entry] of memory) obj[key] = entry;
  return obj;
}

function persistNow(): Promise<void> {
  const gen = cacheGeneration;
  return enqueueStorageOp(async () => {
    if (!dirty || gen !== cacheGeneration) return;
    dirty = false;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: serializeMemory() });
    } catch {
      // Likely QuotaExceededError: drop the oldest half of entries and retry once.
      if (gen !== cacheGeneration || memory.size <= 1) return;
      trimToBudget(Math.floor(memory.size / 2), Math.floor(totalChars / 2));
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: serializeMemory() });
      } catch {
        // Non-fatal; memory cache continues to work.
      }
    }
  });
}

export interface CacheReadResult {
  translations: (string | null)[];
  detected?: string;
}

export async function readCache(
  provider: string,
  source: string,
  target: string,
  texts: string[]
): Promise<CacheReadResult> {
  await ensureLoaded();
  const now = Date.now();
  let detected: string | undefined;
  const translations = texts.map((text) => {
    const key = cacheKey(provider, source, target, text);
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      deleteEntry(key);
      schedulePersist();
      return null;
    }
    if (!detected && entry.detected) detected = entry.detected;
    // LRU touch: move the entry to the most-recently-used position so the
    // eviction below drops the least-recently-used entries first. JS Map
    // preserves insertion order and `set` on an existing key does NOT move
    // it, so we delete + re-insert.
    setEntry(key, entry);
    return entry.text;
  });
  return { translations, detected };
}

export async function writeCache(
  provider: string,
  source: string,
  target: string,
  inputs: string[],
  outputs: string[],
  detected?: string,
  failed?: boolean[]
): Promise<void> {
  await ensureLoaded();
  const expiresAt = Date.now() + CACHE_TTL_MS;
  // A batch reports one detected language for all of its texts, which is only
  // trustworthy per entry when the batch holds a single text.
  const entryDetected = inputs.length === 1 ? detected : undefined;
  let wrote = false;
  for (let i = 0; i < inputs.length; i++) {
    // Skip only genuine failures: an empty output, or a slot the provider
    // explicitly flagged (padding for a dropped chunk, an unparseable reply,
    // a rate-limited segment). Caching those would block retries for the TTL.
    //
    // A translation that legitimately equals its source ("OK", a proper noun,
    // or a page already written in the target language) IS cached. It used to
    // be skipped, which meant the engine re-requested those segments on every
    // mutation pass forever.
    if (!outputs[i] || failed?.[i]) continue;
    const key = cacheKey(provider, source, target, inputs[i]);
    const entry: CacheEntry = {
      text: outputs[i],
      detected: entryDetected,
      expiresAt
    };
    if (entrySize(key, entry) > MAX_ENTRY_CHARS) continue;
    setEntry(key, entry);
    wrote = true;
  }

  if (!wrote) return;
  trimToBudget();
  schedulePersist();
}

/** Clears both the in-memory and persisted cache. */
export async function clearCache(): Promise<void> {
  cacheGeneration++;
  memory.clear();
  totalChars = 0;
  dirty = false;
  loaded = true;
  loadPromise = null;
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await enqueueStorageOp(async () => {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });
}
