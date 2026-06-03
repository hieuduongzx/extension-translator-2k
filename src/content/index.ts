import { TranslationEngine } from "./engine";
import {
  dismissSelectionPopup,
  showSelectionPopup
} from "./selectionPopup";
import {
  dismissDictionaryPopup,
  showDictionaryPopup
} from "./dictionaryPopup";
import {
  installSelectionTrigger,
  uninstallSelectionTrigger
} from "./selectionTrigger";
import { ensureStyles } from "./styles";
import { normalizeSelection } from "./selectionText";
import { loadSettings, updateSettings, watchSettings } from "../storage";
import { customProviderId } from "../types";
import type {
  ApplySettingsMessage,
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
  if (!cachedSettings) cachedSettings = await loadSettings();
  return cachedSettings;
}

async function markTabActive(): Promise<void> {
  if (!chrome.storage?.session) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: "get-tab-id" });
    if (res?.tabId != null) tabId = res.tabId as number;
    if (tabId != null) await chrome.storage.session.set({ [`wt-active-tab:${tabId}`]: true });
  } catch { /* extension context invalidated */ }
}

async function markTabInactive(): Promise<void> {
  if (tabId == null || !chrome.storage?.session) return;
  try { await chrome.storage.session.remove(`wt-active-tab:${tabId}`); } catch { /* */ }
}

async function checkTabActive(): Promise<boolean> {
  if (!chrome.storage?.session) return false;
  try {
    const res = await chrome.runtime.sendMessage({ type: "get-tab-id" });
    if (res?.tabId != null) tabId = res.tabId as number;
    if (tabId == null) return false;
    const result = await chrome.storage.session.get(`wt-active-tab:${tabId}`);
    return result[`wt-active-tab:${tabId}`] === true;
  } catch { return false; }
}

function getEngine(): TranslationEngine {
  if (!engine) {
    engine = new TranslationEngine({
      provider: "google",
      displayMode: "bilingual",
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

async function openSelectionPopup(
  text: string,
  anchor: { x: number; y: number }
): Promise<void> {
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
  return [
    { id: "google", label: "Google" },
    { id: "bing", label: "Bing" },
    { id: "gemma", label: "Gemma 4" },
    { id: "qwen", label: "Qwen 3.7 Mmax" },
    ...settings.customModels.map((m) => ({
      id: customProviderId(m.id),
      label: m.name || "Model tuỳ chỉnh"
    }))
  ];
}

async function openDictionaryPopup(
  word: string,
  anchor: { x: number; y: number }
): Promise<void> {
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
  const rects = range.getClientRects();
  if (rects.length === 0) return null;
  const last = rects[rects.length - 1];
  return { x: last.left, y: last.bottom };
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

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "toggle") {
    void handleToggle().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "apply-settings") {
    void applySettings((message as ApplySettingsMessage).settings).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }
  if (message.type === "get-status") {
    sendResponse({ type: "status", ...lastStatus });
    return false;
  }
  if (message.type === "translate-selection") {
    void handleTranslateSelection(message as TranslateSelectionMessage).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }
  if (message.type === "translate-selection-inline") {
    void handleTranslateSelectionInline().then(() => sendResponse({ ok: true }));
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

void (async () => {
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
  if (
    target.closest(
      '[data-wt-selection-popup="true"], [data-wt-selection-trigger="true"]'
    )
  ) {
    return;
  }
  if (
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
    )
  ) {
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
  const rects = sel.getRangeAt(0).getClientRects();
  if (rects.length === 0) return null;
  const last = rects[rects.length - 1];
  return { x: last.left, y: last.bottom };
}

function showError(message: string): void {
  ensureStyles();
  if (lastError?.node?.isConnected) {
    lastError.node.querySelector("span")!.textContent = message;
    lastError.message = message;
    return;
  }
  const banner = document.createElement("div");
  banner.className = "wt-error-banner";
  banner.setAttribute("translate", "no");
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
  }, 6000);
}
