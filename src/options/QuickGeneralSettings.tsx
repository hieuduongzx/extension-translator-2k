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
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">Quick Translate</h1>
        <p className="opt-page-subtitle">Behavior of the quick-translate tab in the popup.</p>
      </header>

      <section className="surface-card p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="icon-badge">
            <Languages size={14} />
          </span>
          <h2 className="text-[13.5px] font-semibold text-primary m-0">Behavior</h2>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-primary">
              Auto-paste clipboard content
            </span>
            <span className="text-[11.5px] leading-snug text-muted">
              Opening the Quick tab automatically pastes clipboard content into the source box.
            </span>
          </div>
          <ToggleSwitch
            checked={settings.pasteFromClipboard}
            disabled={busy}
            onChange={(v) => void togglePaste(v)}
            ariaLabel="Auto-paste clipboard content"
          />
        </div>
        {error && (
          <div role="alert" className="alert-banner alert-banner--danger">
            <span>{error}</span>
          </div>
        )}
      </section>
    </div>
  );
}
