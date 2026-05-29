import { STYLE_ELEMENT_ID } from "./constants";

const STYLES = `
.wt-bilingual-line {
  display: block;
  margin-top: 0.25em;
  padding: 0.15em 0.4em;
  font-size: 0.95em;
  line-height: 1.45;
  color: rgb(37, 99, 235);
  background: rgba(37, 99, 235, 0.06);
  border-left: 3px solid rgba(37, 99, 235, 0.45);
  border-radius: 4px;
  font-family: inherit;
  font-style: normal;
  font-weight: inherit;
  white-space: normal;
  unicode-bidi: isolate;
}

.wt-bilingual-inline {
  display: inline;
  margin-left: 0.35em;
  padding: 0 0.3em;
  font-size: 0.92em;
  color: rgb(37, 99, 235);
  background: rgba(37, 99, 235, 0.08);
  border-radius: 3px;
  font-style: normal;
  unicode-bidi: isolate;
}

.wt-error-banner {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  max-width: 360px;
  padding: 10px 14px;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: auto;
}

.wt-error-banner button {
  margin-left: 8px;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-weight: 600;
}

/* ===== Selection popup (compact) ===== */
.wt-selection-popup {
  --wt-bg: #1c1f24;
  --wt-fg: #e7eaee;
  --wt-muted: #9aa3ad;
  --wt-border: rgba(255, 255, 255, 0.08);
  --wt-toolbar-bg: #1c1f24;
  --wt-icon: #cfd5dc;
  --wt-icon-hover-bg: rgba(255, 255, 255, 0.08);
  --wt-divider: rgba(255, 255, 255, 0.08);
  --wt-source-bg: rgba(255, 255, 255, 0.04);
  --wt-shadow: 0 18px 40px rgba(0, 0, 0, 0.45),
    0 4px 12px rgba(0, 0, 0, 0.25);
  --wt-error: #f87171;
  --wt-error-bg: rgba(248, 113, 113, 0.12);
  --wt-scroll-thumb: rgba(255, 255, 255, 0.16);
  --wt-scroll-thumb-hover: rgba(255, 255, 255, 0.28);

  position: absolute;
  z-index: 2147483647;
  width: 460px;
  max-width: calc(100vw - 24px);
  background: var(--wt-bg);
  color: var(--wt-fg);
  border: 1px solid var(--wt-border);
  border-radius: 14px;
  box-shadow: var(--wt-shadow);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter,
    system-ui, sans-serif;
  overflow: hidden;
  animation: wt-fade-in 130ms ease-out;
  display: flex;
  flex-direction: column;
}

.wt-selection-popup[data-theme="light"] {
  --wt-bg: #ffffff;
  --wt-fg: #1c1f24;
  --wt-muted: #6b7280;
  --wt-border: rgba(0, 0, 0, 0.08);
  --wt-toolbar-bg: #ffffff;
  --wt-icon: #4b5563;
  --wt-icon-hover-bg: rgba(0, 0, 0, 0.06);
  --wt-divider: rgba(0, 0, 0, 0.08);
  --wt-source-bg: rgba(0, 0, 0, 0.03);
  --wt-shadow: 0 18px 40px rgba(0, 0, 0, 0.12),
    0 4px 12px rgba(0, 0, 0, 0.08);
  --wt-error: #b91c1c;
  --wt-error-bg: #fef2f2;
  --wt-scroll-thumb: rgba(0, 0, 0, 0.14);
  --wt-scroll-thumb-hover: rgba(0, 0, 0, 0.26);
}

@keyframes wt-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ----- Toolbar ----- */
.wt-sp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--wt-toolbar-bg);
  border-bottom: 1px solid var(--wt-divider);
}

.wt-sp-toolbar-start {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  justify-content: flex-start;
}

.wt-sp-toolbar-end {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.wt-sp-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--wt-icon);
  cursor: pointer;
  border-radius: 8px;
  padding: 0;
  transition: background 120ms ease, color 120ms ease;
}
.wt-sp-icon-btn:hover {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
}
.wt-sp-icon-btn:active { transform: translateY(0.5px); }
.wt-sp-icon-btn[aria-expanded="true"] {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
}
.wt-sp-icon-btn svg {
  width: 16px;
  height: 16px;
  display: block;
}
.wt-sp-icon-btn[hidden] { display: none !important; }

/* ----- Body ----- */
.wt-sp-body {
  padding: 14px 16px 16px;
  max-height: 60vh;
  overflow: auto;
}

/* Themed slim scrollbars for every scrollable surface inside the popup. */
.wt-sp-body,
.wt-sp-source,
.wt-dict-body {
  scrollbar-width: thin;
  scrollbar-color: var(--wt-scroll-thumb) transparent;
}
.wt-sp-body::-webkit-scrollbar,
.wt-sp-source::-webkit-scrollbar,
.wt-dict-body::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}
.wt-sp-body::-webkit-scrollbar-track,
.wt-sp-source::-webkit-scrollbar-track,
.wt-dict-body::-webkit-scrollbar-track {
  background: transparent;
}
.wt-sp-body::-webkit-scrollbar-thumb,
.wt-sp-source::-webkit-scrollbar-thumb,
.wt-dict-body::-webkit-scrollbar-thumb {
  background: var(--wt-scroll-thumb);
  border-radius: 999px;
}
.wt-sp-body::-webkit-scrollbar-thumb:hover,
.wt-sp-source::-webkit-scrollbar-thumb:hover,
.wt-dict-body::-webkit-scrollbar-thumb:hover {
  background: var(--wt-scroll-thumb-hover);
}

.wt-sp-source {
  font-size: 13px;
  color: var(--wt-muted);
  background: var(--wt-source-bg);
  border-radius: 8px;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  margin-bottom: 10px;
  max-height: 120px;
  overflow: auto;
}

.wt-sp-divider {
  display: none;
}

.wt-sp-result {
  font-size: 14px;
  color: var(--wt-fg);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
  font-weight: 400;
}

.wt-sp-result.wt-loading {
  color: var(--wt-muted);
  font-style: italic;
}

.wt-sp-result.wt-error {
  color: var(--wt-error);
  background: var(--wt-error-bg);
  border-radius: 8px;
  padding: 8px 10px;
}

.wt-sp-status {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--wt-muted);
  text-align: right;
}
.wt-sp-status[hidden] { display: none; }

/* ----- On-demand AI translation section ----- */
.wt-sp-ai {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--wt-divider);
}
.wt-sp-ai[hidden] { display: none; }

.wt-sp-ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.wt-sp-ai-label {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #a78bfa;
}

.wt-sp-ai-copy {
  width: 26px;
  height: 26px;
}
.wt-sp-ai-copy svg { width: 14px; height: 14px; }

.wt-sp-ai-result {
  font-size: 14px;
  color: var(--wt-fg);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
  font-weight: 400;
}
.wt-sp-ai-result.wt-loading {
  color: var(--wt-muted);
  font-style: italic;
}
.wt-sp-ai-result.wt-error {
  color: var(--wt-error);
  background: var(--wt-error-bg);
  border-radius: 8px;
  padding: 8px 10px;
}

/* ----- Provider menu ----- */
.wt-sp-provider {
  position: relative;
}

.wt-sp-provider-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 180px;
  background: var(--wt-bg);
  border: 1px solid var(--wt-border);
  border-radius: 10px;
  box-shadow: var(--wt-shadow);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  z-index: 2;
  animation: wt-fade-in 100ms ease-out;
}
.wt-sp-provider-menu[hidden] { display: none !important; }

.wt-sp-provider-heading {
  padding: 6px 8px 4px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wt-muted);
}

.wt-sp-provider-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 12.5px;
  color: var(--wt-fg);
}
.wt-sp-provider-option:hover { background: var(--wt-icon-hover-bg); }
.wt-sp-provider-option[aria-selected="true"] {
  font-weight: 600;
}

.wt-sp-provider-check {
  width: 14px;
  display: inline-block;
  text-align: center;
  color: #60a5fa;
}
.wt-sp-provider-option:not([aria-selected="true"]) .wt-sp-provider-check {
  color: transparent;
}

/* ===== Floating selection trigger ===== */
.wt-selection-trigger {
  position: absolute;
  z-index: 2147483646;
  width: 22px;
  height: 22px;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: #ffffff;
  color: #2563eb;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 7px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18),
    0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui,
    sans-serif;
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  animation: wt-trigger-in 120ms ease-out;
}
.wt-selection-trigger:hover {
  background: #f8fafc;
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22),
    0 2px 4px rgba(0, 0, 0, 0.1);
}
.wt-selection-trigger:active { transform: translateY(0); }
.wt-selection-trigger svg {
  width: 13px;
  height: 13px;
  display: block;
}

@keyframes wt-trigger-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== Dictionary popup ===== */
.wt-dict-popup .wt-dict-body {
  padding: 14px 18px 18px;
  font-size: 13.5px;
}

.wt-dict-loading {
  color: var(--wt-muted);
  font-style: italic;
  padding: 4px 0;
}

.wt-dict-error {
  color: var(--wt-error);
  background: var(--wt-error-bg);
  border-radius: 8px;
  padding: 10px 12px;
}

.wt-dict-empty {
  color: var(--wt-muted);
  padding: 4px 0;
}

.wt-dict-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.wt-dict-word {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--wt-fg);
}

.wt-dict-phonetic {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 13px;
  color: var(--wt-muted);
}

.wt-dict-source {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--wt-muted);
  background: var(--wt-source-bg);
  border: 1px solid var(--wt-border);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}

.wt-dict-meaning {
  margin-top: 10px;
}

.wt-dict-pos {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wt-muted);
  border-bottom: 1px solid var(--wt-divider);
  padding-bottom: 4px;
  margin-bottom: 6px;
  font-style: italic;
}

.wt-dict-defs {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wt-dict-def {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--wt-fg);
  line-height: 1.55;
}

.wt-dict-def-num {
  color: var(--wt-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 18px;
  padding-top: 1px;
}

.wt-dict-def-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wt-dict-def-en {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--wt-fg);
}

.wt-dict-def-en > span {
  flex: 1;
  min-width: 0;
}

.wt-dict-def-vi {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--wt-fg);
  font-weight: 500;
}

.wt-dict-example {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--wt-muted);
  font-style: italic;
  font-size: 12.5px;
  line-height: 1.5;
  margin-top: 2px;
}

.wt-dict-example-vi {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--wt-muted);
  font-style: italic;
  font-size: 12.5px;
  line-height: 1.5;
}

.wt-dict-quote {
  flex: 1;
  min-width: 0;
}

.wt-dict-speak {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-top: 2px;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: transparent;
  border: 0;
  color: var(--wt-muted);
  cursor: pointer;
  opacity: 0.65;
  transition: background 100ms ease, color 100ms ease, opacity 100ms ease;
}
.wt-dict-speak:hover {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
  opacity: 1;
}
.wt-dict-speak .wt-dict-speak-icon {
  width: 13px;
  height: 13px;
  display: block;
}

.wt-dict-sep {
  border: 0;
  border-top: 1px solid var(--wt-divider);
  margin: 14px 0;
}

.wt-dict-syn {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.wt-dict-syn-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wt-muted);
  margin-right: 2px;
}

.wt-dict-chip {
  font: inherit;
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--wt-border);
  background: var(--wt-source-bg);
  color: var(--wt-fg);
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.wt-dict-chip:hover {
  background: var(--wt-icon-hover-bg);
  border-color: transparent;
}
`;

export function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}

export function removeStyles(): void {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}
