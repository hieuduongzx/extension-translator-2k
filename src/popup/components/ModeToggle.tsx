import { Layers, Replace } from "lucide-react";
import type { DisplayMode } from "../../types";

interface ModeToggleProps {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}

const MODES: { id: DisplayMode; title: string; subtitle: string; icon: typeof Layers }[] = [
  {
    id: "bilingual",
    title: "Song ngữ",
    subtitle: "Hiện bản gốc + bản dịch",
    icon: Layers
  },
  {
    id: "replace",
    title: "Chỉ bản dịch",
    subtitle: "Thay thế văn bản gốc",
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
            className={`group flex items-start gap-2 p-3 rounded-xl border transition-all text-left active:scale-[0.98] ${
              active
                ? "bg-brand-50 border-brand-300 ring-1 ring-brand-200 shadow-glow-sm dark:bg-brand-900/30 dark:border-brand-500/50 dark:ring-brand-500/20"
                : "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-card-hover dark:bg-zinc-800 dark:border-zinc-700 dark:hover:border-zinc-600"
            }`}
          >
            <div
              className={`mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                active
                  ? "bg-brand-600 text-white"
                  : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200 dark:bg-zinc-800 dark:group-hover:bg-zinc-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <span
                className={`text-[12.5px] font-semibold tracking-tight ${
                  active ? "text-brand-900 dark:text-brand-200" : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {mode.title}
              </span>
              <span
                className={`text-[10.5px] leading-snug ${
                  active ? "text-brand-700/80 dark:text-brand-300/80" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {mode.subtitle}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
