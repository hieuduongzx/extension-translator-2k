import { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from "react";
import {
  BookOpen,
  Captions,
  ChevronRight,
  Keyboard,
  KeyRound,
  Languages,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  Settings2,
  Sun,
  X
} from "lucide-react";
import { loadSettings, updateSettings, watchSettings, diffSettings } from "../storage";
import { DEFAULT_SETTINGS, type Settings, type UIThemeMode } from "../types";
import { matchesSearch } from "../shared/search";
import { cycleThemeMode, useApplyTheme } from "../shared/theme";
import { WebGeneralSettings, KEYWORDS as WEB_GENERAL_KW } from "./WebGeneralSettings";
import { WebServicesSettings, KEYWORDS as WEB_SERVICES_KW } from "./WebServicesSettings";
import { WebShortcutsSettings, KEYWORDS as WEB_SHORTCUTS_KW } from "./WebShortcutsSettings";
import { DictionarySettings, KEYWORDS as WEB_DICTIONARY_KW } from "./DictionarySettings";
import { QuickGeneralSettings, KEYWORDS as QUICK_GENERAL_KW } from "./QuickGeneralSettings";
import { StreamGeneralSettings, KEYWORDS as STREAM_GENERAL_KW } from "./StreamGeneralSettings";
import { StreamOverlaySettings, KEYWORDS as STREAM_OVERLAY_KW } from "./StreamOverlaySettings";

type FeatureId = "web" | "quick" | "stream" | "dictionary";
type CategoryId = "general" | "shortcuts" | "services" | "overlay";

interface NavEntry {
  feature: FeatureId;
  category: CategoryId;
  label: string;
  icon: typeof Settings2;
}

interface NavGroup {
  id: FeatureId;
  label: string;
  items: NavEntry[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "web",
    label: "Web Translate",
    items: [
      { feature: "web", category: "general", label: "General", icon: Settings2 },
      { feature: "web", category: "shortcuts", label: "Shortcuts", icon: Keyboard },
      { feature: "web", category: "services", label: "Services & AI", icon: Server }
    ]
  },
  {
    id: "dictionary",
    label: "Dictionary",
    items: [{ feature: "dictionary", category: "general", label: "Dictionary", icon: BookOpen }]
  },
  {
    id: "quick",
    label: "Quick Translate",
    items: [{ feature: "quick", category: "general", label: "Quick Translate", icon: Languages }]
  },
  {
    id: "stream",
    label: "Stream Translate",
    items: [
      { feature: "stream", category: "general", label: "API & Auto-pause", icon: KeyRound },
      { feature: "stream", category: "overlay", label: "Subtitle Overlay", icon: Captions }
    ]
  }
];

const ALL_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap((g) => g.items);

const CATEGORY_KEYWORDS: Record<FeatureId, Record<string, string[]>> = {
  web: {
    general: WEB_GENERAL_KW,
    shortcuts: WEB_SHORTCUTS_KW,
    services: WEB_SERVICES_KW
  },
  dictionary: { general: WEB_DICTIONARY_KW },
  quick: { general: QUICK_GENERAL_KW },
  stream: { general: STREAM_GENERAL_KW, overlay: STREAM_OVERLAY_KW }
};

interface WebSettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  query: string;
}

interface SimplePanelProps {
  query: string;
}

const WEB_PANELS: Record<
  "general" | "shortcuts" | "services",
  ComponentType<WebSettingsPanelProps>
> = {
  general: WebGeneralSettings,
  shortcuts: WebShortcutsSettings,
  services: WebServicesSettings
};

const QUICK_PANELS: Record<"general", ComponentType<SimplePanelProps>> = {
  general: QuickGeneralSettings
};

const DICTIONARY_PANELS: Record<"general", ComponentType<WebSettingsPanelProps>> = {
  general: DictionarySettings
};

const STREAM_PANELS: Record<"general" | "overlay", ComponentType<SimplePanelProps>> = {
  general: StreamGeneralSettings,
  overlay: StreamOverlaySettings
};

const THEME_OPTIONS: { value: UIThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Auto", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon }
];

function validCategoriesFor(feature: FeatureId): CategoryId[] {
  return NAV_GROUPS.find((g) => g.id === feature)?.items.map((i) => i.category) ?? ["general"];
}

/**
 * Full-page settings shell aligned with TubeDeck2k's collapsible sidebar layout.
 * Deep-links: `#web`, `#web/services`, `#dictionary`, `#quick`, `#stream`,
 * `#stream/overlay`, and legacy `#models` → Web · Translation Service.
 */
export function OptionsApp() {
  const [feature, setFeature] = useState<FeatureId>("web");
  const [activeCategory, setActiveCategory] = useState<Record<FeatureId, CategoryId>>({
    web: "general",
    dictionary: "general",
    quick: "general",
    stream: "general"
  });
  const [collapsed, setCollapsed] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");
  const pendingSaves = useRef(0);

  useApplyTheme(settings.uiTheme);

  const validCats = validCategoriesFor(feature);
  const activeCat = validCats.includes(activeCategory[feature])
    ? activeCategory[feature]
    : validCats[0];

  const dynamicKeywords = useMemo<Record<FeatureId, Record<string, string[]>>>(
    () => ({
      web: {
        general: [
          ...CATEGORY_KEYWORDS.web.general,
          ...Object.keys(settings.hostRules),
          ...Object.values(settings.hostRules)
        ],
        shortcuts: CATEGORY_KEYWORDS.web.shortcuts,
        services: [
          ...CATEGORY_KEYWORDS.web.services,
          ...settings.customModels.flatMap((m) => [m.name, m.model, m.endpoint])
        ]
      },
      dictionary: CATEGORY_KEYWORDS.dictionary,
      quick: CATEGORY_KEYWORDS.quick,
      stream: CATEGORY_KEYWORDS.stream
    }),
    [settings.hostRules, settings.customModels]
  );

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadSettings();
        if (cancelled) return;
        setSettings(loaded);
        unwatch = watchSettings((next) => {
          if (pendingSaves.current === 0) setSettings(next);
        });
      } catch {
        setStorageError("Couldn't read settings. Reload the page.");
      } finally {
        setIsLoaded(true);
      }
    })();

    const hash = window.location.hash.replace("#", "");
    const [hFeature, hCat] = hash.split("/");
    if (
      hFeature === "web" ||
      hFeature === "dictionary" ||
      hFeature === "quick" ||
      hFeature === "stream"
    ) {
      setFeature(hFeature);
      if (hCat && validCategoriesFor(hFeature).includes(hCat as CategoryId)) {
        setActiveCategory((prev) => ({ ...prev, [hFeature]: hCat as CategoryId }));
      }
    }
    if (hash === "models") {
      setFeature("web");
      setActiveCategory((prev) => ({ ...prev, web: "services" }));
      setScrollTarget("models-section");
    }

    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, []);

  // Auto-jump to the first matching section when searching.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    if (matchesSearch(q, ...(dynamicKeywords[feature][activeCat] ?? []))) return;
    const match = ALL_ENTRIES.find((entry) =>
      matchesSearch(q, ...(dynamicKeywords[entry.feature][entry.category] ?? []))
    );
    if (match) {
      setFeature(match.feature);
      setActiveCategory((prev) => ({ ...prev, [match.feature]: match.category }));
      window.history.replaceState(null, "", `#${match.feature}/${match.category}`);
    }
  }, [query, feature, activeCat, dynamicKeywords]);

  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(scrollTarget);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("scroll-highlight");
    }
    setScrollTarget(null);
  }, [feature, activeCat, scrollTarget]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [feature, activeCat]);

  const updateWebSettings = useCallback(
    async (next: Settings) => {
      const patch = diffSettings(settings, next);
      setSettings(next);
      setStorageError("");
      pendingSaves.current++;
      try {
        const saved = await updateSettings(patch);
        if (pendingSaves.current === 1) setSettings(saved);
      } catch {
        setStorageError("Couldn't save settings. Your latest changes were not saved.");
        if (pendingSaves.current === 1) {
          setSettings(await loadSettings().catch(() => settings));
        }
      } finally {
        pendingSaves.current--;
      }
    },
    [settings]
  );

  const selectEntry = useCallback((nextFeature: FeatureId, nextCategory: CategoryId) => {
    setFeature(nextFeature);
    setActiveCategory((prev) => ({ ...prev, [nextFeature]: nextCategory }));
    window.history.replaceState(null, "", `#${nextFeature}/${nextCategory}`);
  }, []);

  const hasAnyMatch =
    query.trim().length === 0 ||
    ALL_ENTRIES.some((entry) =>
      matchesSearch(query, ...(dynamicKeywords[entry.feature][entry.category] ?? []))
    );

  const currentGroup = NAV_GROUPS.find((g) => g.id === feature) ?? NAV_GROUPS[0];
  const currentItem =
    currentGroup.items.find((i) => i.category === activeCat) ?? currentGroup.items[0];

  const renderPanel = () => {
    if (feature === "web") {
      const Panel = WEB_PANELS[activeCat as keyof typeof WEB_PANELS];
      return <Panel settings={settings} onChange={updateWebSettings} query={query} />;
    }
    if (feature === "dictionary") {
      const Panel = DICTIONARY_PANELS[activeCat as keyof typeof DICTIONARY_PANELS];
      return <Panel settings={settings} onChange={updateWebSettings} query={query} />;
    }
    if (feature === "stream") {
      const Panel = STREAM_PANELS[activeCat as keyof typeof STREAM_PANELS];
      return <Panel query={query} />;
    }
    const Panel = QUICK_PANELS[activeCat as keyof typeof QUICK_PANELS];
    return <Panel query={query} />;
  };

  const CollapsedThemeIcon =
    settings.uiTheme === "dark" ? Moon : settings.uiTheme === "light" ? Sun : Monitor;

  return (
    <div className="opt-layout">
      {/* Left sidebar (*2k standard) */}
      <aside className={`opt-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="opt-sidebar-brand">
          <img
            src={chrome.runtime.getURL("public/icons/icon-48.png")}
            alt="Translator2k"
            className="opt-brand-icon"
          />
          {!collapsed && (
            <div className="opt-brand-text">
              <div className="opt-brand-name">Translator2k</div>
              <div className="opt-brand-sub">v{chrome.runtime.getManifest().version}</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="btn-icon-sm"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="opt-nav" aria-label="Settings navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="opt-nav-group">
              {!collapsed && <div className="opt-nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = feature === item.feature && activeCat === item.category;
                return (
                  <button
                    key={`${item.feature}/${item.category}`}
                    type="button"
                    onClick={() => selectEntry(item.feature, item.category)}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? `${group.label} · ${item.label}` : undefined}
                    className={`opt-nav-item ${active ? "is-active" : ""}`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="opt-nav-bottom">
          {collapsed ? (
            <button
              type="button"
              className="opt-nav-item"
              onClick={() =>
                void updateWebSettings({
                  ...settings,
                  uiTheme: cycleThemeMode(settings.uiTheme)
                })
              }
              title={`Theme: ${settings.uiTheme}`}
              aria-label={`Theme: ${settings.uiTheme}`}
            >
              <CollapsedThemeIcon size={16} />
            </button>
          ) : (
            <>
              <span className="opt-nav-group-label px-1 pb-0">Appearance</span>
              <div className="opt-theme-seg" role="radiogroup" aria-label="Appearance theme">
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                  const active = settings.uiTheme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => void updateWebSettings({ ...settings, uiTheme: value })}
                      className={`opt-theme-btn ${active ? "is-active" : ""}`}
                    >
                      <Icon size={12} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main workspace */}
      <div className="opt-main">
        <header className="opt-topbar">
          <div className="opt-breadcrumb">
            <span>{currentGroup.label}</span>
            {currentItem.label !== currentGroup.label && (
              <>
                <ChevronRight size={14} className="shrink-0 opacity-60" />
                <span className="opt-breadcrumb-current">{currentItem.label}</span>
              </>
            )}
          </div>

          <div className="relative w-72 max-w-[45vw]">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Search settings…"
              aria-label="Search settings"
              className="brand-input-sm w-full pl-8 pr-7"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-muted hover:text-primary bg-transparent border-0 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </header>

        <main className={`opt-content ${isLoaded ? "section-enter" : "opacity-0"}`}>
          {storageError && (
            <div role="alert" className="alert-banner alert-banner--danger mb-4">
              <span>{storageError}</span>
            </div>
          )}
          {query.trim().length > 0 && !hasAnyMatch ? (
            <div className="surface-card p-8 text-center">
              <p className="text-[13px] text-muted m-0">No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            renderPanel()
          )}
        </main>
      </div>
    </div>
  );
}
