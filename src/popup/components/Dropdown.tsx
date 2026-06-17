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
      ...(flipUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      maxHeight: Math.min(256, Math.max(flipUp ? spaceAbove : spaceBelow, 96))
    });
  };

  // Position before paint when opening, and keep it in sync with scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onReflow = () => updatePosition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

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
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

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
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus({ preventScroll: true });
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={`group w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:border-brand-400 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 ${
          open
            ? "border-brand-300 ring-1 ring-brand-200 dark:border-brand-500/50 dark:ring-brand-500/20"
            : "border-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {current?.icon && <span className="shrink-0">{current.icon}</span>}
          <span className="text-[13px] font-semibold tracking-tight text-zinc-900 truncate dark:text-zinc-100">
            {buttonLabel ?? current?.label ?? value}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform shrink-0 dark:text-zinc-500 ${
            open ? "rotate-180 text-zinc-700 dark:text-zinc-300" : ""
          }`}
        />
      </button>

      {open && position &&
        createPortal(
          <div
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
            }
            onKeyDown={onListKeyDown}
            ref={(node) => {
              listRef.current = node;
              node?.focus({ preventScroll: true });
            }}
            style={{
              position: "fixed",
              left: position.left,
              width: position.width,
              top: position.top,
              bottom: position.bottom,
              maxHeight: position.maxHeight
            }}
            className="z-[1000] bg-white border border-zinc-200 rounded-md shadow-float-light overflow-hidden animate-slide-up p-1 flex flex-col overflow-y-auto custom-scrollbar outline-none dark:bg-zinc-900 dark:border-zinc-700"
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
                  className={`flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    selected
                      ? "bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-300"
                      : highlighted
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-700 dark:text-zinc-100"
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      selected ? "text-brand-600 dark:text-brand-400" : "text-transparent"
                    }`}
                  />
                  {option.icon && (
                    <span className="mt-0.5 shrink-0">{option.icon}</span>
                  )}
                  <span className="flex flex-col min-w-0">
                    <span className="text-[12.5px] font-semibold tracking-tight truncate">
                      {option.label}
                    </span>
                    {option.description && (
                      <span
                        className={`text-[10.5px] leading-snug ${
                          selected
                            ? "text-brand-700/80 dark:text-brand-300/80"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
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
