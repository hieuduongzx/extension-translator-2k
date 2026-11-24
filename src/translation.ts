import { readCache, writeCache } from "./cache";
import { providerCacheKey, translateWith, type TranslateResult } from "./providers";
import type { ProviderId, Settings } from "./types";

/**
 * Cap on provider calls running at once across the whole service worker.
 *
 * Every frame's content engine runs its own batch pool, and pages like YouTube
 * have several frames (watch page + live chat) — often in several tabs. Without
 * a global cap those pools stack into a burst that trips the free endpoints'
 * rate limits, and then every batch fails at once.
 */
export const MAX_CONCURRENT_PROVIDER_CALLS = 4;

let activeProviderCalls = 0;
const providerCallWaiters: (() => void)[] = [];

export async function withProviderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeProviderCalls >= MAX_CONCURRENT_PROVIDER_CALLS) {
    await new Promise<void>((resolve) => providerCallWaiters.push(resolve));
  } else {
    activeProviderCalls++;
  }
  try {
    return await task();
  } finally {
    // Hand the slot straight to the next waiter (count stays the same), or
    // release it.
    const next = providerCallWaiters.shift();
    if (next) next();
    else activeProviderCalls--;
  }
}

function slotFailed(result: TranslateResult, index: number): boolean {
  return Boolean(result.failed?.[index]) || !result.translations[index];
}

/** Translate repeated labels only once and expand results back into DOM order. */
export async function translateCached(
  provider: ProviderId,
  texts: string[],
  source: string,
  target: string,
  settings: Settings
): Promise<TranslateResult> {
  const uniqueTexts = [...new Set(texts)];
  const cacheProvider = providerCacheKey(provider, settings);
  const { translations, detected: cachedDetected } = await readCache(
    cacheProvider,
    source,
    target,
    uniqueTexts
  );
  const missingIndices: number[] = [];
  const missingTexts: string[] = [];
  for (let index = 0; index < translations.length; index++) {
    if (translations[index] === null) {
      missingIndices.push(index);
      missingTexts.push(uniqueTexts[index]);
    }
  }
  let detected = cachedDetected;
  if (missingTexts.length > 0) {
    const result = await withProviderSlot(() =>
      translateWith(provider, missingTexts, source, target, settings)
    );
    await writeCache(
      cacheProvider,
      source,
      target,
      missingTexts,
      result.translations,
      result.detected,
      result.failed
    );
    missingIndices.forEach((index, resultIndex) => {
      translations[index] = slotFailed(result, resultIndex) ? "" : result.translations[resultIndex];
    });
    detected ??= result.detected;

    // A provider can drop a few slots of an otherwise good batch (a rate-limited
    // Bing segment, a malformed Google slot, a chunk the model skipped). Give
    // just those one more try instead of leaving them untranslated on the page.
    const retryPositions = missingIndices
      .map((_, resultIndex) => resultIndex)
      .filter((resultIndex) => slotFailed(result, resultIndex));
    // (A provider that is down throws instead, so this never doubles traffic
    // against a dead endpoint.)
    if (retryPositions.length > 0) {
      const retryTexts = retryPositions.map((resultIndex) => missingTexts[resultIndex]);
      try {
        const retry = await withProviderSlot(() =>
          translateWith(provider, retryTexts, source, target, settings)
        );
        await writeCache(
          cacheProvider,
          source,
          target,
          retryTexts,
          retry.translations,
          retry.detected,
          retry.failed
        );
        retryPositions.forEach((resultIndex, retryIndex) => {
          if (!slotFailed(retry, retryIndex)) {
            translations[missingIndices[resultIndex]] = retry.translations[retryIndex];
          }
        });
        detected ??= retry.detected;
      } catch {
        // Keep the blanks; the engine reports the partial failure.
      }
    }
  }
  const byText = new Map(uniqueTexts.map((text, index) => [text, translations[index] ?? ""]));
  return { translations: texts.map((text) => byText.get(text) ?? ""), detected };
}
