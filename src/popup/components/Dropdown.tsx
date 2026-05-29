import { useEffect, useRef, useState, type ReactNode } from "react";
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

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  buttonLabel,
  className = ""
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border bg-white text-left transition-colors ${
          open
            ? "border-brand-300 ring-1 ring-brand-200"
            : "border-zinc-200 hover:border-zinc-300"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {current?.icon && <span className="shrink-0">{current.icon}</span>}
          <span className="text-[13px] font-semibold tracking-tight text-zinc-900 truncate">
            {buttonLabel ?? current?.label ?? value}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform shrink-0 ${
            open ? "rotate-180 text-zinc-700" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-zinc-200 rounded-md shadow-lg overflow-hidden animate-slide-up"
        >
          <div className="p-1 flex flex-col max-h-64 overflow-auto custom-scrollbar">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    selected
                      ? "bg-brand-50 text-brand-900"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      selected ? "text-brand-600" : "text-transparent"
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
                          selected ? "text-brand-700/80" : "text-zinc-500"
                        }`}
                      >
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
