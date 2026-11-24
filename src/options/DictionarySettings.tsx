import { BookOpen, MousePointerClick } from "lucide-react";
import { Dropdown } from "../popup/components/Dropdown";
import { DICTIONARY_MODE_OPTIONS, Section, THEME_LABELS } from "./settingsShared";
import type { WebSettingsPanelProps } from "./WebGeneralSettings";
import type { DictionaryMode } from "../types";

const SECTION_KEYWORDS = {
  trigger: [
    "Dictionary",
    "Dictionary trigger",
    "Tra từ",
    "Từ điển",
    "Double-click",
    "Alt + double-click",
    "Look up a word",
    "Definitions",
    "Pronunciation",
    "Examples",
    "Off",
    "Disable dictionary lookup"
  ],
  popupLookup: [
    "In translate popup",
    "Translate popup",
    "Selection popup",
    "Original text",
    "Look up words in the translate popup",
    "Double-click a word in the original text",
    "Show original text",
    "In-popup dictionary"
  ],
  theme: [
    "Popup theme on pages",
    "Popup theme",
    "Light",
    "Dark",
    "Dictionary popup background",
    "Background color"
  ]
};

export const KEYWORDS = [
  ...SECTION_KEYWORDS.trigger,
  ...SECTION_KEYWORDS.popupLookup,
  ...SECTION_KEYWORDS.theme
];

/**
 * Dictionary popup settings: how to trigger a lookup (double-click vs
 * Alt + double-click) and the popup theme shared with the selection popup.
 */
export function DictionarySettings({ settings, onChange, query }: WebSettingsPanelProps) {
  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">Dictionary</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Look up words in Vietnamese dictionaries right on the page.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.trigger}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Dictionary trigger
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Double-click a word to open the dictionary popup with definitions, pronunciation and
            examples. Falls back to the translator when the word is not found.
          </p>
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <span className="flex flex-col flex-1 min-w-0">
              <span className="text-[12.5px] font-medium text-zinc-800">Trigger mode</span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Which gesture opens the lookup.
              </span>
            </span>
            <div className="w-[200px] shrink-0">
              <Dropdown
                value={settings.dictionaryMode}
                options={DICTIONARY_MODE_OPTIONS}
                onChange={(dictionaryMode) =>
                  onChange({ ...settings, dictionaryMode: dictionaryMode as DictionaryMode })
                }
                ariaLabel="Dictionary trigger"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5 text-[11px] text-zinc-500">
            <MousePointerClick className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>
              On pages, lookups are skipped inside inputs, text areas and the extension&apos;s own
              popups.
            </span>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.popupLookup}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <MousePointerClick className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              In translate popup
            </h2>
          </div>
          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Look up words in the translate popup
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Double-click a word in the original text inside the translation popup to open the
                dictionary. Requires the &ldquo;Show original text&rdquo; option in Web Translate →
                General → Selection popup.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.dictionaryInPopup}
              onChange={(e) => onChange({ ...settings, dictionaryInPopup: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
            />
          </label>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.theme}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-col flex-1 min-w-0">
              <span className="text-[12.5px] font-medium text-zinc-800">Popup theme on pages</span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Background color of the dictionary and translate popups shown on websites.
              </span>
            </span>
            <div className="grid grid-cols-2 gap-1.5 shrink-0">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...settings, selectionPopupTheme: t })}
                  aria-pressed={settings.selectionPopupTheme === t}
                  className={`choice-chip px-3 py-1.5 uppercase tracking-wider ${
                    settings.selectionPopupTheme === t ? "choice-chip-active" : ""
                  }`}
                >
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </section>
      </Section>
    </div>
  );
}
