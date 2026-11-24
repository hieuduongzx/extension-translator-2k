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

/**
 * Keyboard shortcuts for controlling page translation while browsing. Chrome
 * only lets users re-bind commands from `chrome://extensions/shortcuts`, so we
 * read the live assignments with `chrome.commands.getAll()` and show which key
 * combination is really active — including a warning when a command has none
 * bound (e.g. after a reset or a binding conflict).
 */
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
    // Re-read when the tab regains focus in case the user re-bound shortcuts
    // in chrome://extensions/shortcuts while this page was open.
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">Shortcuts</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Keyboard shortcuts to control translation while browsing.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.shortcuts}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Keyboard className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Keyboard shortcuts
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Speed up translation actions right on the page. Chrome binds the keys — you can change
            them at{" "}
            <button
              type="button"
              onClick={openShortcutSettings}
              className="text-brand-700 font-medium hover:underline"
            >
              chrome://extensions/shortcuts
            </button>
            .
          </p>

          {error && (
            <p role="alert" className="text-[11px] text-red-600 font-medium">
              {error}
            </p>
          )}

          <ul className="flex flex-col gap-2 max-w-md">
            {assigned === null ? (
              <li className="text-[11.5px] text-zinc-400 py-1">Loading shortcuts…</li>
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
                    className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="text-[12.5px] font-medium text-zinc-800">
                        {command.label}
                      </span>
                      <span className="text-[11px] leading-snug text-zinc-500">
                        {command.description}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-700">
                        Not assigned
                      </span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          <button
            type="button"
            onClick={openShortcutSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
          >
            <PencilLine className="w-3.5 h-3.5" />
            Change shortcuts
          </button>
        </section>
      </Section>
    </div>
  );
}
