import { useEffect, useState, useCallback } from "react";
import { Globe, Radio, Search, Languages, X } from "lucide-react";
import { WebSettings } from "./WebSettings";
import { StreamSettings } from "./StreamSettings";
import { QuickSettings } from "./QuickSettings";
import { loadSettings, updateSettings, watchSettings, diffSettings } from "../storage";
import { DEFAULT_SETTINGS, type Settings } from "../types";

type SectionId = "web" | "stream" | "quick";

const SECTIONS: {
  id: SectionId;
  label: string;
  caption: string;
  icon: typeof Globe;
}[] = [
  { id: "web", label: "Dịch Web", caption: "Trang web · bôi đen · từ điển", icon: Globe },
  { id: "quick", label: "Dịch nhanh", caption: "Dịch trực tiếp trong popup", icon: Languages },
  { id: "stream", label: "Dịch Stream", caption: "Phụ đề thời gian thực", icon: Radio }
];

/**
 * Full-page settings shell with a left sidebar listing the extension's two
 * features. Each feature owns an isolated settings panel:
 *  - "Dịch Web"    → page/selection/dictionary/AI settings (shared `Settings`).
 *  - "Dịch Stream" → Soniox API key + overlay defaults (`streamTranslatorSettings`).
 */
export function OptionsApp() {
  const [section, setSection] = useState<SectionId>("web");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    void (async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      setIsLoaded(true);
      unwatch = watchSettings((next) => setSettings(next));
    })();

    // Deep-link to a section via `#web` / `#stream` / `#quick`, or jump
    // straight to the model manager with `#models`.
    const hash = window.location.hash.replace("#", "");
    if (hash === "web" || hash === "stream" || hash === "quick") setSection(hash);
    else if (hash === "models") {
      setSection("web");
      setScrollTarget("models-section");
    }

    return () => unwatch?.();
  }, []);

  // After the target section mounts, scroll the relevant card into view.
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(scrollTarget);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("scroll-highlight");
    }
    setScrollTarget(null);
  }, [section, scrollTarget]);

  const updateWebSettings = useCallback(
    async (next: Settings) => {
      const patch = diffSettings(settings, next);
      setSettings(next);
      await updateSettings(patch);
    },
    [settings]
  );

  // Keep the URL hash in sync so refresh / back / copied links land on the
  // section the user was looking at.
  const selectSection = useCallback((id: SectionId) => {
    setSection(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

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
                className="w-9 h-9 rounded-xl ring-1 ring-zinc-200/70"
              />
              <div>
                <h1 className="text-[15px] font-bold tracking-tight text-zinc-900 leading-tight">
                  Translator2k
                </h1>
                <p className="text-[11px] text-zinc-500 leading-tight">Cài đặt</p>
              </div>
            </div>

            <nav className="flex flex-col gap-1 rounded-xl bg-zinc-100/70 p-2 border border-zinc-200/50">
              {SECTIONS.map(({ id, label, caption, icon: Icon }) => {
                const active = section === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectSection(id)}
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

            <div className="mt-4 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                placeholder="Tìm trong cài đặt…"
                aria-label="Tìm trong cài đặt"
                className="brand-input-sm w-full pl-8 pr-7"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Xoá tìm kiếm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <p className="mt-3 px-2 text-[10.5px] text-zinc-400">
              v{chrome.runtime.getManifest().version}
            </p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 relative">
          <div
            className={`absolute inset-0 overflow-y-auto pr-2 ${isLoaded ? "section-enter" : "opacity-0"}`}
          >
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
