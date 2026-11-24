import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Optional leading visual (e.g. a brand favicon for the provider). */
  icon?: ReactNode;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Optional override for the displayed label (defaults to selected option label). */
  buttonLabel?: string;
  /**
   * Accessible name for the trigger. Without it screen readers announce only
   * the selected value — "English" with no hint of what the control picks.
   */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** Fixed-position geometry for the floating menu, measured from the trigger. */
interface MenuPosition {
  left: number;
  width: number;
  /** Set when the menu opens downward. */
  top?: number;
  /** Set (as distance from viewport bottom) when the menu flips upward. */
  bottom?: number;
  /** Max height available in the chosen direction. */
  maxHeight: number;
}

/** Vertical gap between the trigger and the floating menu. */
const GAP = 4;
/** Keep the menu this far from the viewport edges. */
const MARGIN = 8;

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  buttonLabel,
  ariaLabel,
  disabled = false,
  className = ""
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  /** Index of the keyboard-highlighted option while the menu is open. */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const current = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  // Measure the trigger and decide whether the menu opens down or flips up.
  const updatePosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN;
    const spaceAbove = rect.top - GAP - MARGIN;
    const flipUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    setPosition({
      left: rect.left,
      width: rect.width,
      ...(flipUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      maxHeight: Math.min(256, Math.max(flipUp ? spaceAbove : spaceBelow, 96))
    });
  };

  // Position before paint when opening, and keep it in sync with scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = (e: Event) => {
      // Scrolling inside the listbox itself does not move the anchor trigger.
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      updatePosition();
    };
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Move focus into the portaled listbox once when it opens (not on every render).
  const hasPosition = position !== null;
  useEffect(() => {
    if (open && hasPosition) {
      listRef.current?.focus({ preventScroll: true });
    }
  }, [open, hasPosition]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // When opening, highlight the currently-selected option.
  useEffect(() => {
    if (!open) return;
    if (options.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex, options.length]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (options.length === 0) return;
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (options.length === 0) return;
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        if (options.length === 0) return;
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        if (options.length === 0) return;
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus({ preventScroll: true });
        break;
      case "Tab":
        // Restore focus to the trigger synchronously before native Tab runs so
        // Tab / Shift+Tab continues from the trigger instead of document.body.
        buttonRef.current?.focus({ preventScroll: true });
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        style={{
          backgroundColor: "var(--surface)",
          borderColor: open ? "var(--accent)" : "var(--border)",
          color: "var(--text)",
          boxShadow: open ? "0 0 0 2px var(--accent-ring)" : undefined
        }}
        className="group w-full h-8 flex items-center justify-between gap-2 px-2.5 rounded-[var(--radius)] border text-left transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-2 min-w-0">
          {current?.icon && <span className="shrink-0">{current.icon}</span>}
          <span className="text-[12.5px] font-medium text-primary truncate">
            {buttonLabel ?? current?.label ?? value}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted transition-transform shrink-0 ${
            open ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
            onKeyDown={onListKeyDown}
            style={{
              position: "fixed",
              left: position.left,
              width: position.width,
              top: position.top,
              bottom: position.bottom,
              maxHeight: position.maxHeight,
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-float)"
            }}
            className="z-[1000] border rounded-[var(--radius)] overflow-hidden p-1 flex flex-col overflow-y-auto outline-none"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const highlighted = index === activeIndex;
              return (
                <button
                  key={option.value}
                  id={`${listboxId}-opt-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                  style={{
                    backgroundColor: selected
                      ? "var(--accent-soft)"
                      : highlighted
                        ? "var(--surface-2)"
                        : "transparent",
                    color: selected ? "var(--accent-text)" : "var(--text)"
                  }}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-[6px] text-left transition-colors cursor-pointer"
                >
                  <Check
                    style={{ color: selected ? "var(--accent)" : "transparent" }}
                    className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  />
                  {option.icon && <span className="mt-0.5 shrink-0">{option.icon}</span>}
                  <span className="flex flex-col min-w-0">
                    <span className="text-[12.5px] font-medium truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-[10.5px] leading-snug text-muted">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
