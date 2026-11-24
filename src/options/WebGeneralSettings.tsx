import { useCallback, useMemo } from "react";
import { Captions, Globe2, MousePointerClick, Server, Sparkles } from "lucide-react";
import { ModeToggle } from "../popup/components/ModeToggle";
import { Dropdown } from "../popup/components/Dropdown";
import { ToggleSwitch } from "../popup/components/ToggleSwitch";
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
 * General web-translate settings.
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

  const hoverPercent = (settings.selectionHoverDelayMs / 2000) * 100;

  return (
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">General</h1>
        <p className="opt-page-subtitle">
          Which service handles each task, display mode, selection popup, YouTube subtitles, and
          auto-translate rules.
        </p>
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.services}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Server size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">Translation services</h2>
              <p className="text-[11.5px] text-muted m-0">
                Choose which service handles each task. Manage providers under Services &amp; AI.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 pt-1 max-w-xl">
            <div className="flex flex-col gap-1">
              <span className="section-label">Page translation service</span>
              <Dropdown
                value={settings.provider}
                options={providerOptions}
                ariaLabel="Page translation service"
                onChange={(v) => onChange({ ...settings, provider: v as ProviderId })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="section-label">Selection translation service</span>
              <Dropdown
                value={settings.quickProvider}
                options={providerOptions}
                ariaLabel="Selection translation service"
                onChange={(v) => onChange({ ...settings, quickProvider: v as ProviderId })}
              />
            </div>
            <div className="flex flex-col gap-1">
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
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Sparkles size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">AI translation</h2>
              <p className="text-[11.5px] text-muted m-0">
                Configure how AI translations are displayed in the selection popup.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-0.5">
            <span className="text-[12.5px] font-medium text-primary">
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
                  className={`choice-chip ${
                    settings.aiTranslationMode === mode ? "choice-chip-active" : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] leading-snug text-muted m-0">
              {settings.aiTranslationMode === "replace"
                ? "The AI translation overwrites the main translation in the popup."
                : "The AI translation appears in its own section below the main translation."}
            </p>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.display}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Globe2 size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">
                Translation display mode
              </h2>
              <p className="text-[11.5px] text-muted m-0">
                How translated content is displayed on the page.
              </p>
            </div>
          </div>
          <div className="max-w-md">
            <ModeToggle
              value={settings.displayMode}
              onChange={(displayMode) => onChange({ ...settings, displayMode })}
            />
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.selection}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <MousePointerClick size={14} />
            </span>
            <h2 className="text-[13.5px] font-semibold text-primary m-0">Selection popup</h2>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-primary">
                Show floating translate icon
              </span>
              <span className="text-[11.5px] leading-snug text-muted">
                Shows a compact icon next to selected text. Click it to open the translate popup
                without using the context menu.
              </span>
            </div>
            <ToggleSwitch
              checked={settings.selectionTrigger}
              onChange={(selectionTrigger) => onChange({ ...settings, selectionTrigger })}
              ariaLabel="Show floating translate icon"
            />
          </div>

          <div className="ui-divider" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-primary">Show original text</span>
              <span className="text-[11.5px] leading-snug text-muted">
                When the popup opens, show the original text above the translation.
              </span>
            </div>
            <ToggleSwitch
              checked={settings.showSelectionOriginal}
              onChange={(showSelectionOriginal) => onChange({ ...settings, showSelectionOriginal })}
              ariaLabel="Show original text"
            />
          </div>

          <div className="ui-divider" />

          <div className="flex flex-col gap-1.5 max-w-md">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-primary">Translate on hover delay</span>
              <span className="value-pill">{settings.selectionHoverDelayMs}ms</span>
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
              className="ui-range"
              style={{
                background: `linear-gradient(to right, var(--accent) ${hoverPercent}%, var(--slider-track) ${hoverPercent}%)`
              }}
            />
            <p className="text-[11.5px] leading-snug text-muted m-0">
              How long to hover the floating icon before it translates. Set to 0 for instant.
            </p>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.youtube}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Captions size={14} />
            </span>
            <h2 className="text-[13.5px] font-semibold text-primary m-0">YouTube Subtitle</h2>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-primary">
                Always show YouTube captions in my language
              </span>
              <span className="text-[11.5px] leading-snug text-muted">
                Whenever captions are on, switch them to the language below. Uses the video&apos;s
                own track when available, otherwise YouTube&apos;s auto-translate.
              </span>
            </div>
            <ToggleSwitch
              checked={settings.youtubeSubtitle}
              onChange={(youtubeSubtitle) => onChange({ ...settings, youtubeSubtitle })}
              ariaLabel="Always show YouTube captions in my language"
            />
          </div>

          <div className="max-w-xs flex flex-col gap-1">
            <span className="section-label">Subtitle language</span>
            <Dropdown
              value={settings.youtubeSubtitleLang}
              options={SUBTITLE_LANGUAGE_OPTIONS}
              onChange={(youtubeSubtitleLang) => onChange({ ...settings, youtubeSubtitleLang })}
              ariaLabel="Subtitle language"
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-primary">
                Turn captions on automatically
              </span>
              <span className="text-[11.5px] leading-snug text-muted">
                Turn on captions for every video that has them. You can still toggle them per video.
              </span>
            </div>
            <ToggleSwitch
              checked={settings.youtubeSubtitleAutoOn}
              disabled={!settings.youtubeSubtitle}
              onChange={(youtubeSubtitleAutoOn) => onChange({ ...settings, youtubeSubtitleAutoOn })}
              ariaLabel="Turn captions on automatically"
            />
          </div>

          <div className="ui-divider" />

          <div className="space-y-2.5">
            <div>
              <span className="block text-[13px] font-medium text-primary">AI subtitles</span>
              <p className="text-[11.5px] leading-snug text-muted mt-0.5 mb-0">
                YouTube&apos;s captions stay the default. Click the{" "}
                <strong className="text-primary">AI</strong> button in the YouTube player bar and
                choose <strong className="text-primary">AI subtitles</strong> to translate into the
                language above. The video buffers the next {BUFFER_LINES} lines as needed.
              </p>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-primary">Show original line</span>
                <span className="text-[11.5px] leading-snug text-muted">
                  Show the original caption in smaller text under the AI translation.
                </span>
              </div>
              <ToggleSwitch
                checked={settings.youtubeSubtitleBilingual}
                onChange={(youtubeSubtitleBilingual) =>
                  onChange({ ...settings, youtubeSubtitleBilingual })
                }
                ariaLabel="Show original line"
              />
            </div>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={SECTION_KEYWORDS.defaultRule}>
        <section className="surface-card p-4 space-y-3">
          <h2 className="text-[13.5px] font-semibold text-primary m-0">Default behavior</h2>
          <div className="grid grid-cols-3 gap-1.5 max-w-sm">
            {(["always", "ask", "never"] as AutoRule[]).map((rule) => (
              <button
                key={rule}
                type="button"
                onClick={() => onChange({ ...settings, autoRule: rule })}
                aria-pressed={settings.autoRule === rule}
                className={`choice-chip ${settings.autoRule === rule ? "choice-chip-active" : ""}`}
              >
                {AUTO_RULE_LABELS[rule]}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] leading-snug text-muted m-0">
            Applies to sites without a specific rule below.
          </p>
        </section>
      </Section>

      <Section query={query} keywords={hostRuleKeywords}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Globe2 size={14} />
            </span>
            <h2 className="text-[13.5px] font-semibold text-primary m-0">Per-site rules</h2>
          </div>
          {Object.keys(settings.hostRules).length === 0 ? (
            <p className="text-[12px] leading-snug text-muted m-0">
              No rules yet. Set a rule from the popup while viewing a site.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 list-none p-0 m-0">
              {Object.entries(settings.hostRules).map(([host, rule]) => (
                <li
                  key={host}
                  className="surface-card-sub flex items-center justify-between px-3 py-2"
                >
                  <span className="text-[13px] font-medium text-primary truncate">{host}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span
                      className={`status-pill ${
                        rule === "always"
                          ? "status-pill--accent"
                          : rule === "never"
                            ? "status-pill--danger"
                            : ""
                      }`}
                    >
                      {AUTO_RULE_LABELS[rule]}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHostRule(host)}
                      className="btn-ghost-sm h-7 px-2 text-[11.5px]"
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
