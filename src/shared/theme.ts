import { useEffect, useState } from "react";
import type { UIThemeMode } from "../types";

export type ResolvedTheme = "light" | "dark";

/** Resolve a user theme preference (`system | light | dark`) against OS dark mode. */
export function resolveTheme(mode: UIThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "dark" || mode === "light") return mode;
  return systemDark ? "dark" : "light";
}

/** Cycle theme preference in a predictable order: system → light → dark → system. */
export function cycleThemeMode(mode: UIThemeMode): UIThemeMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

/** Apply `data-theme` immediately before React mounts to prevent a light/dark flash. */
export function initSystemThemeEarly(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  if (!document.documentElement.hasAttribute("data-theme")) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
}

/**
 * Keep `<html data-theme="light|dark">` synced with the user's `uiTheme`
 * preference and live OS color-scheme changes (matching TubeDeck2k's ThemeProvider).
 */
export function useApplyTheme(theme: UIThemeMode): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const dark =
      typeof window !== "undefined"
        ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false)
        : false;
    return resolveTheme(theme, dark);
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const next = resolveTheme(theme, media.matches);
      document.documentElement.setAttribute("data-theme", next);
      setResolved(next);
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return resolved;
}
