/**
 * Page-side rendering for the live-subtitle overlay.
 *
 * These two functions are deliberately self-contained: they are shipped to the
 * page via `chrome.scripting.executeScript({ func, args })`, which serialises
 * the function source with `.toString()` and re-evaluates it in the page
 * isolated extension context. They must NOT close over any module-scope variable and must use only
 * their arguments + DOM APIs. That is also why the overlay CSS lives here as an
 * inline string literal rather than an imported constant.
 *
 * The DOM is shared with the page, but JavaScript runs in Chrome's ISOLATED world.
 */

/** A finished subtitle line. `id` is stable so the page can render incrementally. */
export type OverlayLine = {
  id: number;
  text: string;
  translatedText: string;
  speaker?: string;
};

export type TranslationPayload = {
  /** Original text of the open line (or a status message's detail). */
  text: string;
  /** Translation of the open line (or a status message). */
  translatedText: string;
  speaker?: string;
  isFinal?: boolean;
  status?: "info" | "success" | "warning" | "error";
  isPaused?: boolean;
  isStandby?: boolean;
  fontScale?: number;
  opacity?: number;
  showSource?: boolean;
  showSpeaker?: boolean;
  targetLanguage?: string;
  statusHint?: string;
  history?: OverlayLine[];
  displayMode?: "transcript" | "block";
  autoScroll?: boolean;
  captureId?: string;
};

export function resetOverlayLayoutOnPage() {
  const containerId = "stream-translator-overlay-root";
  const storageKey = "st-overlay-layout";
  const root = document.getElementById(containerId) as HTMLDivElement | null;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* blocked storage */
  }

  if (!root) return;

  root.style.left = "50%";
  root.style.top = "";
  root.style.bottom = "48px";
  // Back to the stylesheet's centered `translate`.
  root.style.translate = "";
  root.style.animation = "";
  root.classList.remove("is-dragging");
  root.style.width = "";
  root.style.height = "";
  const content = root.querySelector(".st-card-content") as HTMLDivElement | null;
  if (content) {
    content.style.width = "";
    content.style.height = "";
    content.style.maxHeight = "";
  }
  delete root.dataset.savedWidth;
  delete root.dataset.savedHeight;
}

export function renderOverlayOnPage(payload: TranslationPayload | null) {
  const containerId = "stream-translator-overlay-root";
  const styleId = "stream-translator-overlay-style";
  const storageKey = "st-overlay-layout";
  const cleanupKey = "__translator2kOverlayCleanup";
  const overlayWindow = window as Window & { __translator2kOverlayCleanup?: () => void };

  if (!payload) {
    overlayWindow[cleanupKey]?.();
    delete overlayWindow[cleanupKey];
    document.getElementById(containerId)?.remove();
    document.getElementById(styleId)?.remove();
    return;
  }

  // Bump when the CSS below changes. Rewriting a stylesheet makes the browser
  // re-match styles for the whole page, so only do it when it actually differs.
  const styleVersion = "6";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.documentElement.appendChild(style);
  }

  if (style.dataset.version !== styleVersion) {
    style.dataset.version = styleVersion;
    style.textContent = `
    @keyframes st-slide-up { from { opacity:0; transform:translateY(14px) scale(.98); } to { opacity:1; transform:none; } }
    @keyframes st-pulse-dot { 0%,100% { opacity:1; } 50% { opacity:.35; } }
    @keyframes st-settings-in { from { opacity:0; transform:translateY(6px) scale(.97); } to { opacity:1; transform:none; } }

    /* Centered with the separate translate property: the slide-up animation
       animates transform, and its final frame would otherwise override a
       transform-based centering. */
    #${containerId} {
      position:fixed; left:50%; bottom:48px; translate:-50% 0;
      z-index:2147483647;
      font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans",sans-serif;
      color:#fff; line-height:normal; text-align:left;
      pointer-events:auto; user-select:none;
      animation:st-slide-up .35s cubic-bezier(.16,1,.3,1) both;
      --st-t-size:26px;
      /* Scales the whole frame (fill, border, shadow, blur): at 0% only the
         text is left. Hovering brings it back enough to reach the controls. */
      --st-frame-a:var(--st-bg-opacity, .85);
    }
    #${containerId}:hover,
    #${containerId}:has(:focus-visible),
    #${containerId}.is-dragging,
    #${containerId}[data-settings-open="true"] { --st-frame-a:max(var(--st-bg-opacity, .85), .55); }
    #${containerId}.is-dragging { transition:none !important; animation:none !important; }
    #${containerId}, #${containerId} *, #${containerId} *::before, #${containerId} *::after { box-sizing:border-box; }
    #${containerId} [hidden] { display:none !important; }

    /* ─── Card: sized by its text, up to ~5 lines ─── */
    #${containerId} .st-card { position:relative; display:flex; }
    #${containerId} .st-card-content {
      position:relative; flex:1;
      display:flex; flex-direction:column; overflow:hidden;
      width:min(680px, calc(100vw - 32px)); min-width:280px;
      min-height:calc(var(--st-t-size) * 1.32 + 22px);
      max-height:min(calc(var(--st-t-size) * 5.4 + 22px), calc(100vh - 96px));
      border-radius:14px;
      border:1px solid rgba(255,255,255,calc(.08 * var(--st-frame-a)));
      background:rgba(12,12,18,var(--st-frame-a));
      box-shadow:0 12px 40px rgba(0,0,0,calc(.35 * var(--st-frame-a)));
      backdrop-filter:blur(calc(16px * var(--st-frame-a))) saturate(calc(1 + .5 * var(--st-frame-a)));
      -webkit-backdrop-filter:blur(calc(16px * var(--st-frame-a))) saturate(calc(1 + .5 * var(--st-frame-a)));
      transition:background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
    }

    /* ─── Toolbar: floats above the card, so it never covers the text.
       Hidden while live; shown on hover/focus and whenever not live. ─── */
    #${containerId} .st-header {
      position:absolute; left:0; bottom:calc(100% + 6px); z-index:5;
      display:flex; align-items:center; gap:6px; max-width:100%;
      padding:3px 3px 3px 9px; border-radius:999px;
      background:rgba(18,18,26,.9); border:1px solid rgba(255,255,255,.08);
      box-shadow:0 4px 14px rgba(0,0,0,.35);
      backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
      cursor:grab; touch-action:none;
      opacity:0; pointer-events:none; transition:opacity .15s ease;
    }
    /* Keeps the hover alive while the pointer crosses the gap to the card. */
    #${containerId} .st-header::after {
      content:""; position:absolute; left:0; right:0; top:100%; height:8px;
    }
    #${containerId}:hover .st-header,
    #${containerId}:has(:focus-visible) .st-header,
    #${containerId}.is-dragging .st-header,
    #${containerId}[data-settings-open="true"] .st-header,
    #${containerId}:not([data-live="true"]) .st-header { opacity:1; pointer-events:auto; }
    #${containerId} .st-header:active { cursor:grabbing; }
    #${containerId} .st-header-left { display:flex; align-items:center; gap:7px; min-width:0; }
    #${containerId} .st-grip { display:grid; grid-template-columns:repeat(2,3px); gap:2px; opacity:.45; }
    #${containerId} .st-header:hover .st-grip { opacity:.8; }
    #${containerId} .st-grip-dot { width:3px; height:3px; border-radius:50%; background:#fff; }

    #${containerId} .st-resizer {
      position:absolute; top:0; right:0; width:22px; height:22px; z-index:6;
      cursor:ne-resize; opacity:0; transition:opacity .15s ease;
    }
    #${containerId}:hover .st-resizer { opacity:1; }
    #${containerId} .st-resizer::after {
      content:""; position:absolute; top:7px; right:7px; width:7px; height:7px;
      border-top:2px solid rgba(255,255,255,.5); border-right:2px solid rgba(255,255,255,.5);
      border-radius:0 2px 0 0;
    }
    #${containerId} .st-resizer:hover::after { border-color:#fff; }

    /* Status badge */
    #${containerId} .st-badge {
      padding:2px 7px; border-radius:999px;
      font-size:9.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
      line-height:1.2; white-space:nowrap;
    }
    #${containerId} .st-badge.info { background:rgba(20,184,166,.18); color:#99f6e4; }
    #${containerId} .st-badge.success { background:rgba(34,197,94,.15); color:#86efac; }
    #${containerId} .st-badge.success::before {
      content:""; display:inline-block; width:6px; height:6px; border-radius:50%;
      background:#22c55e; margin-right:5px; vertical-align:1px;
      animation:st-pulse-dot 1.8s ease-in-out infinite;
    }
    #${containerId} .st-badge.warning { background:rgba(245,158,11,.15); color:#fcd34d; }
    #${containerId} .st-badge.error { background:rgba(239,68,68,.15); color:#fca5a5; }
    #${containerId}[data-paused="true"] .st-badge.success,
    #${containerId}[data-standby="true"] .st-badge.success { background:rgba(251,191,36,.15); color:#fcd34d; }
    #${containerId}[data-paused="true"] .st-badge.success::before,
    #${containerId}[data-standby="true"] .st-badge.success::before { background:#f59e0b; animation:none; }

    #${containerId} .st-lang {
      font-size:10.5px; font-weight:600; letter-spacing:.03em; text-transform:uppercase;
      color:rgba(255,255,255,.5); white-space:nowrap;
    }

    #${containerId} .st-controls { display:flex; align-items:center; gap:1px; }
    #${containerId} .st-btn {
      display:inline-flex; align-items:center; justify-content:center;
      width:24px; height:24px; border:none; border-radius:999px;
      background:transparent; color:rgba(255,255,255,.65); cursor:pointer;
      font-size:11px; line-height:1; padding:0; font-family:inherit;
      transition:background .15s ease, color .15s ease, transform .15s ease;
    }
    #${containerId} .st-btn:hover { background:rgba(255,255,255,.1); color:#fff; }
    #${containerId} .st-btn:active { transform:scale(.92); }
    #${containerId} .st-btn:focus-visible { outline:2px solid #2dd4bf; outline-offset:1px; }
    #${containerId} .st-btn.stop { color:rgba(248,113,113,.85); }
    #${containerId} .st-btn.stop:hover { background:rgba(239,68,68,.14); color:#f87171; }
    #${containerId} .st-btn.pause[data-paused="true"] { color:#fbbf24; }
    #${containerId} .st-sep { width:1px; height:12px; background:rgba(255,255,255,.12); margin:0 3px; }

    /* ─── Settings Panel ─── */
    #${containerId} .st-settings-panel {
      display:none; position:absolute; right:0; bottom:calc(100% + 42px); z-index:7;
      width:272px; padding:16px; border-radius:16px;
      border:1px solid rgba(255,255,255,.1);
      background:linear-gradient(180deg,rgba(20,20,28,.97),rgba(14,14,20,.98));
      box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset;
      backdrop-filter:blur(20px);
      animation:st-settings-in .2s cubic-bezier(.16,1,.3,1) both;
      pointer-events:auto; color:#e2e8f0;
    }
    #${containerId}[data-settings-open="true"] .st-settings-panel { display:block; }
    #${containerId}[data-settings-open="true"] .st-btn.settings { background:rgba(255,255,255,.12); color:#fff; }

    #${containerId} .st-settings-title {
      font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
      color:rgba(255,255,255,.5); margin-bottom:14px;
    }
    #${containerId} .st-setting-row {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      font-size:13px; font-weight:500; color:rgba(255,255,255,.8);
      margin-bottom:12px; cursor:default;
    }
    #${containerId} .st-setting-row:last-child { margin-bottom:0; }
    #${containerId} .st-value {
      font-size:12px; font-weight:600; color:rgba(255,255,255,.5);
      font-variant-numeric:tabular-nums; min-width:40px; text-align:right;
    }
    #${containerId} .st-range {
      width:100%; height:5px; -webkit-appearance:none; appearance:none;
      background:rgba(255,255,255,.1); border-radius:3px; outline:none;
      cursor:pointer; margin:6px 0 4px;
    }
    #${containerId} .st-range::-webkit-slider-thumb {
      -webkit-appearance:none; width:16px; height:16px;
      background:#fff; border-radius:50%; cursor:pointer;
      box-shadow:0 1px 6px rgba(0,0,0,.4);
      transition:transform .15s;
    }
    #${containerId} .st-range::-webkit-slider-thumb:hover { transform:scale(1.15); }
    #${containerId} .st-range:focus-visible { outline:2px solid #2dd4bf; outline-offset:3px; }
    #${containerId} .st-toggle-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 0; cursor:pointer; font-size:13px; font-weight:500;
      color:rgba(255,255,255,.8); width:100%; border:0; background:transparent;
      font-family:inherit;
    }
    #${containerId} .st-toggle-row:focus-visible { outline:2px solid #2dd4bf; outline-offset:2px; }
    #${containerId} .st-toggle-switch {
      position:relative; width:36px; height:20px; border-radius:10px; flex:none;
      background:rgba(255,255,255,.14); transition:background .25s; cursor:pointer;
    }
    #${containerId} .st-toggle-switch.on { background:#14b8a6; }
    #${containerId} .st-toggle-knob {
      position:absolute; top:2px; left:2px; width:16px; height:16px;
      border-radius:50%; background:#fff;
      box-shadow:0 1px 3px rgba(0,0,0,.25);
      transition:transform .25s cubic-bezier(.16,1,.3,1);
    }
    #${containerId} .st-toggle-switch.on .st-toggle-knob { transform:translateX(16px); }
    #${containerId} .st-settings-divider { height:1px; background:rgba(255,255,255,.07); margin:10px 0; }
    #${containerId} .st-mode-tabs {
      display:flex; background:rgba(255,255,255,.06); border-radius:8px; padding:3px; margin-top:6px;
    }
    #${containerId} .st-mode-tab {
      flex:1; text-align:center; padding:6px; font-size:12px; font-weight:600;
      color:rgba(255,255,255,.55); cursor:pointer; border-radius:6px; transition:all .2s;
      border:0; background:transparent; font-family:inherit;
    }
    #${containerId} .st-mode-tab:focus-visible { outline:2px solid #2dd4bf; }
    #${containerId} .st-mode-tab[data-active="true"] { background:rgba(255,255,255,.16); color:#fff; }
    #${containerId} .st-reset-btn {
      width:100%; padding:8px 12px; border:1px solid rgba(255,255,255,.1);
      background:rgba(255,255,255,.05); color:rgba(255,255,255,.75);
      border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;
      transition:all .2s; font-family:inherit;
    }
    #${containerId} .st-reset-btn:hover { background:rgba(255,255,255,.1); color:#fff; }

    /* ─── Subtitle area ─── */
    #${containerId} .st-body {
      flex:1; min-height:0; display:flex; flex-direction:column;
      padding:10px 18px 12px; overflow-y:auto; overflow-x:hidden;
      scrollbar-width:none; overscroll-behavior:contain;
    }
    #${containerId} .st-body::-webkit-scrollbar { display:none; }
    /* Older lines fade out under the top edge once the box is full. */
    #${containerId} .st-body[data-overflow="true"] {
      -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 18px);
      mask-image:linear-gradient(to bottom, transparent 0, #000 18px);
    }
    /* Pinned to the bottom edge like video subtitles; scrolls once full. */
    #${containerId} .st-copy { margin-top:auto; width:100%; }

    #${containerId} .st-transcript,
    #${containerId} .st-history,
    #${containerId} .st-current {
      font-size:var(--st-t-size); line-height:1.32; letter-spacing:0;
      overflow-wrap:break-word; white-space:pre-wrap;
      text-shadow:0 1px 2px rgba(0,0,0,.45);
    }

    /* Continuous: one flowing paragraph, newest text brightest. */
    #${containerId} .st-transcript { font-weight:500; text-wrap:pretty; }
    #${containerId} .st-history-text { color:rgba(255,255,255,.6); }
    #${containerId} .st-current-text { color:rgba(255,255,255,.88); font-weight:600; }
    #${containerId} .st-current-text[data-final="true"] { color:#fff; }
    #${containerId} .st-source-text { display:block; }

    /* By sentence: earlier lines small and dim above the current one. */
    #${containerId} .st-history { display:flex; flex-direction:column; gap:1px; margin-bottom:3px; text-align:center; }
    #${containerId} .st-history:empty { display:none; }
    #${containerId} .st-history-item {
      font-size:.66em; line-height:1.35; font-weight:500;
      color:rgba(255,255,255,.55); text-wrap:balance;
    }
    /* Between sentences the newest finished line keeps the main style. */
    #${containerId} .st-dynamic-content[data-has-current="false"] .st-history-last {
      font-size:1em; font-weight:600; color:#fff;
    }
    #${containerId} .st-current { display:flex; flex-direction:column; align-items:center; text-align:center; }
    #${containerId} .st-line { font-weight:600; text-wrap:balance; }
    #${containerId} .st-translation { color:rgba(255,255,255,.88); }
    #${containerId} .st-translation[data-final="true"] { color:#fff; }

    /* Original text: small, upright (italics hurt diacritics) and muted. */
    #${containerId} .st-source,
    #${containerId} .st-source-text {
      margin-top:2px; font-size:.6em; line-height:1.35; font-weight:500;
      color:rgba(255,255,255,.6);
    }
    #${containerId} .st-source:empty,
    #${containerId} .st-source-text:empty { display:none; }
    #${containerId}[data-show-source="false"] .st-source,
    #${containerId}[data-show-source="false"] .st-source-text { display:none; }

    /* Speaker chips sit inline with the text, one color per speaker. */
    #${containerId} .st-speaker {
      display:inline-block; vertical-align:middle; margin:0 .45em .12em 0; padding:0 7px;
      border-radius:999px; font-size:calc(var(--st-t-size) * .4); line-height:1.7;
      font-weight:700; letter-spacing:.02em; white-space:nowrap; text-shadow:none;
      color:#0b0b10; background:#5eead4;
    }
    #${containerId} .st-speaker[data-n="2"] { background:#fcd34d; }
    #${containerId} .st-speaker[data-n="3"] { background:#c4b5fd; }
    #${containerId} .st-speaker[data-n="4"] { background:#f9a8d4; }
    #${containerId} .st-speaker[data-n="5"] { background:#93c5fd; }
    #${containerId} .st-speaker[data-n="0"] { background:#bef264; }
    #${containerId} .st-speaker:empty { display:none; }
    #${containerId}[data-show-speaker="false"] .st-speaker,
    #${containerId}[data-show-speaker="false"] .st-speaker-break,
    #${containerId}[data-show-speaker="false"] .st-current-turn { display:none; }

    /* Little or no frame: outline the text like video subtitles and lift the
       dimmed lines so they stay readable over bright video. */
    #${containerId}[data-transparent="true"] .st-transcript,
    #${containerId}[data-transparent="true"] .st-history,
    #${containerId}[data-transparent="true"] .st-current {
      text-shadow:0 0 2px #000, 0 0 4px rgba(0,0,0,.9), 0 1px 3px rgba(0,0,0,.9);
    }
    #${containerId}[data-transparent="true"] .st-history-text,
    #${containerId}[data-transparent="true"] .st-history-item { color:rgba(255,255,255,.8); }
    #${containerId}[data-transparent="true"] .st-source,
    #${containerId}[data-transparent="true"] .st-source-text { color:rgba(255,255,255,.85); }
    #${containerId}[data-transparent="true"] .st-current-text,
    #${containerId}[data-transparent="true"] .st-translation { color:rgba(255,255,255,.93); }
    #${containerId}[data-transparent="true"] .st-current-text[data-final="true"],
    #${containerId}[data-transparent="true"] .st-translation[data-final="true"],
    #${containerId}[data-transparent="true"] .st-dynamic-content[data-has-current="false"] .st-history-last { color:#fff; }

    /* ─── Error ─── */
    #${containerId} .st-error {
      display:none; padding:10px 12px; border-radius:10px;
      border:1px solid rgba(248,113,113,.25); background:rgba(127,29,29,.4);
    }
    #${containerId}[data-status="error"] .st-error { display:block; }
    #${containerId}[data-status="error"] .st-dynamic-content { display:none; }
    #${containerId} .st-error-title {
      display:flex; align-items:center; gap:6px;
      font-size:10.5px; font-weight:700; letter-spacing:.05em;
      text-transform:uppercase; color:#fca5a5;
    }
    #${containerId} .st-error-title::before { content:"⚠"; font-size:12px; }
    #${containerId} .st-error-message {
      margin-top:6px; font-size:13px; line-height:1.45; color:#fef2f2; overflow-wrap:break-word;
    }
    #${containerId} .st-error-hint {
      margin-top:4px; font-size:12px; line-height:1.45; color:rgba(254,226,226,.75); overflow-wrap:break-word;
    }
    #${containerId} .st-footer {
      display:none; margin-top:8px; font-size:11px;
      color:rgba(255,255,255,.5); text-align:center;
    }
    #${containerId}[data-show-footer="true"] .st-footer { display:block; }
  `;
  }

  const safeStorageGet = (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const safeStorageSet = (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* blocked or full storage */
    }
  };
  const safeStorageRemove = (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  const sendStreamMsg = (message: unknown): void => {
    try {
      void chrome.runtime.sendMessage(message).catch(() => undefined);
    } catch {
      /* extension context invalidated */
    }
  };
  const overlayHostParent = (): Element => {
    const fs = document.fullscreenElement;
    // `<video>` / `<iframe>` elements cannot render child DOM nodes.
    if (fs && fs.tagName !== "VIDEO" && fs.tagName !== "IFRAME") return fs;
    return document.documentElement;
  };
  const clampNumber = (v: number, lo: number, hi: number): number =>
    Math.min(Math.max(v, lo), Math.max(lo, hi));
  const clampRootToViewport = (el: HTMLDivElement): void => {
    if (el.style.translate !== "none") return;
    const rect = el.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 80;
    const clampedLeft = clampNumber(rect.left, 8, window.innerWidth - width - 8);
    const currentBottom = Math.max(8, window.innerHeight - rect.bottom);
    const clampedBottom = clampNumber(currentBottom, 8, window.innerHeight - height - 44);
    el.style.left = `${Math.round(clampedLeft)}px`;
    el.style.bottom = `${Math.round(clampedBottom)}px`;
    el.style.top = "auto";
  };

  let root = document.getElementById(containerId) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = containerId;
    overlayHostParent().appendChild(root);

    const saved = safeStorageGet(storageKey);
    if (saved) {
      try {
        const layout = JSON.parse(saved) as {
          left?: number;
          top?: number;
          bottom?: number;
          width?: number;
          height?: number;
        };
        const savedWidth =
          typeof layout.width === "number" && Number.isFinite(layout.width)
            ? clampNumber(layout.width, 280, window.innerWidth - 16)
            : undefined;
        const savedHeight =
          typeof layout.height === "number" && Number.isFinite(layout.height)
            ? clampNumber(layout.height, 48, window.innerHeight - 96)
            : undefined;
        if (savedWidth !== undefined) {
          root.dataset.savedWidth = String(Math.round(savedWidth));
        }
        if (savedHeight !== undefined) {
          root.dataset.savedHeight = String(Math.round(savedHeight));
        }
        if (typeof layout.left === "number" && Number.isFinite(layout.left)) {
          const estW = savedWidth ?? Math.min(720, window.innerWidth - 24);
          const estH = savedHeight ?? 120;
          const left = clampNumber(layout.left, 8, window.innerWidth - estW - 8);
          root.style.left = `${Math.round(left)}px`;
          root.style.translate = "none";
          if (typeof layout.bottom === "number" && Number.isFinite(layout.bottom)) {
            const bottom = clampNumber(layout.bottom, 8, window.innerHeight - estH - 44);
            root.style.bottom = `${Math.round(bottom)}px`;
            root.style.top = "auto";
          } else if (typeof layout.top === "number" && Number.isFinite(layout.top)) {
            const rawBottom = Math.max(8, window.innerHeight - (layout.top + estH));
            const bottom = clampNumber(rawBottom, 8, window.innerHeight - estH - 44);
            root.style.bottom = `${Math.round(bottom)}px`;
            root.style.top = "auto";
          }
        }
      } catch {
        safeStorageRemove(storageKey);
      }
    }
  }

  const status = payload.status ?? "info";
  const badgeLabel = payload.isPaused
    ? "Paused"
    : payload.isStandby && status !== "error"
      ? "Standby"
      : status === "warning"
        ? "Setup"
        : status === "error"
          ? "Error"
          : status === "success"
            ? "Live"
            : "Listening";

  // Bump when the markup below changes: an overlay already on the page is then
  // rebuilt, and its listeners re-bound, instead of being patched in place.
  const domVersion = "2";
  if (root.dataset.domVersion !== domVersion || !root.querySelector(".st-card-content")) {
    overlayWindow[cleanupKey]?.();
    delete overlayWindow[cleanupKey];
    delete root.dataset.actionBound;
    delete root.dataset.dragBound;
    delete root.dataset.resizeBound;
    root.dataset.domVersion = domVersion;
    root.innerHTML = `
      <div class="st-card">
        <div class="st-settings-panel">
          <div class="st-settings-title">Overlay Settings</div>
          <label class="st-setting-row">
            <span>Font size</span>
            <span class="st-value font-val"></span>
          </label>
          <input class="st-range font-range" aria-label="Font size" type="range" min="30" max="180" step="5" />
          <label class="st-setting-row" style="margin-top:10px;">
            <span>Background opacity</span>
            <span class="st-value opacity-val"></span>
          </label>
          <input class="st-range opacity-range" aria-label="Background opacity" type="range" min="0" max="100" step="5" />
          <div class="st-settings-divider"></div>
          <button type="button" class="st-toggle-row" data-action="toggle-source">
            <span>Show original text</span>
            <div class="st-toggle-switch" data-key="source"><div class="st-toggle-knob"></div></div>
          </button>
          <button type="button" class="st-toggle-row" data-action="toggle-speaker">
            <span>Show speakers</span>
            <div class="st-toggle-switch" data-key="speaker"><div class="st-toggle-knob"></div></div>
          </button>
          <button type="button" class="st-toggle-row" data-action="toggle-autoscroll">
            <span>Auto-focus newest text</span>
            <div class="st-toggle-switch" data-key="autoscroll"><div class="st-toggle-knob"></div></div>
          </button>
          <div class="st-settings-divider"></div>
          <div class="st-setting-row" style="margin-bottom:0;"><span>Display Mode</span></div>
          <div class="st-mode-tabs">
            <button type="button" class="st-mode-tab" data-mode="transcript">Transcript</button>
            <button type="button" class="st-mode-tab" data-mode="block">Sentence</button>
          </div>
          <div class="st-settings-divider"></div>
          <button class="st-reset-btn st-reset-layout" type="button">Reset position</button>
        </div>
        <div class="st-header">
          <div class="st-header-left">
            <div class="st-grip"><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div></div>
            <div class="st-badge"></div>
            <div class="st-lang"></div>
          </div>
          <div class="st-sep"></div>
          <div class="st-controls">
            <button class="st-btn settings" type="button" title="Settings" aria-label="Settings">⚙</button>
            <button class="st-btn pause" type="button" title="Pause" aria-label="Pause">❚❚</button>
            <button class="st-btn stop" type="button" title="Stop" aria-label="Stop">■</button>
          </div>
        </div>
        <div class="st-card-content">
          <div class="st-resizer"></div>
          <div class="st-body">
            <div class="st-copy">
              <div class="st-dynamic-content"></div>
              <div class="st-error">
                <div class="st-error-title">Translation Error</div>
                <div class="st-error-message"></div>
                <div class="st-error-hint"></div>
              </div>
              <div class="st-footer"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (root.dataset.savedWidth && root.dataset.savedHeight) {
      const content = root.querySelector(".st-card-content") as HTMLDivElement;
      content.style.width = `${root.dataset.savedWidth}px`;
      content.style.height = `${root.dataset.savedHeight}px`;
      // A size the user picked replaces the ~5-line auto height cap.
      content.style.maxHeight = "calc(100vh - 96px)";
    }
  }

  root.dataset.status = status;
  root.dataset.paused = payload.isPaused ? "true" : "false";
  root.dataset.standby = payload.isStandby ? "true" : "false";
  // While live the toolbar hides so only the subtitles show.
  root.dataset.live =
    status === "success" && !payload.isPaused && !payload.isStandby ? "true" : "false";
  root.dataset.targetLang = payload.targetLanguage || "vi";
  root.dataset.captureId = payload.captureId || "";
  root.dataset.showSource = payload.showSource === false ? "false" : "true";
  root.dataset.showSpeaker = payload.showSpeaker === true ? "true" : "false";
  root.dataset.showFooter = status === "error" && payload.statusHint ? "true" : "false";

  const scale = (payload.fontScale ?? 100) / 100;
  root.style.setProperty("--st-t-size", `${Math.round(26 * scale)}px`);

  const opacityRatio = Math.min(1, Math.max(0, (payload.opacity ?? 85) / 100));
  root.style.setProperty("--st-bg-opacity", String(opacityRatio));
  root.dataset.transparent = opacityRatio < 0.5 ? "true" : "false";

  const badge = root.querySelector(".st-badge") as HTMLDivElement | null;
  const dynamicContent = root.querySelector(".st-dynamic-content") as HTMLDivElement | null;
  const footer = root.querySelector(".st-footer") as HTMLDivElement | null;
  const errorMessage = root.querySelector(".st-error-message") as HTMLDivElement | null;
  const errorHint = root.querySelector(".st-error-hint") as HTMLDivElement | null;
  const pauseButton = root.querySelector(".st-btn.pause") as HTMLButtonElement | null;
  const settingsButton = root.querySelector(".st-btn.settings") as HTMLButtonElement | null;
  const languageChip = root.querySelector(".st-lang") as HTMLDivElement | null;
  const fontScaleRange = root.querySelector(".font-range") as HTMLInputElement | null;
  const fontScaleValue = root.querySelector(".font-val") as HTMLSpanElement | null;
  const opacityRange = root.querySelector(".opacity-range") as HTMLInputElement | null;
  const opacityValue = root.querySelector(".opacity-val") as HTMLSpanElement | null;
  const resetLayoutButton = root.querySelector(".st-reset-layout") as HTMLButtonElement | null;

  if (badge) {
    badge.className = `st-badge ${status}`;
    badge.textContent = badgeLabel;
  }

  if (languageChip) {
    languageChip.textContent = payload.targetLanguage
      ? `→ ${payload.targetLanguage.toUpperCase()}`
      : "";
  }

  if (dynamicContent) {
    // Live text is untrusted (it comes from page audio), so it only ever goes
    // through textContent. The DOM is updated incrementally: finished lines are
    // appended once by id, and only the open line's text is rewritten.
    const isBlock = payload.displayMode === "block";
    const layoutKey = isBlock ? "block" : "transcript";
    const stBody = root.querySelector(".st-body") as HTMLDivElement | null;
    // Follow new text only while the reader is at the bottom, so scrolling up
    // to re-read isn't yanked back down on every update.
    const followTail =
      payload.autoScroll !== false &&
      (!stBody || stBody.scrollHeight - stBody.scrollTop - stBody.clientHeight < 32);

    if (dynamicContent.dataset.layout !== layoutKey) {
      dynamicContent.dataset.layout = layoutKey;
      dynamicContent.innerHTML = isBlock
        ? '<div class="st-history"></div><div class="st-current"><div class="st-line"><span class="st-speaker"></span><span class="st-translation"></span></div><div class="st-source"></div></div>'
        : '<div class="st-transcript"><span class="st-history-text"></span><span class="st-current-turn" hidden><br class="st-speaker-break"><span class="st-speaker"></span></span><span class="st-current-text"></span><span class="st-source-text"></span></div>';
    }

    const setText = (el: Element | null, value: string) => {
      if (el && el.textContent !== value) el.textContent = value;
    };
    // "Speaker 3" → color slot 3, so each speaker keeps one chip color.
    const setChip = (chip: HTMLElement | null, label: string) => {
      if (!chip) return;
      setText(chip, label);
      chip.dataset.n = label ? String((Number(label.replace(/\D+/g, "")) || 1) % 6) : "";
    };
    const makeChip = (label: string) => {
      const chip = document.createElement("span");
      chip.className = "st-speaker";
      setChip(chip, label);
      return chip;
    };
    // Scripts written without spaces between words.
    const joiner = /^(zh|ja|th|lo|km|my)$/.test((payload.targetLanguage || "").split("-")[0])
      ? ""
      : " ";
    const history = payload.history || [];
    const historyEl = dynamicContent.querySelector(
      isBlock ? ".st-history" : ".st-history-text"
    ) as HTMLElement | null;

    if (historyEl) {
      const wanted = new Set(history.map((line) => String(line.id)));
      const rendered = new Set<string>();
      for (const child of Array.from(historyEl.children) as HTMLElement[]) {
        const id = child.dataset.id || "";
        if (wanted.has(id)) rendered.add(id);
        else child.remove();
      }
      history.forEach((line, index) => {
        if (rendered.has(String(line.id))) return;
        const shown = line.translatedText || line.text;
        const speaker = line.speaker !== history[index - 1]?.speaker ? line.speaker : undefined;
        if (isBlock) {
          const item = document.createElement("div");
          item.className = "st-history-item";
          item.dataset.id = String(line.id);
          if (speaker) item.appendChild(makeChip(speaker));
          item.appendChild(document.createTextNode(shown));
          historyEl.appendChild(item);
        } else {
          const segment = document.createElement("span");
          segment.dataset.id = String(line.id);
          // A new speaker starts a new line, led by their label.
          if (speaker) {
            if (historyEl.childElementCount > 0) {
              const lineBreak = document.createElement("br");
              lineBreak.className = "st-speaker-break";
              segment.appendChild(lineBreak);
            }
            segment.appendChild(makeChip(speaker));
          }
          segment.appendChild(document.createTextNode(shown + joiner));
          historyEl.appendChild(segment);
        }
      });
      if (isBlock) {
        const last = historyEl.lastElementChild;
        historyEl.querySelectorAll(".st-history-last").forEach((el) => {
          if (el !== last) el.classList.remove("st-history-last");
        });
        last?.classList.add("st-history-last");
      }
    }

    const translated = payload.translatedText || "";
    const source = payload.text && payload.text !== translated ? payload.text : "";
    const finalFlag = payload.isFinal ? "true" : "false";
    // Between sentences the last finished line keeps the main style.
    dynamicContent.dataset.hasCurrent = translated || source ? "true" : "false";
    // Speaker chips are always rendered; [data-show-speaker] hides them.
    const lastSpeaker = history[history.length - 1]?.speaker;
    const currentSpeaker =
      payload.speaker && payload.speaker !== lastSpeaker && (translated || source)
        ? payload.speaker
        : "";
    if (isBlock) {
      setChip(dynamicContent.querySelector(".st-current .st-speaker"), currentSpeaker);
      const translationEl = dynamicContent.querySelector(".st-translation") as HTMLElement | null;
      setText(translationEl, translated);
      if (translationEl) translationEl.dataset.final = finalFlag;
      setText(dynamicContent.querySelector(".st-current .st-source"), source);
    } else {
      const turn = dynamicContent.querySelector(".st-current-turn") as HTMLElement | null;
      if (turn) {
        turn.hidden = !currentSpeaker;
        const lineBreak = turn.querySelector(".st-speaker-break") as HTMLElement | null;
        if (lineBreak) lineBreak.hidden = history.length === 0;
        setChip(turn.querySelector(".st-speaker"), currentSpeaker);
      }
      const currentEl = dynamicContent.querySelector(".st-current-text") as HTMLElement | null;
      setText(currentEl, translated);
      if (currentEl) currentEl.dataset.final = finalFlag;
      setText(dynamicContent.querySelector(".st-source-text"), source);
    }

    if (stBody) {
      if (followTail) stBody.scrollTop = stBody.scrollHeight;
      // Fade the top edge only when older lines are actually cut off.
      stBody.dataset.overflow = stBody.scrollHeight > stBody.clientHeight + 1 ? "true" : "false";
    }
  }
  if (footer) footer.textContent = status === "error" ? payload.statusHint || "" : "";
  if (errorMessage) errorMessage.textContent = payload.translatedText;
  if (errorHint) errorHint.textContent = payload.text;

  if (pauseButton) {
    pauseButton.dataset.paused = payload.isPaused ? "true" : "false";
    const pauseGlyph = payload.isPaused ? "▶" : "❚❚";
    if (pauseButton.textContent !== pauseGlyph) pauseButton.textContent = pauseGlyph;
    pauseButton.title = payload.isPaused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-label", pauseButton.title);
  }

  if (fontScaleRange) fontScaleRange.value = String(payload.fontScale ?? 100);
  if (fontScaleValue) fontScaleValue.textContent = `${payload.fontScale ?? 100}%`;

  if (opacityRange) opacityRange.value = String(payload.opacity ?? 85);
  if (opacityValue) opacityValue.textContent = `${payload.opacity ?? 85}%`;

  const sourceSwitch = root.querySelector(
    '.st-toggle-switch[data-key="source"]'
  ) as HTMLDivElement | null;
  const speakerSwitch = root.querySelector(
    '.st-toggle-switch[data-key="speaker"]'
  ) as HTMLDivElement | null;
  const autoscrollSwitch = root.querySelector(
    '.st-toggle-switch[data-key="autoscroll"]'
  ) as HTMLDivElement | null;
  if (sourceSwitch) sourceSwitch.classList.toggle("on", payload.showSource !== false);
  if (speakerSwitch) speakerSwitch.classList.toggle("on", payload.showSpeaker === true);
  if (autoscrollSwitch) autoscrollSwitch.classList.toggle("on", payload.autoScroll !== false);

  const tabs = root.querySelectorAll(".st-mode-tab");
  tabs.forEach((t) =>
    t.setAttribute(
      "data-active",
      t.getAttribute("data-mode") === (payload.displayMode || "transcript") ? "true" : "false"
    )
  );

  // Bind actions once
  if (root.dataset.actionBound !== "true") {
    root.dataset.actionBound = "true";

    const onVisibilityChange = () => {
      sendStreamMsg({
        type: "VISIBILITY_CHANGED",
        payload: { hidden: document.hidden, captureId: root?.dataset.captureId }
      });
    };
    const onFullscreenChange = () => {
      const parent = overlayHostParent();
      if (root && root.parentElement !== parent) parent.appendChild(root);
      if (root) clampRootToViewport(root);
    };
    const onWindowResize = () => {
      if (root) clampRootToViewport(root);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("resize", onWindowResize);
    overlayWindow[cleanupKey] = () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("resize", onWindowResize);
    };

    root.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".st-settings-panel") || target?.closest(".settings")) return;
      root!.dataset.settingsOpen = "false";
    });

    settingsButton?.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      event.stopPropagation();
      root!.dataset.settingsOpen = root!.dataset.settingsOpen === "true" ? "false" : "true";
    });

    root.querySelector(".st-settings-panel")?.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      event.stopPropagation();
    });

    fontScaleRange?.addEventListener("input", (event) => {
      if (!event.isTrusted) return;
      const nextValue = Number(fontScaleRange.value);
      if (fontScaleValue) fontScaleValue.textContent = `${nextValue}%`;
      sendStreamMsg({
        type: "UPDATE_OVERLAY_SETTINGS",
        payload: { fontScale: nextValue, captureId: root?.dataset.captureId }
      });
    });

    opacityRange?.addEventListener("input", (event) => {
      if (!event.isTrusted) return;
      const nextValue = Number(opacityRange.value);
      if (opacityValue) opacityValue.textContent = `${nextValue}%`;
      sendStreamMsg({
        type: "UPDATE_OVERLAY_SETTINGS",
        payload: { opacity: nextValue, captureId: root?.dataset.captureId }
      });
    });

    root
      .querySelector('.st-toggle-row[data-action="toggle-source"]')
      ?.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        const s = root!.querySelector('.st-toggle-switch[data-key="source"]');
        sendStreamMsg({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: {
            showSource: !s?.classList.contains("on"),
            captureId: root?.dataset.captureId
          }
        });
      });

    root
      .querySelector('.st-toggle-row[data-action="toggle-speaker"]')
      ?.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        const s = root!.querySelector('.st-toggle-switch[data-key="speaker"]');
        sendStreamMsg({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: {
            showSpeaker: !s?.classList.contains("on"),
            captureId: root?.dataset.captureId
          }
        });
      });

    root
      .querySelector('.st-toggle-row[data-action="toggle-autoscroll"]')
      ?.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        const s = root!.querySelector('.st-toggle-switch[data-key="autoscroll"]');
        sendStreamMsg({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: {
            autoScroll: !s?.classList.contains("on"),
            captureId: root?.dataset.captureId
          }
        });
      });

    root.querySelectorAll(".st-mode-tab").forEach((tab) => {
      tab.addEventListener("click", (event) => {
        if (!event.isTrusted) return;
        sendStreamMsg({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: {
            displayMode: tab.getAttribute("data-mode"),
            captureId: root?.dataset.captureId
          }
        });
      });
    });

    resetLayoutButton?.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      sendStreamMsg({
        type: "RESET_OVERLAY_LAYOUT",
        payload: { captureId: root?.dataset.captureId }
      });
    });

    root.querySelector(".st-btn.pause")?.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      sendStreamMsg({
        type: root?.dataset.paused === "true" ? "RESUME_TRANSLATION" : "PAUSE_TRANSLATION",
        payload: { captureId: root?.dataset.captureId }
      });
    });

    root.querySelector(".st-btn.stop")?.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      // On an error overlay the session is already stopped in the background,
      // so dismiss the overlay directly instead of waiting for the 15s timer.
      if (root?.dataset.status === "error") {
        overlayWindow[cleanupKey]?.();
        delete overlayWindow[cleanupKey];
        root.remove();
        document.getElementById(styleId)?.remove();
        return;
      }
      sendStreamMsg({
        type: "TOGGLE_TRANSLATION",
        payload: {
          active: false,
          lang: root?.dataset.targetLang || "vi",
          captureId: root?.dataset.captureId
        }
      });
    });
  }

  // Drag handler
  const dragHandle = root.querySelector(".st-header") as HTMLDivElement | null;
  if (dragHandle && root.dataset.dragBound !== "true") {
    root.dataset.dragBound = "true";

    let pointerId: number | null = null;
    let offsetX = 0;
    let offsetY = 0;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

    const saveLayout = () => {
      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const rect = root!.getBoundingClientRect();
      const bottom = Math.max(8, window.innerHeight - rect.bottom);
      // Only a size the user resized to is kept; otherwise the card keeps
      // sizing itself to the text.
      const userSized = Boolean(root!.dataset.savedWidth && root!.dataset.savedHeight);
      safeStorageSet(
        storageKey,
        JSON.stringify({
          left: Math.round(rect.left),
          bottom: Math.round(bottom),
          ...(userSized
            ? { width: Math.round(content.offsetWidth), height: Math.round(content.offsetHeight) }
            : {})
        })
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          ".st-controls, .st-btn, .st-settings-panel, .st-range, .st-toggle-switch, input, button, label"
        )
      )
        return;

      pointerId = event.pointerId;
      const rect = root!.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      root!.classList.add("is-dragging");
      root!.style.animation = "none";
      root!.style.translate = "none";
      // Pin the current spot in px so dropping the centering doesn't jump.
      root!.style.left = `${rect.left}px`;
      root!.style.bottom = `${window.innerHeight - rect.bottom}px`;
      root!.style.top = "auto";
      dragHandle.setPointerCapture(pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const maxL = Math.max(8, window.innerWidth - content.offsetWidth - 8);
      // Leave room above the card for the floating toolbar.
      const maxB = Math.max(8, window.innerHeight - root!.offsetHeight - 44);
      const newTop = event.clientY - offsetY;
      const newBottom = window.innerHeight - (newTop + root!.offsetHeight);

      root!.style.left = `${clamp(event.clientX - offsetX, 8, maxL)}px`;
      root!.style.bottom = `${clamp(newBottom, 8, maxB)}px`;
      root!.style.top = "auto";
    };

    const finishDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      root!.classList.remove("is-dragging");
      if (dragHandle.hasPointerCapture(pointerId)) dragHandle.releasePointerCapture(pointerId);
      pointerId = null;
      saveLayout();
    };

    dragHandle.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    const previousCleanup = overlayWindow[cleanupKey];
    overlayWindow[cleanupKey] = () => {
      previousCleanup?.();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }

  // Top Resize Handle Logic
  const resizer = root.querySelector(".st-resizer") as HTMLDivElement | null;
  if (resizer && root.dataset.resizeBound !== "true") {
    root.dataset.resizeBound = "true";
    let resizePointerId: number | null = null;
    let startW = 0,
      startH = 0,
      startX = 0,
      startY = 0;

    resizer.addEventListener("pointerdown", (e) => {
      if (!e.isTrusted) return;
      resizePointerId = e.pointerId;
      const content = root!.querySelector(".st-card-content") as HTMLElement;
      startW = content.offsetWidth;
      startH = content.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;
      resizer.setPointerCapture(resizePointerId);
      root!.style.animation = "none";
      e.preventDefault();
      e.stopPropagation();
    });

    resizer.addEventListener("pointermove", (e) => {
      if (resizePointerId !== e.pointerId) return;
      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const rect = root!.getBoundingClientRect();
      const deltaX = e.clientX - startX;
      const deltaY = startY - e.clientY;
      const maxW =
        root!.style.translate === "none"
          ? Math.max(280, window.innerWidth - Math.max(8, rect.left) - 8)
          : Math.max(280, window.innerWidth - 16);
      const maxH = Math.max(48, Math.min(window.innerHeight - 96, rect.bottom - 52));
      const nextW = Math.max(280, Math.min(maxW, startW + deltaX));
      const nextH = Math.max(48, Math.min(maxH, startH + deltaY));
      content.style.width = `${nextW}px`;
      content.style.height = `${nextH}px`;
      content.style.maxHeight = "calc(100vh - 96px)";
      root!.dataset.savedWidth = String(nextW);
      root!.dataset.savedHeight = String(nextH);
    });

    const endResize = (e: PointerEvent) => {
      if (resizePointerId !== e.pointerId) return;
      if (resizer.hasPointerCapture(resizePointerId)) {
        resizer.releasePointerCapture(resizePointerId);
      }
      resizePointerId = null;

      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const rect = root!.getBoundingClientRect();
      const bottom = Math.max(8, window.innerHeight - rect.bottom);
      safeStorageSet(
        storageKey,
        JSON.stringify({
          left: Math.round(rect.left),
          bottom: Math.round(bottom),
          width: Math.round(content.offsetWidth),
          height: Math.round(content.offsetHeight)
        })
      );
    };

    resizer.addEventListener("pointerup", endResize);
    resizer.addEventListener("pointercancel", endResize);
  }
}
