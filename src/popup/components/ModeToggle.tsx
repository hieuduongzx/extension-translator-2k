import { Layers, Replace } from "lucide-react";
import type { DisplayMode } from "../../types";

interface ModeToggleProps {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}

const MODES: { id: DisplayMode; title: string; subtitle: string; icon: typeof Layers }[] = [
  {
    id: "bilingual",
    title: "Bilingual",
    subtitle: "Show original + translation",
    icon: Layers
  },
  {
    id: "replace",
    title: "Translation only",
    subtitle: "Replace original text",
    icon: Replace
  }
];

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            aria-pressed={active}
            style={{
              backgroundColor: active ? "var(--accent-soft)" : "var(--surface)",
              borderColor: active ? "var(--accent)" : "var(--border)"
            }}
            className="flex items-start gap-2.5 p-3 rounded-[var(--radius)] border text-left transition-colors cursor-pointer"
          >
            <div
              style={{
                backgroundColor: active ? "var(--accent)" : "var(--surface-2)",
                color: active ? "#ffffff" : "var(--text-muted)"
              }}
              className="mt-0.5 w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span
                style={{ color: active ? "var(--accent-text)" : "var(--text)" }}
                className="text-[12.5px] font-semibold tracking-tight"
              >
                {mode.title}
              </span>
              <span className="text-[11px] leading-snug text-muted">{mode.subtitle}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
