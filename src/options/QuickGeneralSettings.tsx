import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { ToggleSwitch } from "../popup/components/ToggleSwitch";
import {
  DEFAULT_QUICK_SETTINGS,
  loadQuickSettings,
  updateQuickSettings,
  watchQuickSettings,
  type QuickSettings as QuickSettingsType
} from "../quick/settings";
import { matchesSearch } from "../shared/search";

interface QuickGeneralSettingsProps {
  query: string;
}

export const KEYWORDS = [
  "Quick Translate",
  "General",
  "Auto-paste clipboard content",
  "clipboard",
  "popup",
  "translate directly"
];

/**
 * General settings for the standalone Quick Translate popup tab.
 */
export function QuickGeneralSettings({ query }: QuickGeneralSettingsProps) {
  const [settings, setSettings] = useState<QuickSettingsType>(DEFAULT_QUICK_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const [loaded, hasPerm] = await Promise.all([
        loadQuickSettings(),
        chrome.permissions.contains({ permissions: ["clipboardRead"] }).catch(() => false)
      ]);
      if (cancelled) return;
      if (loaded.pasteFromClipboard && !hasPerm) {
        setSettings({ ...loaded, pasteFromClipboard: false });
        void updateQuickSettings({ pasteFromClipboard: false }).catch(() => undefined);
      } else {
        setSettings(loaded);
      }
      unwatch = watchQuickSettings((next) => setSettings(next));
    })();
    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, []);

  if (!matchesSearch(query, ...KEYWORDS)) return null;

  const togglePaste = async (value: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (value) {
        const granted = await chrome.permissions.request({ permissions: ["clipboardRead"] });
        if (!granted) return;
      } else {
        await chrome.permissions.remove({ permissions: ["clipboardRead"] });
      }
      setSettings((prev) => ({ ...prev, pasteFromClipboard: value }));
      await updateQuickSettings({ pasteFromClipboard: value });
    } catch {
      setError("Couldn't update clipboard permission. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">General</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Behavior of the quick-translate tab in the popup.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
            <Languages className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Behavior</h2>
        </div>

        <label className="flex items-start justify-between gap-3 cursor-pointer group">
          <span className="flex flex-col">
            <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
              Auto-paste clipboard content
            </span>
            <span className="text-[11px] leading-snug text-zinc-500">
              Opening the Quick Translate tab automatically pastes clipboard content into the source
              box.
            </span>
          </span>
          <ToggleSwitch
            checked={settings.pasteFromClipboard}
            disabled={busy}
            onChange={(v) => void togglePaste(v)}
            ariaLabel="Auto-paste clipboard content"
          />
        </label>
        {error && (
          <p role="alert" className="text-[11px] text-red-600 font-medium">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
