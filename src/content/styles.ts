import { STYLE_ELEMENT_ID } from "./constants";

const STYLES = `
.wt-bilingual-line {
  display: block;
  margin-top: 0.35em;
  margin-bottom: 0.25em;
  padding: 0.25em 0.6em;
  font-size: 0.92em;
  line-height: 1.6;
  color: #78716c;
  background: rgba(120, 113, 108, 0.04);
  border-left: 2.5px solid rgba(13, 148, 136, 0.35);
  border-radius: 0 6px 6px 0;
  font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", system-ui, sans-serif;
  font-weight: 400;
  white-space: normal;
  unicode-bidi: isolate;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.wt-bilingual-line:hover {
  background: rgba(13, 148, 136, 0.06);
  border-left-color: rgba(13, 148, 136, 0.55);
}

.wt-bilingual-inline {
  display: inline;
  margin: 0 0.15em 0 0.3em;
  padding: 0.05em 0.35em;
  font-size: 0.9em;
  color: #78716c;
  background: rgba(120, 113, 108, 0.04);
  border-radius: 4px;
  border-bottom: 1.5px solid rgba(13, 148, 136, 0.25);
  font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", system-ui, sans-serif;
  font-weight: 400;
  unicode-bidi: isolate;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.wt-bilingual-inline:hover {
  background: rgba(13, 148, 136, 0.06);
  border-bottom-color: rgba(13, 148, 136, 0.45);
}

@media (prefers-color-scheme: dark) {
  .wt-bilingual-line {
    color: #a8a29e;
    background: rgba(168, 162, 158, 0.04);
    border-left-color: rgba(13, 148, 136, 0.3);
  }
  .wt-bilingual-line:hover {
    background: rgba(13, 148, 136, 0.08);
    border-left-color: rgba(13, 148, 136, 0.5);
  }
  .wt-bilingual-inline {
    color: #a8a29e;
    background: rgba(168, 162, 158, 0.04);
    border-bottom-color: rgba(13, 148, 136, 0.25);
  }
  .wt-bilingual-inline:hover {
    background: rgba(13, 148, 136, 0.08);
    border-bottom-color: rgba(13, 148, 136, 0.45);
  }
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
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(185, 28, 28, 0.12), 0 1px 3px rgba(0,0,0,0.06);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
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

/* ===== Selection popup (compact) ===== */
.wt-selection-popup {
  --wt-bg: rgba(28, 31, 36, 0.92);
  --wt-fg: #e7eaee;
  --wt-muted: #9aa3ad;
  --wt-border: rgba(255, 255, 255, 0.1);
  --wt-toolbar-bg: rgba(28, 31, 36, 0.85);
  --wt-icon: #cfd5dc;
  --wt-icon-hover-bg: rgba(255, 255, 255, 0.1);
  --wt-divider: rgba(255, 255, 255, 0.08);
  --wt-source-bg: rgba(255, 255, 255, 0.05);
  --wt-trigger-bg: rgba(255, 255, 255, 0.06);
  --wt-trigger-border: rgba(255, 255, 255, 0.15);
  --wt-trigger-border-hover: rgba(255, 255, 255, 0.3);
  --wt-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.5),
    0 8px 24px -4px rgba(0, 0, 0, 0.3);
  --wt-error: #f87171;
  --wt-error-bg: rgba(248, 113, 113, 0.15);
  --wt-scroll-thumb: rgba(255, 255, 255, 0.18);
  --wt-scroll-thumb-hover: rgba(255, 255, 255, 0.3);

  position: absolute;
  z-index: 2147483647;
  width: 460px;
  max-width: calc(100vw - 24px);
  background: var(--wt-bg);
  color: var(--wt-fg);
  border: 1px solid var(--wt-border);
  border-radius: 16px;
  box-shadow: var(--wt-shadow);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter,
    system-ui, sans-serif;
  overflow: hidden;
  animation: wt-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  /* Glassmorphism for modern browsers */
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
}

.wt-selection-popup[data-theme="light"] {
  --wt-bg: rgba(255, 255, 255, 0.92);
  --wt-fg: #1c1f24;
  --wt-muted: #6b7280;
  --wt-border: rgba(0, 0, 0, 0.08);
  --wt-toolbar-bg: rgba(255, 255, 255, 0.85);
  --wt-icon: #4b5563;
  --wt-icon-hover-bg: rgba(0, 0, 0, 0.06);
  --wt-divider: rgba(0, 0, 0, 0.06);
  --wt-source-bg: rgba(0, 0, 0, 0.03);
  --wt-trigger-bg: rgba(0, 0, 0, 0.04);
  --wt-trigger-border: rgba(0, 0, 0, 0.1);
  --wt-trigger-border-hover: rgba(0, 0, 0, 0.18);
  --wt-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.15),
    0 8px 24px -4px rgba(0, 0, 0, 0.1);
  --wt-error: #b91c1c;
  --wt-error-bg: #fef2f2;
  --wt-scroll-thumb: rgba(0, 0, 0, 0.14);
  --wt-scroll-thumb-hover: rgba(0, 0, 0, 0.26);
}

@keyframes wt-fade-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ----- Toolbar ----- */
.wt-sp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--wt-toolbar-bg);
  border-bottom: 1px solid var(--wt-divider);
  /* The toolbar doubles as a drag handle for the whole popup. */
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
  gap: 3px;
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
  gap: 3px;
  flex: 1 1 0;
  justify-content: flex-end;
}

.wt-sp-icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--wt-icon);
  cursor: pointer;
  border-radius: 10px;
  padding: 0;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.wt-sp-icon-btn:hover {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
  transform: translateY(-1px);
}
.wt-sp-icon-btn:active { transform: translateY(0); }
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
  font-size: 12.5px;
  color: var(--wt-muted);
  background: var(--wt-source-bg);
  border-radius: 8px;
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
  font-size: 14.5px;
  color: var(--wt-fg);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-weight: 400;
  letter-spacing: 0.005em;
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
  font-size: 13px;
}

.wt-sp-status {
  margin-top: 8px;
  font-size: 11px;
  color: var(--wt-muted);
  text-align: right;
  letter-spacing: 0.01em;
}
.wt-sp-status[hidden] { display: none; }

/* ----- On-demand AI translation section ----- */
.wt-sp-ai {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--wt-divider);
}
.wt-sp-ai[hidden] { display: none; }

.wt-sp-ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.wt-sp-ai-label {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #a78bfa;
}

.wt-sp-ai-copy {
  width: 26px;
  height: 26px;
}
.wt-sp-ai-copy svg { width: 14px; height: 14px; }

.wt-sp-ai-result {
  font-size: 14.5px;
  color: var(--wt-fg);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-weight: 400;
  letter-spacing: 0.005em;
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
  font-size: 13px;
}

/* ----- Provider menu ----- */
.wt-sp-provider {
  position: relative;
}

/* Inline dropdown trigger on the toolbar: shows the active provider name plus
   a caret, replacing the old gear-icon-only button. Click toggles the menu.
   Fixed width so it doesn't jump as the provider name changes. */
.wt-sp-provider-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  width: 210px;
  padding: 0 8px 0 11px;
  /* Sits just barely above the toolbar with a faint grey wash; the subtle
     border is what really sets it apart from the title bar. */
  background: var(--wt-trigger-bg);
  border: 1px solid var(--wt-trigger-border);
  border-radius: 9px;
  color: var(--wt-fg);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  transition: background 120ms ease, border-color 120ms ease;
}
.wt-sp-provider-trigger:hover {
  background: var(--wt-icon-hover-bg);
  border-color: var(--wt-trigger-border-hover);
}
.wt-sp-provider-trigger[aria-expanded="true"] {
  background: var(--wt-icon-hover-bg);
  border-color: rgba(20, 184, 166, 0.5);
}
.wt-sp-provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wt-sp-provider-icon svg {
  width: 15px;
  height: 15px;
  display: block;
}
.wt-sp-provider-current {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wt-sp-provider-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--wt-muted);
  flex-shrink: 0;
  transition: transform 150ms ease;
}
.wt-sp-provider-caret svg {
  width: 14px;
  height: 14px;
  display: block;
}
.wt-sp-provider-trigger[aria-expanded="true"] .wt-sp-provider-caret {
  transform: rotate(180deg);
}

/* The menu is mounted on <body> (outside the popup) so the popup's
   overflow:hidden can't clip it. It carries its own theme tokens and is
   positioned manually via inline left/top. */
.wt-selection-popup-menu {
  --wt-bg: rgba(28, 31, 36, 0.95);
  --wt-fg: #e7eaee;
  --wt-muted: #9aa3ad;
  --wt-border: rgba(255, 255, 255, 0.1);
  --wt-icon-hover-bg: rgba(255, 255, 255, 0.1);
  --wt-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.5),
    0 8px 24px -4px rgba(0, 0, 0, 0.3);
}
.wt-selection-popup-menu[data-theme="light"] {
  --wt-bg: rgba(255, 255, 255, 0.95);
  --wt-fg: #1c1f24;
  --wt-muted: #6b7280;
  --wt-border: rgba(0, 0, 0, 0.08);
  --wt-icon-hover-bg: rgba(0, 0, 0, 0.06);
  --wt-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.15),
    0 8px 24px -4px rgba(0, 0, 0, 0.1);
}

.wt-sp-provider-menu {
  position: absolute;
  z-index: 2147483647;
  min-width: 220px;
  max-width: calc(100vw - 16px);
  max-height: 50vh;
  overflow-y: auto;
  background: var(--wt-bg);
  color: var(--wt-fg);
  border: 1px solid var(--wt-border);
  border-radius: 14px;
  box-shadow: var(--wt-shadow);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter,
    system-ui, sans-serif;
  animation: wt-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  /* Glassmorphism for menu */
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
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
  gap: 8px;
  padding: 7px 9px;
  border-radius: 7px;
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
  background: rgba(13, 148, 136, 0.08);
}

.wt-sp-provider-option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wt-sp-provider-option-icon svg {
  width: 16px;
  height: 16px;
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
  color: #14b8a6;
}
.wt-sp-provider-option:not([aria-selected="true"]) .wt-sp-provider-check {
  color: transparent;
}

/* ===== Floating selection trigger ===== */
.wt-selection-trigger {
  position: absolute;
  z-index: 2147483646;
  width: 36px;
  height: 36px;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: linear-gradient(135deg, #ffffff 0%, #f0fdfc 100%);
  color: #0d9488;
  border: 1px solid rgba(13, 148, 136, 0.2);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(13, 148, 136, 0.25),
    0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui,
    sans-serif;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  animation: wt-trigger-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.wt-selection-trigger:hover {
  background: linear-gradient(135deg, #f0fdfc 0%, #ccfbf1 100%);
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 8px 24px rgba(13, 148, 136, 0.35),
    0 2px 6px rgba(0, 0, 0, 0.08);
}
.wt-selection-trigger:active { transform: translateY(0) scale(1); }
.wt-selection-trigger svg {
  width: 16px;
  height: 16px;
  display: block;
}

@keyframes wt-trigger-in {
  from { opacity: 0; transform: translateY(4px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ===== Dictionary popup ===== */
.wt-dict-popup .wt-dict-body {
  padding: 16px 18px 18px;
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
  border-radius: 10px;
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
  margin-bottom: 8px;
}

.wt-dict-word {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--wt-fg);
  background: linear-gradient(135deg, var(--wt-fg) 0%, #14b8a6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  padding: 2px 10px;
  white-space: nowrap;
}

.wt-dict-meaning {
  margin-top: 12px;
}

.wt-dict-pos {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wt-muted);
  border-bottom: 1.5px solid var(--wt-divider);
  padding-bottom: 4px;
  margin-bottom: 8px;
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
  padding-left: 8px;
  border-left: 2.5px solid rgba(13, 148, 136, 0.45);
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
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: var(--wt-muted);
  cursor: pointer;
  opacity: 0.65;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.wt-dict-speak:hover {
  background: var(--wt-icon-hover-bg);
  color: var(--wt-fg);
  opacity: 1;
  transform: translateY(-1px);
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
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--wt-border);
  background: var(--wt-source-bg);
  color: var(--wt-fg);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.wt-dict-chip:hover {
  background: rgba(13, 148, 136, 0.12);
  border-color: rgba(13, 148, 136, 0.4);
  color: #0d9488;
  transform: translateY(-1px);
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
