import {
  type RealtimeResult,
  type RealtimeSttSession,
  SonioxClient,
  SonioxError,
  segmentRealtimeTokens
} from "@soniox/client";
import {
  renderOverlayOnPage,
  resetOverlayLayoutOnPage,
  type TranslationPayload
} from "./overlay/render";

// Re-export so existing internal references and the page-world bindings stay intact.
export type { TranslationPayload };

type OverlaySettings = {
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  apiKey: string;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
};

type RuntimeState = {
  isActive: boolean;
  isPaused: boolean;
  targetLang: string;
  statusMessage: string;
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  apiKey: string;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
};

type ToggleTranslationMessage = {
  type: "TOGGLE_TRANSLATION";
  payload: {
    active: boolean;
    lang: string;
  };
};

type PauseTranslationMessage = {
  type: "PAUSE_TRANSLATION";
};

type ResumeTranslationMessage = {
  type: "RESUME_TRANSLATION";
};

type GetTranslationStateMessage = {
  type: "GET_TRANSLATION_STATE";
};

type UpdateOverlaySettingsMessage = {
  type: "UPDATE_OVERLAY_SETTINGS";
  payload: Partial<OverlaySettings>;
};

type UpdateApiKeyMessage = {
  type: "UPDATE_API_KEY";
  payload: {
    apiKey: string;
  };
};

type ResetOverlayLayoutMessage = {
  type: "RESET_OVERLAY_LAYOUT";
};

type OffscreenStartCaptureMessage = {
  type: "OFFSCREEN_START_CAPTURE";
  payload: {
    streamId: string;
  };
};

type OffscreenStartCaptureResponse = {
  ok: boolean;
  error?: string;
  sampleRate?: number;
  numChannels?: number;
};

type OffscreenStopCaptureMessage = {
  type: "OFFSCREEN_STOP_CAPTURE";
};

type OffscreenAudioChunkMessage = {
  type: "OFFSCREEN_AUDIO_CHUNK";
  payload: {
    chunk: ArrayBuffer;
  };
};

type OffscreenCaptureErrorMessage = {
  type: "OFFSCREEN_CAPTURE_ERROR";
  payload: {
    error: string;
  };
};

type OffscreenRequestMessage = OffscreenStartCaptureMessage | OffscreenStopCaptureMessage;
type OffscreenInboundMessage = OffscreenAudioChunkMessage | OffscreenCaptureErrorMessage;
type VisibilityChangedMessage = {
  type: "VISIBILITY_CHANGED";
  payload: { hidden: boolean };
};

type RuntimeMessage =
  | ToggleTranslationMessage
  | PauseTranslationMessage
  | ResumeTranslationMessage
  | GetTranslationStateMessage
  | UpdateOverlaySettingsMessage
  | UpdateApiKeyMessage
  | ResetOverlayLayoutMessage
  | VisibilityChangedMessage;

const SONIOX_MODEL = "stt-rt-v4";
const MAX_PENDING_AUDIO_CHUNKS = 120;
const AUDIO_CHANNEL_NAME = "stream-translator-audio";
const MIN_FONT_SCALE = 30;
const MAX_FONT_SCALE = 180;
const MAX_SUBTITLE_HISTORY = 50;

let activeTabId: number | null = null;
let sonioxClient: SonioxClient | null = null;
let sonioxSession: RealtimeSttSession | null = null;
let isTranslating = false;
let offscreenDocumentPromise: Promise<void> | null = null;
let latestTargetLanguage = "vi";
let pendingAudioChunks: ArrayBuffer[] = [];
let sessionConnected = false;
let isPaused = false;
let isAutoPausedVisibility = false;
let lastSourceText = "";
let lastTranslatedText = "";
let subtitleHistory: { text: string; translatedText: string }[] = [];
let pendingHistoryItem: { text: string; translatedText: string } | null = null;
let speakerLabels = new Map<string, string>();
let nextSpeakerLabel = 1;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let currentStatusMessage = "Open a normal website tab, then start the translator.";
let currentOverlayPayload: TranslationPayload | null = null;
const overlaySettings: OverlaySettings = {
  fontScale: 100,
  opacity: 85,
  showSource: true,
  showSpeaker: false,
  apiKey: "",
  displayMode: "transcript",
  autoScroll: true
};
const audioChannel = new BroadcastChannel(AUDIO_CHANNEL_NAME);
const storageReady = chrome.storage.local.get(["streamTranslatorSettings"]).then((stored) => {
  const settings = stored.streamTranslatorSettings as Partial<OverlaySettings> | undefined;
  if (typeof settings?.fontScale === "number") {
    overlaySettings.fontScale = clampFontScale(settings.fontScale);
  }
  if (typeof settings?.opacity === "number") {
    overlaySettings.opacity = Math.min(100, Math.max(10, Math.round(settings.opacity)));
  }
  if (typeof settings?.showSource === "boolean") {
    overlaySettings.showSource = settings.showSource;
  }
  if (typeof settings?.showSpeaker === "boolean") {
    overlaySettings.showSpeaker = settings.showSpeaker;
  }
  if (typeof settings?.apiKey === "string") {
    overlaySettings.apiKey = settings.apiKey;
  }
  if (typeof settings?.displayMode === "string") {
    overlaySettings.displayMode = settings.displayMode as "transcript" | "block";
  }
  if (typeof settings?.autoScroll === "boolean") {
    overlaySettings.autoScroll = settings.autoScroll;
  }
});

function getRuntimeState(): RuntimeState {
  return {
    isActive: isTranslating,
    isPaused,
    targetLang: latestTargetLanguage,
    statusMessage: currentStatusMessage,
    fontScale: overlaySettings.fontScale,
    opacity: overlaySettings.opacity,
    showSource: overlaySettings.showSource,
    showSpeaker: overlaySettings.showSpeaker,
    apiKey: overlaySettings.apiKey,
    displayMode: overlaySettings.displayMode,
    autoScroll: overlaySettings.autoScroll
  };
}

async function syncRuntimeState() {
  await chrome.storage.local.set({
    streamTranslatorState: getRuntimeState(),
    streamTranslatorSettings: overlaySettings
  });
}

function setStatusMessage(message: string) {
  currentStatusMessage = message;
  void syncRuntimeState();
}

/**
 * Message types this module is responsible for. The shared background worker
 * forwards every runtime message to all listeners, so we must ignore anything
 * that isn't ours (otherwise we'd keep the response channel open and starve
 * the web-translation handlers).
 */
const STREAM_MESSAGE_TYPES = new Set([
  "GET_TRANSLATION_STATE",
  "UPDATE_OVERLAY_SETTINGS",
  "UPDATE_API_KEY",
  "RESET_OVERLAY_LAYOUT",
  "PAUSE_TRANSLATION",
  "RESUME_TRANSLATION",
  "VISIBILITY_CHANGED",
  "TOGGLE_TRANSLATION"
]);

/**
 * Wire up the Soniox stream-translator side of the background worker. Called
 * once from the shared `background.ts` entry point. All module-level state and
 * the audio BroadcastChannel are created on import; this only registers the
 * event listeners so registration order stays explicit.
 */
export function initStreamTranslator() {
  audioChannel.onmessage = (event: MessageEvent<OffscreenInboundMessage>) => {
    const message = event.data;

    if (message?.type === "OFFSCREEN_AUDIO_CHUNK") {
      handleOffscreenAudioChunk(message.payload.chunk);
      return;
    }

    if (message?.type === "OFFSCREEN_CAPTURE_ERROR") {
      void handleTranslationError(new Error(message.payload.error), "Tab audio capture failed.");
    }
  };

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      !STREAM_MESSAGE_TYPES.has((message as { type?: string }).type ?? "")
    ) {
      return false;
    }

    void (async () => {
      await storageReady;

      if (message.type === "GET_TRANSLATION_STATE") {
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "UPDATE_OVERLAY_SETTINGS") {
        if (typeof message.payload.fontScale === "number") {
          overlaySettings.fontScale = clampFontScale(message.payload.fontScale);
        }
        if (typeof message.payload.opacity === "number") {
          overlaySettings.opacity = Math.min(
            100,
            Math.max(10, Math.round(message.payload.opacity))
          );
        }
        if (typeof message.payload.showSource === "boolean") {
          overlaySettings.showSource = message.payload.showSource;
        }
        if (typeof message.payload.showSpeaker === "boolean") {
          overlaySettings.showSpeaker = message.payload.showSpeaker;
          if (message.payload.showSpeaker) {
            overlaySettings.displayMode = "block";
          } else {
            lastSourceText = stripSpeakerLabels(lastSourceText);
            lastTranslatedText = stripSpeakerLabels(lastTranslatedText);
            subtitleHistory = subtitleHistory.map((item) => ({
              text: stripSpeakerLabels(item.text),
              translatedText: stripSpeakerLabels(item.translatedText)
            }));
            pendingHistoryItem = pendingHistoryItem
              ? {
                  text: stripSpeakerLabels(pendingHistoryItem.text),
                  translatedText: stripSpeakerLabels(pendingHistoryItem.translatedText)
                }
              : null;
            currentOverlayPayload = currentOverlayPayload
              ? {
                  ...currentOverlayPayload,
                  text: stripSpeakerLabels(currentOverlayPayload.text),
                  translatedText: stripSpeakerLabels(currentOverlayPayload.translatedText),
                  history: (currentOverlayPayload.history || []).map((item) => ({
                    text: stripSpeakerLabels(item.text),
                    translatedText: stripSpeakerLabels(item.translatedText)
                  }))
                }
              : null;
          }
        }
        if (typeof message.payload.displayMode === "string") {
          overlaySettings.displayMode = message.payload.displayMode as "transcript" | "block";
        }
        if (typeof message.payload.autoScroll === "boolean") {
          overlaySettings.autoScroll = message.payload.autoScroll;
        }

        await syncRuntimeState();
        await refreshOverlay();
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "UPDATE_API_KEY") {
        overlaySettings.apiKey = message.payload.apiKey.trim();
        await syncRuntimeState();
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "RESET_OVERLAY_LAYOUT") {
        await resetOverlayLayout();
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "PAUSE_TRANSLATION") {
        isAutoPausedVisibility = false;
        await pauseCapture();
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "RESUME_TRANSLATION") {
        isAutoPausedVisibility = false;
        await resumeCapture();
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "VISIBILITY_CHANGED") {
        if (message.payload.hidden) {
          if (isTranslating && !isPaused) {
            isAutoPausedVisibility = true;
            await pauseCapture();
          }
        } else {
          if (isAutoPausedVisibility && isPaused) {
            isAutoPausedVisibility = false;
            await resumeCapture();
          } else {
            isAutoPausedVisibility = false;
          }
        }
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "TOGGLE_TRANSLATION") {
        if (message.payload.active) {
          await startCapture(message.payload.lang);
        } else {
          await stopCapture();
        }

        sendResponse(getRuntimeState());
      }
    })().catch((error) => {
      sendResponse({
        ...getRuntimeState(),
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return true;
  });
}

function isInjectableTab(url?: string) {
  return Boolean(url && /^(https?:\/\/)/.test(url));
}

function clampFontScale(value: number) {
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(value)));
}

async function pushOverlayUpdate(payload: TranslationPayload | null) {
  if (!activeTabId) return false;

  currentOverlayPayload = payload;
  const overlayPayload = payload
    ? {
        history: subtitleHistory,
        ...payload,
        isPaused,
        fontScale: overlaySettings.fontScale,
        opacity: overlaySettings.opacity,
        showSource: overlaySettings.showSource,
        showSpeaker: overlaySettings.showSpeaker,
        targetLanguage: latestTargetLanguage,
        statusHint: currentStatusMessage,
        displayMode: overlaySettings.displayMode,
        autoScroll: overlaySettings.autoScroll
      }
    : null;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: renderOverlayOnPage,
      args: [overlayPayload]
    });
    return true;
  } catch (error) {
    console.warn("Failed to render overlay:", error);
    return false;
  }
}

async function refreshOverlay() {
  if (!currentOverlayPayload) {
    return;
  }

  await pushOverlayUpdate(currentOverlayPayload);
}

async function resetOverlayLayout() {
  if (!activeTabId) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: resetOverlayLayoutOnPage
    });
  } catch (error) {
    console.warn("Failed to reset overlay layout:", error);
  }
}

async function ensureOffscreenDocument(path: string) {
  const offscreenUrl = chrome.runtime.getURL(path);

  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });

    if (contexts.length > 0) {
      return;
    }
  }

  if (!offscreenDocumentPromise) {
    offscreenDocumentPromise = chrome.offscreen.createDocument({
      url: path,
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Capture tab audio for live transcription and keep tab audio audible."
    });
  }

  try {
    await offscreenDocumentPromise;
  } finally {
    offscreenDocumentPromise = null;
  }
}

async function sendOffscreenMessage(
  message: OffscreenStartCaptureMessage
): Promise<OffscreenStartCaptureResponse>;
async function sendOffscreenMessage(
  message: OffscreenStopCaptureMessage
): Promise<{ ok: boolean; error?: string }>;
async function sendOffscreenMessage(message: OffscreenRequestMessage) {
  await ensureOffscreenDocument("offscreen.html");
  const response = (await chrome.runtime.sendMessage(message)) as
    OffscreenStartCaptureResponse | { ok?: boolean; error?: string } | undefined;

  if (!response?.ok) {
    throw new Error(response?.error || "Offscreen audio capture failed.");
  }

  return response;
}

function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof SonioxError) {
    const parts = [error.message];

    if (error.code) {
      parts.push(`code: ${error.code}`);
    }

    if (typeof error.statusCode === "number") {
      parts.push(`status: ${error.statusCode}`);
    }

    return parts.join(" | ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

function resetSpeakerLabels() {
  speakerLabels = new Map<string, string>();
  nextSpeakerLabel = 1;
}

function stripSpeakerLabels(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\[Speaker \d+\]\s*/u, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getSpeakerLabel(speakerId: string) {
  const existingLabel = speakerLabels.get(speakerId);
  if (existingLabel) {
    return existingLabel;
  }

  const nextLabel = `Speaker ${nextSpeakerLabel}`;
  speakerLabels.set(speakerId, nextLabel);
  nextSpeakerLabel += 1;
  return nextLabel;
}

function formatRealtimeTokens(tokens: RealtimeResult["tokens"], showSpeakerLabels: boolean) {
  if (!showSpeakerLabels) {
    return tokens
      .map((token) => token.text)
      .join("")
      .trim();
  }

  const segments = segmentRealtimeTokens(tokens);

  return segments
    .map((segment) => {
      const text = segment.text.trim();
      if (!text) {
        return "";
      }

      if (!segment.speaker) {
        return text;
      }

      return `[${getSpeakerLabel(segment.speaker)}] ${text}`;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function summarizeRealtimeResult(result: RealtimeResult) {
  const originalTokens = result.tokens.filter(
    (token) => token.translation_status !== "translation"
  );
  const translatedTokens = result.tokens.filter(
    (token) => token.translation_status === "translation"
  );

  return {
    sourceText: formatRealtimeTokens(originalTokens, overlaySettings.showSpeaker),
    translatedText: formatRealtimeTokens(translatedTokens, overlaySettings.showSpeaker),
    hasFinalToken: result.tokens.some((token) => token.is_final)
  };
}

async function handleRealtimeResult(result: RealtimeResult) {
  const { sourceText, translatedText, hasFinalToken } = summarizeRealtimeResult(result);

  if (!sourceText && !translatedText) {
    return;
  }

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    subtitleHistory = [];
    pendingHistoryItem = null;
    lastSourceText = "";
    lastTranslatedText = "";
    void pushOverlayUpdate({ text: "", translatedText: "", isFinal: false, status: "success" });
  }, 10000);

  if (pendingHistoryItem && sourceText) {
    subtitleHistory.push(pendingHistoryItem);
    // Cap retained history so long sessions don't grow the array / overlay DOM
    // without bound (speech every <10s keeps the clear timer from firing).
    if (subtitleHistory.length > MAX_SUBTITLE_HISTORY) {
      subtitleHistory = subtitleHistory.slice(-MAX_SUBTITLE_HISTORY);
    }
    pendingHistoryItem = null;

    lastSourceText = "";
    lastTranslatedText = "";
  }

  if (sourceText) {
    lastSourceText = sourceText;
  }

  if (translatedText) {
    // Prevent fallback to untranslated text if we already had a valid translation
    if (translatedText === sourceText && lastTranslatedText && lastTranslatedText !== sourceText) {
      // Keep lastTranslatedText
    } else {
      lastTranslatedText = translatedText;
    }
  }

  const displaySourceText = sourceText || lastSourceText;
  const displayTranslatedText = translatedText || lastTranslatedText;

  if (!displaySourceText && !displayTranslatedText) {
    return;
  }

  if (hasFinalToken) {
    pendingHistoryItem = {
      text: displaySourceText,
      translatedText: displayTranslatedText || displaySourceText
    };
  }

  await pushOverlayUpdate({
    text: displaySourceText,
    translatedText: displayTranslatedText,
    isFinal: hasFinalToken,
    status: translatedText ? "success" : lastTranslatedText ? "success" : "info"
  });
}

async function handleTranslationError(error: unknown, prefix = "Live translation failed.") {
  const errorMessage = formatErrorMessage(error, "Unknown error");

  console.error(prefix, error);
  setStatusMessage(`${prefix} ${errorMessage}`);

  await pushOverlayUpdate({
    text: `${prefix} API response/details:`,
    translatedText: errorMessage,
    status: "error"
  });

  await stopCapture(false);
}

function flushPendingAudioChunks() {
  if (!sonioxSession || !sessionConnected || isPaused || pendingAudioChunks.length === 0) {
    return;
  }

  const chunks = [...pendingAudioChunks];
  pendingAudioChunks = [];

  for (const chunk of chunks) {
    sonioxSession.sendAudio(chunk);
  }
}

function handleOffscreenAudioChunk(chunk: ArrayBuffer) {
  if (!isTranslating || isPaused) {
    return;
  }

  try {
    if (!sonioxSession || !sessionConnected) {
      pendingAudioChunks.push(chunk);
      if (pendingAudioChunks.length > MAX_PENDING_AUDIO_CHUNKS) {
        pendingAudioChunks.shift();
      }
      return;
    }

    sonioxSession.sendAudio(chunk);
  } catch (error) {
    void handleTranslationError(error, "Could not send tab audio to Soniox.");
  }
}

async function pauseCapture() {
  if (!isTranslating || isPaused) {
    return;
  }

  sonioxSession?.pause();
  isPaused = true;
  setStatusMessage("Translation paused. Click Continue to resume live subtitles.");
  await refreshOverlay();
}

async function resumeCapture() {
  if (!isTranslating || !isPaused) {
    return;
  }

  sonioxSession?.resume();
  isPaused = false;
  setStatusMessage(`Live translation resumed for ${latestTargetLanguage.toUpperCase()}.`);
  flushPendingAudioChunks();
  await refreshOverlay();
}

async function startCapture(targetLang: string) {
  if (isTranslating) return;

  try {
    await storageReady;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    activeTabId = tab.id;
    isTranslating = true;
    isPaused = false;
    latestTargetLanguage = targetLang;
    pendingAudioChunks = [];
    sessionConnected = false;
    lastSourceText = "";
    lastTranslatedText = "";
    subtitleHistory = [];
    pendingHistoryItem = null;
    resetSpeakerLabels();
    if (clearTimer) clearTimeout(clearTimer);

    if (!isInjectableTab(tab.url)) {
      throw new Error(
        "Overlay only works on normal http/https pages. Open a website tab and try again."
      );
    }

    await resetOverlayLayout();

    const bootstrapped = await pushOverlayUpdate({
      text: "Extension is listening to the current tab audio.",
      translatedText: `Preparing Soniox translation to ${targetLang.toUpperCase()}...`,
      status: "info"
    });

    if (!bootstrapped) {
      throw new Error("Could not create the subtitle overlay on this page.");
    }

    if (!overlaySettings.apiKey || overlaySettings.apiKey === "YOUR_SONIOX_API_KEY") {
      await pushOverlayUpdate({
        text: "No Soniox API key configured yet.",
        translatedText: `Demo mode active. Subtitle output for ${targetLang.toUpperCase()} will appear here.`,
        status: "warning"
      });
      return;
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: activeTabId
    });

    if (!streamId) {
      throw new Error("Failed to get tab capture stream ID.");
    }

    sonioxClient = new SonioxClient({
      api_key: overlaySettings.apiKey
    });

    const captureResponse = await sendOffscreenMessage({
      type: "OFFSCREEN_START_CAPTURE",
      payload: { streamId }
    });

    if (!captureResponse.sampleRate || !captureResponse.numChannels) {
      throw new Error("Tab capture started but did not report audio format metadata.");
    }

    sonioxSession = sonioxClient.realtime.stt(
      {
        model: SONIOX_MODEL,
        audio_format: "pcm_s16le",
        sample_rate: captureResponse.sampleRate,
        num_channels: captureResponse.numChannels,
        enable_endpoint_detection: true,
        enable_speaker_diarization: true,
        translation: {
          type: "one_way",
          target_language: targetLang
        }
      },
      {
        api_key: overlaySettings.apiKey
      }
    );

    sonioxSession.on("connected", () => {
      sessionConnected = true;
      try {
        flushPendingAudioChunks();
      } catch (error) {
        void handleTranslationError(error, "Could not flush buffered audio to Soniox.");
        return;
      }

      void pushOverlayUpdate({
        text: "Tab audio is now streaming to Soniox.",
        translatedText: `Connected. Waiting for ${targetLang.toUpperCase()} transcription/translation results...`,
        status: "success"
      });
    });

    sonioxSession.on("result", (result) => {
      void handleRealtimeResult(result);
    });

    sonioxSession.on("error", (error) => {
      void handleTranslationError(error, "Soniox API returned an error.");
    });

    sonioxSession.on("disconnected", (reason) => {
      if (!isTranslating) {
        return;
      }

      void handleTranslationError(
        new Error(reason || "WebSocket disconnected unexpectedly."),
        "Soniox connection was closed."
      );
    });

    await sonioxSession.connect();

    await pushOverlayUpdate({
      text: "Audio capture started successfully.",
      translatedText: `Streaming tab audio. Waiting for Soniox to return ${targetLang.toUpperCase()} output...`,
      status: "success"
    });
    await syncRuntimeState();
  } catch (error) {
    await handleTranslationError(error, "Could not start live translation.");
  }
}

async function stopCapture(clearOverlay = true) {
  isTranslating = false;
  isPaused = false;
  sessionConnected = false;
  pendingAudioChunks = [];
  lastSourceText = "";
  lastTranslatedText = "";
  subtitleHistory = [];
  pendingHistoryItem = null;
  resetSpeakerLabels();
  if (clearTimer) clearTimeout(clearTimer);
  setStatusMessage("Translator stopped.");

  await sendOffscreenMessage({ type: "OFFSCREEN_STOP_CAPTURE" }).catch(() => undefined);

  if (sonioxSession) {
    const session = sonioxSession;
    sonioxSession = null;
    await session.finish().catch(() => session.close());
  }

  sonioxClient = null;

  if (clearOverlay) {
    currentOverlayPayload = null;
    await pushOverlayUpdate(null);
  }

  await syncRuntimeState();

  console.log("Stopped tab capture");
}
