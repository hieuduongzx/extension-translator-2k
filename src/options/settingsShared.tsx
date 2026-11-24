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
 * any of its keywords. Keywords should include the section title, descriptions,
 * labels, and any distinctive control text.
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
    <li className="flex items-start justify-between gap-3 bg-zinc-50 border border-zinc-200/70 rounded-lg px-3 py-2.5 hover:border-zinc-300 transition-colors duration-200">
      <span className="flex flex-col min-w-0">
        <span className="text-[12.5px] font-medium text-zinc-800">{label}</span>
        <span className="text-[11px] leading-snug text-zinc-500">{description}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 pt-0.5">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-zinc-400">+</span>}
            <kbd className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md border border-zinc-300 bg-white text-[11px] font-bold text-zinc-700 shadow-sm">
              {k}
            </kbd>
          </span>
        ))}
      </span>
    </li>
  );
}
