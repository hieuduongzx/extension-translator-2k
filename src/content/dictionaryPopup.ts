/**
 * Floating dictionary popup. Activated by double-click on a single word
 * (see `content/index.ts`). Shows phonetic, audio playback, definitions
 * grouped by part of speech, examples, synonyms.
 *
 * Styling follows the same theme tokens as the selection popup (`data-theme`
 * dark|light) so the two surfaces feel consistent.
 */
import type { DictionaryEntry, ProviderId } from "../types";
import { ensureStyles } from "./styles";
import {
  sendDictionaryRequest,
  sendLabanRequest,
  sendTranslateRequest,
  sendVdictRequest,
  sendWiktionaryRequest
} from "./messaging";
import { parseWiktionaryHtml } from "./wiktionaryParser";
import { parseLabanHtml } from "./labanParser";
import { parseVdictHtml } from "./vdictParser";
import { speak as ttsSpeak, stop as ttsStop } from "./tts";

interface DictionaryPopupConfig {
  theme: "dark" | "light";
  /** Provider used to translate definitions/examples into `target`. */
  provider: ProviderId;
  /**
   * Source language passed to the translator. Free Dictionary only ships
   * English content reliably, so this is normally "en".
   */
  source: string;
  /** Target language for translated definitions (e.g. "vi"). */
  target: string;
  /** Called when the user clicks "Translate instead" or when the lookup
   * returns no entries — the caller falls back to the translator. */
  onFallback: (word: string, anchor: { x: number; y: number }) => void;
  onThemeChange: (theme: "dark" | "light") => void;
}

interface PopupHandle {
  destroy(): void;
  show(word: string, anchor: { x: number; y: number }): void;
}

let activeHandle: PopupHandle | null = null;
let activeConfigKey = "";

/**
 * Fingerprint of the config the live popup was built with; a mismatch means
 * settings changed while it was open, so rebuild instead of reusing stale
 * provider/language/theme.
 */
function configKey(config: DictionaryPopupConfig): string {
  return JSON.stringify([config.theme, config.provider, config.source, config.target]);
}

export function showDictionaryPopup(
  word: string,
  anchor: { x: number; y: number },
  config: DictionaryPopupConfig
): PopupHandle {
  const key = configKey(config);
  if (activeHandle && key === activeConfigKey) {
    activeHandle.show(word, anchor);
    return activeHandle;
  }
  activeHandle?.destroy();
  ensureStyles();
  const handle = createPopup(word, anchor, config);
  activeHandle = handle;
  activeConfigKey = key;
  return handle;
}

export function dismissDictionaryPopup(): void {
  activeHandle?.destroy();
  activeHandle = null;
}

function createPopup(
  initialWord: string,
  initialAnchor: { x: number; y: number },
  config: DictionaryPopupConfig
): PopupHandle {
  let currentWord = initialWord;
  let currentTheme = config.theme;
  let inflightId = 0;

  const root = document.createElement("div");
  root.className = "wt-selection-popup wt-dict-popup";
  root.dataset.theme = currentTheme;
  root.setAttribute("translate", "no");
  root.setAttribute("data-wt-selection-popup", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Dictionary");
  root.tabIndex = -1;

  const ICON_SPEAK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const ICON_TRANSLATE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;
  const ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  // Tiny inline speaker icon used per-row to play just that line.
  const ICON_SPEAK_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="wt-dict-speak-icon"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;

  root.innerHTML = `
    <div class="wt-sp-toolbar">
      <div class="wt-sp-toolbar-start">
        <button type="button" class="wt-sp-icon-btn" data-role="speak" aria-label="Phát âm" title="Phát âm từ">${ICON_SPEAK}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="copy" aria-label="Sao chép từ" title="Sao chép từ">${ICON_COPY}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="fallback" aria-label="Dịch thay vì tra" title="Dịch thay vì tra">${ICON_TRANSLATE}</button>
      </div>
      <div class="wt-sp-toolbar-end">
        <button type="button" class="wt-sp-icon-btn" data-role="theme" aria-label="Đổi giao diện" title="Đổi giao diện">
          <span data-role="theme-icon">${currentTheme === "dark" ? ICON_MOON : ICON_SUN}</span>
        </button>
        <button type="button" class="wt-sp-icon-btn" data-role="close" aria-label="Đóng" title="Đóng">${ICON_CLOSE}</button>
      </div>
    </div>
    <div class="wt-sp-body wt-dict-body" data-role="body">
      <div class="wt-dict-loading">Đang tra &ldquo;${escapeHtml(initialWord)}&rdquo;…</div>
    </div>
  `;

  const speakBtn = root.querySelector<HTMLButtonElement>('[data-role="speak"]')!;
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-role="copy"]')!;
  const fallbackBtn = root.querySelector<HTMLButtonElement>('[data-role="fallback"]')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-role="close"]')!;
  const themeBtn = root.querySelector<HTMLButtonElement>('[data-role="theme"]')!;
  const themeIconEl = root.querySelector<HTMLSpanElement>('[data-role="theme-icon"]')!;
  const bodyEl = root.querySelector<HTMLDivElement>('[data-role="body"]')!;

  function setTheme(theme: "dark" | "light"): void {
    if (theme === currentTheme) return;
    currentTheme = theme;
    root.dataset.theme = theme;
    themeIconEl.innerHTML = theme === "dark" ? ICON_MOON : ICON_SUN;
    config.onThemeChange(theme);
  }

  function setStatus(text: string): void {
    bodyEl.innerHTML = `<div class="wt-dict-loading">${escapeHtml(text)}</div>`;
  }

  function setError(message: string): void {
    bodyEl.innerHTML = `<div class="wt-dict-error">${escapeHtml(message)}</div>`;
  }

  let currentEntries: DictionaryEntry[] = [];

  /**
   * Translate every English definition + example string in `entries` into
   * `target`. Wiktionary entries are skipped — they already contain
   * Vietnamese definitions written by editors.
   */
  async function translateEntries(entries: DictionaryEntry[], targetLang: string): Promise<void> {
    if (targetLang === config.source || targetLang === "auto") return;

    type Slot = { kind: "def" | "ex"; m: number; d: number; e: number };
    const slots: Slot[] = [];
    const texts: string[] = [];

    entries.forEach((entry, e) => {
      if (entry.source === "wiktionary") return;
      entry.meanings.forEach((m, mi) => {
        m.definitions.forEach((d, di) => {
          slots.push({ kind: "def", m: mi, d: di, e });
          texts.push(d.definition);
          if (d.example) {
            slots.push({ kind: "ex", m: mi, d: di, e });
            texts.push(d.example);
          }
        });
      });
    });
    if (texts.length === 0) return;

    const response = await sendTranslateRequest({
      type: "translate",
      texts,
      source: config.source,
      target: targetLang,
      provider: config.provider
    });
    if (response.error || response.translations.length !== texts.length) {
      return;
    }
    response.translations.forEach((translated, i) => {
      const slot = slots[i];
      if (!slot) return;
      const def = entries[slot.e].meanings[slot.m].definitions[slot.d];
      if (slot.kind === "def") def.definitionVi = translated;
      else def.exampleVi = translated;
    });
  }

  function renderEntries(entries: DictionaryEntry[]): void {
    currentEntries = entries;
    if (entries.length === 0) {
      bodyEl.innerHTML = `<div class="wt-dict-empty">
        Không tìm thấy mục từ cho <strong>${escapeHtml(currentWord)}</strong>.
      </div>`;
      return;
    }
    const html = entries
      .map((entry) => renderEntry(entry, ICON_SPEAK_SM))
      .join('<hr class="wt-dict-sep"/>');
    bodyEl.innerHTML = html;
  }

  async function lookup(word: string): Promise<void> {
    const id = ++inflightId;
    setStatus(`Đang tra “${word}”…`);

    // Try the Vietnamese dictionary sources one at a time and stop at the
    // first that yields a non-empty parse. Sequential (not parallel) so we
    // don't hammer three third-party sites for every lookup — most common
    // words resolve on the first source. Priority order:
    //   1. VDict      — richest with bilingual examples
    //   2. Laban      — wide coverage with example sentences
    //   3. Wiktionary — community Anh-Việt entries
    const sources: {
      name: string;
      fetch: () => Promise<{ html: string; error?: string }>;
      parse: (html: string, word: string) => DictionaryEntry[];
    }[] = [
      {
        name: "VDict",
        fetch: () => sendVdictRequest({ type: "vdict", word }),
        parse: parseVdictHtml
      },
      {
        name: "Laban",
        fetch: () => sendLabanRequest({ type: "laban", word }),
        parse: parseLabanHtml
      },
      {
        name: "Wiktionary",
        fetch: () => sendWiktionaryRequest({ type: "wiktionary", word }),
        parse: parseWiktionaryHtml
      }
    ];

    for (const source of sources) {
      try {
        const res = await source.fetch();
        if (id !== inflightId) return;
        if (res.error) {
          console.warn(`[web-translator] ${source.name} fetch error:`, res.error);
          continue;
        }
        if (!res.html) continue;
        const entries = source.parse(res.html, word);
        console.info(
          `[web-translator] ${source.name} parsed`,
          entries.length,
          "entry/entries for",
          word
        );
        if (entries.length > 0) {
          renderEntries(entries);
          return;
        }
      } catch (err) {
        if (id !== inflightId) return;
        console.warn(`[web-translator] ${source.name} lookup threw:`, err);
      }
    }
    if (id !== inflightId) return;

    // Last resort: Free Dictionary (English) + machine translate.
    try {
      const response = await sendDictionaryRequest({
        type: "dictionary",
        word,
        lang: "en"
      });
      if (id !== inflightId) return;
      if (response.error) {
        setError(response.error);
        return;
      }
      if (response.entries.length === 0) {
        bodyEl.innerHTML = `<div class="wt-dict-empty">
          Không tìm thấy mục từ cho <strong>${escapeHtml(word)}</strong>.
          Đang chuyển sang trình dịch…
        </div>`;
        window.setTimeout(() => {
          if (inflightId !== id) return;
          const anchor = lastAnchor;
          destroy();
          config.onFallback(word, anchor);
        }, 350);
        return;
      }

      // Show English entries immediately, translate in background.
      renderEntries(response.entries);
      await translateEntries(response.entries, config.target);
      if (id !== inflightId) return;
      renderEntries(response.entries);
    } catch (err) {
      if (id !== inflightId) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Speak `text` in the given BCP-47 language code via Web Speech API. */
  function speak(text: string, lang: string): void {
    ttsSpeak(text, lang);
  }

  closeBtn.addEventListener("click", () => destroy());
  themeBtn.addEventListener("click", () => setTheme(currentTheme === "dark" ? "light" : "dark"));
  speakBtn.addEventListener("click", () => {
    const audio = currentEntries.find((e) => e.audio)?.audio;
    if (audio) {
      try {
        const a = new Audio(audio);
        a.play().catch(() => speak(currentWord, "en"));
      } catch {
        speak(currentWord, "en");
      }
    } else {
      speak(currentWord, "en");
    }
  });
  copyBtn.addEventListener("click", () => {
    navigator.clipboard?.writeText(currentWord).catch(() => {});
  });
  fallbackBtn.addEventListener("click", () => {
    const anchor = lastAnchor;
    destroy();
    config.onFallback(currentWord, anchor);
  });

  // Delegated body clicks: synonym chips, per-line speak buttons.
  bodyEl.addEventListener("click", (e) => {
    const targetEl = e.target as HTMLElement;

    const speakNode = targetEl.closest<HTMLElement>("[data-wt-speak]");
    if (speakNode) {
      e.preventDefault();
      e.stopPropagation();
      const text = speakNode.getAttribute("data-wt-speak") ?? "";
      const lang = speakNode.getAttribute("data-wt-speak-lang") ?? "en";
      speak(text, lang);
      return;
    }

    const synNode = targetEl.closest<HTMLElement>("[data-wt-syn]");
    if (synNode) {
      const next = synNode.getAttribute("data-wt-syn");
      if (!next) return;
      e.preventDefault();
      currentWord = next;
      void lookup(next);
    }
  });

  // Dismiss on outside click or Escape only. The popup is `position: fixed`
  // and stays anchored on scroll, so users can keep reading the page.
  const onDocClick = (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) destroy();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      destroy();
      return;
    }
    if (e.key === "Tab") trapFocus(e);
  };
  document.addEventListener("mousedown", onDocClick, true);
  document.addEventListener("keydown", onKey, true);

  // Keep keyboard focus inside the popup while it's open (focus trap).
  function focusableElements(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);
  }

  function trapFocus(e: KeyboardEvent): void {
    const focusable = focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeEl = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (activeEl === first || !root.contains(activeEl))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const previousFocus = document.activeElement as HTMLElement | null;

  function destroy(): void {
    inflightId++;
    document.removeEventListener("mousedown", onDocClick, true);
    document.removeEventListener("keydown", onKey, true);
    try {
      ttsStop();
    } catch {
      /* ignore */
    }
    root.remove();
    try {
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    } catch {
      /* ignore */
    }
    if (activeHandle && activeHandle.destroy === destroy) activeHandle = null;
  }

  let lastAnchor = initialAnchor;

  function position(anchor: { x: number; y: number }): void {
    lastAnchor = anchor;
    // `anchor` is viewport-relative; convert to document coordinates so the
    // popup (position: absolute) stays anchored to the page on scroll.
    const margin = 8;
    const rect = root.getBoundingClientRect();
    const width = rect.width || 460;
    const height = rect.height || 280;
    let left = anchor.x;
    let top = anchor.y + 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + width > vw - margin) left = vw - width - margin;
    if (left < margin) left = margin;
    if (top + height > vh - margin) {
      top = anchor.y - height - 10;
      if (top < margin) top = margin;
    }
    root.style.left = `${left + window.scrollX}px`;
    root.style.top = `${top + window.scrollY}px`;
  }

  function show(word: string, anchor: { x: number; y: number }): void {
    currentWord = word;
    position(anchor);
    void lookup(word);
  }

  document.body.appendChild(root);
  requestAnimationFrame(() => {
    position(initialAnchor);
    closeBtn.focus();
  });
  void lookup(initialWord);

  const handle: PopupHandle = { destroy, show };
  return handle;
}

function renderEntry(entry: DictionaryEntry, speakIcon: string): string {
  const phonetic = entry.phonetic
    ? `<span class="wt-dict-phonetic">${escapeHtml(entry.phonetic)}</span>`
    : "";

  const isVietnameseSource =
    entry.source === "wiktionary" || entry.source === "laban" || entry.source === "vdict";

  const meanings = entry.meanings
    .map((m) => {
      const defs = m.definitions
        .map((d, i) => {
          const item = d;
          // Laban / Wiktionary: definition is already Vietnamese.
          // Free Dictionary: definition is English with optional vi overlay.
          const primaryLang = isVietnameseSource ? "vi" : "en";
          const primaryHtml = `
            <div class="wt-dict-def-en">
              <span>${escapeHtml(item.definition)}</span>
              <button type="button" class="wt-dict-speak"
                data-wt-speak="${escapeAttr(item.definition)}"
                data-wt-speak-lang="${primaryLang}"
                aria-label="Đọc">${speakIcon}</button>
            </div>`;
          const defViLine =
            !isVietnameseSource && item.definitionVi
              ? `<div class="wt-dict-def-vi">
                   ${escapeHtml(item.definitionVi)}
                   <button type="button" class="wt-dict-speak"
                     data-wt-speak="${escapeAttr(item.definitionVi)}"
                     data-wt-speak-lang="vi"
                     aria-label="Đọc bản dịch">${speakIcon}</button>
                 </div>`
              : "";
          // Examples on Laban / VDict entries are always English; Wiktionary varies.
          const exampleLang =
            entry.source === "laban" || entry.source === "vdict"
              ? "en"
              : isVietnameseSource
                ? "vi"
                : "en";
          const exampleLine = item.example
            ? `<div class="wt-dict-example">
                 <span class="wt-dict-quote">&ldquo;${escapeHtml(item.example)}&rdquo;</span>
                 <button type="button" class="wt-dict-speak"
                   data-wt-speak="${escapeAttr(item.example)}"
                   data-wt-speak-lang="${exampleLang}"
                   aria-label="Đọc ví dụ">${speakIcon}</button>
               </div>`
            : "";
          // Laban + VDict ship Vietnamese example translations.
          // Free Dictionary: exampleVi is set by translateEntries() above.
          const sourceExampleVi =
            (entry.source === "laban" || entry.source === "vdict") &&
            (item as { exampleVi?: string }).exampleVi
              ? (item as { exampleVi?: string }).exampleVi
              : undefined;
          const machineExampleVi =
            !isVietnameseSource && item.exampleVi ? item.exampleVi : undefined;
          const finalExampleVi = sourceExampleVi ?? machineExampleVi;
          const exampleViLine = finalExampleVi
            ? `<div class="wt-dict-example-vi">
                 <span class="wt-dict-quote">&ldquo;${escapeHtml(finalExampleVi)}&rdquo;</span>
                 <button type="button" class="wt-dict-speak"
                   data-wt-speak="${escapeAttr(finalExampleVi)}"
                   data-wt-speak-lang="vi"
                   aria-label="Đọc bản dịch ví dụ">${speakIcon}</button>
               </div>`
            : "";

          return `
            <li class="wt-dict-def">
              <span class="wt-dict-def-num">${i + 1}.</span>
              <div class="wt-dict-def-body">
                ${primaryHtml}
                ${defViLine}
                ${exampleLine}
                ${exampleViLine}
              </div>
            </li>`;
        })
        .join("");

      const syns = (m.synonyms ?? [])
        .slice(0, 6)
        .map(
          (s) =>
            `<button type="button" class="wt-dict-chip" data-wt-syn="${escapeAttr(s)}">${escapeHtml(s)}</button>`
        )
        .join("");
      const synBlock = syns
        ? `<div class="wt-dict-syn"><span class="wt-dict-syn-label">Đồng nghĩa</span>${syns}</div>`
        : "";

      return `
        <section class="wt-dict-meaning">
          <div class="wt-dict-pos">${escapeHtml(m.partOfSpeech || "—")}</div>
          <ol class="wt-dict-defs">${defs}</ol>
          ${synBlock}
        </section>`;
    })
    .join("");

  const sourceTag =
    entry.source === "vdict"
      ? `<span class="wt-dict-source" title="Nguồn: vdict.com">VDict</span>`
      : entry.source === "laban"
        ? `<span class="wt-dict-source" title="Nguồn: dict.laban.vn">Laban</span>`
        : entry.source === "wiktionary"
          ? `<span class="wt-dict-source" title="Nguồn: vi.wiktionary.org">Wiktionary</span>`
          : `<span class="wt-dict-source" title="Nguồn: Free Dictionary API + dịch máy">Free Dictionary · dịch máy</span>`;

  return `
    <header class="wt-dict-header">
      <div class="wt-dict-word">${escapeHtml(entry.word)}</div>
      ${phonetic}
      ${sourceTag}
    </header>
    ${meanings}
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
