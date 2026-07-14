import { useEffect, useRef, useState, useCallback } from "react";
import { Globe, Radio, Settings as SettingsIcon, Languages } from "lucide-react";
import { WebPanel } from "./WebPanel";
import { StreamPanel } from "./StreamPanel";
import { QuickPanel } from "./QuickPanel";

type TabId = "web" | "stream" | "quick";

const ACTIVE_TAB_KEY = "translator2k:activeTab";

const TABS: { id: TabId; label: string; icon: typeof Globe }[] = [
  { id: "web", label: "Dịch Web", icon: Globe },
  { id: "quick", label: "Dịch nhanh", icon: Languages },
  { id: "stream", label: "Dịch Stream", icon: Radio }
];

/**
 * Root popup shell. Hosts three tabs: page translation, real-time audio
 * subtitles, and a standalone quick translator. All three panels stay mounted
 * (inactive ones are hidden) so switching tabs never destroys in-progress
 * state — e.g. text typed into the quick translator. The last-used tab is
 * remembered in `chrome.storage.local` so the popup reopens where you left.
 */
export function Popup() {
  const [tab, setTab] = useState<TabId>("web");
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  useEffect(() => {
    void (async () => {
      const stored = await chrome.storage.local.get(ACTIVE_TAB_KEY);
      const saved = stored[ACTIVE_TAB_KEY] as TabId | undefined;
      if (saved === "web" || saved === "stream" || saved === "quick") setTab(saved);
    })();
  }, []);

  const selectTab = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      setTab(next);
      void chrome.storage.local.set({ [ACTIVE_TAB_KEY]: next });
    },
    [tab]
  );

  // ARIA tabs keyboard pattern: Left/Right (and Home/End) move focus and
  // selection between tabs.
  const onTablistKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const index = TABS.findIndex((t) => t.id === tab);
      let nextIndex = -1;
      if (e.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
      else if (e.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = TABS.length - 1;
      if (nextIndex === -1) return;
      e.preventDefault();
      const next = TABS[nextIndex].id;
      selectTab(next);
      tabRefs.current.get(next)?.focus();
    },
    [tab, selectTab]
  );

  const openSettings = useCallback(() => {
    const url = chrome.runtime.getURL(`options.html#${tab}`);
    void chrome.tabs.create({ url });
  }, [tab]);

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 px-3 pt-2.5 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={chrome.runtime.getURL("public/icons/icon-32.png")}
              alt=""
              className="w-5 h-5 rounded-md"
            />
            <span className="text-[13px] font-bold tracking-tight text-zinc-900">Translator2k</span>
            <span className="text-[10px] font-medium text-zinc-500 mt-px">
              v{chrome.runtime.getManifest().version}
            </span>
          </div>
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

        <nav className="segment-track" role="tablist" onKeyDown={onTablistKeyDown}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                ref={(node) => {
                  if (node) tabRefs.current.set(id, node);
                  else tabRefs.current.delete(id);
                }}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={active}
                aria-controls={`panel-${id}`}
                tabIndex={active ? 0 : -1}
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

      <div className="flex-1 overflow-y-auto relative">
        {TABS.map(({ id }) => (
          <div
            key={id}
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            hidden={tab !== id}
            className={tab === id ? "animate-fade-in" : undefined}
          >
            {id === "web" && <WebPanel />}
            {id === "stream" && <StreamPanel />}
            {id === "quick" && <QuickPanel />}
          </div>
        ))}
      </div>
    </div>
  );
}
