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

const CONTEXT_INVALIDATED = "Tiện ích vừa được tải lại. Vui lòng làm mới trang này.";

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
export function sendMessage<TResponse>(
  request: unknown,
  fallback: TResponse
): Promise<TResponse> {
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

export function sendTranslateRequest(
  request: TranslateRequestMessage
): Promise<TranslateResponseMessage> {
  return sendMessage(request, {
    type: "translate-response",
    translations: []
  } as TranslateResponseMessage);
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

export function sendLabanRequest(
  request: LabanRequestMessage
): Promise<LabanResponseMessage> {
  return sendMessage(request, {
    type: "laban-response",
    html: ""
  } as LabanResponseMessage);
}

export function sendVdictRequest(
  request: VdictRequestMessage
): Promise<VdictResponseMessage> {
  return sendMessage(request, {
    type: "vdict-response",
    html: ""
  } as VdictResponseMessage);
}

export function sendTtsRequest(
  request: TtsRequestMessage
): Promise<TtsResponseMessage> {
  return sendMessage(request, {
    type: "tts-response",
    audio: []
  } as TtsResponseMessage);
}
