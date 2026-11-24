import { STYLE_ELEMENT_ID } from "./constants";

const STYLES = `
/*
 * Bilingual text inherits the page's own text color slightly muted
 * (color-mix with currentColor) so it always contrasts on both light and dark
 * websites. Uses a uniform 1px 4-side border + soft tinted surface (zero
 * thick border-left bars).
 */
.wt-bilingual-line {
  display: block;
  margin-top: 0.4em;
  margin-bottom: 0.3em;
  padding: 0.32em 0.68em;
  font-size: 0.92em;
  line-height: 1.58;
  color: color-mix(in srgb, currentColor 82%, transparent);
  background: color-mix(in srgb, #14b8a6 6%, color-mix(in srgb, currentColor 3%, transparent));
  border: 1px solid color-mix(in srgb, #14b8a6 26%, color-mix(in srgb, currentColor 14%, transparent));
  border-radius: 6px;
  font-family: "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
  font-weight: 400;
  white-space: normal;
  unicode-bidi: isolate;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.wt-bilingual-line:hover {
  background: color-mix(in srgb, #14b8a6 10%, color-mix(in srgb, currentColor 3%, transparent));
  border-color: color-mix(in srgb, #14b8a6 42%, color-mix(in srgb, currentColor 14%, transparent));
}

.wt-bilingual-inline {
  display: inline;
  margin: 0 0.18em 0 0.32em;
  padding: 0.06em 0.38em;
  font-size: 0.9em;
  color: color-mix(in srgb, currentColor 82%, transparent);
  background: color-mix(in srgb, #14b8a6 6%, color-mix(in srgb, currentColor 3%, transparent));
  border: 1px solid color-mix(in srgb, #14b8a6 24%, color-mix(in srgb, currentColor 12%, transparent));
  border-radius: 4px;
  font-family: "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
  font-weight: 400;
  unicode-bidi: isolate;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.wt-bilingual-inline:hover {
  background: color-mix(in srgb, #14b8a6 10%, color-mix(in srgb, currentColor 3%, transparent));
  border-color: color-mix(in srgb, #14b8a6 40%, color-mix(in srgb, currentColor 12%, transparent));
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
  box-shadow: 0 8px 24px rgba(17, 19, 24, 0.14);
  font: 13px/1.45 "Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif;
  pointer-events: auto;
}

.wt-error-banner button {
  margin-left: 8px;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ===== Selection & dictionary popup (*2k token palette) ===== */
.wt-selection-popup {
  --wt-bg: #1a1d24;
  --wt-fg: #e6e8ee;
  --wt-muted: #9aa1b2;
  --wt-border: #2e3340;
  --wt-border-strong: #3d4456;
  --wt-toolbar-bg: #111318;
  --wt-surface-2: #232733;
  --wt-icon: #9aa1b2;
  --wt-icon-hover-bg: #232733;
  --wt-divider: #2e3340;
  --wt-source-bg: #232733;
  --wt-trigger-bg: #1a1d24;
  --wt-trigger-border: #2e3340;
  --wt-trigger-border-hover: #3d4456;
  --wt-accent: #14b8a6;
  --wt-accent-text: #2dd4bf;
  --wt-accent-soft: rgba(20, 184, 166, 0.14);
  --wt-accent-border: rgba(20, 184, 166, 0.36);
  --wt-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.25);
  --wt-error: #f87171;
  --wt-error-bg: rgba(239, 68, 68, 0.14);
  --wt-error-border: rgba(239, 68, 68, 0.34);
  --wt-scroll-thumb: #2e3340;
  --wt-scroll-thumb-hover: #525b70;

  position: absolute;
  z-index: 2147483647;
  width: 448px;
  max-width: calc(100vw - 24px);
  background: var(--wt-bg);
  color: var(--wt-fg);
  border: 1px solid var(--wt-border);
  border-radius: 10px;
  box-shadow: var(--wt-shadow);
  font: 14px/1.55 "Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
  overflow: hidden;
  animation: wt-fade-in 0.15s ease-out;
  display: flex;
  flex-direction: column;
  outline: none;
  box-sizing: border-box;
}

.wt-selection-popup *,
.wt-selection-popup *::before,
.wt-selection-popup *::after,
.wt-selection-popup-menu *,
.wt-selection-popup-menu *::before,
.wt-selection-popup-menu *::after {
  box-sizing: border-box;
}

.wt-selection-popup[data-theme="light"] {
  --wt-bg: #ffffff;
  --wt-fg: #1a1d24;
  --wt-muted: #5f6675;
  --wt-border: #dde1e8;
  --wt-border-strong: #c8ceda;
  --wt-toolbar-bg: #f5f6f8;
  --wt-surface-2: #eef0f4;
  --wt-icon: #5f6675;
  --wt-icon-hover-bg: #eef0f4;
  --wt-divider: #dde1e8;
  --wt-source-bg: #f5f6f8;
  --wt-trigger-bg: #ffffff;
  --wt-trigger-border: #dde1e8;
  --wt-trigger-border-hover: #c8ceda;
  --wt-accent: #0d9488;
  --wt-accent-text: #0f766e;
  --wt-accent-soft: rgba(13, 148, 136, 0.09);
  --wt-accent-border: rgba(13, 148, 136, 0.3);
  --wt-shadow: 0 14px 36px rgba(17, 19, 24, 0.14), 0 3px 10px rgba(17, 19, 24, 0.06);
  --wt-error: #dc2626;
  --wt-error-bg: rgba(239, 68, 68, 0.09);
  --wt-error-border: rgba(239, 68, 68, 0.3);
  --wt-scroll-thumb: #dde1e8;
  --wt-scroll-thumb-hover: #9aa1b2;
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
  padding: 7px 10px;
  background: var(--wt-toolbar-bg);
  border-bottom: 1px solid var(--wt-divider);
  cursor: grab;
  user-select: none;
}
.wt-selection-popup.wt-dragging,
.wt-selection-popup.wt-dragging .wt-sp-toolbar {
  cursor: grabbing;
}

.wt-sp-toolbar-start {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-start;
}

.wt-sp-toolbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 0;
  padding: 0 4px;
}

.wt-sp-toolbar-end {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1 1 0;
  justify-content: flex-end;
}

.wt-sp-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--wt-icon);
  cursor: pointer;
  border-radius: 7px;
  padding: 0;
  outline: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.wt-sp-icon-btn:hover {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
}
.wt-sp-icon-btn:focus-visible {
  outline: 2px solid var(--wt-accent);
  outline-offset: 1px;
}
.wt-sp-icon-btn[aria-expanded="true"] {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
}
.wt-sp-icon-btn svg {
  width: 15px;
  height: 15px;
  display: block;
}
.wt-sp-icon-btn[hidden] { display: none !important; }

/* ----- Body ----- */
.wt-sp-body {
  padding: 12px 14px 14px;
  max-height: 60vh;
  overflow: auto;
}

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
  font-size: 12.5px;
  color: var(--wt-muted);
  background: var(--wt-source-bg);
  border-radius: 7px;
  padding: 7px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  margin-bottom: 10px;
  max-height: 110px;
  overflow: auto;
  border: 1px solid var(--wt-border);
}

.wt-sp-divider {
  display: none;
}

.wt-sp-result {
  font-size: 14px;
  color: var(--wt-fg);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.58;
  font-weight: 400;
}

.wt-sp-result.wt-loading {
  color: var(--wt-muted);
  font-style: italic;
}

.wt-sp-result.wt-error {
  color: var(--wt-error);
  background: var(--wt-error-bg);
  border: 1px solid var(--wt-error-border);
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 13px;
}

.wt-sp-status {
  margin-top: 8px;
  font-size: 11px;
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
  color: var(--wt-accent-text);
}

.wt-sp-ai-copy {
  width: 24px;
  height: 24px;
}
.wt-sp-ai-copy svg { width: 13px; height: 13px; }

.wt-sp-ai-result {
  font-size: 14px;
  color: var(--wt-fg);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.58;
  font-weight: 400;
}
.wt-sp-ai-result.wt-loading {
  color: var(--wt-muted);
  font-style: italic;
}
.wt-sp-ai-result.wt-error {
  color: var(--wt-error);
  background: var(--wt-error-bg);
  border: 1px solid var(--wt-error-border);
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 13px;
}

/* ----- Provider menu ----- */
.wt-sp-provider {
  position: relative;
}

.wt-sp-provider-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  width: 196px;
  padding: 0 8px 0 9px;
  background: var(--wt-trigger-bg);
  border: 1px solid var(--wt-trigger-border);
  border-radius: 7px;
  color: var(--wt-fg);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  outline: none;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}
.wt-sp-provider-trigger:hover {
  background: var(--wt-icon-hover-bg);
  border-color: var(--wt-trigger-border-hover);
}
.wt-sp-provider-trigger:focus-visible {
  outline: 2px solid var(--wt-accent);
  outline-offset: 1px;
}
.wt-sp-provider-trigger[aria-expanded="true"] {
  border-color: var(--wt-accent);
}
.wt-sp-provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wt-sp-provider-icon svg {
  width: 14px;
  height: 14px;
  display: block;
}
.wt-sp-provider-current {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.wt-sp-provider-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--wt-muted);
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.wt-sp-provider-caret svg {
  width: 13px;
  height: 13px;
  display: block;
}
.wt-sp-provider-trigger[aria-expanded="true"] .wt-sp-provider-caret {
  transform: rotate(180deg);
}

.wt-selection-popup-menu {
  --wt-bg: #1a1d24;
  --wt-fg: #e6e8ee;
  --wt-muted: #9aa1b2;
  --wt-border: #2e3340;
  --wt-icon-hover-bg: #232733;
  --wt-accent: #14b8a6;
  --wt-accent-text: #2dd4bf;
  --wt-accent-soft: rgba(20, 184, 166, 0.14);
  --wt-shadow: 0 14px 36px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.25);
}
.wt-selection-popup-menu[data-theme="light"] {
  --wt-bg: #ffffff;
  --wt-fg: #1a1d24;
  --wt-muted: #5f6675;
  --wt-border: #dde1e8;
  --wt-icon-hover-bg: #eef0f4;
  --wt-accent: #0d9488;
  --wt-accent-text: #0f766e;
  --wt-accent-soft: rgba(13, 148, 136, 0.09);
  --wt-shadow: 0 12px 28px rgba(17, 19, 24, 0.14), 0 2px 6px rgba(17, 19, 24, 0.06);
}

.wt-sp-provider-menu {
  position: absolute;
  z-index: 2147483647;
  min-width: 210px;
  max-width: calc(100vw - 16px);
  max-height: 50vh;
  overflow-y: auto;
  background: var(--wt-bg);
  color: var(--wt-fg);
  border: 1px solid var(--wt-border);
  border-radius: 8px;
  box-shadow: var(--wt-shadow);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font: 13px/1.45 "Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif;
  animation: wt-fade-in 0.12s ease-out;
}
.wt-sp-provider-menu[hidden] { display: none !important; }

.wt-sp-provider-heading {
  padding: 5px 8px 3px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--wt-muted);
}

.wt-sp-provider-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 12.5px;
  color: var(--wt-fg);
  outline: none;
  transition: background-color 0.12s ease;
}
.wt-sp-provider-option:hover { background: var(--wt-icon-hover-bg); }
.wt-sp-provider-option[aria-selected="true"] {
  font-weight: 600;
  background: var(--wt-accent-soft);
  color: var(--wt-accent-text);
}

.wt-sp-provider-option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wt-sp-provider-option-icon svg {
  width: 15px;
  height: 15px;
  display: block;
}
.wt-sp-provider-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wt-sp-provider-check {
  width: 14px;
  flex-shrink: 0;
  display: inline-block;
  text-align: center;
  color: var(--wt-accent);
}
.wt-sp-provider-option:not([aria-selected="true"]) .wt-sp-provider-check {
  color: transparent;
}

/* ===== Floating selection trigger (compact, jitter-free on hover) ===== */
.wt-selection-trigger {
  position: fixed;
  z-index: 2147483646;
  width: 20px;
  height: 20px;
  display: none;
  padding: 0;
  align-items: center;
  justify-content: center;
  background: #1a1d24;
  border: 1px solid #2e3340;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
  cursor: pointer;
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
  animation: wt-trigger-in 0.14s ease-out;
}
.wt-selection-trigger svg {
  width: 11px;
  height: 11px;
  display: block;
}
.wt-selection-trigger:hover {
  background: #232733;
  border-color: #14b8a6;
  box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.24), 0 2px 8px rgba(0, 0, 0, 0.26);
}
.wt-selection-trigger.wt-hovering {
  border-color: #14b8a6;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.26), 0 2px 8px rgba(0, 0, 0, 0.26);
}

@keyframes wt-trigger-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ===== Dictionary popup ===== */
.wt-dict-popup .wt-dict-body {
  padding: 14px 16px 16px;
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
  border: 1px solid var(--wt-error-border);
  border-radius: 8px;
  padding: 9px 12px;
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
  margin-bottom: 8px;
}

.wt-dict-word {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.015em;
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
  font-weight: 500;
  color: var(--wt-muted);
  background: var(--wt-source-bg);
  border: 1px solid var(--wt-border);
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}

.wt-dict-meaning {
  margin-top: 12px;
}

.wt-dict-pos {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wt-accent-text);
  border-bottom: 1px solid var(--wt-divider);
  padding-bottom: 3px;
  margin-bottom: 8px;
}

.wt-dict-defs {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
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
  gap: 4px;
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

/* Uniform 1px 4-side tinted card (zero thick border-left) */
.wt-dict-def-vi {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--wt-fg);
  font-weight: 500;
  padding: 5px 8px;
  background: var(--wt-accent-soft);
  border: 1px solid var(--wt-accent-border);
  border-radius: 6px;
}

.wt-dict-example {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  color: var(--wt-muted);
  font-style: italic;
  font-size: 12.5px;
  line-height: 1.5;
  margin-top: 1px;
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
  margin-top: 1px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: var(--wt-muted);
  cursor: pointer;
  opacity: 0.72;
  transition: background-color 0.12s ease, color 0.12s ease, opacity 0.12s ease;
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
  margin: 12px 0;
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
  letter-spacing: 0.05em;
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
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.wt-dict-chip:hover {
  background: var(--wt-accent-soft);
  border-color: var(--wt-accent-border);
  color: var(--wt-accent-text);
}

/* ===== "Translating" per-segment hint ===== */
.wt-translating {
  text-decoration: underline dotted rgba(20, 184, 166, 0.55);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}
`;

/**
 * Injects the shared stylesheet once per document.
 */
export function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
}
