import { Layers, Replace } from "lucide-react";
import type { DisplayMode } from "../../types";

const MODE_META: Record<DisplayMode, { label: string; icon: typeof Layers }> = {
  bilingual: { label: "Bilingual", icon: Layers },
  replace: { label: "Replace", icon: Replace }
};

interface ModeSwitchProps {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}

/**
 * Compact display mode switcher for the popup. Clicking flips between
 * Bilingual and Replace without wrapping onto two lines.
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
      className="btn-ghost-sm h-7 px-2.5 text-[12px]"
    >
      <Icon className="w-3.5 h-3.5 text-accent shrink-0" />
      <span>{meta.label}</span>
    </button>
  );
}
