import { TranslationEngine } from "./engine";
import { dismissSelectionPopup, showSelectionPopup } from "./selectionPopup";
import { dismissDictionaryPopup, showDictionaryPopup } from "./dictionaryPopup";
import { installSelectionTrigger, uninstallSelectionTrigger } from "./selectionTrigger";
import { ensureStyles } from "./styles";
import { normalizeSelection } from "./selectionText";
import { loadSettings, updateSettings, watchSettings } from "../storage";
import { customProviderId, BUILTIN_PROVIDER_LABELS, DEFAULT_SETTINGS } from "../types";
import type {
  ApplySettingsMessage,
  BuiltinProviderId,
  ProviderId,
  RuntimeMessage,
  Settings,
  TranslateSelectionMessage
} from "../types";

let engine: TranslationEngine | null = null;
let lastError: { message: string; node?: HTMLElement } | null = null;
let lastStatus = { active: false, count: 0, pending: 0 };
let lastContextMenuPoint: { x: number; y: number } | null = null;
let lastContextMenuSelection: string = "";
let cachedSettings: Settings | null = null;
let tabId: number | null = null;

async function getSettings(): Promise<Settings> {
  if (!cachedSettings) {
    try {
      cachedSettings = await loadSettings();
    } catch {
      // In the MAIN world `chrome.storage` can be unavailable or throw before
      // the extension context is fully wired. Fall back to defaults so callers
      // (e.g. the selection trigger) keep working instead of silently dying.
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  }
  return cachedSettings;
}

async function markTabActive(): Promise<void> {
  if (!chrome.storage?.session) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: "get-tab-id" });
    if (res?.tabId != null) tabId = res.tabId as number;
    if (tabId != null) await chrome.storage.session.set({ [`wt-active-tab:${tabId}`]: true });
  } catch {
    /* extension context invalidated */
  }
}

async function markTabInactive(): Promise<void> {
  if (tabId == null || !chrome.storage?.session) return;
  try {
    await chrome.storage.session.remove(`wt-active-tab:${tabId}`);
  } catch {
    /* */
  }
}

async function checkTabActive(): Promise<boolean> {
  if (!chrome.storage?.session) return false;
  try {
    const res = await chrome.runtime.sendMessage({ type: "get-tab-id" });
    if (res?.tabId != null) tabId = res.tabId as number;
    if (tabId == null) return false;
    const result = await chrome.storage.session.get(`wt-active-tab:${tabId}`);
    return result[`wt-active-tab:${tabId}`] === true;
  } catch {
    return false;
  }
}

function getEngine(): TranslationEngine {
  if (!engine) {
    engine = new TranslationEngine({
      provider: "google",
      displayMode: "replace",
      source: "auto",
      target: "vi"
    });
    engine.setProgressHandler((state) => {
      lastStatus = state;
      // The extension context may be invalidated after an update/reload.
      // Bail out silently in that case; the next user action will surface
      // a clearer "please refresh this page" error from the engine.
      if (!chrome.runtime?.id) return;
      try {
        chrome.runtime
          .sendMessage({
            type: "status",
            active: state.active,
            count: state.count,
            pending: state.pending
          })
          .catch(() => {
            /* popup may be closed */
          });
      } catch {
        /* extension context invalidated */
      }
    });
    engine.setErrorHandler((message) => {
      showError(message);
    });
  }
  return engine;
}

function configFromSettings(settings: Settings) {
  return {
    provider: settings.provider,
    displayMode: settings.displayMode,
    source: settings.sourceLang,
    target: settings.targetLang
  };
}

async function handleToggle(): Promise<void> {
  const settings = await getSettings();
  const e = getEngine();
  if (e.isActive()) {
    e.disable();
    await markTabInactive();
    return;
  }
  await e.enable(configFromSettings(settings));
  await markTabActive();
}

async function applySettings(settings: Settings): Promise<void> {
  cachedSettings = settings;
  syncSelectionTrigger(settings);
  const e = getEngine();
  if (e.isActive()) {
    await e.enable(configFromSettings(settings));
    return;
  }
  const host = window.location.hostname;
  const rule = settings.hostRules[host] ?? settings.autoRule;
  if (rule === "always") {
    await e.enable(configFromSettings(settings));
  }
}

async function handleTranslateSelectionInline(): Promise<void> {
  const selection = window.getSelection();
  const hasSelection = !!selection && selection.toString().trim().length > 0;
  if (!hasSelection) {
    showError("Hãy bôi đen đoạn văn bản cần dịch trước, rồi nhấn Alt+S.");
    return;
  }
  const settings = await getSettings();
  await getEngine().translateSelection(configFromSettings(settings));
}

async function handleTranslateSelection(message: TranslateSelectionMessage): Promise<void> {
  // Chrome's `info.selectionText` (which feeds `message.text`) collapses
  // newlines into spaces. Prefer the live DOM selection captured at the
  // time of the right-click — it preserves `\n` at block boundaries so the
  // popup can keep the original line layout when translating.
  const liveSelection = lastContextMenuSelection.trim();
  const text = (liveSelection || message.text).trim();
  if (!text) return;
  const anchor = lastContextMenuPoint ?? selectionAnchor() ?? { x: 32, y: 32 };
  await openSelectionPopup(text, anchor);
}

async function openSelectionPopup(text: string, anchor: { x: number; y: number }): Promise<void> {
  const settings = await getSettings();
  dismissDictionaryPopup();
  showSelectionPopup(normalizeSelection(text), anchor, {
    provider: settings.quickProvider,
    aiProvider: settings.aiProvider,
    aiTranslationMode: settings.aiTranslationMode,
    providerOptions: buildProviderOptions(settings),
    source: settings.sourceLang,
    target: settings.targetLang,
    showOriginal: settings.showSelectionOriginal,
    theme: settings.selectionPopupTheme,
    onProviderChange: (provider: ProviderId) => {
      void persistProvider(provider);
    },
    onThemeChange: (theme) => {
      void persistTheme(theme);
    }
  });
}

/**
 * Build the provider menu entries for the in-page popup: the built-in
 * services plus every user-added custom model (as `custom:<id>`).
 */
function buildProviderOptions(settings: Settings): { id: ProviderId; label: string }[] {
  const builtins = (Object.keys(BUILTIN_PROVIDER_LABELS) as BuiltinProviderId[]).map((id) => ({
    id,
    label: BUILTIN_PROVIDER_LABELS[id]
  }));
  return [
    ...builtins,
    ...settings.customModels.map((m) => ({
      id: customProviderId(m.id),
      label: m.name || "Model tuỳ chỉnh"
    }))
  ];
}

async function openDictionaryPopup(word: string, anchor: { x: number; y: number }): Promise<void> {
  const settings = await getSettings();
  dismissSelectionPopup();
  showDictionaryPopup(word, anchor, {
    theme: settings.selectionPopupTheme,
    provider: settings.quickProvider,
    source: "en",
    target: settings.targetLang,
    onThemeChange: (theme) => {
      void persistTheme(theme);
    },
    onFallback: (text, fallbackAnchor) => {
      void openSelectionPopup(text, fallbackAnchor);
    }
  });
}

function syncSelectionTrigger(settings: Settings): void {
  if (settings.selectionTrigger) {
    installSelectionTrigger({
      onTranslate: (text, anchor) => {
        void openSelectionPopup(text, anchor);
      }
    });
  } else {
    uninstallSelectionTrigger();
  }
}

async function persistTheme(theme: "dark" | "light"): Promise<void> {
  const settings = await getSettings();
  if (settings.selectionPopupTheme === theme) return;
  // Merge over the freshest stored settings so we don't clobber fields (e.g.
  // autoRule / hostRules) that may have changed in the popup meanwhile.
  cachedSettings = await updateSettings({ selectionPopupTheme: theme });
}

async function persistProvider(provider: ProviderId): Promise<void> {
  const settings = await getSettings();
  if (settings.quickProvider === provider) return;
  cachedSettings = await updateSettings({ quickProvider: provider });
}

function selectionAnchor(): { x: number; y: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  let rects: DOMRectList | null = null;
  try {
    rects = range.getClientRects();
  } catch {
    /* shadow DOM can throw */
  }
  if (rects && rects.length > 0) {
    const last = rects[rects.length - 1];
    return { x: last.left, y: last.bottom };
  }
  let boundingRect: DOMRect | null = null;
  try {
    boundingRect = range.getBoundingClientRect();
  } catch {
    /* ignore */
  }
  if (boundingRect && boundingRect.width > 0 && boundingRect.height > 0) {
    return { x: boundingRect.right, y: boundingRect.bottom };
  }
  return null;
}

document.addEventListener(
  "contextmenu",
  (e) => {
    lastContextMenuPoint = { x: e.clientX, y: e.clientY };
    // Capture the live DOM selection now. `Selection.toString()` keeps `\n`
    // characters at block boundaries (paragraphs, list items, <br>, ...)
    // which Chrome's `info.selectionText` strips before delivering it to the
    // background script.
    try {
      lastContextMenuSelection = window.getSelection()?.toString() ?? "";
    } catch {
      lastContextMenuSelection = "";
    }
  },
  true
);

/**
 * Always resolve the port, even when a handler throws. An unresolved port
 * makes the sender's `tabs.sendMessage` reject, and `sendOrInject` in the
 * background interprets that as "content script missing" and re-injects the
 * whole script — duplicating the engine and every document-level listener.
 */
function respond(promise: Promise<void>, sendResponse: (response?: unknown) => void): void {
  promise
    .then(() => sendResponse({ ok: true }))
    .catch((err) => {
      console.warn("[Translator2k]", err);
      sendResponse({ ok: false });
    });
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "toggle") {
    respond(handleToggle(), sendResponse);
    return true;
  }
  if (message.type === "apply-settings") {
    respond(applySettings((message as ApplySettingsMessage).settings), sendResponse);
    return true;
  }
  if (message.type === "get-status") {
    sendResponse({ type: "status", ...lastStatus });
    return false;
  }
  if (message.type === "translate-selection") {
    respond(handleTranslateSelection(message as TranslateSelectionMessage), sendResponse);
    return true;
  }
  if (message.type === "translate-selection-inline") {
    respond(handleTranslateSelectionInline(), sendResponse);
    return true;
  }
  return false;
});

watchSettings((settings) => {
  cachedSettings = settings;
  syncSelectionTrigger(settings);
  const e = engine;
  if (e?.isActive()) {
    void e.enable(configFromSettings(settings));
  }
});

// Attach the selection-trigger listeners synchronously at module load using
// defaults. The async settings load below reconciles this (uninstalling it if
// the user turned the feature off). This guarantees the floating icon works on
// the first selection even if `chrome.storage` is slow or throws.
syncSelectionTrigger(DEFAULT_SETTINGS);

void (async () => {
  // Install the selection trigger up front using whatever settings load (or
  // defaults) so the floating icon works on the very first selection, without
  // waiting on the engine/auto-enable logic below. Previously this lived after
  // `await getSettings()` and a throw there (common in the MAIN world before
  // `chrome.storage` is ready) left the listeners uninstalled until a later
  // re-sync (e.g. after a right-click translate).
  const settings = await getSettings();
  syncSelectionTrigger(settings);

  const host = window.location.hostname;
  const rule = settings.hostRules[host] ?? settings.autoRule;

  let shouldEnable = rule === "always";

  if (!shouldEnable) {
    shouldEnable = await checkTabActive();
  }

  if (shouldEnable) {
    await getEngine().enable(configFromSettings(settings));
  }
})();

// Hide selection popup if user starts typing or clicks elsewhere; the popup
// itself listens for outside-clicks and Escape, but we ensure cleanup on
// navigation events too.
window.addEventListener("beforeunload", () => {
  dismissSelectionPopup();
  dismissDictionaryPopup();
});

// Double-click on a single word opens the dictionary popup. We let the
// browser do its own word-selection (default behaviour) and then read the
// resulting selection. If the user opted out via settings, or the click
// was inside an input/contenteditable, we no-op.
document.addEventListener(
  "dblclick",
  (e) => {
    void handleDoubleClick(e);
  },
  true
);

async function handleDoubleClick(e: MouseEvent): Promise<void> {
  const settings = await getSettings();
  if (settings.dictionaryMode === "off") return;
  // "alt-doubleclick" requires the Alt key to be held during the double-click.
  if (settings.dictionaryMode === "alt-doubleclick" && !e.altKey) return;

  // Skip when the click is inside our own popups, inputs, or editable areas.
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest('[data-wt-selection-popup="true"], [data-wt-selection-trigger="true"]')) {
    return;
  }
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
    return;
  }

  // Read the live selection. The browser already expanded it to the word.
  const sel = window.getSelection();
  const raw = sel?.toString().trim() ?? "";
  if (!raw) return;
  // Only treat single words as dictionary lookups. Multi-word selections
  // fall through to the regular selection trigger / context menu flow.
  const word = raw.match(/^[\p{L}\p{M}'’-]+$/u) ? raw : null;
  if (!word) return;

  const anchor = anchorForSelection(sel) ?? { x: e.clientX, y: e.clientY };
  await openDictionaryPopup(word, anchor);
}

function anchorForSelection(sel: Selection | null): { x: number; y: number } | null {
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let rects: DOMRectList | null = null;
  try {
    rects = range.getClientRects();
  } catch {
    /* shadow DOM can throw */
  }
  if (rects && rects.length > 0) {
    const last = rects[rects.length - 1];
    return { x: last.left, y: last.bottom };
  }
  let boundingRect: DOMRect | null = null;
  try {
    boundingRect = range.getBoundingClientRect();
  } catch {
    /* ignore */
  }
  if (boundingRect && boundingRect.width > 0 && boundingRect.height > 0) {
    return { x: boundingRect.right, y: boundingRect.bottom };
  }
  return null;
}

function showError(message: string): void {
  console.warn("[Translator2k]", message);
  ensureStyles();
  if (lastError?.node?.isConnected) {
    lastError.node.querySelector("span")!.textContent = message;
    lastError.message = message;
    return;
  }
  const banner = document.createElement("div");
  banner.className = "wt-error-banner";
  banner.setAttribute("translate", "no");
  banner.setAttribute("role", "alert");
  const span = document.createElement("span");
  span.textContent = message;
  const close = document.createElement("button");
  close.textContent = "Đóng";
  close.onclick = () => {
    banner.remove();
    lastError = null;
  };
  banner.appendChild(span);
  banner.appendChild(close);
  document.body.appendChild(banner);
  lastError = { message, node: banner };
  window.setTimeout(() => {
    if (lastError?.node === banner) {
      banner.remove();
      lastError = null;
    }
  }, 12000);
}
