import { Layers, Replace } from "lucide-react";
import type { DisplayMode } from "../../types";

const MODE_META: Record<DisplayMode, { label: string; icon: typeof Layers }> = {
  bilingual: { label: "Song ngữ", icon: Layers },
  replace: { label: "Chỉ bản dịch", icon: Replace }
};

interface ModeSwitchProps {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}

/**
 * Compact icon switch for the popup. Shows the icon + label of the current
 * display mode; clicking flips to the other mode. Keeps the popup tidy versus
 * the two-card {@link ModeToggle} used on the settings page.
 */
export function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  const meta = MODE_META[value];
  const Icon = meta.icon;
  const next: DisplayMode = value === "bilingual" ? "replace" : "bilingual";
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={`Chế độ: ${meta.label} · bấm để đổi`}
      aria-label={`Chế độ hiển thị: ${meta.label}. Bấm để đổi.`}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-[12px] font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:hover:border-zinc-600"
    >
      <Icon className="w-3.5 h-3.5 text-brand-600" />
      {meta.label}
    </button>
  );
}
