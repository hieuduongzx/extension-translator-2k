/**
 * Page-side rendering for the live-subtitle overlay.
 *
 * These two functions are deliberately self-contained: they are shipped to the
 * page via `chrome.scripting.executeScript({ func, args })`, which serialises
 * the function source with `.toString()` and re-evaluates it in the page
 * context. They must NOT close over any module-scope variable and must use only
 * their arguments + DOM APIs. That is also why the overlay CSS lives here as an
 * inline string literal rather than an imported constant.
 *
 * Everything in this file runs in the PAGE world, not the service worker.
 */

export type TranslationPayload = {
  text: string;
  translatedText: string;
  isFinal?: boolean;
  status?: "info" | "success" | "warning" | "error";
  isPaused?: boolean;
  fontScale?: number;
  opacity?: number;
  showSource?: boolean;
  showSpeaker?: boolean;
  targetLanguage?: string;
  statusHint?: string;
  history?: { text: string; translatedText: string }[];
  displayMode?: "transcript" | "block";
  autoScroll?: boolean;
};

export function resetOverlayLayoutOnPage() {
  const containerId = "stream-translator-overlay-root";
  const storageKey = "st-overlay-layout";
  const root = document.getElementById(containerId) as HTMLDivElement | null;

  window.localStorage.removeItem(storageKey);

  if (!root) return;

  root.style.left = "50%";
  root.style.width = "";
  root.style.height = "";
  const content = root.querySelector(".st-card-content") as HTMLDivElement | null;
  if (content) {
    content.style.width = "";
    content.style.height = "";
  }
}

export function renderOverlayOnPage(payload: TranslationPayload | null) {
  const containerId = "stream-translator-overlay-root";
  const styleId = "stream-translator-overlay-style";
  const storageKey = "st-overlay-layout";

  if (!payload) {
    document.getElementById(containerId)?.remove();
    document.getElementById(styleId)?.remove();
    return;
  }

  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.documentElement.appendChild(style);
  }

  style.textContent = `
    @keyframes st-slide-up { from { opacity:0; transform:translateY(20px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
    @keyframes st-pulse-dot { 0%,100% { opacity:1; } 50% { opacity:.4; } }
    @keyframes st-settings-in { from { opacity:0; transform:translateY(6px) scale(.96); } to { opacity:1; transform:translateY(0) scale(1); } }

    #${containerId} {
      position:fixed; left:50%; bottom:48px; transform:translateX(-50%);
      z-index:2147483647;
      font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      pointer-events:auto; user-select:none;
      animation:st-slide-up .45s cubic-bezier(.16,1,.3,1) both;
      --st-t-size:26px; --st-s-size:13px;
    }
    #${containerId}.is-dragging { transition:none !important; animation:none !important; }

    /* ─── Main Card ─── */
    #${containerId} .st-card {
      position: relative;
      display: flex;
    }

    #${containerId} .st-card-content {
      border-radius:20px;
      border:1px solid rgba(255,255,255,.1);
      background:rgba(15,15,22,var(--st-bg-opacity, 0.88));
      box-shadow:0 24px 80px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04) inset;
      backdrop-filter:blur(24px) saturate(160%);
      -webkit-backdrop-filter:blur(24px) saturate(160%);
      overflow:hidden;
      width:min(640px, calc(100vw - 32px)); min-width:300px;
      height:140px;
      max-height:calc(100vh - 64px);
      display:flex; flex-direction:column;
      flex:1;
    }

    #${containerId} .st-resizer {
      position: absolute; top:0; right:0; width:20px; height:20px;
      cursor:ne-resize; z-index: 10;
    }
    #${containerId} .st-resizer::after {
      content: ""; position:absolute; top:8px; right:8px;
      width:8px; height:8px; border-top:2px solid rgba(255,255,255,.4); border-right:2px solid rgba(255,255,255,.4);
      border-radius: 0 2px 0 0;
    }
    #${containerId} .st-resizer:hover::after { border-color: rgba(255,255,255,.8); }

    /* ─── Header / Drag Bar ─── */
    #${containerId} .st-header {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:6px 12px; cursor:grab; touch-action:none;
      border-top:1px solid rgba(255,255,255,.06);
      background:rgba(255,255,255,.02);
      transition:background .2s;
    }
    #${containerId} .st-header:hover { background:rgba(255,255,255,.04); }
    #${containerId} .st-header:active { cursor:grabbing; }

    #${containerId} .st-header-left {
      display:flex; align-items:center; gap:10px; min-width:0; flex:1;
    }

    /* Drag grip dots */
    #${containerId} .st-grip {
      display:grid; grid-template-columns:repeat(2,4px); gap:3px;
      opacity:.35; transition:opacity .2s;
    }
    #${containerId} .st-header:hover .st-grip { opacity:.65; }
    #${containerId} .st-grip-dot {
      width:4px; height:4px; border-radius:50%; background:rgba(255,255,255,.7);
    }

    /* Status badge */
    #${containerId} .st-badge {
      padding:2px 8px; border-radius:999px;
      font-size:9.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
      line-height:1.1; white-space:nowrap;
    }
    #${containerId} .st-badge.info { background:rgba(20,184,166,.18); color:#99f6e4; }
    #${containerId} .st-badge.success { background:rgba(34,197,94,.15); color:#86efac; }
    #${containerId} .st-badge.success::before {
      content:""; display:inline-block; width:6px; height:6px; border-radius:50%;
      background:#22c55e; margin-right:6px; vertical-align:middle;
      animation:st-pulse-dot 1.8s ease-in-out infinite;
    }
    #${containerId} .st-badge.warning { background:rgba(245,158,11,.15); color:#fcd34d; }
    #${containerId} .st-badge.error { background:rgba(239,68,68,.15); color:#fca5a5; }
    #${containerId}[data-paused="true"] .st-badge.success { background:rgba(251,191,36,.15); color:#fcd34d; }
    #${containerId}[data-paused="true"] .st-badge.success::before { background:#f59e0b; animation:none; }

    #${containerId} .st-lang {
      font-size:11px; font-weight:600; letter-spacing:.03em; text-transform:uppercase;
      color:rgba(255,255,255,.45); white-space:nowrap;
    }

    /* ─── Controls ─── */
    #${containerId} .st-controls { display:flex; align-items:center; gap:2px; }

    #${containerId} .st-btn {
      display:inline-flex; align-items:center; justify-content:center;
      width:26px; height:26px; border:none; border-radius:6px;
      background:transparent; color:rgba(255,255,255,.55); cursor:pointer;
      font-size:12px; line-height:1; padding:0;
      transition:all .18s ease;
    }
    #${containerId} .st-btn:hover { background:rgba(255,255,255,.08); color:#fff; }
    #${containerId} .st-btn:active { transform:scale(.92); }
    #${containerId} .st-btn.stop { color:rgba(248,113,113,.8); }
    #${containerId} .st-btn.stop:hover { background:rgba(239,68,68,.12); color:#f87171; }
    #${containerId} .st-btn.pause[data-paused="true"] { color:#fbbf24; }
    #${containerId} .st-btn.settings[data-open="true"] { background:rgba(255,255,255,.08); color:#fff; }

    #${containerId} .st-sep {
      width:1px; height:14px; background:rgba(255,255,255,.08); margin:0 4px;
    }

    /* ─── Settings Panel ─── */
    #${containerId} .st-settings-panel {
      display:none; position:absolute; right:12px; bottom:calc(100% + 8px);
      width:264px; padding:16px; border-radius:16px;
      border:1px solid rgba(255,255,255,.1);
      background:linear-gradient(180deg,rgba(20,20,28,.97),rgba(14,14,20,.98));
      box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset;
      backdrop-filter:blur(20px);
      animation:st-settings-in .25s cubic-bezier(.16,1,.3,1) both;
      pointer-events:auto; color:#e2e8f0;
    }
    #${containerId}[data-settings-open="true"] .st-settings-panel { display:block; }
    #${containerId}[data-settings-open="true"] .st-btn.settings { background:rgba(255,255,255,.08); color:#fff; }

    #${containerId} .st-settings-title {
      font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
      color:rgba(255,255,255,.5); margin-bottom:16px;
    }

    #${containerId} .st-setting-row {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      font-size:13px; font-weight:500; color:rgba(255,255,255,.8);
      margin-bottom:14px; cursor:default;
    }
    #${containerId} .st-setting-row:last-child { margin-bottom:0; }

    #${containerId} .st-value {
      font-size:12px; font-weight:600; color:rgba(255,255,255,.5);
      font-variant-numeric:tabular-nums; min-width:40px; text-align:right;
    }

    #${containerId} .st-range {
      width:100%; height:5px; -webkit-appearance:none; appearance:none;
      background:rgba(255,255,255,.08); border-radius:3px; outline:none;
      cursor:pointer; margin:8px 0 4px;
    }
    #${containerId} .st-range::-webkit-slider-thumb {
      -webkit-appearance:none; width:16px; height:16px;
      background:#fff; border-radius:50%; cursor:pointer;
      box-shadow:0 1px 6px rgba(0,0,0,.4);
      transition:transform .15s;
    }
    #${containerId} .st-range::-webkit-slider-thumb:hover { transform:scale(1.15); }

    #${containerId} .st-toggle-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 0; cursor:pointer; font-size:13px; font-weight:500;
      color:rgba(255,255,255,.8);
    }
    #${containerId} .st-toggle-switch {
      position:relative; width:36px; height:20px; border-radius:10px;
      background:rgba(255,255,255,.12); transition:background .25s; cursor:pointer;
    }
    #${containerId} .st-toggle-switch.on { background:#14b8a6; }
    #${containerId} .st-toggle-knob {
      position:absolute; top:2px; left:2px; width:16px; height:16px;
      border-radius:50%; background:#fff;
      box-shadow:0 1px 3px rgba(0,0,0,.25);
      transition:transform .25s cubic-bezier(.16,1,.3,1);
    }
    #${containerId} .st-toggle-switch.on .st-toggle-knob { transform:translateX(16px); }

    #${containerId} .st-settings-divider {
      height:1px; background:rgba(255,255,255,.06); margin:12px 0;
    }

    #${containerId} .st-reset-btn {
      width:100%; padding:9px 12px; border:1px solid rgba(255,255,255,.1);
      background:rgba(255,255,255,.04); color:rgba(255,255,255,.7);
      border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;
      transition:all .2s;
    }
    #${containerId} .st-reset-btn:hover { background:rgba(255,255,255,.1); color:#fff; }

    /* ─── Body / Subtitle Area ─── */
    #${containerId} .st-body {
      padding:16px 20px 20px; display:grid; align-content:center; justify-items:center;
      min-height:60px;
      flex:1; overflow-y:auto; overflow-x:hidden;
      scrollbar-width:none; -ms-overflow-style:none;
    }
    #${containerId} .st-body::-webkit-scrollbar { display:none; }
    #${containerId} .st-copy { width:100%; }

    /* ─── Transcript Area ─── */
    #${containerId} .st-transcript {
      font-size:var(--st-t-size); line-height:1.45; font-weight:500;
      color:rgba(255,255,255,.9); text-align:left;
      text-shadow:0 2px 20px rgba(0,0,0,.4);
      word-break:break-word; letter-spacing:-.01em;
    }
    #${containerId} .st-history-text { color:#fff; font-weight:700; transition: color 0.3s ease; }
    #${containerId} .st-current-text { color:rgba(255,255,255,.55); font-weight:600; transition: color 0.3s ease; }
    #${containerId} .st-current-text[data-final="true"] { color:#fff; font-weight:700; }
    #${containerId} .st-source-text {
      display:block; margin-top:8px;
      color:rgba(255,255,255,.4); font-style:italic; font-size:0.85em;
      line-height:1.4; text-align:left; text-shadow:0 2px 20px rgba(0,0,0,.4);
    }
    #${containerId} .st-history-text,
    #${containerId} .st-current-text,
    #${containerId} .st-source-text,
    #${containerId} .st-translation,
    #${containerId} .st-source,
    #${containerId} .st-history-translation { white-space:pre-wrap; }
    #${containerId}[data-show-source="false"] .st-source-text { display:none; }

    /* ─── Mode Tabs ─── */
    #${containerId} .st-mode-tabs {
      display:flex; background:rgba(255,255,255,.05); border-radius:8px; padding:3px; margin-top:6px;
    }
    #${containerId} .st-mode-tab {
      flex:1; text-align:center; padding:6px; font-size:12px; font-weight:600;
      color:rgba(255,255,255,.5); cursor:pointer; border-radius:6px; transition:all .2s;
    }
    #${containerId} .st-mode-tab[data-active="true"] {
      background:rgba(255,255,255,.15); color:#fff;
    }

    /* ─── Block Area ─── */
    #${containerId} .st-translation {
      font-size:var(--st-t-size); line-height:1.35; font-weight:600;
      color:rgba(255,255,255,.55); text-align:center; text-wrap:balance;
      text-shadow:0 2px 20px rgba(0,0,0,.3);
      word-break:break-word; letter-spacing:-.01em;
      transition: color 0.3s ease, font-weight 0.3s ease;
    }
    #${containerId} .st-translation[data-final="true"] {
      font-weight:700;
      color:#fff;
    }
    #${containerId} .st-source {
      font-size:var(--st-s-size); line-height:1.5; font-weight:500;
      color:rgba(255,255,255,.4); text-align:center;
      margin-top:6px; word-break:break-word;
    }
    #${containerId}[data-show-source="false"] .st-source { display:none; }

    #${containerId} .st-history { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
    #${containerId} .st-history-item { display: flex; flex-direction: column; align-items: center; }
    #${containerId} .st-history-translation {
      font-size: calc(var(--st-t-size) * 0.8); line-height: 1.35; font-weight: 600;
      color: rgba(255,255,255,.55); text-align: center; text-wrap: balance; text-shadow: 0 2px 20px rgba(0,0,0,.3);
      word-break: break-word; letter-spacing: -.01em;
      transition: color 0.3s ease, font-weight 0.3s ease;
    }
    #${containerId} .st-history-last .st-history-translation {
      color: #fff; font-weight: 700;
    }

    /* ─── Error State ─── */
    #${containerId} .st-error {
      display:none; margin-top:16px; padding:14px 18px;
      border-radius:14px; border:1px solid rgba(248,113,113,.2);
      background:rgba(127,29,29,.25); text-align:left;
    }
    #${containerId}[data-status="error"] .st-error { display:block; }
    #${containerId}[data-status="error"] .st-transcript,
    #${containerId}[data-status="error"] .st-translation,
    #${containerId}[data-status="error"] .st-source,
    #${containerId}[data-status="error"] .st-history { display:none; }

    #${containerId} .st-error-title {
      display:flex; align-items:center; gap:6px;
      font-size:11px; font-weight:700; letter-spacing:.05em;
      text-transform:uppercase; color:#fca5a5;
    }
    #${containerId} .st-error-title::before {
      content:"⚠"; font-size:13px;
    }
    #${containerId} .st-error-message {
      margin-top:8px; font-size:14px; line-height:1.5; color:#fef2f2; word-break:break-word;
    }
    #${containerId} .st-error-hint {
      margin-top:6px; font-size:13px; line-height:1.5; color:rgba(254,226,226,.75); word-break:break-word;
    }

    #${containerId} .st-footer {
      display:none; margin-top:10px; font-size:11px;
      color:rgba(255,255,255,.4); text-align:center;
    }
    #${containerId}[data-show-footer="true"] .st-footer { display:block; }
  `;

  let root = document.getElementById(containerId) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = containerId;
    document.documentElement.appendChild(root);

    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const layout = JSON.parse(saved) as {
          left?: number;
          top?: number;
          bottom?: number;
          width?: number;
          height?: number;
        };
        if (typeof layout.left === "number") {
          root.style.left = `${layout.left}px`;
          root.style.transform = "none";
          if (typeof layout.bottom === "number") {
            root.style.bottom = `${layout.bottom}px`;
            root.style.top = "auto";
          } else if (typeof layout.top === "number") {
            root.style.bottom = `${Math.max(8, window.innerHeight - (layout.top + (layout.height || 0)))}px`;
            root.style.top = "auto";
          }
        }
        root.dataset.savedWidth = String(layout.width);
        root.dataset.savedHeight = String(layout.height);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
  }

  const status = payload.status ?? "info";
  const badgeLabel = payload.isPaused
    ? "Paused"
    : status === "warning"
      ? "Setup"
      : status === "error"
        ? "Error"
        : status === "success"
          ? "Live"
          : "Listening";

  if (!root.querySelector(".st-card")) {
    root.innerHTML = `
      <div class="st-card">
        <div class="st-settings-panel">
          <div class="st-settings-title">Overlay Settings</div>
          <label class="st-setting-row">
            <span>Font size</span>
            <span class="st-value font-val"></span>
          </label>
          <input class="st-range font-range" type="range" min="30" max="180" step="5" />
          <label class="st-setting-row" style="margin-top:10px;">
            <span>Background opacity</span>
            <span class="st-value opacity-val"></span>
          </label>
          <input class="st-range opacity-range" type="range" min="10" max="100" step="5" />
          <div class="st-settings-divider"></div>
          <div class="st-toggle-row" data-action="toggle-source">
            <span>Show original text</span>
            <div class="st-toggle-switch" data-key="source"><div class="st-toggle-knob"></div></div>
          </div>
          <div class="st-toggle-row" data-action="toggle-speaker" style="margin-top:10px;">
            <span>Show speakers</span>
            <div class="st-toggle-switch" data-key="speaker"><div class="st-toggle-knob"></div></div>
          </div>
          <div class="st-toggle-row" data-action="toggle-autoscroll" style="margin-top:10px;">
            <span>Auto-focus newest text</span>
            <div class="st-toggle-switch" data-key="autoscroll"><div class="st-toggle-knob"></div></div>
          </div>
          <div class="st-settings-divider"></div>
          <div class="st-setting-row" style="margin-bottom:0;"><span>Display Mode</span></div>
          <div class="st-mode-tabs">
            <div class="st-mode-tab" data-mode="transcript">Transcript</div>
            <div class="st-mode-tab" data-mode="block">Sentence</div>
          </div>
          <div class="st-settings-divider"></div>
          <button class="st-reset-btn st-reset-layout" type="button">Reset position</button>
        </div>
        <div class="st-card-content">
          <div class="st-resizer"></div>
          <div class="st-body">
          <div class="st-copy">
            <div class="st-dynamic-content"></div>
            <div class="st-footer"></div>
            <div class="st-error">
              <div class="st-error-title">Translation Error</div>
              <div class="st-error-message"></div>
              <div class="st-error-hint"></div>
            </div>
          </div>
          </div>
          <div class="st-header">
            <div class="st-header-left">
              <div class="st-grip"><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div><div class="st-grip-dot"></div></div>
              <div class="st-badge"></div>
              <div class="st-lang"></div>
            </div>
            <div class="st-controls">
              <button class="st-btn settings" type="button" title="Settings" aria-label="Settings">⚙</button>
              <div class="st-sep"></div>
              <button class="st-btn pause" type="button" title="Pause" aria-label="Pause">❚❚</button>
              <button class="st-btn stop" type="button" title="Stop" aria-label="Stop">■</button>
            </div>
          </div>
        </div>
    `;

    if (root.dataset.savedWidth && root.dataset.savedWidth !== "undefined") {
      const content = root.querySelector(".st-card-content") as HTMLDivElement;
      content.style.width = `${root.dataset.savedWidth}px`;
      content.style.height = `${root.dataset.savedHeight}px`;
    }
  }

  root.dataset.status = status;
  root.dataset.paused = payload.isPaused ? "true" : "false";
  root.dataset.targetLang = payload.targetLanguage || "vi";
  root.dataset.showSource = payload.showSource === false ? "false" : "true";
  root.dataset.showSpeaker = payload.showSpeaker === true ? "true" : "false";
  root.dataset.showFooter = status === "error" && payload.statusHint ? "true" : "false";

  const scale = (payload.fontScale ?? 100) / 100;
  root.style.setProperty("--st-t-size", `${Math.round(26 * scale)}px`);
  root.style.setProperty("--st-s-size", `${Math.round(13 * scale)}px`);

  const opacityRatio = (payload.opacity ?? 85) / 100;
  root.style.setProperty("--st-bg-opacity", String(opacityRatio));

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
    // Transcribed/translated text comes from an untrusted source (live audio),
    // so escape it before interpolating into innerHTML. Defined inline because
    // this function is serialized and injected into the page via executeScript.
    const esc = (value: string) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    let html = "";
    if (payload.displayMode === "block") {
      const history = payload.history || [];
      const historyHtml = history
        .map(
          (item, idx) => `
        <div class="st-history-item ${idx === history.length - 1 ? "st-history-last" : ""}">
          <div class="st-history-translation">${esc(item.translatedText)}</div>
        </div>
      `
        )
        .join("");
      let currentHtml = "";
      if (payload.translatedText)
        currentHtml += `<div class="st-translation" data-final="${payload.isFinal ? "true" : "false"}">${esc(payload.translatedText)}</div>`;
      if (payload.text) currentHtml += `<div class="st-source">${esc(payload.text)}</div>`;
      html = `<div class="st-history">${historyHtml}</div>${currentHtml}`;
    } else {
      const historyText = (payload.history || []).map((i) => i.translatedText).join(" ");
      let currentHtml = "";
      if (payload.translatedText)
        currentHtml += `<span class="st-current-text" data-final="${payload.isFinal ? "true" : "false"}">${esc(payload.translatedText)}</span>`;
      else if (payload.text)
        currentHtml += `<span class="st-source-text">${esc(payload.text)}</span>`;
      // Show the original line beneath the translation when both exist, gated by
      // the "show source" toggle via the [data-show-source] CSS rule.
      const sourceLine =
        payload.translatedText && payload.text
          ? `<span class="st-source-text">${esc(payload.text)}</span>`
          : "";
      html = `<div class="st-transcript"><span class="st-history-text">${historyText ? esc(historyText) + " " : ""}</span>${currentHtml}${sourceLine}</div>`;
    }
    dynamicContent.innerHTML = html;

    const stBody = root.querySelector(".st-body") as HTMLDivElement | null;
    if (stBody && payload.autoScroll !== false) {
      stBody.scrollTop = stBody.scrollHeight;
    }
  }
  if (footer) footer.textContent = status === "error" ? payload.statusHint || "" : "";
  if (errorMessage) errorMessage.textContent = payload.translatedText;
  if (errorHint) errorHint.textContent = payload.text;

  if (pauseButton) {
    pauseButton.dataset.paused = payload.isPaused ? "true" : "false";
    pauseButton.innerHTML = payload.isPaused ? "▶" : "❚❚";
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

    document.addEventListener("visibilitychange", () => {
      void chrome.runtime.sendMessage({
        type: "VISIBILITY_CHANGED",
        payload: { hidden: document.hidden }
      });
    });

    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".st-settings-panel") || target?.closest(".settings")) return;
      root!.dataset.settingsOpen = "false";
    });

    settingsButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      root!.dataset.settingsOpen = root!.dataset.settingsOpen === "true" ? "false" : "true";
    });

    root.querySelector(".st-settings-panel")?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    fontScaleRange?.addEventListener("input", () => {
      const nextValue = Number(fontScaleRange.value);
      if (fontScaleValue) fontScaleValue.textContent = `${nextValue}%`;
      void chrome.runtime.sendMessage({
        type: "UPDATE_OVERLAY_SETTINGS",
        payload: { fontScale: nextValue }
      });
    });

    opacityRange?.addEventListener("input", () => {
      const nextValue = Number(opacityRange.value);
      if (opacityValue) opacityValue.textContent = `${nextValue}%`;
      void chrome.runtime.sendMessage({
        type: "UPDATE_OVERLAY_SETTINGS",
        payload: { opacity: nextValue }
      });
    });

    root
      .querySelector('.st-toggle-row[data-action="toggle-source"]')
      ?.addEventListener("click", () => {
        const s = root!.querySelector('.st-toggle-switch[data-key="source"]');
        void chrome.runtime.sendMessage({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: { showSource: !s?.classList.contains("on") }
        });
      });

    root
      .querySelector('.st-toggle-row[data-action="toggle-speaker"]')
      ?.addEventListener("click", () => {
        const s = root!.querySelector('.st-toggle-switch[data-key="speaker"]');
        void chrome.runtime.sendMessage({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: { showSpeaker: !s?.classList.contains("on") }
        });
      });

    root
      .querySelector('.st-toggle-row[data-action="toggle-autoscroll"]')
      ?.addEventListener("click", () => {
        const s = root!.querySelector('.st-toggle-switch[data-key="autoscroll"]');
        void chrome.runtime.sendMessage({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: { autoScroll: !s?.classList.contains("on") }
        });
      });

    root.querySelectorAll(".st-mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        void chrome.runtime.sendMessage({
          type: "UPDATE_OVERLAY_SETTINGS",
          payload: { displayMode: tab.getAttribute("data-mode") }
        });
      });
    });

    resetLayoutButton?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "RESET_OVERLAY_LAYOUT" });
    });

    root.querySelector(".st-btn.pause")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({
        type: root?.dataset.paused === "true" ? "RESUME_TRANSLATION" : "PAUSE_TRANSLATION"
      });
    });

    root.querySelector(".st-btn.stop")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({
        type: "TOGGLE_TRANSLATION",
        payload: { active: false, lang: root?.dataset.targetLang || "vi" }
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
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

    const saveLayout = () => {
      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const bottom = Math.max(8, window.innerHeight - (root!.offsetTop + root!.offsetHeight));
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          left: Math.round(root!.offsetLeft),
          bottom: Math.round(bottom),
          width: Math.round(content.offsetWidth),
          height: Math.round(content.offsetHeight)
        })
      );
    };

    const onPointerDown = (event: PointerEvent) => {
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
      root!.style.transform = "none";
      dragHandle.setPointerCapture(pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const maxL = Math.max(8, window.innerWidth - content.offsetWidth - 8);
      const maxB = Math.max(8, window.innerHeight - root!.offsetHeight - 8);
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

    // Debounced resize save
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(saveLayout, 300);
      });
      observer.observe(root);
    }
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
      const deltaX = e.clientX - startX;
      const deltaY = startY - e.clientY;
      const nextW = Math.max(300, Math.min(window.innerWidth - 16, startW + deltaX));
      const nextH = Math.max(80, startH + deltaY);
      content.style.width = `${nextW}px`;
      content.style.height = `${nextH}px`;
      root!.dataset.savedWidth = String(nextW);
      root!.dataset.savedHeight = String(nextH);
    });

    const endResize = (e: PointerEvent) => {
      if (resizePointerId !== e.pointerId) return;
      resizer.releasePointerCapture(resizePointerId);
      resizePointerId = null;

      const content = root!.querySelector(".st-card-content") as HTMLElement;
      const bottom = Math.max(8, window.innerHeight - (root!.offsetTop + root!.offsetHeight));
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          left: Math.round(root!.offsetLeft),
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
