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

interface QuickSettingsProps {
  query: string;
}

const KEYWORDS = [
  "Dịch nhanh",
  "Tự động dán nội dung clipboard",
  "clipboard",
  "popup",
  "dịch trực tiếp"
];

/**
 * Settings for the standalone Quick Translate popup tab.
 */
export function QuickSettings({ query }: QuickSettingsProps) {
  const [settings, setSettings] = useState<QuickSettingsType>(DEFAULT_QUICK_SETTINGS);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    void (async () => {
      const loaded = await loadQuickSettings();
      setSettings(loaded);
      unwatch = watchQuickSettings((next) => setSettings(next));
    })();
    return () => unwatch?.();
  }, []);

  if (!matchesSearch(query, ...KEYWORDS)) return null;

  const togglePaste = async (value: boolean) => {
    const next = { ...settings, pasteFromClipboard: value };
    setSettings(next);
    await updateQuickSettings({ pasteFromClipboard: value });
  };

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Dịch nhanh
        </h1>
        <p className="text-[13px] text-zinc-500 mt-1 dark:text-zinc-400">
          Tuỳ chỉnh tab dịch trực tiếp trong popup.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center dark:bg-brand-900/20 dark:border-brand-800">
            <Languages className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Hành vi
          </h2>
        </div>

        <label className="flex items-start justify-between gap-3 cursor-pointer group">
          <span className="flex flex-col">
            <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors dark:text-zinc-200 dark:group-hover:text-zinc-100">
              Tự động dán nội dung clipboard
            </span>
            <span className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              Mở tab Dịch nhanh là tự động điền nội dung clipboard vào ô văn bản gốc.
            </span>
          </span>
          <ToggleSwitch
            checked={settings.pasteFromClipboard}
            onChange={(v) => void togglePaste(v)}
            ariaLabel="Tự động dán nội dung clipboard"
          />
        </label>
      </section>
    </div>
  );
}
