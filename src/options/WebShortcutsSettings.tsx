import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Keyboard, PencilLine } from "lucide-react";
import { Section, ShortcutRow } from "./settingsShared";
import { formatShortcutKeys } from "../shared/shortcuts";
import type { WebSettingsPanelProps } from "./WebGeneralSettings";

const SECTION_KEYWORDS = {
  shortcuts: [
    "Keyboard shortcuts",
    "Translate / untranslate the whole page",
    "Translate the selection",
    "Alt",
    "Alt+A",
    "Alt+S",
    "Not assigned",
    "Change shortcut",
    "chrome://extensions/shortcuts",
    "Phím tắt"
  ]
};

export const KEYWORDS = [...SECTION_KEYWORDS.shortcuts];

interface CommandDef {
  name: string;
  label: string;
  description: string;
}

const COMMANDS: CommandDef[] = [
  {
    name: "toggle-translation",
    label: "Translate / untranslate the whole page",
    description: "Turn translation of the current page on or off."
  },
  {
    name: "translate-selection",
    label: "Translate the selection",
    description: "Select a passage, then press to translate just that passage in place."
  }
];

function openShortcutSettings(): void {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

export function WebShortcutsSettings({ query }: WebSettingsPanelProps) {
  const [assigned, setAssigned] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    chrome.commands
      .getAll()
      .then((commands) => {
        const map: Record<string, string> = {};
        for (const command of commands) {
          if (!command.name) continue;
          map[command.name] = command.shortcut ?? "";
        }
        setAssigned(map);
        setError("");
      })
      .catch(() => setError("Couldn't read shortcut assignments."));
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">Shortcuts</h1>
        <p className="opt-page-subtitle">
          Keyboard shortcuts to control translation while browsing.
        </p>
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.shortcuts}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Keyboard size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">Keyboard shortcuts</h2>
              <p className="text-[11.5px] text-muted m-0">
                Chrome manages extension keybindings at{" "}
                <button
                  type="button"
                  onClick={openShortcutSettings}
                  className="text-accent font-medium hover:underline bg-transparent border-0 p-0 cursor-pointer"
                >
                  chrome://extensions/shortcuts
                </button>
                .
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="alert-banner alert-banner--danger">
              <span>{error}</span>
            </div>
          )}

          <ul className="flex flex-col gap-2 max-w-lg list-none p-0 m-0">
            {assigned === null ? (
              <li className="text-[12px] text-muted py-1">Loading shortcuts…</li>
            ) : (
              COMMANDS.map((command) => {
                const shortcut = assigned[command.name] ?? "";
                if (shortcut) {
                  return (
                    <ShortcutRow
                      key={command.name}
                      keys={formatShortcutKeys(shortcut)}
                      label={command.label}
                      description={command.description}
                    />
                  );
                }
                return (
                  <li
                    key={command.name}
                    className="alert-banner alert-banner--warning items-center justify-between"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-primary">{command.label}</span>
                      <span className="text-[11.5px] leading-snug text-muted">
                        {command.description}
                      </span>
                    </span>
                    <span className="status-pill status-pill--warning shrink-0">
                      <AlertTriangle size={12} />
                      <span>Not assigned</span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          <button type="button" onClick={openShortcutSettings} className="btn-ghost-sm">
            <PencilLine size={14} />
            <span>Change shortcuts</span>
          </button>
        </section>
      </Section>
    </div>
  );
}
