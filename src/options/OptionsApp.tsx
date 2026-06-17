import { useEffect, useState, useCallback } from "react";
import { Globe, Radio, Search, Languages } from "lucide-react";
import { WebSettings } from "./WebSettings";
import { StreamSettings } from "./StreamSettings";
import { QuickSettings } from "./QuickSettings";
import { loadSettings, updateSettings, watchSettings, diffSettings } from "../storage";
import { DEFAULT_SETTINGS, type Settings } from "../types";
import { useTheme } from "../shared/useTheme";

type SectionId = "web" | "stream" | "quick";

const SECTIONS: {
  id: SectionId;
  label: string;
  caption: string;
  icon: typeof Globe;
}[] = [
  { id: "web", label: "Dịch Web", caption: "Trang web · bôi đen · từ điển", icon: Globe },
  { id: "stream", label: "Dịch Stream", caption: "Phụ đề thờigian thực", icon: Radio },
  { id: "quick", label: "Dịch nhanh", caption: "Dịch trực tiếp trong popup", icon: Languages }
];

/**
 * Full-page settings shell with a left sidebar listing the extension's two
 * features. Each feature owns an isolated settings panel:
 *  - "Dịch Web"    → page/selection/dictionary/AI settings (shared `Settings`).
 *  - "Dịch Stream" → Soniox API key + overlay defaults (`streamTranslatorSettings`).
 */
export function OptionsApp() {
  useTheme();
  const [section, setSection] = useState<SectionId>("web");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    void (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      setIsLoaded(true);
      unwatch = watchSettings((next) => setSettings(next));
    })();

    // Deep-link to a section via `#web` / `#stream` / `#quick`.
    const hash = window.location.hash.replace("#", "");
    if (hash === "web" || hash === "stream" || hash === "quick") setSection(hash);

    return () => unwatch?.();
  }, []);

  const updateWebSettings = useCallback(async (next: Settings) => {
    const patch = diffSettings(settings, next);
    setSettings(next);
    await updateSettings(patch);
  }, [settings]);

  return (
    <div className="h-screen flex justify-center">
      <div className="w-full max-w-5xl flex gap-6 px-6 py-8">
        {/* Sidebar */}
        <aside className="w-60 shrink-0">
          <div className="sticky top-8">
            <div className="flex items-center gap-2.5 mb-5 px-1">
              <img
                src={chrome.runtime.getURL("public/icons/icon-128.png")}
                alt="Translator2k"
                className="w-9 h-9 rounded-xl shadow-card ring-1 ring-zinc-200/70 dark:ring-zinc-700/70"
              />
              <div>
                <h1 className="text-[15px] font-bold tracking-tight text-zinc-900 leading-tight dark:text-zinc-100">
                  Translator2k
                </h1>
                <p className="text-[11px] text-zinc-500 leading-tight dark:text-zinc-400">Cài đặt</p>
              </div>
            </div>

            <nav className="flex flex-col gap-1 rounded-xl bg-zinc-100/70 p-2 border border-zinc-200/50 dark:bg-zinc-800/70 dark:border-zinc-700/50">
              {SECTIONS.map(({ id, label, caption, icon: Icon }) => {
                const active = section === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={`nav-item ${active ? "nav-item-active" : ""}`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-all duration-200 ${
                        active
                          ? "bg-brand-600 text-white shadow-glow-sm"
                          : "bg-white text-zinc-500 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? "scale-110" : ""} transition-transform`} />
                    </span>
                    <span className="flex flex-col min-w-0 text-left">
                      <span className="font-semibold tracking-tight">{label}</span>
                      <span className="text-[10.5px] text-zinc-500 truncate dark:text-zinc-400">{caption}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm trong cài đặt…"
                className="brand-input-sm w-full pl-8 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>

            <p className="mt-3 px-2 text-[10.5px] text-zinc-400">
              v{chrome.runtime.getManifest().version}
            </p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 relative">
          <div className={`absolute inset-0 overflow-y-auto pr-2 ${isLoaded ? "section-enter" : "opacity-0"}`}>
            {section === "web" && (
              <WebSettings settings={settings} onChange={updateWebSettings} query={query} />
            )}
            {section === "stream" && <StreamSettings query={query} />}
            {section === "quick" && <QuickSettings query={query} />}
          </div>
        </main>
      </div>
    </div>
  );
}
