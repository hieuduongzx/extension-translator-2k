import {
  type RealtimeResult,
  type RealtimeSttSession,
  RealtimeError,
  SonioxClient,
  SonioxError
} from "@soniox/client";
import {
  renderOverlayOnPage,
  resetOverlayLayoutOnPage,
  type TranslationPayload
} from "./overlay/render";
import { TranscriptBuilder } from "./transcript";
import {
  normalizeStreamTargetLanguage as normalizeTargetLanguage,
  STREAM_AUTO_PAUSE_MODES,
  type StreamAutoPauseMode
} from "./types";
import { storageAccessReady } from "../storageAccess";

// Re-export so existing internal references and the page-world bindings stay intact.
export type { TranslationPayload };

type OverlaySettings = {
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
  autoPause: StreamAutoPauseMode;
};

type RuntimeState = {
  revision: number;
  isActive: boolean;
  isPaused: boolean;
  isStandby: boolean;
  autoPause: StreamAutoPauseMode;
  targetLang: string;
  statusMessage: string;
  fontScale: number;
  opacity: number;
  showSource: boolean;
  showSpeaker: boolean;
  hasApiKey: boolean;
  displayMode: "transcript" | "block";
  autoScroll: boolean;
  error?: string;
};

type ToggleTranslationMessage = {
  type: "TOGGLE_TRANSLATION";
  payload: {
    active: boolean;
    lang: string;
    tabId?: number;
    captureId?: string;
  };
};

type PauseTranslationMessage = {
  type: "PAUSE_TRANSLATION";
  payload?: { captureId?: string };
};

type ResumeTranslationMessage = {
  type: "RESUME_TRANSLATION";
  payload?: { captureId?: string };
};

type GetTranslationStateMessage = {
  type: "GET_TRANSLATION_STATE";
};

type UpdateOverlaySettingsMessage = {
  type: "UPDATE_OVERLAY_SETTINGS";
  payload: Partial<OverlaySettings> & { captureId?: string };
};

type UpdateApiKeyMessage = {
  type: "UPDATE_API_KEY";
  payload: {
    apiKey: string;
  };
};

type ResetOverlayLayoutMessage = {
  type: "RESET_OVERLAY_LAYOUT";
  payload?: { captureId?: string };
};

type OffscreenStartCaptureMessage = {
  type: "OFFSCREEN_START_CAPTURE";
  payload: {
    streamId: string;
    captureId: string;
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
  payload?: { captureId?: string };
};

type OffscreenPauseCaptureMessage = {
  type: "OFFSCREEN_PAUSE_CAPTURE";
  payload: { captureId: string };
};

type OffscreenResumeCaptureMessage = {
  type: "OFFSCREEN_RESUME_CAPTURE";
  payload: { captureId: string };
};

type OffscreenAudioChunkMessage = {
  type: "OFFSCREEN_AUDIO_CHUNK";
  payload: {
    chunk: ArrayBuffer;
    /** Peak sample level (0..1) of the chunk, used for silence detection. */
    peak?: number;
    captureId: string;
  };
};

type OffscreenCaptureErrorMessage = {
  type: "OFFSCREEN_CAPTURE_ERROR";
  payload: {
    error: string;
    captureId?: string;
  };
};

type OffscreenCaptureEndedMessage = {
  type: "OFFSCREEN_CAPTURE_ENDED";
  payload: { captureId: string };
};

type OffscreenRequestMessage =
  | OffscreenStartCaptureMessage
  | OffscreenStopCaptureMessage
  | OffscreenPauseCaptureMessage
  | OffscreenResumeCaptureMessage;
type OffscreenInboundMessage =
  OffscreenAudioChunkMessage | OffscreenCaptureErrorMessage | OffscreenCaptureEndedMessage;
type VisibilityChangedMessage = {
  type: "VISIBILITY_CHANGED";
  payload: { hidden: boolean; captureId?: string };
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

const SONIOX_MODEL = "stt-rt-v6";
/** Chunks are ~100 ms each (see public/pcm-processor.js): ~15 s of audio. */
const MAX_PENDING_AUDIO_CHUNKS = 150;
const AUDIO_CHANNEL_NAME = "stream-translator-audio";
const MIN_FONT_SCALE = 30;
const MAX_FONT_SCALE = 180;
const STREAM_SECRET_KEY = "streamTranslatorSecrets";
const STREAM_OWNER_KEY = "streamTranslatorOwner";
const FINISH_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 15_000;
/** Clear the subtitles after this long without new speech. */
const SUBTITLE_CLEAR_MS = 10_000;
/** At most one overlay injection per this interval; updates in between coalesce. */
const OVERLAY_MIN_INTERVAL_MS = 120;
/** Peak level below this (~-54 dBFS) counts as silence: a paused or muted tab. */
const SILENCE_PEAK_THRESHOLD = 0.002;
/**
 * Soniox bills for the whole time a session is open, so after this much
 * silence the session is closed until sound comes back ("standby").
 */
const STANDBY_AFTER_SILENCE_MS = 8_000;
/** Silent chunks kept while in standby so the first word isn't clipped. */
const STANDBY_PREROLL_CHUNKS = 5;
/** Ignore brief focus blips (e.g. switching between two Chrome windows). */
const UNFOCUS_GRACE_MS = 1_000;

let activeTabId: number | null = null;
let sonioxClient: SonioxClient | null = null;
let sonioxSession: RealtimeSttSession | null = null;
let isTranslating = false;
let sonioxApiKey = "";
let activeCaptureId: string | null = null;
let lifecycleGeneration = 0;
let sessionGeneration = 0;
let lifecycleQueue: Promise<void> = Promise.resolve();
let stateWriteQueue: Promise<void> = Promise.resolve();
let activeAudioFormat: { sampleRate: number; numChannels: number } | null = null;
let persistedActive = false;
let stateRevision = 0;
let offscreenDocumentPromise: Promise<void> | null = null;
let latestTargetLanguage = "vi";
let pendingAudioChunks: ArrayBuffer[] = [];
let sessionConnected = false;
/** Session being finished: its last results still count, its close doesn't. */
let drainingSessionToken: number | null = null;
let isPaused = false;
/** The current pause was started by auto-pause, so auto-resume may end it. */
let isAutoPaused = false;
let pageHidden = false;
let windowUnfocused = false;
let activeWindowId: number | null = null;
let unfocusTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let isStandby = false;
let silentSinceMs: number | null = null;
let standbyPreroll: ArrayBuffer[] = [];
let transcript = new TranscriptBuilder("vi");
/** Status text shown while there is no transcript yet. */
let overlayNotice: Pick<TranslationPayload, "text" | "translatedText" | "status"> | null = null;
/** Whether the overlay should exist on the captured tab. */
let overlayVisible = false;
let overlayDirty = false;
let overlayLoop: Promise<boolean> | null = null;
let lastOverlayRenderAt = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let pauseKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
// A capture failure that arrived while `startCapture` was still running. The
// start aborts on the generation bump and must report it instead of a plain stop.
let pendingCaptureFailure: { captureId: string; error: unknown; prefix: string } | null = null;
let currentStatusMessage = "Open a normal website tab, then start the translator.";
let currentError: string | undefined;
const overlaySettings: OverlaySettings = {
  fontScale: 100,
  opacity: 85,
  showSource: true,
  showSpeaker: false,
  displayMode: "transcript",
  autoScroll: true,
  autoPause: "unfocused"
};
const audioChannel = new BroadcastChannel(AUDIO_CHANNEL_NAME);
const storageReady = storageAccessReady
  .then(() =>
    chrome.storage.local.get([
      "streamTranslatorSettings",
      STREAM_SECRET_KEY,
      "streamTranslatorState"
    ])
  )
  .then(async (stored) => {
    const settings = stored.streamTranslatorSettings as Partial<OverlaySettings> | undefined;
    const legacySettings = stored.streamTranslatorSettings as { apiKey?: unknown } | undefined;
    const secrets = stored[STREAM_SECRET_KEY] as { apiKey?: unknown } | undefined;
    const persistedState = stored.streamTranslatorState as
      | {
          isActive?: unknown;
          targetLang?: unknown;
          statusMessage?: unknown;
          error?: unknown;
          apiKey?: unknown;
          revision?: unknown;
        }
      | undefined;
    persistedActive = persistedState?.isActive === true;
    if (typeof persistedState?.revision === "number") stateRevision = persistedState.revision;
    if (typeof persistedState?.targetLang === "string") {
      latestTargetLanguage = normalizeTargetLanguage(persistedState.targetLang) ?? "vi";
    }
    if (typeof persistedState?.statusMessage === "string") {
      currentStatusMessage = persistedState.statusMessage;
    }
    if (typeof persistedState?.error === "string") currentError = persistedState.error;
    if (typeof settings?.fontScale === "number") {
      overlaySettings.fontScale = clampFontScale(settings.fontScale);
    }
    if (typeof settings?.opacity === "number") {
      overlaySettings.opacity = clampOpacity(settings.opacity);
    }
    if (typeof settings?.showSource === "boolean") {
      overlaySettings.showSource = settings.showSource;
    }
    if (typeof settings?.showSpeaker === "boolean") {
      overlaySettings.showSpeaker = settings.showSpeaker;
    }
    sonioxApiKey =
      typeof secrets?.apiKey === "string"
        ? secrets.apiKey
        : typeof legacySettings?.apiKey === "string"
          ? legacySettings.apiKey
          : "";
    if (typeof settings?.displayMode === "string") {
      overlaySettings.displayMode = settings.displayMode as "transcript" | "block";
    }
    if (typeof settings?.autoScroll === "boolean") {
      overlaySettings.autoScroll = settings.autoScroll;
    }
    if (isAutoPauseMode(settings?.autoPause)) {
      overlaySettings.autoPause = settings.autoPause;
    }
    if (typeof legacySettings?.apiKey === "string") {
      await chrome.storage.local.set({
        [STREAM_SECRET_KEY]: { apiKey: sonioxApiKey },
        streamTranslatorSettings: overlaySettings
      });
    }
    if (persistedState && "apiKey" in persistedState) {
      await syncRuntimeState();
    }
  });

function getRuntimeState(): RuntimeState {
  return {
    revision: stateRevision,
    isActive: isTranslating,
    isPaused,
    isStandby: isTranslating && !isPaused && isStandby,
    autoPause: overlaySettings.autoPause,
    targetLang: latestTargetLanguage,
    statusMessage: currentStatusMessage,
    fontScale: overlaySettings.fontScale,
    opacity: overlaySettings.opacity,
    showSource: overlaySettings.showSource,
    showSpeaker: overlaySettings.showSpeaker,
    hasApiKey: isValidApiKey(sonioxApiKey),
    displayMode: overlaySettings.displayMode,
    autoScroll: overlaySettings.autoScroll,
    error: currentError
  };
}

async function syncRuntimeState() {
  stateRevision++;
  const state = getRuntimeState();
  const settings = { ...overlaySettings };
  const write = stateWriteQueue.then(() =>
    chrome.storage.local.set({
      streamTranslatorState: state,
      streamTranslatorSettings: settings
    })
  );
  stateWriteQueue = write.catch(() => undefined);
  await write;
}

function setStatusMessage(message: string) {
  currentStatusMessage = message;
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
  void ensureStreamReady().catch((error) => {
    console.error("Could not reconcile stream capture state", error);
  });
  audioChannel.onmessage = (event: MessageEvent<OffscreenInboundMessage>) => {
    const message = event.data;

    if (message?.type === "OFFSCREEN_AUDIO_CHUNK") {
      if (message.payload.captureId !== activeCaptureId) return;
      handleOffscreenAudioChunk(message.payload.chunk, message.payload.peak);
      return;
    }

    if (message?.type === "OFFSCREEN_CAPTURE_ERROR") {
      if (message.payload.captureId && message.payload.captureId !== activeCaptureId) return;
      void failCurrentCapture(new Error(message.payload.error), "Tab audio capture failed.");
      return;
    }

    if (message?.type === "OFFSCREEN_CAPTURE_ENDED") {
      if (message.payload.captureId !== activeCaptureId) return;
      void failCurrentCapture(new Error("Tab audio ended."), "Tab audio capture stopped.");
    }
  };

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      !STREAM_MESSAGE_TYPES.has((message as { type?: string }).type ?? "")
    ) {
      return false;
    }
    if (!isAuthorizedStreamSender(message, sender)) return false;

    void (async () => {
      await ensureStreamReady();

      if (message.type === "GET_TRANSLATION_STATE") {
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "UPDATE_OVERLAY_SETTINGS") {
        if (typeof message.payload.fontScale === "number") {
          overlaySettings.fontScale = clampFontScale(message.payload.fontScale);
        }
        if (typeof message.payload.opacity === "number") {
          overlaySettings.opacity = clampOpacity(message.payload.opacity);
        }
        if (typeof message.payload.showSource === "boolean") {
          overlaySettings.showSource = message.payload.showSource;
        }
        if (typeof message.payload.showSpeaker === "boolean") {
          // Speaker labels travel separately from the text, so toggling only
          // changes what the overlay shows.
          overlaySettings.showSpeaker = message.payload.showSpeaker;
        }
        if (
          message.payload.displayMode === "transcript" ||
          message.payload.displayMode === "block"
        ) {
          overlaySettings.displayMode = message.payload.displayMode;
        }
        if (typeof message.payload.autoScroll === "boolean") {
          overlaySettings.autoScroll = message.payload.autoScroll;
        }
        const nextAutoPause: unknown = message.payload.autoPause;
        let autoPauseChanged = false;
        if (isAutoPauseMode(nextAutoPause) && nextAutoPause !== overlaySettings.autoPause) {
          overlaySettings.autoPause = nextAutoPause;
          autoPauseChanged = true;
        }
        await syncRuntimeState();
        if (autoPauseChanged) await enqueueLifecycle(reconcileAutoPause);
        await refreshOverlay();
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "UPDATE_API_KEY") {
        if (isTranslating)
          throw new Error("Stop the translation session before changing the API key.");
        sonioxApiKey = message.payload.apiKey.trim();
        await chrome.storage.local.set({ [STREAM_SECRET_KEY]: { apiKey: sonioxApiKey } });
        currentError = undefined;
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
        await enqueueLifecycle(async () => {
          isAutoPaused = false;
          await pauseCapture();
        });
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "RESUME_TRANSLATION") {
        await enqueueLifecycle(async () => {
          isAutoPaused = false;
          await resumeCapture();
        });
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "VISIBILITY_CHANGED") {
        handlePageVisibilityChange(message.payload.hidden === true);
        sendResponse(getRuntimeState());
        return;
      }

      if (message.type === "TOGGLE_TRANSLATION") {
        if (message.payload.active) {
          await enqueueLifecycle(() => startCapture(message.payload.lang, message.payload.tabId));
        } else {
          lifecycleGeneration++;
          sessionGeneration++;
          sonioxSession?.close();
          await enqueueLifecycle(() => stopCapture());
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

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
      void failCurrentCapture(new Error("Captured tab was closed."), "Live translation stopped.");
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId !== activeTabId || !isTranslating) return;
    if (changeInfo.url && !isInjectableTab(changeInfo.url)) {
      void failCurrentCapture(
        new Error("Captured tab navigated to a restricted page."),
        "Live translation stopped."
      );
      return;
    }
    // Re-inject the overlay after reloads or cross-page navigations so the
    // subtitle box and visibilitychange auto-pause listener are restored.
    if (changeInfo.status === "complete" && overlayVisible) {
      void refreshOverlay();
    }
  });

  // The captured tab was dragged into another window.
  chrome.tabs.onAttached.addListener((tabId, info) => {
    if (tabId !== activeTabId) return;
    activeWindowId = info.newWindowId;
    void chrome.windows
      .getLastFocused()
      .then((win) => handleWindowFocusChange(win.focused ? (win.id ?? -1) : -1))
      .catch(() => undefined);
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    handleWindowFocusChange(windowId);
  });

  if (chrome.tabCapture.onStatusChanged) {
    chrome.tabCapture.onStatusChanged.addListener((info) => {
      if (
        info.tabId === activeTabId &&
        (info.status === "stopped" || info.status === "error") &&
        isTranslating
      ) {
        void failCurrentCapture(
          new Error("Chrome stopped tab capture."),
          "Live translation stopped."
        );
      }
    });
  }
}

function isValidApiKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 10 && trimmed !== "YOUR_SONIOX_API_KEY";
}

function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id && Boolean(sender.url?.startsWith(chrome.runtime.getURL("")))
  );
}

function isActivePageSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id && sender.tab?.id === activeTabId && (sender.frameId ?? 0) === 0
  );
}

function isAuthorizedStreamSender(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (message.type === "GET_TRANSLATION_STATE" || message.type === "UPDATE_API_KEY") {
    return isExtensionPageSender(sender);
  }
  if (message.type === "TOGGLE_TRANSLATION" && message.payload.active) {
    return isExtensionPageSender(sender);
  }
  if (isExtensionPageSender(sender)) return true;
  if (!isActivePageSender(sender)) return false;
  const captureId = (message as { payload?: { captureId?: string } }).payload?.captureId;
  return Boolean(activeCaptureId && captureId === activeCaptureId);
}

function enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = lifecycleQueue.then(operation, operation);
  lifecycleQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

let streamReadyPromise: Promise<void> | null = null;
let errorDismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearErrorDismissTimer() {
  if (errorDismissTimer) {
    clearTimeout(errorDismissTimer);
    errorDismissTimer = null;
  }
}

function ensureStreamReady(): Promise<void> {
  if (!streamReadyPromise) {
    streamReadyPromise = storageReady.then(reconcileOrphanedCapture).catch((err) => {
      streamReadyPromise = null;
      throw err;
    });
  }
  return streamReadyPromise;
}

async function reconcileOrphanedCapture(): Promise<void> {
  const [ownerResult, stateResult, hasOffscreen] = await Promise.all([
    chrome.storage.session.get(STREAM_OWNER_KEY),
    chrome.storage.local.get("streamTranslatorState"),
    hasOffscreenDocument()
  ]);
  const owner = ownerResult[STREAM_OWNER_KEY] as { tabId?: unknown } | undefined;
  const oldState = stateResult.streamTranslatorState as { isActive?: unknown } | undefined;
  if (!hasOffscreen && !owner && oldState?.isActive !== true && !persistedActive) return;

  if (hasOffscreen) {
    await sendOffscreenMessage({ type: "OFFSCREEN_STOP_CAPTURE" }).catch(() => undefined);
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }
  if (typeof owner?.tabId === "number") {
    await chrome.scripting
      .executeScript({
        target: { tabId: owner.tabId },
        func: renderOverlayOnPage,
        args: [null]
      })
      .catch(() => undefined);
  }
  await chrome.storage.session.remove(STREAM_OWNER_KEY);
  currentError = "The previous capture session was cleaned up after the service worker restarted.";
  currentStatusMessage = currentError;
  await syncRuntimeState();
}

function failCurrentCapture(error: unknown, prefix: string): Promise<void> {
  const captureId = activeCaptureId;
  if (!captureId || !isTranslating) return Promise.resolve();
  pendingCaptureFailure = { captureId, error, prefix };
  lifecycleGeneration++;
  return enqueueLifecycle(async () => {
    if (pendingCaptureFailure?.captureId === captureId) pendingCaptureFailure = null;
    if (captureId !== activeCaptureId) return;
    await handleTranslationError(error, prefix);
  });
}

/** Tear down a superseded `startCapture`, surfacing a failure that caused it. */
async function abortStart(): Promise<void> {
  const failure = pendingCaptureFailure;
  pendingCaptureFailure = null;
  if (failure && failure.captureId === activeCaptureId) {
    await handleTranslationError(failure.error, failure.prefix);
  } else {
    await stopCapture();
  }
}

function isInjectableTab(url?: string) {
  return Boolean(url && /^(https?:\/\/)/.test(url));
}

function clampFontScale(value: number) {
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(value)));
}

/** 0 = only the subtitle text is visible; 100 = solid frame. */
function clampOpacity(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 85;
}

function isAutoPauseMode(value: unknown): value is StreamAutoPauseMode {
  return STREAM_AUTO_PAUSE_MODES.includes(value as StreamAutoPauseMode);
}

function buildOverlayPayload(): TranslationPayload {
  const base = {
    isPaused,
    isStandby: isStandby && !isPaused,
    fontScale: overlaySettings.fontScale,
    opacity: overlaySettings.opacity,
    showSource: overlaySettings.showSource,
    showSpeaker: overlaySettings.showSpeaker,
    targetLanguage: latestTargetLanguage,
    captureId: activeCaptureId ?? undefined,
    statusHint: currentStatusMessage,
    displayMode: overlaySettings.displayMode,
    autoScroll: overlaySettings.autoScroll
  };
  if (overlayNotice?.status === "error" || transcript.isEmpty) {
    return {
      ...base,
      history: [],
      text: overlayNotice?.text ?? "",
      translatedText: overlayNotice?.translatedText ?? "",
      status: overlayNotice?.status ?? "success",
      isFinal: false
    };
  }
  const { history, current, isFinal } = transcript.snapshot();
  return {
    ...base,
    history,
    text: current?.text ?? "",
    translatedText: current?.translatedText ?? "",
    speaker: current?.speaker,
    isFinal,
    status: "success"
  };
}

async function renderOverlayNow(): Promise<boolean> {
  const tabId = activeTabId;
  if (tabId === null) return false;
  const payload = overlayVisible ? buildOverlayPayload() : null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: renderOverlayOnPage,
      args: [payload]
    });
    return true;
  } catch (error) {
    console.warn("Failed to render overlay:", error);
    return false;
  }
}

/**
 * Each render re-injects the overlay function into the page, so updates are
 * coalesced: at most one injection is in flight, at most one per
 * OVERLAY_MIN_INTERVAL_MS, and each one draws the latest state. Resolves once
 * the state at call time (or newer) is on the page.
 */
function requestOverlayRender(): Promise<boolean> {
  overlayDirty = true;
  overlayLoop ??= drainOverlayRenders();
  return overlayLoop;
}

async function drainOverlayRenders(): Promise<boolean> {
  let ok = true;
  try {
    while (overlayDirty) {
      const wait = OVERLAY_MIN_INTERVAL_MS - (Date.now() - lastOverlayRenderAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      overlayDirty = false;
      ok = await renderOverlayNow();
      lastOverlayRenderAt = Date.now();
    }
  } finally {
    // Cleared in the same tick as the last `overlayDirty` check, so a request
    // can never slip in between and be dropped.
    overlayLoop = null;
  }
  return ok;
}

/** Show a status notice (used until there is a transcript), or remove the overlay. */
function pushOverlayUpdate(
  notice: Pick<TranslationPayload, "text" | "translatedText" | "status"> | null
): Promise<boolean> {
  overlayVisible = notice !== null;
  overlayNotice = notice;
  return requestOverlayRender();
}

async function refreshOverlay() {
  if (overlayVisible) await requestOverlayRender();
}

function scheduleSubtitleClear() {
  if (clearTimer) clearTimeout(clearTimer);
  const captureId = activeCaptureId;
  clearTimer = setTimeout(() => {
    clearTimer = null;
    if (captureId !== activeCaptureId || isPaused) return;
    transcript.clear();
    overlayNotice = null;
    void requestOverlayRender();
  }, SUBTITLE_CLEAR_MS);
}

async function resetOverlayLayout() {
  if (!activeTabId) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      world: "ISOLATED",
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
async function sendOffscreenMessage(
  message: OffscreenPauseCaptureMessage | OffscreenResumeCaptureMessage
): Promise<{ ok: boolean; error?: string }>;
async function sendOffscreenMessage(message: OffscreenRequestMessage) {
  // Only START may create the offscreen document. Creating one just to tell
  // it to stop leaks an idle document (audio graph included) forever.
  if (message.type !== "OFFSCREEN_START_CAPTURE") {
    if (!(await hasOffscreenDocument())) {
      if (message.type === "OFFSCREEN_STOP_CAPTURE") return { ok: true };
      throw new Error("Offscreen audio capture is no longer available.");
    }
  } else {
    await ensureOffscreenDocument("offscreen.html");
  }
  const response = (await chrome.runtime.sendMessage(message)) as
    OffscreenStartCaptureResponse | { ok?: boolean; error?: string } | undefined;

  if (!response?.ok) {
    throw new Error(response?.error || "Offscreen audio capture failed.");
  }

  return response;
}

async function hasOffscreenDocument(): Promise<boolean> {
  if (!("getContexts" in chrome.runtime)) return false;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof SonioxError) {
    const parts = [error.message];

    if (error.code) {
      parts.push(`code: ${error.code}`);
    }

    // Soniox's stable error identifier lives on the raw server frame.
    const errorType =
      error instanceof RealtimeError
        ? (error.raw as { error_type?: unknown } | null)?.error_type
        : undefined;
    if (typeof errorType === "string" && errorType) {
      parts.push(`type: ${errorType}`);
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

function handleRealtimeResult(result: RealtimeResult) {
  if (!transcript.ingest(result.tokens)) return;
  scheduleSubtitleClear();
  void requestOverlayRender();
}

async function handleTranslationError(error: unknown, prefix = "Live translation failed.") {
  const errorMessage = formatErrorMessage(error, "Unknown error");
  const errorTabId = activeTabId;
  clearErrorDismissTimer();
  console.error(prefix, error);
  currentError = `${prefix} ${errorMessage}`;
  setStatusMessage(currentError);
  await pushOverlayUpdate({
    text: `${prefix} API response/details:`,
    translatedText: errorMessage,
    status: "error"
  });
  await stopCapture(false, true);
  if (errorTabId !== null) {
    errorDismissTimer = setTimeout(() => {
      errorDismissTimer = null;
      if (isTranslating && activeTabId === errorTabId) return;
      void chrome.scripting
        .executeScript({
          target: { tabId: errorTabId },
          world: "ISOLATED",
          func: renderOverlayOnPage,
          args: [null]
        })
        .catch(() => undefined);
    }, 15_000);
  }
}

function flushPendingAudioChunks() {
  if (!sonioxSession || !sessionConnected || isPaused || pendingAudioChunks.length === 0) return;
  const chunks = [...pendingAudioChunks];
  pendingAudioChunks = [];
  for (const chunk of chunks) sonioxSession.sendAudio(chunk);
}

function handleOffscreenAudioChunk(chunk: ArrayBuffer, peak: number | undefined) {
  if (!isTranslating || isPaused) return;
  const silent = typeof peak === "number" && peak < SILENCE_PEAK_THRESHOLD;

  if (isStandby) {
    if (silent) {
      standbyPreroll.push(chunk);
      if (standbyPreroll.length > STANDBY_PREROLL_CHUNKS) standbyPreroll.shift();
    } else {
      wakeFromStandby(chunk);
    }
    return;
  }

  if (!silent) {
    silentSinceMs = null;
  } else {
    silentSinceMs ??= Date.now();
    if (sessionConnected && Date.now() - silentSinceMs >= STANDBY_AFTER_SILENCE_MS) {
      enterStandby(chunk);
      return;
    }
  }

  try {
    if (!sonioxSession || !sessionConnected) {
      pendingAudioChunks.push(chunk);
      if (pendingAudioChunks.length > MAX_PENDING_AUDIO_CHUNKS) pendingAudioChunks.shift();
      return;
    }
    sonioxSession.sendAudio(chunk);
  } catch (error) {
    void failCurrentCapture(error, "Could not send tab audio to Soniox.");
  }
}

/**
 * Finish the live Soniox session. Its remaining results still reach the
 * transcript, but its close is not treated as a failure.
 */
async function drainSonioxSession(): Promise<void> {
  const session = sonioxSession;
  const token = sessionGeneration;
  sonioxSession = null;
  sessionConnected = false;
  sessionGeneration++;
  if (!session) return;
  drainingSessionToken = token;
  try {
    await finishSession(session);
  } finally {
    if (drainingSessionToken === token) drainingSessionToken = null;
  }
  // Everything Soniox had is final now, so the open line is complete.
  transcript.flush();
}

/** Long silence (paused video, muted tab): close the billed session until sound returns. */
function enterStandby(chunk: ArrayBuffer) {
  isStandby = true;
  standbyPreroll = [chunk];
  const captureId = activeCaptureId;
  void enqueueLifecycle(async () => {
    if (!isStandby || isPaused || !isTranslating || captureId !== activeCaptureId) return;
    await drainSonioxSession();
    // Sound may have come back while the session was finishing.
    if (!isStandby) return;
    // Keep the MV3 service worker alive while the Soniox WebSocket is closed:
    // BroadcastChannel audio messages do not extend the 30s idle timer.
    setPauseKeepAlive(true);
    setStatusMessage("Standby: no sound from the tab. Resumes when audio returns.");
    await Promise.all([refreshOverlay(), syncRuntimeState()]);
  });
}

function wakeFromStandby(chunk: ArrayBuffer) {
  isStandby = false;
  silentSinceMs = null;
  setPauseKeepAlive(false);
  pendingAudioChunks = [...standbyPreroll, chunk];
  standbyPreroll = [];
  // Standby was requested but the session is still open: just keep streaming.
  if (sonioxSession && sessionConnected) {
    try {
      flushPendingAudioChunks();
    } catch (error) {
      void failCurrentCapture(error, "Could not flush buffered audio to Soniox.");
    }
    return;
  }
  const captureId = activeCaptureId;
  void enqueueLifecycle(async () => {
    if (isStandby || isPaused || !isTranslating || !captureId || captureId !== activeCaptureId) {
      return;
    }
    if (sonioxSession) {
      try {
        flushPendingAudioChunks();
      } catch (error) {
        await handleTranslationError(error, "Could not flush buffered audio to Soniox.");
      }
      return;
    }
    try {
      if (!(await connectRealtimeSession(lifecycleGeneration, captureId, latestTargetLanguage))) {
        return;
      }
      flushPendingAudioChunks();
      setStatusMessage(`Live translation active for ${latestTargetLanguage.toUpperCase()}.`);
      await Promise.all([refreshOverlay(), syncRuntimeState()]);
    } catch (error) {
      await handleTranslationError(error, "Could not reconnect to Soniox after standby.");
    }
  });
}

function resetAudioActivity() {
  isStandby = false;
  silentSinceMs = null;
  standbyPreroll = [];
}

type AutoPauseReason = "hidden" | "unfocused";

function currentAutoPauseReason(): AutoPauseReason | null {
  const mode = overlaySettings.autoPause;
  if (mode !== "off" && pageHidden) return "hidden";
  if (mode === "unfocused" && windowUnfocused) return "unfocused";
  return null;
}

/** Pause when the tab is hidden / unfocused, resume when it is back (auto pauses only). */
async function reconcileAutoPause() {
  if (!isTranslating) {
    isAutoPaused = false;
    return;
  }
  const reason = currentAutoPauseReason();
  if (reason && !isPaused) {
    isAutoPaused = true;
    await pauseCapture(reason);
  } else if (!reason && isAutoPaused && isPaused) {
    isAutoPaused = false;
    await resumeCapture();
  } else if (!reason) {
    isAutoPaused = false;
  }
}

function handleWindowFocusChange(focusedWindowId: number) {
  if (!isTranslating || activeWindowId === null) return;
  if (unfocusTimer) {
    clearTimeout(unfocusTimer);
    unfocusTimer = null;
  }
  if (focusedWindowId === activeWindowId) {
    if (!windowUnfocused) return;
    windowUnfocused = false;
    void enqueueLifecycle(reconcileAutoPause);
    return;
  }
  // WINDOW_ID_NONE also fires briefly when moving between Chrome windows.
  unfocusTimer = setTimeout(() => {
    unfocusTimer = null;
    if (!isTranslating || windowUnfocused) return;
    windowUnfocused = true;
    void enqueueLifecycle(reconcileAutoPause);
  }, UNFOCUS_GRACE_MS);
}

/** A quick glance at another tab shouldn't tear down and reopen the session. */
function handlePageVisibilityChange(hidden: boolean) {
  if (hiddenTimer) {
    clearTimeout(hiddenTimer);
    hiddenTimer = null;
  }
  if (!hidden) {
    if (!pageHidden) return;
    pageHidden = false;
    void enqueueLifecycle(reconcileAutoPause);
    return;
  }
  hiddenTimer = setTimeout(() => {
    hiddenTimer = null;
    if (!isTranslating || pageHidden) return;
    pageHidden = true;
    void enqueueLifecycle(reconcileAutoPause);
  }, UNFOCUS_GRACE_MS);
}

function resetFocusTracking() {
  if (unfocusTimer) clearTimeout(unfocusTimer);
  unfocusTimer = null;
  if (hiddenTimer) clearTimeout(hiddenTimer);
  hiddenTimer = null;
  pageHidden = false;
  windowUnfocused = false;
  isAutoPaused = false;
}

// While paused, no audio flows and the Soniox socket is closed, so nothing keeps
// the service worker alive. Chrome would evict it after ~30s and the next wake
// tears the paused session down as orphaned. Any extension API call resets the
// idle timer, so ping one until the session resumes or stops.
function setPauseKeepAlive(enabled: boolean) {
  if (pauseKeepAliveTimer) {
    clearInterval(pauseKeepAliveTimer);
    pauseKeepAliveTimer = null;
  }
  if (enabled) {
    pauseKeepAliveTimer = setInterval(() => {
      void chrome.runtime.getPlatformInfo();
    }, 20_000);
  }
}

async function pauseCapture(reason?: AutoPauseReason) {
  if (!isTranslating || isPaused || !activeCaptureId) return;
  const captureId = activeCaptureId;
  isPaused = true;
  resetAudioActivity();
  setPauseKeepAlive(true);
  try {
    await sendOffscreenMessage({
      type: "OFFSCREEN_PAUSE_CAPTURE",
      payload: { captureId }
    });
    pendingAudioChunks = [];
    await drainSonioxSession();
    setStatusMessage(
      reason === "hidden"
        ? "Auto-paused: the tab is hidden. Resumes when you return to it."
        : reason === "unfocused"
          ? "Auto-paused: the window lost focus. Resumes when you return to it."
          : "Translation paused. Audio upload and Soniox session are stopped."
    );
    await Promise.all([refreshOverlay(), syncRuntimeState()]);
  } catch (error) {
    pendingAudioChunks = [];
    await drainSonioxSession().catch(() => undefined);
    setPauseKeepAlive(false);
    await handleTranslationError(error, "Could not pause live translation.");
  }
}

async function resumeCapture() {
  if (!isTranslating || !isPaused || !activeCaptureId || !activeAudioFormat) return;
  resetAudioActivity();
  try {
    const captureId = activeCaptureId;
    if (!(await connectRealtimeSession(lifecycleGeneration, captureId, latestTargetLanguage)))
      return;
    await sendOffscreenMessage({
      type: "OFFSCREEN_RESUME_CAPTURE",
      payload: { captureId }
    });
    isPaused = false;
    setPauseKeepAlive(false);
    setStatusMessage(`Live translation resumed for ${latestTargetLanguage.toUpperCase()}.`);
    flushPendingAudioChunks();
    await Promise.all([refreshOverlay(), syncRuntimeState()]);
  } catch (error) {
    await handleTranslationError(error, "Could not resume live translation.");
  }
}

async function connectRealtimeSession(
  runGeneration: number,
  captureId: string,
  targetLang: string
): Promise<boolean> {
  if (!activeAudioFormat) throw new Error("Audio format metadata is unavailable.");
  // SDK >= 2.4 sends the key in the WebSocket handshake (`soniox-api-key`
  // subprotocol). Soniox refuses keys sent only in the config message from
  // 15 Jan 2027, so don't downgrade below that.
  sonioxClient ??= new SonioxClient({ config: { api_key: sonioxApiKey } });
  // Close any stale session before opening a new one so we never leak a billed socket.
  if (sonioxSession) {
    const previous = sonioxSession;
    sonioxSession = null;
    sessionConnected = false;
    try {
      previous.close();
    } catch {
      /* ignore */
    }
  }
  const token = ++sessionGeneration;
  let cancelled = false;
  const session = sonioxClient.realtime.stt(
    {
      model: SONIOX_MODEL,
      audio_format: "pcm_s16le",
      sample_rate: activeAudioFormat.sampleRate,
      num_channels: activeAudioFormat.numChannels,
      enable_endpoint_detection: true,
      enable_speaker_diarization: true,
      // Lets the transcript tell speech already in the target language (no
      // translation tokens will follow) from speech still being translated.
      enable_language_identification: true,
      translation: { type: "one_way", target_language: targetLang }
    },
    { api_key: sonioxApiKey }
  );
  sonioxSession = session;
  const isCurrentSession = () =>
    !cancelled &&
    token === sessionGeneration &&
    runGeneration === lifecycleGeneration &&
    captureId === activeCaptureId &&
    isTranslating;
  // A session being finished (pause / standby) still delivers its last tokens.
  const acceptsResults = () =>
    isCurrentSession() ||
    (token === drainingSessionToken && captureId === activeCaptureId && isTranslating);

  session.on("connected", () => {
    if (!isCurrentSession()) return;
    sessionConnected = true;
    try {
      flushPendingAudioChunks();
    } catch (error) {
      void failCurrentCapture(error, "Could not flush buffered audio to Soniox.");
      return;
    }
    void pushOverlayUpdate({
      text: "Tab audio is now streaming to Soniox.",
      translatedText: `Connected. Waiting for ${targetLang.toUpperCase()} transcription/translation results...`,
      status: "success"
    });
  });
  session.on("result", (result) => {
    if (acceptsResults()) handleRealtimeResult(result);
  });
  // `<end>` (speaker paused) and `<fin>` (finalize done) close the utterance.
  session.on("endpoint", () => {
    if (acceptsResults()) transcript.markEndpoint();
  });
  session.on("finalized", () => {
    if (acceptsResults()) transcript.markEndpoint();
  });
  session.on("error", (error) => {
    if (isCurrentSession()) void failCurrentCapture(error, "Soniox API returned an error.");
  });
  session.on("disconnected", (reason) => {
    if (isCurrentSession()) {
      void failCurrentCapture(
        new Error(reason || "WebSocket disconnected unexpectedly."),
        "Soniox connection was closed."
      );
    }
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      session.connect(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Soniox connection timed out")),
          CONNECT_TIMEOUT_MS
        );
      })
    ]);
  } catch (error) {
    cancelled = true;
    session.close();
    if (sonioxSession === session) sonioxSession = null;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!isCurrentSession()) {
    cancelled = true;
    session.close();
    if (sonioxSession === session) sonioxSession = null;
    return false;
  }
  return true;
}

async function startCapture(requestedTargetLang: string, requestedTabId?: number) {
  if (isTranslating) return;
  clearErrorDismissTimer();
  const runGeneration = ++lifecycleGeneration;
  const targetLang = normalizeTargetLanguage(requestedTargetLang);

  try {
    if (!targetLang) throw new Error("Unsupported Soniox target language.");
    await storageReady;
    if (!isValidApiKey(sonioxApiKey)) {
      currentError = "No valid Soniox API key.";
      setStatusMessage(currentError);
      await syncRuntimeState();
      return;
    }

    const tab =
      typeof requestedTabId === "number"
        ? await chrome.tabs.get(requestedTabId)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab?.id === undefined || !isInjectableTab(tab.url)) {
      throw new Error(
        "Overlay only works on normal http/https pages. Open a website tab and try again."
      );
    }

    activeTabId = tab.id;
    activeWindowId = tab.windowId;
    activeCaptureId = crypto.randomUUID();
    isTranslating = true;
    isPaused = false;
    resetFocusTracking();
    resetAudioActivity();
    latestTargetLanguage = targetLang;
    currentError = undefined;
    pendingAudioChunks = [];
    sessionConnected = false;
    transcript = new TranscriptBuilder(targetLang);
    if (clearTimer) clearTimeout(clearTimer);
    await chrome.storage.session.set({
      [STREAM_OWNER_KEY]: { captureId: activeCaptureId, tabId: activeTabId }
    });
    await syncRuntimeState();

    const bootstrapped = await pushOverlayUpdate({
      text: "Extension is listening to the current tab audio.",
      translatedText: `Preparing Soniox translation to ${targetLang.toUpperCase()}...`,
      status: "info"
    });
    if (!bootstrapped) throw new Error("Could not create the subtitle overlay on this page.");
    if (runGeneration !== lifecycleGeneration) {
      await abortStart();
      return;
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: activeTabId });
    if (!streamId) throw new Error("Failed to get tab capture stream ID.");
    if (runGeneration !== lifecycleGeneration || !activeCaptureId) {
      await abortStart();
      return;
    }

    const captureId = activeCaptureId;
    const captureResponse = await sendOffscreenMessage({
      type: "OFFSCREEN_START_CAPTURE",
      payload: { streamId, captureId }
    });
    if (!captureResponse.sampleRate || !captureResponse.numChannels) {
      throw new Error("Tab capture started but did not report audio format metadata.");
    }
    activeAudioFormat = {
      sampleRate: captureResponse.sampleRate,
      numChannels: captureResponse.numChannels
    };
    if (runGeneration !== lifecycleGeneration || captureId !== activeCaptureId) {
      await abortStart();
      return;
    }

    if (!(await connectRealtimeSession(runGeneration, captureId, targetLang))) {
      await abortStart();
      return;
    }
    setStatusMessage(`Live translation active for ${targetLang.toUpperCase()}.`);
    await pushOverlayUpdate({
      text: "Audio capture started successfully.",
      translatedText: `Streaming tab audio. Waiting for Soniox to return ${targetLang.toUpperCase()} output...`,
      status: "success"
    });
    await syncRuntimeState();
  } catch (error) {
    if (runGeneration !== lifecycleGeneration) {
      await abortStart();
      return;
    }
    await handleTranslationError(error, "Could not start live translation.");
  }
}

async function finishSession(session: RealtimeSttSession): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      session.finish(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Soniox finish timed out")), FINISH_TIMEOUT_MS);
      })
    ]);
  } catch {
    session.close();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function stopCapture(clearOverlay = true, preserveError = false) {
  const captureId = activeCaptureId;
  const overlayTabId = activeTabId;
  isTranslating = false;
  isPaused = false;
  setPauseKeepAlive(false);
  resetFocusTracking();
  resetAudioActivity();
  sessionConnected = false;
  sessionGeneration++;
  drainingSessionToken = null;
  pendingAudioChunks = [];
  transcript.clear();
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  if (!preserveError) {
    currentError = undefined;
    setStatusMessage("Translator stopped.");
  }

  await sendOffscreenMessage({
    type: "OFFSCREEN_STOP_CAPTURE",
    payload: { captureId: captureId ?? undefined }
  }).catch(() => undefined);
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }

  if (sonioxSession) {
    const session = sonioxSession;
    sonioxSession = null;
    await finishSession(session);
  }
  sonioxClient = null;
  activeAudioFormat = null;

  if (clearOverlay && overlayTabId !== null) {
    await pushOverlayUpdate(null);
  }
  overlayVisible = false;
  overlayNotice = null;
  activeCaptureId = null;
  activeTabId = null;
  activeWindowId = null;
  await chrome.storage.session.remove(STREAM_OWNER_KEY);
  await syncRuntimeState();
}
