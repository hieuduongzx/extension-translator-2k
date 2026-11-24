import { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from "react";
import {
  BookOpen,
  Captions,
  Globe,
  Keyboard,
  KeyRound,
  Languages,
  Radio,
  Search,
  Server,
  Settings2,
  X
} from "lucide-react";
import { loadSettings, updateSettings, watchSettings, diffSettings } from "../storage";
import { DEFAULT_SETTINGS, type Settings } from "../types";
import { matchesSearch } from "../shared/search";
import { WebGeneralSettings, KEYWORDS as WEB_GENERAL_KW } from "./WebGeneralSettings";
import { WebServicesSettings, KEYWORDS as WEB_SERVICES_KW } from "./WebServicesSettings";
import { WebShortcutsSettings, KEYWORDS as WEB_SHORTCUTS_KW } from "./WebShortcutsSettings";
import { DictionarySettings, KEYWORDS as WEB_DICTIONARY_KW } from "./DictionarySettings";
import { QuickGeneralSettings, KEYWORDS as QUICK_GENERAL_KW } from "./QuickGeneralSettings";
import { StreamGeneralSettings, KEYWORDS as STREAM_GENERAL_KW } from "./StreamGeneralSettings";
import { StreamOverlaySettings, KEYWORDS as STREAM_OVERLAY_KW } from "./StreamOverlaySettings";

type FeatureId = "web" | "quick" | "stream" | "dictionary";
type CategoryId = "general" | "shortcuts" | "services" | "overlay";

interface Feature {
  id: FeatureId;
  label: string;
  icon: typeof Globe;
}

interface Category {
  id: CategoryId;
  label: string;
  caption: string;
  icon: typeof Globe;
}

const FEATURES: Feature[] = [
  { id: "web", label: "Web Translate", icon: Globe },
  { id: "dictionary", label: "Dictionary", icon: BookOpen },
  { id: "quick", label: "Quick Translate", icon: Languages },
  { id: "stream", label: "Stream Translate", icon: Radio }
];

const CATEGORIES: Record<FeatureId, Category[]> = {
  web: [
    {
      id: "general",
      label: "General",
      caption: "Services · display · popup · rules",
      icon: Settings2
    },
    { id: "shortcuts", label: "Shortcuts", caption: "Alt+A · Alt+S", icon: Keyboard },
    {
      id: "services",
      label: "Translation Service",
      caption: "Providers · AI models",
      icon: Server
    }
  ],
  dictionary: [
    {
      id: "general",
      label: "General",
      caption: "Trigger · theme",
      icon: BookOpen
    }
  ],
  quick: [{ id: "general", label: "General", caption: "Clipboard · behavior", icon: Settings2 }],
  stream: [
    { id: "general", label: "General", caption: "Soniox API key", icon: KeyRound },
    { id: "overlay", label: "Overlay", caption: "Subtitle defaults", icon: Captions }
  ]
};

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

function categoryList(feature: FeatureId): Category[] {
  return CATEGORIES[feature];
}

/**
 * Full-page settings shell: a horizontal feature tab bar (Web / Dictionary /
 * Quick / Stream) on top, and a vertical category sidebar on the left whose
 * entries depend on the active feature (e.g. Web Translate → General,
 * Shortcuts, Translation Service). Deep-links: `#web` / `#dictionary` /
 * `#quick` / `#stream`, `#<feature>/<category>`, and legacy `#models` → Web ·
 * Translation Service.
 */
export function OptionsApp() {
  const [feature, setFeature] = useState<FeatureId>("web");
  const [activeCategory, setActiveCategory] = useState<Record<FeatureId, CategoryId>>({
    web: "general",
    dictionary: "general",
    quick: "general",
    stream: "general"
  });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const featureTabRefs = useRef(new Map<FeatureId, HTMLButtonElement>());
  // Saves still in flight. While > 0, a save response or storage event carries
  // an older snapshot than what the user has typed since, so it is ignored.
  const pendingSaves = useRef(0);

  const cats = categoryList(feature);
  const activeCat = cats.some((c) => c.id === activeCategory[feature])
    ? activeCategory[feature]
    : cats[0].id;

  // Include dynamic hostRules and custom model names/models in the search index
  // so searching a saved domain or custom model works from any tab.
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

    // Deep-link to a feature/category via `#web`, `#web/services`, … or jump
    // straight to the model manager with the legacy `#models`.
    const hash = window.location.hash.replace("#", "");
    const [hFeature, hCat] = hash.split("/");
    if (
      hFeature === "web" ||
      hFeature === "dictionary" ||
      hFeature === "quick" ||
      hFeature === "stream"
    ) {
      setFeature(hFeature);
      if (hCat && categoryList(hFeature).some((c) => c.id === hCat)) {
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

  // When a search query is active, jump to the first matching category (or
  // feature tab if the active feature has no matches) and keep the URL hash in sync.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    if (matchesSearch(q, ...(dynamicKeywords[feature][activeCat] ?? []))) return;
    const sameFeatureMatch = cats.find((c) =>
      matchesSearch(q, ...(dynamicKeywords[feature][c.id] ?? []))
    );
    if (sameFeatureMatch) {
      setActiveCategory((prev) => ({ ...prev, [feature]: sameFeatureMatch.id }));
      window.history.replaceState(null, "", `#${feature}/${sameFeatureMatch.id}`);
      return;
    }
    for (const f of FEATURES) {
      if (f.id === feature) continue;
      const match = categoryList(f.id).find((c) =>
        matchesSearch(q, ...(dynamicKeywords[f.id][c.id] ?? []))
      );
      if (match) {
        setFeature(f.id);
        setActiveCategory((prev) => ({ ...prev, [f.id]: match.id }));
        window.history.replaceState(null, "", `#${f.id}/${match.id}`);
        return;
      }
    }
  }, [query, feature, activeCat, cats, dynamicKeywords]);

  // After the target panel mounts, scroll the relevant card into view.
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(scrollTarget);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("scroll-highlight");
    }
    setScrollTarget(null);
  }, [feature, activeCat, scrollTarget]);

  // Reset scroll when switching feature or category.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
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
        // Only roll back when no newer local edit is still in flight.
        if (pendingSaves.current === 1) {
          setSettings(await loadSettings().catch(() => settings));
        }
      } finally {
        pendingSaves.current--;
      }
    },
    [settings]
  );

  // Keep the URL hash in sync so refresh / back / copied links land on the
  // exact feature + category the user was looking at.
  const selectFeature = useCallback(
    (id: FeatureId) => {
      setFeature(id);
      window.history.replaceState(null, "", `#${id}/${activeCategory[id]}`);
    },
    [activeCategory]
  );

  const onFeatureTablistKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const index = FEATURES.findIndex((f) => f.id === feature);
      let nextIndex = -1;
      if (e.key === "ArrowRight") nextIndex = (index + 1) % FEATURES.length;
      else if (e.key === "ArrowLeft") nextIndex = (index - 1 + FEATURES.length) % FEATURES.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = FEATURES.length - 1;
      if (nextIndex === -1) return;
      e.preventDefault();
      const next = FEATURES[nextIndex].id;
      selectFeature(next);
      featureTabRefs.current.get(next)?.focus();
    },
    [feature, selectFeature]
  );

  const selectCategory = useCallback(
    (id: CategoryId) => {
      setActiveCategory((prev) => ({ ...prev, [feature]: id }));
      window.history.replaceState(null, "", `#${feature}/${id}`);
    },
    [feature]
  );

  const hasAnyMatch =
    query.trim().length === 0 ||
    cats.some((c) => matchesSearch(query, ...(dynamicKeywords[feature][c.id] ?? [])));

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

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar: identity + search + version */}
      <header className="shrink-0 border-b border-zinc-200/70 bg-white/85 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-6 pt-3 pb-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={chrome.runtime.getURL("public/icons/icon-128.png")}
              alt="Translator2k"
              className="w-8 h-8 rounded-xl ring-1 ring-zinc-200/70"
            />
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold tracking-tight text-zinc-900 leading-tight">
                Translator2k
              </h1>
              <p className="text-[10.5px] text-zinc-500 leading-tight">Settings</p>
            </div>
          </div>
          <div className="relative w-72 max-w-[45vw]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
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
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-[10.5px] text-zinc-400 shrink-0">
            v{chrome.runtime.getManifest().version}
          </p>
        </div>

        {/* Horizontal feature tabs */}
        <nav className="max-w-5xl mx-auto px-6 pb-2" aria-label="Settings feature">
          <div
            className="segment-track"
            role="tablist"
            aria-label="Settings feature"
            onKeyDown={onFeatureTablistKeyDown}
          >
            {FEATURES.map(({ id, label, icon: Icon }) => {
              const active = feature === id;
              return (
                <button
                  key={id}
                  ref={(node) => {
                    if (node) featureTabRefs.current.set(id, node);
                    else featureTabRefs.current.delete(id);
                  }}
                  type="button"
                  role="tab"
                  id={`options-tab-${id}`}
                  aria-selected={active}
                  aria-controls={`options-panel-${id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectFeature(id)}
                  className={`segment ${active ? "segment-active" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="flex-1 flex justify-center min-h-0">
        <div className="w-full max-w-5xl flex gap-6 px-6 py-6">
          {/* Vertical category sidebar for the active feature */}
          <aside className="w-56 shrink-0">
            <div className="sticky top-6">
              <nav className="flex flex-col gap-1 rounded-xl bg-zinc-100/70 p-2 border border-zinc-200/50">
                {cats.map(({ id, label, caption, icon: Icon }) => {
                  const active = activeCat === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectCategory(id)}
                      aria-current={active ? "page" : undefined}
                      className={`nav-item ${active ? "nav-item-active" : ""}`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors duration-200 ${
                          active
                            ? "bg-brand-600 text-white"
                            : "bg-white text-zinc-500 border border-zinc-200/80"
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${active ? "scale-110" : ""} transition-transform`}
                        />
                      </span>
                      <span className="flex flex-col min-w-0 text-left">
                        <span className="font-semibold tracking-tight">{label}</span>
                        <span className="text-[10.5px] text-zinc-500 truncate">{caption}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main
            id={`options-panel-${feature}`}
            role="tabpanel"
            aria-labelledby={`options-tab-${feature}`}
            className="flex-1 min-w-0 relative"
          >
            <div
              ref={scrollRef}
              className={`absolute inset-0 overflow-y-auto pr-2 ${isLoaded ? "section-enter" : "opacity-0"}`}
            >
              {storageError && (
                <p
                  role="alert"
                  className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                  {storageError}
                </p>
              )}
              {query.trim().length > 0 && !hasAnyMatch ? (
                <div className="text-center py-8 animate-fade-in">
                  <p className="text-[13px] text-zinc-500">No results for &ldquo;{query}&rdquo;</p>
                </div>
              ) : (
                renderPanel()
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
