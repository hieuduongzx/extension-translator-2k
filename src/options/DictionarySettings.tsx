import { BookOpen, MousePointerClick } from "lucide-react";
import { Dropdown } from "../popup/components/Dropdown";
import { ToggleSwitch } from "../popup/components/ToggleSwitch";
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

export function DictionarySettings({ settings, onChange, query }: WebSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">Dictionary</h1>
        <p className="opt-page-subtitle">
          Look up words in Vietnamese dictionaries right on the page.
        </p>
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.trigger}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <BookOpen size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">Dictionary trigger</h2>
              <p className="text-[11.5px] text-muted m-0">
                Look up definitions, phonetics and examples. Falls back to translation if not found.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[13px] font-medium text-primary">Trigger mode</span>
              <span className="text-[11.5px] leading-snug text-muted">
                Which gesture opens the lookup.
              </span>
            </div>
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

          <div className="flex items-center gap-2 pt-0.5 text-[11.5px] text-muted">
            <MousePointerClick size={14} className="shrink-0" />
            <span>
              On pages, lookups are skipped inside inputs, text areas and the extension&apos;s own
              popups.
            </span>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.popupLookup}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <MousePointerClick size={14} />
            </span>
            <h2 className="text-[13.5px] font-semibold text-primary m-0">In translate popup</h2>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-primary">
                Look up words in the translate popup
              </span>
              <span className="text-[11.5px] leading-snug text-muted">
                Double-click a word in the original text inside the translation popup to open the
                dictionary. Requires &ldquo;Show original text&rdquo; in Web Translate → General.
              </span>
            </div>
            <ToggleSwitch
              checked={settings.dictionaryInPopup}
              onChange={(dictionaryInPopup) => onChange({ ...settings, dictionaryInPopup })}
              ariaLabel="Look up words in the translate popup"
            />
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.theme}>
        <section className="surface-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[13px] font-medium text-primary">Popup theme on pages</span>
              <span className="text-[11.5px] leading-snug text-muted">
                Color scheme for the dictionary and translate popups shown on websites.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 shrink-0">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...settings, selectionPopupTheme: t })}
                  aria-pressed={settings.selectionPopupTheme === t}
                  className={`choice-chip px-3.5 ${
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
