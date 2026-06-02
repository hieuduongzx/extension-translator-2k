import { useEffect, useState } from "react";
import { Globe, Radio, Settings as SettingsIcon } from "lucide-react";
import { WebPanel } from "./WebPanel";
import { StreamPanel } from "./StreamPanel";

type TabId = "web" | "stream";

const ACTIVE_TAB_KEY = "translator2k:activeTab";

const TABS: { id: TabId; label: string; icon: typeof Globe }[] = [
  { id: "web", label: "Dịch Web", icon: Globe },
  { id: "stream", label: "Dịch Stream", icon: Radio }
];

/**
 * Root popup shell. Hosts the two features as tabs ("Dịch Web" for page
 * translation, "Dịch Stream" for real-time audio subtitles). The last-used tab
 * is remembered in `chrome.storage.local` so the popup reopens where you left.
 */
export function Popup() {
  const [tab, setTab] = useState<TabId>("web");

  useEffect(() => {
    void (async () => {
      const stored = await chrome.storage.local.get(ACTIVE_TAB_KEY);
      const saved = stored[ACTIVE_TAB_KEY] as TabId | undefined;
      if (saved === "web" || saved === "stream") setTab(saved);
    })();
  }, []);

  function selectTab(next: TabId) {
    setTab(next);
    void chrome.storage.local.set({ [ACTIVE_TAB_KEY]: next });
  }

  function openSettings() {
    const url = chrome.runtime.getURL(`options.html#${tab}`);
    void chrome.tabs.create({ url });
  }

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
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className={tab === "web" ? "" : "hidden"}>
          <WebPanel />
        </div>
        <div className={tab === "stream" ? "" : "hidden"}>
          <StreamPanel />
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-200/80 bg-white/90 backdrop-blur-sm px-2 py-1.5 flex items-center justify-end">
        <button
          type="button"
          onClick={openSettings}
          className="btn-icon-sm"
          title="Cài đặt"
          aria-label="Cài đặt"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
