import type { ProviderId } from "../types";
import { ensureStyles } from "./styles";
import { sendTranslateRequest } from "./messaging";
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
  onProviderChange: (provider: ProviderId) => void;
  onThemeChange: (theme: "dark" | "light") => void;
}

interface PopupHandle {
  destroy(): void;
  show(text: string, anchor: { x: number; y: number }): void;
}

let activeHandle: PopupHandle | null = null;

export function showSelectionPopup(
  text: string,
  anchor: { x: number; y: number },
  config: SelectionPopupConfig
): PopupHandle {
  if (activeHandle) {
    activeHandle.show(text, anchor);
    return activeHandle;
  }
  ensureStyles();
  const handle = createPopup(text, anchor, config);
  activeHandle = handle;
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
  let currentText = initialText;
  let currentProvider = config.provider;
  let currentTheme = config.theme;
  let lastTranslation = "";
  let lastAITranslation = "";
  let inflightId = 0;
  let aiInflightId = 0;

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
  const ICON_GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
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
        <button type="button" class="wt-sp-icon-btn" data-role="speak" aria-label="Đọc bản dịch" title="Đọc bản dịch">${ICON_SPEAK}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="copy" aria-label="Sao chép bản dịch" title="Sao chép bản dịch">${ICON_COPY}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="retry" aria-label="Dịch lại" title="Dịch lại">${ICON_RETRY}</button>
        <button type="button" class="wt-sp-icon-btn" data-role="ai" aria-label="Lấy bản dịch AI" title="Lấy bản dịch AI">${ICON_SPARKLE}</button>
      </div>
      <div class="wt-sp-toolbar-end">
        <button type="button" class="wt-sp-icon-btn" data-role="theme" aria-label="Đổi giao diện" title="Đổi giao diện">
          <span data-role="theme-icon">${currentTheme === "dark" ? ICON_MOON : ICON_SUN}</span>
        </button>
        <div class="wt-sp-provider">
          <button type="button" class="wt-sp-icon-btn" data-role="provider-button" aria-expanded="false" aria-label="Tuỳ chọn dịch vụ" title="Dịch vụ dịch">${ICON_GEAR}</button>
          <div class="wt-sp-provider-menu" data-role="provider-menu" hidden></div>
        </div>
        <button type="button" class="wt-sp-icon-btn" data-role="close" aria-label="Đóng" title="Đóng">${ICON_CLOSE}</button>
      </div>
    </div>
    <div class="wt-sp-body">
      ${sourceSectionHtml}
      <div class="wt-sp-result wt-loading" data-role="result">Đang dịch…</div>
      <div class="wt-sp-ai" data-role="ai-section" hidden>
        <div class="wt-sp-ai-header">
          <span class="wt-sp-ai-label">Bản dịch AI</span>
          <button type="button" class="wt-sp-icon-btn wt-sp-ai-copy" data-role="ai-copy" aria-label="Sao chép bản dịch AI" title="Sao chép bản dịch AI">${ICON_COPY}</button>
        </div>
        <div class="wt-sp-ai-result" data-role="ai-result"></div>
      </div>
      <div class="wt-sp-status" data-role="status" hidden></div>
    </div>
  `;

  const sourceEl = root.querySelector<HTMLDivElement>('[data-role="source"]');
  const resultEl = root.querySelector<HTMLDivElement>('[data-role="result"]')!;
  const providerButton = root.querySelector<HTMLButtonElement>('[data-role="provider-button"]')!;
  const providerMenu = root.querySelector<HTMLDivElement>('[data-role="provider-menu"]')!;
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
    themeIconEl.innerHTML = theme === "dark" ? ICON_MOON : ICON_SUN;
    config.onThemeChange(theme);
  }

  function renderProviderMenu(): void {
    providerMenu.innerHTML = "";
    const heading = document.createElement("div");
    heading.className = "wt-sp-provider-heading";
    heading.textContent = "Dịch vụ dịch";
    providerMenu.appendChild(heading);
    for (const p of config.providerOptions) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "wt-sp-provider-option";
      opt.setAttribute("aria-selected", String(p.id === currentProvider));
      opt.innerHTML = `<span class="wt-sp-provider-check">✓</span><span>${p.label}</span>`;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        setProvider(p.id);
        toggleMenu(false);
      });
      providerMenu.appendChild(opt);
    }
  }

  function toggleMenu(force?: boolean): void {
    const next = force ?? providerMenu.hasAttribute("hidden");
    if (next) {
      providerMenu.removeAttribute("hidden");
      providerButton.setAttribute("aria-expanded", "true");
    } else {
      providerMenu.setAttribute("hidden", "");
      providerButton.setAttribute("aria-expanded", "false");
    }
  }

  function setProvider(provider: ProviderId): void {
    if (provider === currentProvider) return;
    currentProvider = provider;
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
  function stitch(
    parts: string[],
    idx: number[],
    translations: string[]
  ): string {
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
    lastTranslation = "";
    resultEl.classList.remove("wt-error");
    resultEl.classList.add("wt-loading");
    resultEl.textContent = "Đang dịch…";
    setStatus("");

    const { parts, idx, texts } = splitSegments();

    if (texts.length === 0) {
      resultEl.classList.remove("wt-loading");
      resultEl.textContent = currentText;
      lastTranslation = currentText;
      return;
    }

    try {
      const response = await sendTranslateRequest({
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
        resultEl.textContent = response.error || "Không có bản dịch.";
        return;
      }
      resultEl.classList.remove("wt-error");

      const stitched = stitch(parts, idx, response.translations);
      lastTranslation = stitched;
      resultEl.textContent = stitched;
    } catch (err) {
      if (id !== inflightId) return;
      const message = err instanceof Error ? err.message : String(err);
      resultEl.classList.remove("wt-loading");
      resultEl.classList.add("wt-error");
      resultEl.textContent = message;
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
    targetEl.textContent = "Đang lấy bản dịch AI…";

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
      const response = await sendTranslateRequest({
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
        targetEl.textContent = response.error || "Không có bản dịch.";
        return;
      }
      targetEl.classList.remove("wt-error");
      const stitched = stitch(parts, idx, response.translations);
      targetEl.textContent = stitched;
      finish(stitched);
    } catch (err) {
      if (id !== aiInflightId) return;
      const message = err instanceof Error ? err.message : String(err);
      targetEl.classList.remove("wt-loading");
      targetEl.classList.add("wt-error");
      targetEl.textContent = message;
    }
  }

  function speak(text: string, lang: string): void {
    if (!text) return;
    if (!ttsSpeak(text, lang)) {
      setStatus("Đọc thất bại", 1500);
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
      () => setStatus("Đã sao chép", 1500),
      () => setStatus("Sao chép thất bại", 1500)
    );
  });
  aiCopyBtn.addEventListener("click", () => {
    if (!lastAITranslation) return;
    navigator.clipboard?.writeText(lastAITranslation).then(
      () => setStatus("Đã sao chép bản dịch AI", 1500),
      () => setStatus("Sao chép thất bại", 1500)
    );
  });
  speakBtn.addEventListener("click", () => {
    speak(lastTranslation, config.target);
  });
  providerButton.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Dismiss on outside click or Escape only. We intentionally do NOT close
  // on page scroll: the popup is `position: fixed` so it stays anchored,
  // and users want to keep reading the page while the translation is open.
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
    // Restore focus to wherever the user was before the popup opened.
    try {
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    } catch {
      /* ignore */
    }
    if (activeHandle && activeHandle.destroy === destroy) activeHandle = null;
  }

  function position(anchor: { x: number; y: number }): void {
    // `anchor` is in viewport coordinates (clientX/Y or getClientRects).
    // The popup uses `position: absolute` so it stays anchored to the page
    // when the user scrolls. Convert to document coordinates by adding the
    // current scroll offset.
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
    root.style.left = `${left + window.scrollX}px`;
    root.style.top = `${top + window.scrollY}px`;
  }

  function show(text: string, anchor: { x: number; y: number }): void {
    currentText = text;
    if (sourceEl) sourceEl.textContent = text;
    resetAISection();
    position(anchor);
    void translate();
  }

  document.body.appendChild(root);
  if (sourceEl) sourceEl.textContent = currentText;
  renderProviderMenu();
  syncAIButton();
  requestAnimationFrame(() => {
    position(initialAnchor);
    closeBtn.focus();
  });
  void translate();

  const handle: PopupHandle = { destroy, show };
  return handle;
}
