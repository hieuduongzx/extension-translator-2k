import { translateWith } from "./providers";
import { lookupDictionary } from "./providers/dictionary";
import { fetchWiktionaryHtml } from "./providers/wiktionary";
import { fetchLabanHtml } from "./providers/laban";
import { fetchVdictHtml } from "./providers/vdict";
import { fetchGoogleTts } from "./providers/googleTts";
import { loadSettings } from "./storage";
import { readCache, writeCache } from "./cache";
import { initStreamTranslator } from "./stream/streamBackground";
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
} from "./types";

async function handleTranslate(
  request: TranslateRequestMessage
): Promise<TranslateResponseMessage> {
  try {
    const settings = await loadSettings();
    const provider = request.provider ?? settings.provider;
    const { translations, detected: cachedDetected } = await readCache(
      provider,
      request.target,
      request.texts
    );

    const missingIndices: number[] = [];
    const missingTexts: string[] = [];
    for (let i = 0; i < translations.length; i++) {
      if (translations[i] === null) {
        missingIndices.push(i);
        missingTexts.push(request.texts[i]);
      }
    }

    let detected = cachedDetected;
    if (missingTexts.length > 0) {
      const result = await translateWith(
        provider,
        missingTexts,
        request.source,
        request.target,
        settings
      );
      await writeCache(
        provider,
        request.target,
        missingTexts,
        result.translations,
        result.detected
      );
      missingIndices.forEach((idx, j) => {
        translations[idx] = result.translations[j];
      });
      if (!detected && result.detected) detected = result.detected;
    }

    return {
      type: "translate-response",
      translations: translations.map((t) => t ?? ""),
      detected
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: "translate-response",
      translations: [],
      error: message
    };
  }
}

async function handleDictionary(
  request: DictionaryRequestMessage
): Promise<DictionaryResponseMessage> {
  try {
    const entries = await lookupDictionary(request.word, request.lang);
    return { type: "dictionary-response", entries };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "dictionary-response", entries: [], error: message };
  }
}

async function handleWiktionary(
  request: WiktionaryRequestMessage
): Promise<WiktionaryResponseMessage> {
  try {
    const html = await fetchWiktionaryHtml(request.word);
    return { type: "wiktionary-response", html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "wiktionary-response", html: "", error: message };
  }
}

async function handleLaban(
  request: LabanRequestMessage
): Promise<LabanResponseMessage> {
  try {
    const html = await fetchLabanHtml(request.word);
    return { type: "laban-response", html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "laban-response", html: "", error: message };
  }
}

async function handleVdict(
  request: VdictRequestMessage
): Promise<VdictResponseMessage> {
  try {
    const html = await fetchVdictHtml(request.word);
    return { type: "vdict-response", html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "vdict-response", html: "", error: message };
  }
}

async function handleTts(request: TtsRequestMessage): Promise<TtsResponseMessage> {
  try {
    const audio = await fetchGoogleTts(request.text, request.lang);
    return { type: "tts-response", audio };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "tts-response", audio: [], error: message };
  }
}

// Wire up the Soniox real-time stream translator. It registers its own
// runtime.onMessage listener (scoped to its own STREAM_* message types) and
// owns the offscreen audio-capture lifecycle.
initStreamTranslator();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: string }).type;

  if (type === "translate") {
    handleTranslate(message as TranslateRequestMessage).then(sendResponse);
    return true;
  }

  if (type === "dictionary") {
    handleDictionary(message as DictionaryRequestMessage).then(sendResponse);
    return true;
  }

  if (type === "wiktionary") {
    handleWiktionary(message as WiktionaryRequestMessage).then(sendResponse);
    return true;
  }

  if (type === "laban") {
    handleLaban(message as LabanRequestMessage).then(sendResponse);
    return true;
  }

  if (type === "vdict") {
    handleVdict(message as VdictRequestMessage).then(sendResponse);
    return true;
  }

  if (type === "tts") {
    handleTts(message as TtsRequestMessage).then(sendResponse);
    return true;
  }

  if (type === "status" && sender.tab?.id !== undefined) {
    const m = message as { active?: boolean };
    void updateBadge(sender.tab.id, !!m.active);
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Nothing persistent to clean; Chrome auto-clears per-tab badges.
  void tabId;
});

/**
 * Show a green check badge on the toolbar icon while a tab is being
 * translated. The badge is scoped per-tab via `tabId`.
 */
async function updateBadge(tabId: number, active: boolean): Promise<void> {
  try {
    if (active) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#16a34a" });
      await chrome.action.setBadgeText({ tabId, text: "✓" });
      if (chrome.action.setBadgeTextColor) {
        await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
      }
    } else {
      await chrome.action.setBadgeText({ tabId, text: "" });
    }
  } catch {
    // Tab may have been closed; ignore.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "wt-translate-page",
      title: "Dịch trang này",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "wt-translate-selection",
      title: "Dịch đoạn đã chọn",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "wt-translate-page") {
    void toggleInTab(tab.id);
    return;
  }
  if (info.menuItemId === "wt-translate-selection") {
    const text = (info.selectionText ?? "").trim();
    if (!text) return;
    void sendOrInject(tab.id, { type: "translate-selection", text });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-translation") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    void toggleInTab(tab.id);
  });
});

/**
 * Sends a toggle message to the tab. If the content script hasn't loaded yet
 * (common for tabs that were already open before the extension was installed
 * or reloaded), inject it first and then retry.
 */
async function toggleInTab(tabId: number): Promise<void> {
  await sendOrInject(tabId, { type: "toggle" });
}

async function sendOrInject(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      const files = getContentScriptFiles();
      if (files.length === 0) return;
      await chrome.scripting.executeScript({
        target: { tabId },
        files
      });
      await new Promise((r) => setTimeout(r, 50));
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Page is likely chrome:// or a restricted URL; nothing more we can do.
    }
  }
}

/**
 * Returns the JS files declared as content scripts in the bundled manifest.
 * Reading from `chrome.runtime.getManifest()` ensures we use the post-build
 * file names (which are hashed by the bundler), not the source paths.
 */
function getContentScriptFiles(): string[] {
  try {
    const manifest = chrome.runtime.getManifest();
    const files = manifest.content_scripts?.flatMap((cs) => cs.js ?? []) ?? [];
    return Array.from(new Set(files));
  } catch {
    return [];
  }
}
