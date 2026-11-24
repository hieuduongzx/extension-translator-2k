const MODIFIER_LABELS: Record<string, string> = {
  Command: "Cmd",
  MacCtrl: "Ctrl"
};

/**
 * Split a Chrome command shortcut (e.g. "Alt+A" or "Ctrl+Shift+Y") into
 * individual key chips for display, compacting platform-specific modifier
 * names.
 */
export function formatShortcutKeys(shortcut: string): string[] {
  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => MODIFIER_LABELS[part] ?? part);
}
