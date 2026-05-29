/**
 * Shared `fetch` wrapper that enforces a timeout via `AbortController`. The
 * public translation/dictionary endpoints can hang indefinitely on a flaky
 * network; without a timeout a single stalled request would block the
 * batch queue in the content engine. On timeout we throw a friendly error.
 */
const DEFAULT_TIMEOUT_MS = 12_000;

export interface FetchOptions extends RequestInit {
  /** Abort the request after this many milliseconds. Defaults to 12s. */
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  input: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Respect a caller-provided signal in addition to our timeout.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
