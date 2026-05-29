/**
 * Floating "translate this selection" trigger that appears next to a user
 * text selection. Clicking it opens the existing selection popup with the
 * captured text.
 *
 * Behaviour:
 *  - Shows after `mouseup` if there is a non-empty, single-range selection
 *    that lies inside normal page content (not inside our own popups, form
 *    inputs, or contenteditable areas).
 *  - Hides on `mousedown` (the user is starting a new interaction), on
 *    selection change to empty, on Escape, and on scroll.
 *  - Anchored at the bottom-right of the last selection rectangle so it
 *    doesn't cover the text being read.
 */
import { ensureStyles } from "./styles";

export interface SelectionTriggerHandlers {
  /** Called when the user clicks the trigger. Receives the selected text. */
  onTranslate: (text: string, anchor: { x: number; y: number }) => void;
}

let triggerEl: HTMLButtonElement | null = null;
let lastShownText = "";
let isInstalled = false;
let installedHandlers: SelectionTriggerHandlers | null = null;

const ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m5 8 6 6"/>
  <path d="m4 14 6-6 2-3"/>
  <path d="M2 5h12"/>
  <path d="M7 2h1"/>
  <path d="m22 22-5-10-5 10"/>
  <path d="M14 18h6"/>
</svg>`;

export function installSelectionTrigger(handlers: SelectionTriggerHandlers): void {
  installedHandlers = handlers;
  if (isInstalled) return;
  isInstalled = true;

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("selectionchange", onSelectionChange, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", hideTrigger, true);
  window.addEventListener("blur", hideTrigger, true);
}

export function uninstallSelectionTrigger(): void {
  if (!isInstalled) return;
  isInstalled = false;
  installedHandlers = null;
  document.removeEventListener("mouseup", onMouseUp, true);
  document.removeEventListener("mousedown", onMouseDown, true);
  document.removeEventListener("selectionchange", onSelectionChange, true);
  document.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("scroll", hideTrigger, true);
  window.removeEventListener("blur", hideTrigger, true);
  hideTrigger();
}

function onMouseUp(e: MouseEvent): void {
  // Ignore clicks that originated inside our own popup/trigger.
  if (isOurOwnNode(e.target as Node | null)) return;
  // Remember where the pointer was released — that's where the user's
  // attention is, and the most convenient place to surface the icon.
  const point = { x: e.clientX, y: e.clientY };
  // Defer to next tick so the selection has settled.
  window.setTimeout(() => maybeShowTrigger(point), 0);
}

function onMouseDown(e: MouseEvent): void {
  // If the user is clicking the trigger itself, let the click handler run.
  if (triggerEl && triggerEl.contains(e.target as Node)) return;
  hideTrigger();
}

function onSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
    hideTrigger();
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") hideTrigger();
}

function isOurOwnNode(node: Node | null): boolean {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return false;
  return !!el.closest(
    '[data-wt-selection-popup="true"], [data-wt-selection-trigger="true"]'
  );
}

function isInsideEditableField(node: Node | null): boolean {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return false;
  const editable = el.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
  );
  return !!editable;
}

function maybeShowTrigger(point?: { x: number; y: number }): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const text = sel.toString().trim();
  if (!text) return;

  const range = sel.getRangeAt(0);
  if (isInsideEditableField(range.startContainer)) return;
  if (isOurOwnNode(range.startContainer)) return;

  const rects = range.getClientRects();
  if (rects.length === 0) return;

  // Anchor next to where the user released the mouse — for a downward
  // selection that's the bottom-right of the last line, for an upward
  // selection the top of the first line. Falling back to the geometric last
  // rectangle keeps keyboard / programmatic selections working.
  const anchor = point
    ? anchorNearPoint(rects, point)
    : { x: rects[rects.length - 1].right, y: rects[rects.length - 1].bottom };

  showTriggerAt(anchor.x, anchor.y, text);
}

/**
 * Pick the trigger anchor closest to the pointer. We clamp the requested
 * point to the selection rectangle the user released over so the icon hugs the
 * end of the selection instead of floating wherever the cursor happened to
 * drift, then offset slightly to the cursor's right/bottom.
 */
function anchorNearPoint(
  rects: DOMRectList,
  point: { x: number; y: number }
): { x: number; y: number } {
  let best = rects[0];
  let bestDist = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    // Vertical distance from the pointer to this line's band dominates: the
    // line the user released on is the one whose y-range contains the cursor.
    const dy =
      point.y < r.top ? r.top - point.y : point.y > r.bottom ? point.y - r.bottom : 0;
    const cx = Math.min(Math.max(point.x, r.left), r.right);
    const dx = Math.abs(point.x - cx);
    const dist = dy * 4 + dx; // weight vertical proximity more heavily
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  // Sit just past the pointer, clamped to the chosen line's horizontal span so
  // the icon stays attached to the selected text.
  const x = Math.min(Math.max(point.x, best.left), best.right);
  return { x, y: best.bottom };
}

function showTriggerAt(x: number, y: number, text: string): void {
  ensureStyles();
  if (!triggerEl) {
    triggerEl = document.createElement("button");
    triggerEl.type = "button";
    triggerEl.className = "wt-selection-trigger";
    triggerEl.setAttribute("data-wt-selection-trigger", "true");
    triggerEl.setAttribute("aria-label", "Dịch đoạn đã chọn");
    triggerEl.setAttribute("title", "Dịch đoạn đã chọn");
    triggerEl.innerHTML = ICON_SVG;
    triggerEl.addEventListener("mousedown", (e) => {
      // Prevent the document `mousedown` handler from clearing the selection
      // before our click runs.
      e.preventDefault();
      e.stopPropagation();
    });
    triggerEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const handlers = installedHandlers;
      if (!handlers) return;
      const anchor = currentAnchor();
      const finalText = lastShownText;
      hideTrigger();
      handlers.onTranslate(finalText, anchor);
    });
    document.body.appendChild(triggerEl);
  }

  lastShownText = text;
  // `x` / `y` arrive in viewport space (from getBoundingClientRect).
  // We use `position: absolute` for the trigger so it stays anchored to the
  // page when the user scrolls — convert to document coordinates here.
  const margin = 6;
  const size = 22;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + margin;
  let top = y + margin;
  if (left + size > vw - 4) left = vw - size - 4;
  if (top + size > vh - 4) top = vh - size - 4;
  if (left < 4) left = 4;
  if (top < 4) top = 4;
  // Remember the viewport anchor for `currentAnchor()` so the translate /
  // dictionary popup positions itself relative to where the icon appeared.
  triggerEl.dataset.x = String(left);
  triggerEl.dataset.y = String(top);
  triggerEl.style.left = `${left + window.scrollX}px`;
  triggerEl.style.top = `${top + window.scrollY}px`;
  triggerEl.style.display = "flex";
}

function currentAnchor(): { x: number; y: number } {
  if (!triggerEl) return { x: 32, y: 32 };
  const x = Number(triggerEl.dataset.x ?? 32);
  const y = Number(triggerEl.dataset.y ?? 32);
  return { x, y };
}

function hideTrigger(): void {
  if (!triggerEl) return;
  triggerEl.style.display = "none";
  lastShownText = "";
}
