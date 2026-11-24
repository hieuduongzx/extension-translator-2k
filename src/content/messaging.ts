import { BATCH_CHAR_LIMIT, BATCH_CONCURRENCY, BATCH_SEGMENT_LIMIT } from "./constants";
import type {
  DictionaryRequestMessage,
  DictionaryResponseMessage,
  LabanRequestMessage,
  LabanResponseMessage,
  TranslateRequestMessage,
  TranslateResponseMessage,
  TtsRequestMessage,
  TtsResponseMessage,
  VdictRequestMessage,
  VdictResponseMessage,
  WiktionaryRequestMessage,
  WiktionaryResponseMessage
} from "../types";

const CONTEXT_INVALIDATED = "The extension was just reloaded. Please refresh this page.";

/**
 * Promise-based `chrome.runtime.sendMessage` that never rejects. It resolves
 * with `fallback` (merged with an `error` field) when the extension context
 * is invalidated or the runtime reports an error, so callers can render a
 * friendly message instead of crashing.
 *
 * The MV3 service worker can be torn down or the extension reloaded while a
 * content-script page is still open; in that state `chrome.runtime` is
 * undefined and any direct call throws synchronously.
 */
export function sendMessage<TResponse>(request: unknown, fallback: TResponse): Promise<TResponse> {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) {
      resolve({ ...fallback, error: CONTEXT_INVALIDATED });
      return;
    }
    try {
      chrome.runtime.sendMessage(request, (response: TResponse) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ...fallback, error: err.message ?? "Runtime error" });
          return;
        }
        resolve(response ?? fallback);
      });
    } catch (err) {
      resolve({
        ...fallback,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
}

/**
 * Runtime errors that mean "the service worker wasn't there to answer this
 * time" rather than "the translation failed". MV3 tears the worker down when
 * idle; a message sent while it restarts (or that it was killed mid-reply)
 * fails with one of these, and simply resending succeeds.
 */
const TRANSIENT_RUNTIME_ERROR =
  /Could not establish connection|Receiving end does not exist|message port closed|message channel closed/i;

export function isTransientRuntimeError(message: string | undefined): boolean {
  return Boolean(message && TRANSIENT_RUNTIME_ERROR.test(message));
}

export async function sendTranslateRequest(
  request: TranslateRequestMessage
): Promise<TranslateResponseMessage> {
  const fallback = { type: "translate-response", translations: [] } as TranslateResponseMessage;
  let response = await sendMessage(request, fallback);
  for (let attempt = 1; attempt <= 2 && isTransientRuntimeError(response.error); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    response = await sendMessage(request, fallback);
  }
  return response;
}

/**
 * Like `sendTranslateRequest`, but splits `texts` into requests bounded by
 * both `BATCH_SEGMENT_LIMIT` and `BATCH_CHAR_LIMIT` (matching page batching)
 * with a bounded concurrency pool, and stitches results back in order.
 */
export async function sendChunkedTranslateRequest(
  request: TranslateRequestMessage
): Promise<TranslateResponseMessage> {
  const totalChars = request.texts.reduce((sum, t) => sum + t.length, 0);
  if (request.texts.length <= BATCH_SEGMENT_LIMIT && totalChars <= BATCH_CHAR_LIMIT) {
    return sendTranslateRequest(request);
  }
  const chunks: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of request.texts) {
    if (
      current.length > 0 &&
      (current.length >= BATCH_SEGMENT_LIMIT || chars + text.length > BATCH_CHAR_LIMIT)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) chunks.push(current);

  const responses: TranslateResponseMessage[] = new Array(chunks.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < chunks.length) {
      const idx = cursor++;
      responses[idx] = await sendTranslateRequest({ ...request, texts: chunks[idx] });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, chunks.length) }, () => worker())
  );

  const failed = responses.find(
    (res, i) => res.error || res.translations.length !== chunks[i].length
  );
  if (failed) {
    return {
      type: "translate-response",
      translations: [],
      error: failed.error || "No translation returned."
    };
  }
  return {
    type: "translate-response",
    translations: responses.flatMap((res) => res.translations),
    detected: responses.find((res) => res.detected)?.detected
  };
}

export function sendDictionaryRequest(
  request: DictionaryRequestMessage
): Promise<DictionaryResponseMessage> {
  return sendMessage(request, {
    type: "dictionary-response",
    entries: []
  } as DictionaryResponseMessage);
}

export function sendWiktionaryRequest(
  request: WiktionaryRequestMessage
): Promise<WiktionaryResponseMessage> {
  return sendMessage(request, {
    type: "wiktionary-response",
    html: ""
  } as WiktionaryResponseMessage);
}

export function sendLabanRequest(request: LabanRequestMessage): Promise<LabanResponseMessage> {
  return sendMessage(request, {
    type: "laban-response",
    html: ""
  } as LabanResponseMessage);
}

export function sendVdictRequest(request: VdictRequestMessage): Promise<VdictResponseMessage> {
  return sendMessage(request, {
    type: "vdict-response",
    html: ""
  } as VdictResponseMessage);
}

export function sendTtsRequest(request: TtsRequestMessage): Promise<TtsResponseMessage> {
  return sendMessage(request, {
    type: "tts-response",
    audio: []
  } as TtsResponseMessage);
}
