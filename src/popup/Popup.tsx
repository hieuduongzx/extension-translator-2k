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

  // Deep-link the options page to the matching section.
  function openSettings() {
    const url = chrome.runtime.getURL(`options.html#${tab}`);
    void chrome.tabs.create({ url });
  }

  return (
    <div>
      <header className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <img
              src={chrome.runtime.getURL("public/icons/icon-128.png")}
              alt="Translator2k"
              className="w-9 h-9 rounded-xl shadow-card ring-1 ring-zinc-200/70"
            />
            <div>
              <h1 className="text-[14px] font-bold tracking-tight text-zinc-900 leading-tight">
                Translator2k
              </h1>
              <p className="text-[11px] text-zinc-500 leading-tight">
                Dịch trang web &amp; phụ đề trực tiếp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openSettings}
            className="btn-icon"
            title="Cài đặt"
            aria-label="Cài đặt"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>

        <nav className="segment-track" role="tablist">
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
        </nav>
      </header>

      <div className={tab === "web" ? "" : "hidden"}>
        <WebPanel />
      </div>
      <div className={tab === "stream" ? "" : "hidden"}>
        <StreamPanel />
      </div>
    </div>
  );
}
