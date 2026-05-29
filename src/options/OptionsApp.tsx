import { useEffect, useState } from "react";
import { Globe, Radio } from "lucide-react";
import { WebSettings } from "./WebSettings";
import { StreamSettings } from "./StreamSettings";
import { loadSettings, updateSettings, watchSettings, diffSettings } from "../storage";
import { DEFAULT_SETTINGS, type Settings } from "../types";

type SectionId = "web" | "stream";

const SECTIONS: {
  id: SectionId;
  label: string;
  caption: string;
  icon: typeof Globe;
}[] = [
  { id: "web", label: "Dịch Web", caption: "Trang web · bôi đen · từ điển", icon: Globe },
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

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    void (async () => {
      setSettings(await loadSettings());
      unwatch = watchSettings(setSettings);
    })();

    // Deep-link to a section via `#stream` / `#web`.
    const hash = window.location.hash.replace("#", "");
    if (hash === "stream" || hash === "web") setSection(hash);

    return () => unwatch?.();
  }, []);

  async function updateWebSettings(next: Settings) {
    const patch = diffSettings(settings, next);
    setSettings(next);
    await updateSettings(patch);
  }

  return (
    <div className="min-h-screen flex justify-center">
      <div className="w-full max-w-5xl flex gap-6 px-6 py-8">
        {/* Sidebar */}
        <aside className="w-60 shrink-0">
          <div className="sticky top-8">
            <div className="flex items-center gap-2.5 mb-5 px-1">
              <img
                src={chrome.runtime.getURL("public/icons/icon-128.png")}
                alt="Translator2k"
                className="w-9 h-9 rounded-lg shadow-sm"
              />
              <div>
                <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900 leading-tight">
                  Translator2k
                </h1>
                <p className="text-[11px] text-zinc-500 leading-tight">Cài đặt</p>
              </div>
            </div>

            <nav className="flex flex-col gap-1 rounded-xl bg-zinc-100/70 p-2">
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
                      className={`flex h-8 w-8 items-center justify-center rounded-md shrink-0 ${
                        active ? "bg-brand-600 text-white" : "bg-white text-zinc-500 border border-zinc-200"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-semibold tracking-tight">{label}</span>
                      <span className="text-[10.5px] text-zinc-500 truncate">{caption}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <p className="mt-4 px-2 text-[10.5px] text-zinc-400">v2.0.0</p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {section === "web" ? (
            <WebSettings settings={settings} onChange={updateWebSettings} />
          ) : (
            <StreamSettings />
          )}
        </main>
      </div>
    </div>
  );
}
