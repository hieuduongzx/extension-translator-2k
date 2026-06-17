import { useEffect, useState, useCallback } from "react";
import { Globe, Radio, Settings as SettingsIcon, Languages } from "lucide-react";
import { WebPanel } from "./WebPanel";
import { StreamPanel } from "./StreamPanel";
import { QuickPanel } from "./QuickPanel";
import { useTheme } from "../shared/useTheme";

type TabId = "web" | "stream" | "quick";

const ACTIVE_TAB_KEY = "translator2k:activeTab";

const TABS: { id: TabId; label: string; icon: typeof Globe }[] = [
  { id: "web", label: "Dịch Web", icon: Globe },
  { id: "stream", label: "Dịch Stream", icon: Radio },
  { id: "quick", label: "Dịch nhanh", icon: Languages }
];

/**
 * Root popup shell. Hosts three tabs: page translation, real-time audio
 * subtitles, and a standalone quick translator. The last-used tab is remembered
 * in `chrome.storage.local` so the popup reopens where you left.
 */
export function Popup() {
  useTheme();
  const [tab, setTab] = useState<TabId>("web");
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await chrome.storage.local.get(ACTIVE_TAB_KEY);
      const saved = stored[ACTIVE_TAB_KEY] as TabId | undefined;
      if (saved === "web" || saved === "stream" || saved === "quick") setTab(saved);
    })();
  }, []);

  const selectTab = useCallback((next: TabId) => {
    if (next === tab) return;
    setAnimating(true);
    setTab(next);
    void chrome.storage.local.set({ [ACTIVE_TAB_KEY]: next });
    // Reset animation flag after transition
    window.setTimeout(() => setAnimating(false), 300);
  }, [tab]);

  const openSettings = useCallback(() => {
    const hash = tab === "quick" ? "web" : tab;
    const url = chrome.runtime.getURL(`options.html#${hash}`);
    void chrome.tabs.create({ url });
  }, [tab]);

  return (
    <div className="flex flex-col h-full">
      <nav className="shrink-0 px-3 pt-2.5 pb-2" role="tablist">
        <div className="segment-track">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(id)}
                className={`segment ${active ? "segment-active" : ""}`}
              >
                <Icon className={`w-3.5 h-3.5 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto relative">
        <div
          key={tab}
          className={`${animating ? "animate-slide-up" : ""}`}
        >
          {tab === "web" && <WebPanel />}
          {tab === "stream" && <StreamPanel />}
          {tab === "quick" && <QuickPanel />}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-200/80 bg-white/90 backdrop-blur-sm px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-400 font-medium tracking-tight">
          v{chrome.runtime.getManifest().version}
        </span>
        <button
          type="button"
          onClick={openSettings}
          className="btn-icon-sm hover-lift"
          title="Cài đặt"
          aria-label="Cài đặt"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
