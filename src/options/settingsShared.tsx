import type { ReactNode } from "react";
import { matchesSearch } from "../shared/search";
import type { AutoRule, DictionaryMode } from "../types";

export const AUTO_RULE_LABELS: Record<AutoRule, string> = {
  always: "Always",
  ask: "Ask",
  never: "Never"
};

export const THEME_LABELS: Record<"light" | "dark", string> = {
  light: "Light",
  dark: "Dark"
};

export const DICTIONARY_MODE_OPTIONS: {
  value: DictionaryMode;
  label: string;
  description: string;
}[] = [
  {
    value: "doubleclick",
    label: "Double-click",
    description: "Double-click a word to look it up"
  },
  {
    value: "alt-doubleclick",
    label: "Alt + double-click",
    description: "Hold Alt and double-click a word"
  },
  {
    value: "off",
    label: "Off",
    description: "Disable dictionary lookup"
  }
];

/**
 * Wrapper that hides a settings section when the search query does not match
 * any of its keywords.
 */
export function Section({
  query,
  keywords,
  children
}: {
  query: string;
  keywords: string[];
  children: ReactNode;
}) {
  if (!matchesSearch(query, ...keywords)) return null;
  return <>{children}</>;
}

export function ShortcutRow({
  keys,
  label,
  description
}: {
  keys: string[];
  label: string;
  description: string;
}) {
  return (
    <li className="surface-card-sub flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="flex flex-col min-w-0">
        <span className="text-[13px] font-medium text-primary">{label}</span>
        <span className="text-[11.5px] leading-snug text-muted">{description}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 pt-0.5">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10.5px] text-muted">+</span>}
            <kbd className="kbd-key min-w-[26px] h-6 px-1.5 text-[11px]">{k}</kbd>
          </span>
        ))}
      </span>
    </li>
  );
}
