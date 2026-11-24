import { Layers, Replace } from "lucide-react";
import type { DisplayMode } from "../../types";

const MODE_META: Record<DisplayMode, { label: string; icon: typeof Layers }> = {
  bilingual: { label: "Bilingual", icon: Layers },
  replace: { label: "Translation only", icon: Replace }
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
      title={`Mode: ${meta.label} · click to switch`}
      aria-label={`Display mode: ${meta.label}. Click to switch.`}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-[12px] font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
    >
      <Icon className="w-3.5 h-3.5 text-brand-600" />
      {meta.label}
    </button>
  );
}
