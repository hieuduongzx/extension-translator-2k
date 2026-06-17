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
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

/** Snapshot of the last non-empty selection, captured on `selectionchange`. */
let cachedSelection: {
  text: string;
  rects: DOMRectList | null;
  boundingRect: DOMRect | null;
} | null = null;

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
  document.addEventListener("pointerup", onPointerUp, true);
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
  cachedSelection = null;
  document.removeEventListener("mouseup", onMouseUp, true);
  document.removeEventListener("pointerup", onPointerUp, true);
  document.removeEventListener("mousedown", onMouseDown, true);
  document.removeEventListener("selectionchange", onSelectionChange, true);
  document.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("scroll", hideTrigger, true);
  window.removeEventListener("blur", hideTrigger, true);
  hideTrigger();
}

function onMouseUp(e: MouseEvent): void {
  if (isOurOwnNode(e.target as Node | null)) return;
  showForCachedSelection({ x: e.clientX, y: e.clientY });
}

function onPointerUp(e: PointerEvent): void {
  if (e.button !== 0) return;
  if (isOurOwnNode(e.target as Node | null)) return;
  showForCachedSelection({ x: e.clientX, y: e.clientY });
}

function onMouseDown(e: MouseEvent): void {
  // If the user is clicking the trigger itself, let the click handler run.
  if (triggerEl && triggerEl.contains(e.target as Node)) return;
  hideTrigger();
}

function onSelectionChange(): void {
  const snapshot = captureSelection();
  if (!snapshot) {
    cachedSelection = null;
    hideTrigger();
    return;
  }

  // Cache the current selection data immediately. Some sites (e.g. YouTube live
  // chat) clear the selection on mouse-up, so by the time the mouse-up handler
  // runs `window.getSelection()` may already be empty. We snapshot text and
  // rects here on every selection change.
  cachedSelection = snapshot;
}

/**
 * Read the current live selection into a snapshot, or `null` when there is no
 * usable non-empty selection. `window.getSelection()` always reflects the
 * up-to-date state, so this is safe to call directly from `mouseup` without
 * waiting for the (asynchronous, coalesced) `selectionchange` event to fire.
 */
function captureSelection(): {
  text: string;
  rects: DOMRectList | null;
  boundingRect: DOMRect | null;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  const range = sel.getRangeAt(0);

  let rects: DOMRectList | null = null;
  try {
    rects = range.getClientRects();
  } catch {
    /* shadow/shady DOM can throw */
  }

  let boundingRect: DOMRect | null = null;
  try {
    boundingRect = range.getBoundingClientRect();
  } catch {
    /* ignore */
  }

  return { text, rects, boundingRect };
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

/**
 * Show the trigger using the selection cached by `onSelectionChange`.
 * This avoids re-reading `window.getSelection()` on mouse-up because sites
 * like YouTube live chat clear the selection before our deferred handler
 * runs.
 */
function showForCachedSelection(point: { x: number; y: number }): void {
  try {
    // Prefer the live selection at mouse-up time: `window.getSelection()` is
    // always up to date, whereas `cachedSelection` depends on the asynchronous
    // `selectionchange` event which may not have fired yet. Falling back to the
    // cache covers sites (e.g. YouTube live chat) that clear the selection on
    // mouse-up.
    const snapshot = captureSelection() ?? cachedSelection;
    if (!snapshot) return;

    const { text, rects, boundingRect } = snapshot;
    if (!text) return;

    // Validate the cached selection is still worth showing (quick guard).
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (isInsideEditableField(range.startContainer)) return;
      if (isOurOwnNode(range.startContainer)) return;
    }

    let anchor: { x: number; y: number } | null = null;

    if (rects && rects.length > 0) {
      anchor = anchorNearPoint(rects, point);
    } else if (boundingRect && boundingRect.width > 0 && boundingRect.height > 0) {
      anchor = {
        x: Math.min(Math.max(point.x, boundingRect.left), boundingRect.right),
        y: boundingRect.bottom
      };
    } else {
      anchor = point;
    }

    if (!anchor) return;
    showTriggerAt(anchor.x, anchor.y, text);
  } catch {
    /* silently ignore */
  }
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
      clearHoverTimer();
      fireTranslate();
    });
    triggerEl.addEventListener("mouseenter", () => {
      triggerEl!.classList.add("wt-hovering");
      hoverTimer = setTimeout(() => {
        fireTranslate();
      }, 1000);
    });
    triggerEl.addEventListener("mouseleave", () => {
      triggerEl!.classList.remove("wt-hovering");
      clearHoverTimer();
    });
    document.body.appendChild(triggerEl);
  }

  lastShownText = text;
  // `x` / `y` arrive in viewport space (from getBoundingClientRect).
  // With `position: fixed` the trigger is positioned relative to the viewport,
  // so we use the viewport coordinates directly.
  const margin = 6;
  const size = 22;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + margin;
  let top = y + margin;
  if (left + size > vw - 8) left = vw - size - 8;
  if (top + size > vh - 8) top = vh - size - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  // Remember the viewport anchor for `currentAnchor()` so the translate /
  // dictionary popup positions itself relative to where the icon appeared.
  triggerEl.dataset.x = String(left);
  triggerEl.dataset.y = String(top);
  triggerEl.style.left = `${left}px`;
  triggerEl.style.top = `${top}px`;
  triggerEl.style.display = "flex";
}

function currentAnchor(): { x: number; y: number } {
  if (!triggerEl) return { x: 32, y: 32 };
  const x = Number(triggerEl.dataset.x ?? 32);
  const y = Number(triggerEl.dataset.y ?? 32);
  return { x, y };
}

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function fireTranslate(): void {
  const handlers = installedHandlers;
  if (!handlers) return;
  const anchor = currentAnchor();
  const finalText = lastShownText;
  hideTrigger();
  handlers.onTranslate(finalText, anchor);
}

function hideTrigger(): void {
  if (!triggerEl) return;
  clearHoverTimer();
  triggerEl.classList.remove("wt-hovering");
  triggerEl.style.display = "none";
  lastShownText = "";
}
