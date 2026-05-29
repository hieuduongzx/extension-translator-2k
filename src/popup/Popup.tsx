import { useEffect, useState } from "react";
import { Globe, Radio } from "lucide-react";
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

  return (
    <div>
      <header className="px-3 pt-3 pb-0">
        <div className="flex items-center gap-2.5 mb-3">
          <img
            src={chrome.runtime.getURL("public/icons/icon-128.png")}
            alt="Translator2k"
            className="w-9 h-9 rounded-lg shadow-sm"
          />
          <div>
            <h1 className="text-[14px] font-semibold tracking-tight text-zinc-900 leading-tight">
              Translator2k
            </h1>
            <p className="text-[11px] text-zinc-500 leading-tight">
              Dịch trang web &amp; phụ đề trực tiếp
            </p>
          </div>
        </div>

        <nav className="flex gap-1 border-b border-zinc-200">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-[12.5px] font-semibold tracking-tight border-b-2 transition-colors ${
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === "web" ? <WebPanel /> : <StreamPanel />}
    </div>
  );
}
