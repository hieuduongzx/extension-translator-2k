import { useEffect, useRef, useState, useCallback } from "react";
import {
  BookOpen,
  Globe,
  Languages,
  Monitor,
  Moon,
  Radio,
  Settings as SettingsIcon,
  Sun
} from "lucide-react";
import { WebPanel } from "./WebPanel";
import { StreamPanel } from "./StreamPanel";
import { QuickPanel } from "./QuickPanel";
import { loadSettings, updateSettings, watchSettings } from "../storage";
import { cycleThemeMode, useApplyTheme } from "../shared/theme";
import { DEFAULT_SETTINGS, type UIThemeMode } from "../types";

type TabId = "web" | "quick" | "stream";

const ACTIVE_TAB_KEY = "translator2k:activeTab";

const TABS: { id: TabId; label: string; title: string; icon: typeof Globe }[] = [
  { id: "web", label: "Web", title: "Web Translate", icon: Globe },
  { id: "quick", label: "Quick", title: "Quick Translate", icon: Languages },
  { id: "stream", label: "Stream", title: "Stream Translate", icon: Radio }
];

const THEME_LABELS: Record<UIThemeMode, string> = {
  system: "Theme: System (click to switch)",
  light: "Theme: Light (click to switch)",
  dark: "Theme: Dark (click to switch)"
};

/**
 * Root popup shell aligned with the *2k standard (TubeDeck2k):
 * 1-row header, 3-tab segmented switcher, scrollable body, and 1-row footer.
 * All three panels stay mounted (inactive ones hidden) so switching tabs never
 * discards in-progress Quick Translate drafts.
 */
export function Popup() {
  const [tab, setTab] = useState<TabId>("web");
  const [uiTheme, setUiTheme] = useState<UIThemeMode>(DEFAULT_SETTINGS.uiTheme);
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());
  const userSelectedTab = useRef(false);

  useApplyTheme(uiTheme);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const [stored, settings] = await Promise.all([
        chrome.storage.local.get(ACTIVE_TAB_KEY),
        loadSettings()
      ]);
      if (cancelled) return;
      const saved = stored[ACTIVE_TAB_KEY] as TabId | undefined;
      if (
        !userSelectedTab.current &&
        (saved === "web" || saved === "stream" || saved === "quick")
      ) {
        setTab(saved);
      }
      setUiTheme(settings.uiTheme);
      unwatch = watchSettings((next) => setUiTheme(next.uiTheme));
    })();
    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, []);

  const selectTab = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      userSelectedTab.current = true;
      setTab(next);
      void chrome.storage.local.set({ [ACTIVE_TAB_KEY]: next });
    },
    [tab]
  );

  const handleCycleTheme = useCallback(() => {
    const next = cycleThemeMode(uiTheme);
    setUiTheme(next);
    void updateSettings({ uiTheme: next }).catch(() => {
      /* ignore transient background wake errors */
    });
  }, [uiTheme]);

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

  const openOptions = useCallback((hash: string) => {
    const url = chrome.runtime.getURL(`options.html#${hash}`);
    void chrome.tabs.create({ url });
  }, []);

  const ThemeIcon = uiTheme === "dark" ? Moon : uiTheme === "light" ? Sun : Monitor;

  return (
    <div className="popup-shell">
      {/* 1. Fixed 1-row header */}
      <header className="popup-header">
        <div className="popup-brand">
          <img
            src={chrome.runtime.getURL("public/icons/icon-48.png")}
            alt="Translator2k"
            className="popup-logo"
          />
          <div className="popup-brand-info">
            <div className="popup-title-row">
              <span className="popup-title">Translator2k</span>
            </div>
            <div className="popup-subtitle">
              v{chrome.runtime.getManifest().version} · Web · Quick · Stream
            </div>
          </div>
        </div>
        <div className="popup-header-actions">
          <button
            type="button"
            onClick={handleCycleTheme}
            className="btn-icon-sm"
            title={THEME_LABELS[uiTheme]}
            aria-label={THEME_LABELS[uiTheme]}
          >
            <ThemeIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => openOptions(tab)}
            className="btn-icon-sm"
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </header>

      {/* 2. Segmented tab switcher */}
      <div className="popup-tabs-wrap">
        <nav
          className="segment-track"
          role="tablist"
          aria-label="Translator modes"
          onKeyDown={onTablistKeyDown}
        >
          {TABS.map(({ id, label, title, icon: Icon }) => {
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
                title={title}
                aria-selected={active}
                aria-controls={`panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(id)}
                className={`segment ${active ? "segment-active" : ""}`}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* 3. Scrollable content */}
      <main className="popup-body">
        {TABS.map(({ id }) => (
          <div
            key={id}
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            hidden={tab !== id}
          >
            {id === "web" && <WebPanel />}
            {id === "quick" && <QuickPanel active={tab === "quick"} />}
            {id === "stream" && <StreamPanel />}
          </div>
        ))}
      </main>

      {/* 4. Single-row clean footer */}
      <footer className="popup-footer">
        <button
          type="button"
          className="popup-footer-btn"
          onClick={() => openOptions("dictionary")}
          title="Dictionary & popup settings"
        >
          <BookOpen size={14} />
          <span>Dictionary</span>
        </button>
        <button
          type="button"
          className="popup-footer-btn"
          onClick={() => openOptions(tab)}
          title="Open full Translator2k settings"
        >
          <SettingsIcon size={14} />
          <span>Settings</span>
        </button>
      </footer>
    </div>
  );
}
