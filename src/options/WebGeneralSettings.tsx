import { useCallback, useMemo } from "react";
import { Captions, Globe2, MousePointerClick, Server, Sparkles } from "lucide-react";
import { ModeToggle } from "../popup/components/ModeToggle";
import { Dropdown } from "../popup/components/Dropdown";
import { getAllProviderOptions, getAIProviderOptions } from "../popup/components/ProviderSelect";
import { AUTO_RULE_LABELS, Section } from "./settingsShared";
import { LANGUAGES } from "../languages";
import { BUFFER_LINES } from "../youtube/subtitleCues";
import type { AIProviderId, AutoRule, ProviderId, Settings } from "../types";

const SUBTITLE_LANGUAGE_OPTIONS = LANGUAGES.filter((l) => l.code !== "auto").map((lang) => ({
  value: lang.code,
  label: lang.native,
  description: lang.name
}));

export interface WebSettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  query: string;
}

const SECTION_KEYWORDS = {
  services: [
    "Translation services",
    "Choose services",
    "Page translation service",
    "Selection translation service",
    "AI service"
  ],
  aiDisplay: ["AI translation", "When using AI translation", "Show below", "Replace old"],
  display: ["Translation display mode", "Bilingual", "Translation only"],
  selection: [
    "Selection popup",
    "Show floating translate icon",
    "Translate on hover delay",
    "Hover delay",
    "Show original text"
  ],
  youtube: [
    "YouTube Subtitle",
    "YouTube captions",
    "Subtitle language",
    "Turn captions on automatically",
    "AI subtitles",
    "Show original line",
    "Vietnamese"
  ],
  defaultRule: ["Default behavior", "Always", "Ask", "Never"],
  hostRules: ["Per-site rules"]
};

export const KEYWORDS = [
  ...SECTION_KEYWORDS.services,
  ...SECTION_KEYWORDS.aiDisplay,
  ...SECTION_KEYWORDS.display,
  ...SECTION_KEYWORDS.selection,
  ...SECTION_KEYWORDS.youtube,
  ...SECTION_KEYWORDS.defaultRule,
  ...SECTION_KEYWORDS.hostRules
];

/**
 * General web-translate settings: which service handles each task, the
 * translation display mode, the selection popup behavior, and auto-translate
 * rules.
 */
export function WebGeneralSettings({ settings, onChange, query }: WebSettingsPanelProps) {
  const providerOptions = useMemo(
    () =>
      getAllProviderOptions(settings.customModels).filter(
        (o) =>
          o.value !== "__add_custom__" &&
          !settings.disabledProviders.includes(o.value as ProviderId)
      ),
    [settings.customModels, settings.disabledProviders]
  );

  const aiProviderOptions = useMemo(
    () =>
      getAIProviderOptions(settings.customModels).filter(
        (o) =>
          o.value !== "__add_custom__" &&
          !settings.disabledProviders.includes(o.value as ProviderId)
      ),
    [settings.customModels, settings.disabledProviders]
  );

  const removeHostRule = useCallback(
    (host: string) => {
      const next = { ...settings.hostRules };
      delete next[host];
      onChange({ ...settings, hostRules: next });
    },
    [settings, onChange]
  );

  const hostRuleKeywords = [
    ...SECTION_KEYWORDS.hostRules,
    ...Object.keys(settings.hostRules),
    ...Object.values(settings.hostRules).map((r) => AUTO_RULE_LABELS[r])
  ];

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">General</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Which service handles each task, display mode, the selection popup, YouTube subtitles, and
          auto-translate rules.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.services}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Server className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Translation services
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Choose which service handles each translation task. Enable or disable services under
            Translation Service.
          </p>
          <div className="grid grid-cols-1 gap-2.5 pt-0.5 max-w-xl">
            <div>
              <span className="section-label">Page translation service</span>
              <Dropdown
                value={settings.provider}
                options={providerOptions}
                ariaLabel="Page translation service"
                onChange={(v) => onChange({ ...settings, provider: v as ProviderId })}
              />
            </div>
            <div>
              <span className="section-label">Selection translation service</span>
              <Dropdown
                value={settings.quickProvider}
                options={providerOptions}
                ariaLabel="Selection translation service"
                onChange={(v) => onChange({ ...settings, quickProvider: v as ProviderId })}
              />
            </div>
            <div>
              <span className="section-label">AI service</span>
              <Dropdown
                value={settings.aiProvider}
                options={aiProviderOptions}
                ariaLabel="AI service"
                onChange={(v) => onChange({ ...settings, aiProvider: v as AIProviderId })}
              />
            </div>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.aiDisplay}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              AI translation
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Configure how AI translations are displayed in the popup.
          </p>

          <div className="flex flex-col gap-2 pt-0.5">
            <span className="text-[11.5px] font-medium text-zinc-800">
              When using AI translation
            </span>
            <div className="grid grid-cols-2 gap-1.5 max-w-xs">
              {(
                [
                  ["below", "Show below"],
                  ["replace", "Replace old"]
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...settings, aiTranslationMode: mode })}
                  aria-pressed={settings.aiTranslationMode === mode}
                  className={`choice-chip py-1.5 ${
                    settings.aiTranslationMode === mode ? "choice-chip-active" : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-zinc-500">
              {settings.aiTranslationMode === "replace"
                ? "The AI translation overwrites the main translation in the popup."
                : "The AI translation appears in its own section below the main translation."}
            </p>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.display}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Globe2 className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Translation display mode
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            How translated content is displayed on the page.
          </p>
          <div className="max-w-md">
            <ModeToggle
              value={settings.displayMode}
              onChange={(displayMode) => onChange({ ...settings, displayMode })}
            />
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.selection}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <MousePointerClick className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Selection popup
            </h2>
          </div>

          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Show floating translate icon
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Shows an icon next to selected text. Click it to open the translate popup without
                using the context menu.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.selectionTrigger}
              onChange={(e) => onChange({ ...settings, selectionTrigger: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Show original text
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                When the popup opens, show the original text next to the translation.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.showSelectionOriginal}
              onChange={(e) => onChange({ ...settings, showSelectionOriginal: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
            />
          </label>

          <div className="flex flex-col gap-1.5 pt-1 max-w-md">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-medium text-zinc-800">Translate on hover delay</span>
              <span className="text-[11px] text-brand-700 font-bold tabular-nums bg-brand-50 px-2 py-0.5 rounded-md">
                {settings.selectionHoverDelayMs}ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2000"
              step="50"
              value={settings.selectionHoverDelayMs}
              aria-label="Translate on hover delay"
              onChange={(e) =>
                onChange({ ...settings, selectionHoverDelayMs: Number(e.target.value) })
              }
              className="w-full h-2 rounded-full appearance-none outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                         [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500
                         [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
              style={{
                background: `linear-gradient(to right, var(--brand-500) ${(settings.selectionHoverDelayMs / 2000) * 100}%, var(--slider-track) ${(settings.selectionHoverDelayMs / 2000) * 100}%)`
              }}
            />
            <p className="text-[11px] leading-snug text-zinc-500">
              How long to hover the floating icon before it translates the selection. Set to 0 for
              instant translation.
            </p>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.youtube}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Captions className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              YouTube Subtitle
            </h2>
          </div>

          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Always show YouTube captions in my language
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Whenever captions are on, switch them to the language below. Uses the video&apos;s
                own track when it has one, otherwise YouTube&apos;s auto-translate.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.youtubeSubtitle}
              onChange={(e) => onChange({ ...settings, youtubeSubtitle: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
            />
          </label>

          <div className="max-w-xs">
            <span className="section-label">Subtitle language</span>
            <Dropdown
              value={settings.youtubeSubtitleLang}
              options={SUBTITLE_LANGUAGE_OPTIONS}
              onChange={(youtubeSubtitleLang) => onChange({ ...settings, youtubeSubtitleLang })}
              ariaLabel="Subtitle language"
            />
          </div>

          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Turn captions on automatically
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Turn on captions for every video that has them. You can still switch them off per
                video.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.youtubeSubtitleAutoOn}
              disabled={!settings.youtubeSubtitle}
              onChange={(e) => onChange({ ...settings, youtubeSubtitleAutoOn: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          <div className="pt-2 border-t border-zinc-200/70 space-y-2">
            <span className="block text-[12.5px] font-medium text-zinc-800">AI subtitles</span>
            <p className="text-[11px] leading-snug text-zinc-500">
              YouTube&apos;s captions stay the default. Click the <b>AI</b> button in the YouTube
              player&apos;s control bar and choose <b>AI subtitles</b> to translate the captions
              into the language above with the AI service. The video pauses until the next{" "}
              {BUFFER_LINES} lines are translated, and pauses again if fast dialogue gets ahead of
              the translation.
            </p>
            <label className="flex items-start justify-between gap-3 cursor-pointer group">
              <span className="flex flex-col">
                <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                  Show original line
                </span>
                <span className="text-[11px] leading-snug text-zinc-500">
                  Show the original caption in smaller text under the AI translation.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.youtubeSubtitleBilingual}
                onChange={(e) =>
                  onChange({ ...settings, youtubeSubtitleBilingual: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
              />
            </label>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.defaultRule}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Default behavior
          </h2>
          <div className="grid grid-cols-3 gap-1.5 max-w-sm">
            {(["always", "ask", "never"] as AutoRule[]).map((rule) => (
              <button
                key={rule}
                type="button"
                onClick={() => onChange({ ...settings, autoRule: rule })}
                aria-pressed={settings.autoRule === rule}
                className={`choice-chip py-1.5 uppercase tracking-wider ${
                  settings.autoRule === rule ? "choice-chip-active" : ""
                }`}
              >
                {AUTO_RULE_LABELS[rule]}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Applies to sites without a specific rule below.
          </p>
        </section>
      </Section>

      <Section query={query} keywords={hostRuleKeywords}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Globe2 className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Per-site rules
            </h2>
          </div>
          {Object.keys(settings.hostRules).length === 0 ? (
            <p className="text-[11px] leading-snug text-zinc-500">
              No rules yet. Set a rule from the main popup while viewing a site.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {Object.entries(settings.hostRules).map(([host, rule]) => (
                <li
                  key={host}
                  className="flex items-center justify-between bg-zinc-50 border border-zinc-200/70 rounded-lg px-3 py-2 hover:border-zinc-300 transition-colors duration-200"
                >
                  <span className="text-[12.5px] font-medium text-zinc-800 truncate">{host}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[10px] uppercase font-bold tracking-wider ${
                        rule === "always"
                          ? "bg-brand-100/60 border-brand-200 text-brand-700"
                          : rule === "never"
                            ? "bg-red-100/60 border-red-200 text-red-700"
                            : "bg-zinc-100 border-zinc-200 text-zinc-600"
                      }`}
                    >
                      {AUTO_RULE_LABELS[rule]}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHostRule(host)}
                      className="text-[10.5px] font-semibold text-zinc-400 hover:text-red-600 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Section>
    </div>
  );
}
