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

const responseCleanups = new WeakMap<Response, () => void>();

/**
 * Release the timeout timer, caller `AbortSignal` listener, and unread stream
 * for a `fetchWithTimeout` response when the caller does not read its body
 * (e.g. non-OK / 404 responses).
 */
export function discardResponse(response: Response): void {
  responseCleanups.get(response)?.();
  responseCleanups.delete(response);
  void response.body?.cancel().catch(() => undefined);
}

export async function fetchWithTimeout(
  input: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;
  const controller = new AbortController();
  let timedOut = false;
  let finished = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();

  // Respect a caller-provided signal in addition to our timeout.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  };

  try {
    const response = await fetch(input, { ...rest, signal: controller.signal });
    const bodyReaders = new Set(["arrayBuffer", "blob", "formData", "json", "text"]);
    const proxied = new Proxy(response, {
      get(target, property) {
        const value = Reflect.get(target, property, target) as unknown;
        if (property === "body" && value && typeof value === "object") {
          const stream = value as ReadableStream<Uint8Array>;
          return new Proxy(stream, {
            get(streamTarget, streamProp) {
              const streamVal = Reflect.get(streamTarget, streamProp, streamTarget) as unknown;
              if (streamProp === "cancel" && typeof streamVal === "function") {
                return (...args: unknown[]) =>
                  Promise.resolve(
                    (streamVal as (...cancelArgs: unknown[]) => unknown).apply(streamTarget, args)
                  ).finally(finish);
              }
              return typeof streamVal === "function" ? streamVal.bind(streamTarget) : streamVal;
            }
          });
        }
        if (
          typeof property === "string" &&
          bodyReaders.has(property) &&
          typeof value === "function"
        ) {
          return (...args: unknown[]) =>
            Promise.resolve((value as (...readerArgs: unknown[]) => unknown).apply(target, args))
              .catch((error: unknown) => {
                if (timedOut) {
                  throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
                }
                throw error;
              })
              .finally(finish);
        }
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    responseCleanups.set(proxied, finish);
    return proxied;
  } catch (err) {
    finish();
    if (timedOut) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  }
}

export interface RetryFetchOptions extends FetchOptions {
  /** Total budget for every attempt plus backoff. Defaults to 60s. */
  timeoutMs?: number;
  /** Cap for a single attempt, so one hung request can't eat the whole budget. */
  attemptTimeoutMs?: number;
  /** Maximum number of attempts, including the first. Defaults to 3. */
  attempts?: number;
}

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 8000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("timed out") ||
    /Failed to fetch|NetworkError|fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(message)
  );
}

export function retryDelayMs(attempt: number): number {
  const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  // Jitter so parallel workers don't re-hit the endpoint in lockstep.
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch, retrying transient HTTP statuses (408/429/5xx) and network errors
 * with exponential backoff. Non-retryable statuses are returned as-is so the
 * caller can build its own error. The last retryable response is returned
 * (not thrown) once attempts run out.
 */
export async function fetchWithRetry(
  url: string,
  options: RetryFetchOptions = {}
): Promise<Response> {
  const { attempts = 3, attemptTimeoutMs, timeoutMs = 60_000, ...rest } = options;
  const deadline = Date.now() + timeoutMs;
  const timeoutError = () => new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
  let attempt = 0;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timeoutError();
    attempt++;
    try {
      const res = await fetchWithTimeout(url, {
        ...rest,
        timeoutMs: attemptTimeoutMs ? Math.min(attemptTimeoutMs, remaining) : remaining
      });
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt >= attempts) {
        return res;
      }
      // Release the connection and timeout timer before the retry delay.
      discardResponse(res);
    } catch (err) {
      if (Date.now() >= deadline) throw timeoutError();
      if (attempt >= attempts || !isRetryableError(err)) throw err;
    }
    await sleep(Math.min(retryDelayMs(attempt), Math.max(0, deadline - Date.now())));
  }
}
