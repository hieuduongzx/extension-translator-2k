import { useCallback, useMemo, type ReactNode } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { AutoFreeIcon, BingIcon, CustomIcon, GoogleIcon } from "../popup/components/ProviderSelect";
import { ToggleSwitch } from "../popup/components/ToggleSwitch";
import { Section } from "./settingsShared";
import type { WebSettingsPanelProps } from "./WebGeneralSettings";
import { firstEnabledAIProvider, firstEnabledProvider } from "../storage";
import {
  BUILTIN_PROVIDER_LABELS,
  customProviderId,
  type BuiltinProviderId,
  type CustomModel,
  type ProviderId
} from "../types";

const BUILTIN_SERVICES: {
  id: BuiltinProviderId;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    id: "google",
    label: BUILTIN_PROVIDER_LABELS.google,
    description: "Machine translation",
    icon: <GoogleIcon />
  },
  {
    id: "bing",
    label: BUILTIN_PROVIDER_LABELS.bing,
    description: "Machine translation",
    icon: <BingIcon />
  },
  {
    id: "auto-free",
    label: BUILTIN_PROVIDER_LABELS["auto-free"],
    description: "AI translation",
    icon: <AutoFreeIcon />
  }
];

const SECTION_KEYWORDS = {
  services: [
    "Available services",
    "Google Translate",
    "Bing Translator",
    "AI Translation",
    "Enable",
    "Disable",
    ...BUILTIN_SERVICES.map((s) => s.label)
  ],
  models: [
    "Custom models",
    "Add model",
    "Display name",
    "Endpoint",
    "Model",
    "API key",
    "Disable thinking"
  ]
};

export const KEYWORDS = [...SECTION_KEYWORDS.services, ...SECTION_KEYWORDS.models];

/**
 * Translation service registry: enable/disable built-in services and manage
 * custom OpenAI-compatible LLM models.
 */
export function WebServicesSettings({ settings, onChange, query }: WebSettingsPanelProps) {
  const enabledCount = useMemo(() => {
    const disabled = new Set(settings.disabledProviders);
    const allIds: ProviderId[] = [
      ...BUILTIN_SERVICES.map((s) => s.id),
      ...settings.customModels.map((m) => customProviderId(m.id))
    ];
    return allIds.filter((id) => !disabled.has(id)).length;
  }, [settings.customModels, settings.disabledProviders]);

  const modelKeywords = useMemo(
    () => [
      ...SECTION_KEYWORDS.models,
      ...settings.customModels.flatMap((m) => [m.name, m.model, m.endpoint])
    ],
    [settings.customModels]
  );

  const setProviderEnabled = useCallback(
    (pid: ProviderId, enabled: boolean) => {
      const disabled = new Set(settings.disabledProviders);
      if (!enabled) {
        if (enabledCount <= 1 && !disabled.has(pid)) return;
        disabled.add(pid);
      } else {
        disabled.delete(pid);
      }
      const nextDisabled = [...disabled];

      const mainFallback = firstEnabledProvider(settings.customModels, disabled);
      const aiFallback = firstEnabledAIProvider(settings.customModels, disabled);

      onChange({
        ...settings,
        disabledProviders: nextDisabled,
        provider: !enabled && settings.provider === pid ? mainFallback : settings.provider,
        quickProvider:
          !enabled && settings.quickProvider === pid ? mainFallback : settings.quickProvider,
        aiProvider: !enabled && settings.aiProvider === pid ? aiFallback : settings.aiProvider
      });
    },
    [settings, enabledCount, onChange]
  );

  const updateCustomModel = useCallback(
    (id: string, patch: Partial<CustomModel>) => {
      onChange({
        ...settings,
        customModels: settings.customModels.map((m) => (m.id === id ? { ...m, ...patch } : m))
      });
    },
    [settings, onChange]
  );

  const addCustomModel = useCallback(() => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `m${Date.now()}`;
    onChange({
      ...settings,
      customModels: [
        ...settings.customModels,
        { id, name: "", endpoint: "https://", apiKey: "", model: "" }
      ]
    });
  }, [settings, onChange]);

  const removeCustomModel = useCallback(
    (id: string) => {
      const pid = customProviderId(id);
      const nextModels = settings.customModels.filter((m) => m.id !== id);
      const nextDisabled = settings.disabledProviders.filter((p) => p !== pid);
      const disabledSet = new Set(nextDisabled);
      const mainFallback = firstEnabledProvider(nextModels, disabledSet);
      const aiFallback = firstEnabledAIProvider(nextModels, disabledSet);
      onChange({
        ...settings,
        customModels: nextModels,
        disabledProviders: nextDisabled,
        provider: settings.provider === pid ? mainFallback : settings.provider,
        quickProvider: settings.quickProvider === pid ? mainFallback : settings.quickProvider,
        aiProvider: settings.aiProvider === pid ? aiFallback : settings.aiProvider
      });
    },
    [settings, onChange]
  );

  return (
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">Translation Service</h1>
        <p className="opt-page-subtitle">
          Enable or disable services and configure custom OpenAI-compatible LLM models. Disabled
          services are hidden from pickers.
        </p>
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.services}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Settings2 size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">Available services</h2>
              <p className="text-[11.5px] text-muted m-0">
                Turn a service off to remove it from every translation task.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {BUILTIN_SERVICES.map((service) => {
              const enabled = !settings.disabledProviders.includes(service.id);
              return (
                <div key={service.id} className="surface-card-sub p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {service.icon}
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-primary">
                          {service.label}
                        </span>
                        <span className="text-[11px] text-muted truncate">
                          {service.description}
                        </span>
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={enabled}
                      disabled={enabled && enabledCount <= 1}
                      onChange={(v) => setProviderEnabled(service.id, v)}
                      ariaLabel={`Toggle ${service.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {enabledCount <= 1 && (
            <p className="text-[11.5px] text-muted m-0">
              At least one translation service must remain enabled.
            </p>
          )}
        </section>
      </Section>

      <Section query={query} keywords={modelKeywords}>
        <section id="models-section" className="surface-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="icon-badge">
                <CustomIcon />
              </span>
              <div>
                <h2 className="text-[13.5px] font-semibold text-primary m-0">Custom models</h2>
                <p className="text-[11.5px] text-muted m-0">
                  Add your own OpenAI-compatible endpoint to use across popups and pages.
                </p>
              </div>
            </div>
            <button type="button" onClick={addCustomModel} className="btn-ghost-sm shrink-0">
              <Plus size={14} />
              <span>Add model</span>
            </button>
          </div>

          {settings.customModels.length === 0 ? (
            <p className="text-[12px] text-muted m-0">
              No custom models yet. Click &ldquo;Add model&rdquo; to create one.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {settings.customModels.map((m) => {
                const pid = customProviderId(m.id);
                const enabled = !settings.disabledProviders.includes(pid);
                return (
                  <div key={m.id} className="surface-card-sub flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        spellCheck={false}
                        value={m.name}
                        onChange={(e) => updateCustomModel(m.id, { name: e.target.value })}
                        placeholder="Display name"
                        className="brand-input-sm flex-1 min-w-0 font-medium"
                      />
                      <ToggleSwitch
                        checked={enabled}
                        disabled={enabled && enabledCount <= 1}
                        onChange={(v) => setProviderEnabled(pid, v)}
                        ariaLabel={`Toggle ${m.name || "custom model"}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomModel(m.id)}
                        aria-label="Delete model"
                        title="Delete model"
                        className="btn-icon-sm btn-icon-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="section-label">Endpoint</span>
                      <input
                        type="text"
                        spellCheck={false}
                        value={m.endpoint}
                        onChange={(e) => updateCustomModel(m.id, { endpoint: e.target.value })}
                        placeholder="https://host/v1"
                        className="brand-input-sm w-full"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="section-label">Model</span>
                      <input
                        type="text"
                        spellCheck={false}
                        value={m.model}
                        onChange={(e) => updateCustomModel(m.id, { model: e.target.value })}
                        placeholder="model-name"
                        className="brand-input-sm w-full"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="section-label">API key</span>
                      <input
                        type="password"
                        spellCheck={false}
                        autoComplete="off"
                        value={m.apiKey}
                        onChange={(e) => updateCustomModel(m.id, { apiKey: e.target.value })}
                        placeholder="sk-…"
                        className="brand-input-sm w-full"
                      />
                    </label>

                    <div className="flex items-start justify-between gap-2 pt-1">
                      <span className="text-[11.5px] text-muted leading-snug">
                        Disable thinking (<code>reasoning.effort = none</code>). Turn off if your
                        endpoint rejects this field.
                      </span>
                      <ToggleSwitch
                        checked={m.noReasoning ?? false}
                        onChange={(noReasoning) => updateCustomModel(m.id, { noReasoning })}
                        ariaLabel="Disable thinking"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </Section>
    </div>
  );
}
