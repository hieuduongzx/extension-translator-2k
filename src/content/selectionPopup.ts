import type { ProviderId } from "../types";
import { providerIcon } from "../providerIcons";
import { ensureStyles } from "./styles";
import { sendChunkedTranslateRequest } from "./messaging";
import { speak as ttsSpeak, stop as ttsStop } from "./tts";

interface SelectionPopupConfig {
  provider: ProviderId;
  /** Dedicated AI provider used by the on-demand "AI translation" button. */
  aiProvider: ProviderId;
  /**
   * Whether the AI button overwrites the main translation ("replace") or
   * shows its result in a separate section below it ("below").
   */
  aiTranslationMode: "below" | "replace";
  /** Selectable providers for the in-popup menu (built from current settings). */
  providerOptions: { id: ProviderId; label: string }[];
  source: string;
  target: string;
  /**
   * When true, the popup shows both the original selection and the
   * translation. When false (default), only the translation is shown for a
   * cleaner reading experience.
   */
  showOriginal: boolean;
  /** Initial visual theme. Can be toggled live via the popup. */
  theme: "dark" | "light";
  /**
   * When true, double-clicking a single word in the ORIGINAL text inside the
   * popup calls `onDictionaryLookup` so the dictionary can be opened for that
   * word. Only applies while the original text is shown (`showOriginal`); the
   * translated result has no source word to look up.
   */
  dictionaryInPopup: boolean;
  onDictionaryLookup: (word: string, anchor: { x: number; y: number }) => void;
  onProviderChange: (provider: ProviderId) => void;
  onThemeChange: (theme: "dark" | "light") => void;
}

interface PopupHandle {
  destroy(): void;
  show(text: string, anchor: { x: number; y: number }): void;
}

let activeHandle: PopupHandle | null = null;
let activeConfigKey = "";

/**
 * Serializable fingerprint of the config the live popup was built with.
 * When it changes (provider/language/theme edited elsewhere while a popup is
 * open), the popup is rebuilt instead of silently reusing stale settings.
 */
function configKey(config: SelectionPopupConfig): string {
  return JSON.stringify([
    config.provider,
    config.aiProvider,
    config.aiTranslationMode,
    config.source,
    config.target,
    config.showOriginal,
    config.theme,
    config.dictionaryInPopup,
    config.providerOptions
  ]);
}

export function showSelectionPopup(
  text: string,
  anchor: { x: number; y: number },
  config: SelectionPopupConfig
): PopupHandle {
  const key = configKey(config);
  if (activeHandle && key === activeConfigKey) {
    activeHandle.show(text, anchor);
    return activeHandle;
  }
  activeHandle?.destroy();
  ensureStyles();
  const handle = createPopup(text, anchor, config);
  activeHandle = handle;
  activeConfigKey = key;
  return handle;
}

export function dismissSelectionPopup(): void {
  activeHandle?.destroy();
  activeHandle = null;
}

function createPopup(
  initialText: string,
  initialAnchor: { x: number; y: number },
  config: SelectionPopupConfig
): PopupHandle {
  if (!document.body) {
    return { destroy() {}, show() {} };
  }
  let currentText = initialText;
  let currentProvider = config.provider;
  let currentTheme = config.theme;
  let lastTranslation = "";
  let lastAITranslation = "";
  let inflightId = 0;
  let aiInflightId = 0;
  let lastAnchor = initialAnchor;
  let initialRaf: number | null = null;
  // Set once the user drags the popup, so subsequent re-shows keep its spot
  // instead of snapping back to the selection anchor.
  let dragged = false;

  /** Convert viewport coordinates to `el`'s CSS containing-block offsets. */
  function setViewportPosition(el: HTMLElement, left: number, top: number): void {
    const op = el.offsetParent as HTMLElement | null;
    if (
      op &&
      op !== document.documentElement &&
      window.getComputedStyle(op).position !== "static"
    ) {
      const opRect = op.getBoundingClientRect();
      el.style.left = `${left - opRect.left - op.clientLeft}px`;
      el.style.top = `${top - opRect.top - op.clientTop}px`;
      return;
    }
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${top + window.scrollY}px`;
  }

  const root = document.createElement("div");
  root.className = "wt-selection-popup";
  root.dataset.theme = currentTheme;
  root.setAttribute("translate", "no");
  root.setAttribute("data-wt-selection-popup", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Translation");
  root.tabIndex = -1;

  const ICON_SPEAK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const ICON_RETRY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>`;
  const ICON_SPARKLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`;
  const ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
  const ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

  const sourceSectionHtml = config.showOriginal
    ? `
      <div class="wt-sp-source" data-role="source"></div>
      <div class="wt-sp-divider"></div>
    `
    : "";

  root.innerHTML = `
    <div class="wt-sp-toolbar">
      <div class="wt-sp-toolbar-start">
        <button type="button" class="wt-sp-icon-btn" data-role="speak" aria-label="Read translation" title="Read translation">${ICON_SPEAK}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="copy" aria-label="Copy translation" title="Copy translation">${ICON_COPY}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="retry" aria-label="Retranslate" title="Retranslate">${ICON_RETRY}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="ai" aria-label="Get AI translation" title="Get AI translation">${ICON_SPARKLE}</button>
      </div>
      <div class="wt-sp-toolbar-center">
        <button type="button" class="wt-sp-provider-trigger" data-role="provider-button" aria-expanded="false" aria-haspopup="listbox" aria-label="Translation service" title="Translation service">
          <span class="wt-sp-provider-icon" data-role="provider-icon"></span>
          <span class="wt-sp-provider-current" data-role="provider-current"></span>
          <span class="wt-sp-provider-caret">${ICON_CHEVRON}</span>
        </button>
      </div>
      <div class="wt-sp-toolbar-end">
        <button type="button" class="wt-sp-icon-btn" data-role="theme" aria-label="Toggle theme" title="Toggle theme">
          <span data-role="theme-icon">${currentTheme === "dark" ? ICON_MOON : ICON_SUN}</span>
        </button>
        <button type="button" class="wt-sp-icon-btn" data-role="close" aria-label="Close" title="Close">${ICON_CLOSE}</button>
      </div>
    </div>
    <div class="wt-sp-body">
      ${sourceSectionHtml}
      <div class="wt-sp-result wt-loading" data-role="result">Translating…</div>
      <div class="wt-sp-ai" data-role="ai-section" hidden>
        <div class="wt-sp-ai-header">
          <span class="wt-sp-ai-label">AI translation</span>
          <button type="button" class="wt-sp-icon-btn wt-sp-ai-copy" data-role="ai-copy" aria-label="Copy AI translation" title="Copy AI translation">${ICON_COPY}</button>
        </div>
        <div class="wt-sp-ai-result" data-role="ai-result"></div>
      </div>
      <div class="wt-sp-status" data-role="status" hidden></div>
    </div>
  `;

  const sourceEl = root.querySelector<HTMLDivElement>('[data-role="source"]');
  const resultEl = root.querySelector<HTMLDivElement>('[data-role="result"]')!;
  const toolbarEl = root.querySelector<HTMLDivElement>(".wt-sp-toolbar")!;
  const providerButton = root.querySelector<HTMLButtonElement>('[data-role="provider-button"]')!;
  const providerCurrentEl = root.querySelector<HTMLSpanElement>('[data-role="provider-current"]')!;
  const providerIconEl = root.querySelector<HTMLSpanElement>('[data-role="provider-icon"]')!;
  // The provider menu lives on <body>, not inside the popup, so the popup's
  // `overflow: hidden` can't clip it when the popup is short. It's positioned
  // manually relative to the trigger each time it opens.
  const providerMenu = document.createElement("div");
  providerMenu.className = "wt-selection-popup-menu wt-sp-provider-menu";
  providerMenu.setAttribute("role", "listbox");
  providerMenu.dataset.theme = currentTheme;
  providerMenu.setAttribute("translate", "no");
  providerMenu.hidden = true;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-role="close"]')!;
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-role="copy"]')!;
  const speakBtn = root.querySelector<HTMLButtonElement>('[data-role="speak"]')!;
  const retryBtn = root.querySelector<HTMLButtonElement>('[data-role="retry"]')!;
  const aiBtn = root.querySelector<HTMLButtonElement>('[data-role="ai"]')!;
  const aiSection = root.querySelector<HTMLDivElement>('[data-role="ai-section"]')!;
  const aiResultEl = root.querySelector<HTMLDivElement>('[data-role="ai-result"]')!;
  const aiCopyBtn = root.querySelector<HTMLButtonElement>('[data-role="ai-copy"]')!;
  const themeBtn = root.querySelector<HTMLButtonElement>('[data-role="theme"]')!;
  const themeIconEl = root.querySelector<HTMLSpanElement>('[data-role="theme-icon"]')!;
  const statusEl = root.querySelector<HTMLDivElement>('[data-role="status"]')!;

  function setStatus(text: string, autoClearMs?: number): void {
    if (!text) {
      statusEl.textContent = "";
      statusEl.setAttribute("hidden", "");
      return;
    }
    statusEl.textContent = text;
    statusEl.removeAttribute("hidden");
    if (autoClearMs && autoClearMs > 0) {
      window.setTimeout(() => {
        if (statusEl.textContent === text) setStatus("");
      }, autoClearMs);
    }
  }

  function setTheme(theme: "dark" | "light"): void {
    if (theme === currentTheme) return;
    currentTheme = theme;
    root.dataset.theme = theme;
    providerMenu.dataset.theme = theme;
    themeIconEl.innerHTML = theme === "dark" ? ICON_MOON : ICON_SUN;
    activeConfigKey = configKey({ ...config, theme: currentTheme, provider: currentProvider });
    config.onThemeChange(theme);
  }

  function renderProviderMenu(): void {
    // Reflect the current selection in the toolbar trigger (icon + label).
    const current = config.providerOptions.find((p) => p.id === currentProvider);
    providerIconEl.innerHTML = providerIcon(currentProvider);
    providerCurrentEl.textContent = current?.label ?? "Service";

    providerMenu.innerHTML = "";
    const heading = document.createElement("div");
    heading.className = "wt-sp-provider-heading";
    heading.textContent = "Translation service";
    providerMenu.appendChild(heading);
    for (const p of config.providerOptions) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "wt-sp-provider-option";
      opt.setAttribute("role", "option");
      opt.setAttribute("aria-selected", String(p.id === currentProvider));

      const check = document.createElement("span");
      check.className = "wt-sp-provider-check";
      check.textContent = "✓";
      const icon = document.createElement("span");
      icon.className = "wt-sp-provider-option-icon";
      icon.innerHTML = providerIcon(p.id);
      const label = document.createElement("span");
      label.className = "wt-sp-provider-option-label";
      label.textContent = p.label;
      opt.append(check, icon, label);

      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        setProvider(p.id);
        toggleMenu(false);
      });
      providerMenu.appendChild(opt);
    }
  }

  /**
   * Anchor the body-level menu to the trigger. Opens below by default, flips
   * above when there isn't room, and clamps horizontally to the viewport.
   */
  function positionMenu(): void {
    const btn = providerButton.getBoundingClientRect();
    const margin = 8;
    const menuW = providerMenu.offsetWidth || 200;
    const menuH = providerMenu.offsetHeight || 200;
    let left = btn.left;
    if (left + menuW > window.innerWidth - margin) {
      left = window.innerWidth - menuW - margin;
    }
    if (left < margin) left = margin;
    let top = btn.bottom + 6;
    if (top + menuH > window.innerHeight - margin) {
      const above = btn.top - menuH - 6;
      if (above >= margin) top = above;
      else top = Math.max(margin, window.innerHeight - menuH - margin);
    }
    setViewportPosition(providerMenu, left, top);
  }

  function toggleMenu(force?: boolean): void {
    const next = force ?? providerMenu.hidden;
    if (next) {
      providerMenu.hidden = false;
      providerButton.setAttribute("aria-expanded", "true");
      positionMenu();
    } else {
      providerMenu.hidden = true;
      providerButton.setAttribute("aria-expanded", "false");
    }
  }

  function setProvider(provider: ProviderId): void {
    if (provider === currentProvider) return;
    currentProvider = provider;
    activeConfigKey = configKey({ ...config, theme: currentTheme, provider: currentProvider });
    config.onProviderChange(provider);
    renderProviderMenu();
    resetAISection();
    syncAIButton();
    void translate();
  }

  /**
   * Hide the "AI translation" button when the main provider already is the
   * dedicated AI provider — a second identical rendition would be redundant.
   */
  function syncAIButton(): void {
    if (currentProvider === config.aiProvider) {
      aiBtn.setAttribute("hidden", "");
    } else {
      aiBtn.removeAttribute("hidden");
    }
  }

  /**
   * Split `currentText` into translatable line segments while keeping the
   * newline separators so the result can be reassembled with the exact
   * original line layout. Even indices are content lines, odd indices are
   * separators.
   */
  function splitSegments(): {
    parts: string[];
    idx: number[];
    texts: string[];
  } {
    const parts = currentText.split(/(\r?\n)/);
    const idx: number[] = [];
    const texts: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0 && parts[i].trim().length > 0) {
        idx.push(i);
        texts.push(parts[i]);
      }
    }
    return { parts, idx, texts };
  }

  /** Reassemble the translated segments back into the original line layout. */
  function stitch(parts: string[], idx: number[], translations: string[]): string {
    const out = [...parts];
    for (let i = 0; i < idx.length; i++) {
      const at = idx[i];
      const original = parts[at];
      const translated = translations[i] ?? original;
      const leading = original.match(/^\s*/)?.[0] ?? "";
      const trailing = original.match(/\s*$/)?.[0] ?? "";
      out[at] = `${leading}${translated.trim()}${trailing}`;
    }
    return out.join("");
  }

  function resetAISection(): void {
    aiInflightId++;
    lastAITranslation = "";
    aiSection.setAttribute("hidden", "");
    aiResultEl.classList.remove("wt-error", "wt-loading");
    aiResultEl.textContent = "";
  }

  async function translate(): Promise<void> {
    const id = ++inflightId;
    // In replace mode both actions write into `resultEl`; cancel any older AI
    // request so a slow AI reply cannot clobber a newer Retry.
    if (config.aiTranslationMode === "replace") aiInflightId++;
    lastTranslation = "";
    resultEl.classList.remove("wt-error");
    resultEl.classList.add("wt-loading");
    resultEl.textContent = "Translating…";
    setStatus("");

    const { parts, idx, texts } = splitSegments();

    if (texts.length === 0) {
      resultEl.classList.remove("wt-loading");
      resultEl.textContent = currentText;
      lastTranslation = currentText;
      if (!dragged) position(lastAnchor);
      return;
    }

    try {
      const response = await sendChunkedTranslateRequest({
        type: "translate",
        texts,
        source: config.source,
        target: config.target,
        provider: currentProvider
      });
      if (id !== inflightId) return;
      resultEl.classList.remove("wt-loading");
      if (response.error || response.translations.length === 0) {
        resultEl.classList.add("wt-error");
        resultEl.textContent = response.error || "No translation.";
        if (!dragged) position(lastAnchor);
        return;
      }
      resultEl.classList.remove("wt-error");

      const stitched = stitch(parts, idx, response.translations);
      lastTranslation = stitched;
      resultEl.textContent = stitched;
      if (!dragged) position(lastAnchor);
    } catch (err) {
      if (id !== inflightId) return;
      const message = err instanceof Error ? err.message : String(err);
      resultEl.classList.remove("wt-loading");
      resultEl.classList.add("wt-error");
      resultEl.textContent = message;
      if (!dragged) position(lastAnchor);
    }
  }

  /**
   * Fetch an AI rendition of the current selection on demand using the
   * dedicated AI provider. Depending on `config.aiTranslationMode` it either
   * overwrites the main translation ("replace") or shows the result in its own
   * section below it ("below") so the two can be compared.
   */
  async function translateAI(): Promise<void> {
    const id = ++aiInflightId;
    const replace = config.aiTranslationMode === "replace";
    // Target the main result element in replace mode, the AI section otherwise.
    const targetEl = replace ? resultEl : aiResultEl;

    if (replace) {
      // A fresh main translation could otherwise land on top of the AI result.
      inflightId++;
    } else {
      aiSection.removeAttribute("hidden");
    }
    targetEl.classList.remove("wt-error");
    targetEl.classList.add("wt-loading");
    targetEl.textContent = "Getting AI translation…";

    const finish = (value: string): void => {
      lastAITranslation = value;
      if (replace) lastTranslation = value;
    };

    const { parts, idx, texts } = splitSegments();
    if (texts.length === 0) {
      targetEl.classList.remove("wt-loading");
      targetEl.textContent = currentText;
      finish(currentText);
      return;
    }

    try {
      const response = await sendChunkedTranslateRequest({
        type: "translate",
        texts,
        source: config.source,
        target: config.target,
        provider: config.aiProvider
      });
      if (id !== aiInflightId) return;
      targetEl.classList.remove("wt-loading");
      if (response.error || response.translations.length === 0) {
        targetEl.classList.add("wt-error");
        targetEl.textContent = response.error || "No translation.";
        return;
      }
      targetEl.classList.remove("wt-error");
      const stitched = stitch(parts, idx, response.translations);
      targetEl.textContent = stitched;
      finish(stitched);
      if (!dragged) position(lastAnchor);
    } catch (err) {
      if (id !== aiInflightId) return;
      const message = err instanceof Error ? err.message : String(err);
      targetEl.classList.remove("wt-loading");
      targetEl.classList.add("wt-error");
      targetEl.textContent = message;
      if (!dragged) position(lastAnchor);
    }
  }

  function speak(text: string, lang: string): void {
    if (!text) return;
    if (!ttsSpeak(text, lang)) {
      setStatus("Reading failed", 1500);
    }
  }

  closeBtn.addEventListener("click", () => destroy());
  retryBtn.addEventListener("click", () => translate());
  aiBtn.addEventListener("click", () => translateAI());
  themeBtn.addEventListener("click", () => {
    setTheme(currentTheme === "dark" ? "light" : "dark");
  });
  copyBtn.addEventListener("click", () => {
    if (!lastTranslation) return;
    navigator.clipboard?.writeText(lastTranslation).then(
      () => setStatus("Copied", 1500),
      () => setStatus("Copy failed", 1500)
    );
  });
  aiCopyBtn.addEventListener("click", () => {
    if (!lastAITranslation) return;
    navigator.clipboard?.writeText(lastAITranslation).then(
      () => setStatus("Copied AI translation", 1500),
      () => setStatus("Copy failed", 1500)
    );
  });
  speakBtn.addEventListener("click", () => {
    speak(lastTranslation, config.target);
  });
  providerButton.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Double-clicking a single word in the ORIGINAL text inside the popup opens
  // the dictionary for that word (when enabled). The browser expands the
  // selection to the word before this fires, so `Selection.toString()` already
  // holds the word. The source section only exists when `config.showOriginal`
  // is on — the translated result has no source word to look up.
  const onDblClick = (e: MouseEvent): void => {
    if (!config.dictionaryInPopup) return;
    const target = e.target as HTMLElement | null;
    if (!target || !target.closest(".wt-sp-source")) return;
    const sel = window.getSelection();
    const raw = sel?.toString().trim() ?? "";
    if (!raw) return;
    const word = raw.match(/^[\p{L}\p{M}'’-]+$/u) ? raw : null;
    if (!word) return;
    e.preventDefault();
    e.stopPropagation();
    config.onDictionaryLookup(word, { x: e.clientX, y: e.clientY });
  };
  root.addEventListener("dblclick", onDblClick);

  // ----- Drag the whole popup by its toolbar -----
  // Pointer events give us mouse + touch + pen for free and capture so the
  // drag keeps tracking even if the cursor outruns the popup.
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginLeft = 0;
  let dragOriginTop = 0;

  const onDragMove = (e: PointerEvent) => {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return;
    const margin = 8;
    const rect = root.getBoundingClientRect();
    // Keep the popup within the viewport so it can't be dragged off-screen.
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    let left = dragOriginLeft + (e.clientX - dragStartX);
    let top = dragOriginTop + (e.clientY - dragStartY);
    left = Math.min(Math.max(margin, left), Math.max(margin, maxLeft));
    top = Math.min(Math.max(margin, top), Math.max(margin, maxTop));
    setViewportPosition(root, left, top);
    if (!providerMenu.hidden) positionMenu();
  };

  const stopDrag = () => {
    if (dragPointerId === null) return;
    const pointerId = dragPointerId;
    dragPointerId = null;
    if (toolbarEl.hasPointerCapture?.(pointerId)) {
      try {
        toolbarEl.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
    root.classList.remove("wt-dragging");
    document.removeEventListener("pointermove", onDragMove, true);
    document.removeEventListener("pointerup", onDragEnd, true);
    document.removeEventListener("pointercancel", onDragEnd, true);
    window.removeEventListener("blur", stopDrag);
  };

  const onDragEnd = (e: PointerEvent) => {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return;
    stopDrag();
  };

  toolbarEl.addEventListener("pointerdown", (e) => {
    // Only start a drag from the toolbar background, never from its buttons
    // (those have their own click behaviour) and only with the primary button.
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = root.getBoundingClientRect();
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginLeft = rect.left;
    dragOriginTop = rect.top;
    dragged = true;
    root.classList.add("wt-dragging");
    toggleMenu(false);
    e.preventDefault();
    try {
      toolbarEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    document.addEventListener("pointermove", onDragMove, true);
    document.addEventListener("pointerup", onDragEnd, true);
    document.addEventListener("pointercancel", onDragEnd, true);
    window.addEventListener("blur", stopDrag);
  });

  // Dismiss on outside click or Escape only. We intentionally do NOT close
  // on page scroll: the popup is `position: fixed` so it stays anchored,
  // and users want to keep reading the page while the translation is open.
  // The provider menu lives on <body> (outside `root`), so a click inside it
  // must count as "inside" — otherwise selecting a provider would dismiss the
  // whole popup.
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (root.contains(target)) return;
    if (providerMenu.contains(target)) return;
    // Keep the popup open while the user interacts with a dictionary popup
    // opened from inside it (in-popup lookup).
    if ((e.target as Element).closest?.(".wt-dict-popup")) return;
    // A click anywhere else closes the menu first (if open), else the popup.
    if (!providerMenu.hidden) {
      toggleMenu(false);
      return;
    }
    destroy();
  };
  const onKey = (e: KeyboardEvent) => {
    // Let a stacked dictionary popup handle Escape/Tab first.
    if (document.querySelector(".wt-dict-popup")) return;
    if (e.key === "Escape") {
      if (!providerMenu.hidden) {
        toggleMenu(false);
        providerButton.focus();
        return;
      }
      destroy();
      return;
    }
    if (e.key === "Tab") trapFocus(e);
  };
  document.addEventListener("mousedown", onDocClick, true);
  document.addEventListener("keydown", onKey, true);

  // Keep the menu glued to the trigger if the layout shifts while it's open.
  const onReflow = () => {
    if (!providerMenu.hidden) positionMenu();
  };
  window.addEventListener("scroll", onReflow, true);
  window.addEventListener("resize", onReflow);

  // Keep keyboard focus inside the popup while it's open (focus trap).
  function focusableElements(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === root);
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
    } else if (!e.shiftKey && (activeEl === last || !root.contains(activeEl))) {
      e.preventDefault();
      first.focus();
    }
  }

  const previousFocus = document.activeElement as HTMLElement | null;

  function destroy(): void {
    inflightId++;
    aiInflightId++;
    if (initialRaf !== null) {
      cancelAnimationFrame(initialRaf);
      initialRaf = null;
    }
    stopDrag();
    root.removeEventListener("dblclick", onDblClick);
    document.removeEventListener("mousedown", onDocClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onReflow, true);
    window.removeEventListener("resize", onReflow);
    try {
      ttsStop();
    } catch {
      /* ignore */
    }
    providerMenu.remove();
    root.remove();
    // Restore focus to wherever the user was before the popup opened.
    try {
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    } catch {
      /* ignore */
    }
    if (activeHandle && activeHandle.destroy === destroy) activeHandle = null;
  }

  function position(anchor: { x: number; y: number }): void {
    lastAnchor = anchor;
    // `anchor` is in viewport coordinates (clientX/Y or getClientRects).
    const margin = 8;
    const rect = root.getBoundingClientRect();
    const width = rect.width || 360;
    const height = rect.height || 240;
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
    setViewportPosition(root, left, top);
  }

  function show(text: string, anchor: { x: number; y: number }): void {
    if (initialRaf !== null) {
      cancelAnimationFrame(initialRaf);
      initialRaf = null;
    }
    currentText = text;
    lastAnchor = anchor;
    if (sourceEl) sourceEl.textContent = text;
    toggleMenu(false);
    resetAISection();
    // Once the user has dragged the popup, keep it where they put it rather
    // than snapping back to the new selection anchor.
    if (!dragged) position(anchor);
    void translate();
  }

  document.body.appendChild(root);
  document.body.appendChild(providerMenu);
  if (sourceEl) sourceEl.textContent = currentText;
  renderProviderMenu();
  syncAIButton();
  initialRaf = requestAnimationFrame(() => {
    initialRaf = null;
    position(initialAnchor);
    closeBtn.focus();
  });
  void translate();

  const handle: PopupHandle = { destroy, show };
  return handle;
}
