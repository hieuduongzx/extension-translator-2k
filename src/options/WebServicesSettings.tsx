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
 * Translation service registry: every available service with an on/off toggle
 * and, where applicable, its LLM configuration. Disabled services are hidden
 * from the task → service pickers in General.
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

      // If a task currently uses the provider being turned off, fall back to
      // the first still-enabled service (including built-in AI or custom models).
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
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">Translation Service</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Enable or disable services and configure your custom LLM models. The auto-free model is
          the bundled default and cannot be edited. Disabled services are hidden from the service
          pickers in General.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS.services}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Available services
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Turn a service off to remove it from every translation task.
          </p>

          <div className="flex flex-col gap-2">
            {BUILTIN_SERVICES.map((service) => {
              const enabled = !settings.disabledProviders.includes(service.id);
              return (
                <div
                  key={service.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 transition-colors duration-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {service.icon}
                      <div className="flex flex-col min-w-0">
                        <span className="text-[12.5px] font-medium text-zinc-800">
                          {service.label}
                        </span>
                        <span className="text-[10.5px] text-zinc-500 truncate">
                          {service.description}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ToggleSwitch
                        checked={enabled}
                        disabled={enabled && enabledCount <= 1}
                        onChange={(v) => setProviderEnabled(service.id, v)}
                        ariaLabel={`Toggle ${service.label}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {enabledCount <= 1 && (
            <p className="text-[11px] text-zinc-500">
              At least one translation service must remain enabled.
            </p>
          )}
        </section>
      </Section>

      <Section query={query} keywords={modelKeywords}>
        <section
          id="models-section"
          className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
                <CustomIcon />
              </div>
              <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
                Custom models
              </h2>
            </div>
            <button
              type="button"
              onClick={addCustomModel}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-[11px] font-semibold text-zinc-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-all duration-200 active:scale-[0.97]"
            >
              <Plus className="w-3 h-3" />
              Add model
            </button>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Add your own OpenAI-compatible endpoint. Each model becomes a selectable service and
            appears in the service pickers in General.
          </p>

          {settings.customModels.length === 0 ? (
            <p className="text-[11px] leading-snug text-zinc-400 italic">
              No models yet. Click &ldquo;Add model&rdquo; to create one.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {settings.customModels.map((m) => {
                const pid = customProviderId(m.id);
                const enabled = !settings.disabledProviders.includes(pid);
                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 hover:border-zinc-300 transition-colors duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        spellCheck={false}
                        value={m.name}
                        onChange={(e) => updateCustomModel(m.id, { name: e.target.value })}
                        placeholder="Display name"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[12px] font-medium text-zinc-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/50 outline-none transition-all"
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
                        className="inline-flex items-center justify-center shrink-0 h-8 w-8 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                        Endpoint
                      </span>
                      <input
                        type="text"
                        spellCheck={false}
                        value={m.endpoint}
                        onChange={(e) => updateCustomModel(m.id, { endpoint: e.target.value })}
                        placeholder="https://host/v1"
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/50 outline-none transition-all"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                        Model
                      </span>
                      <input
                        type="text"
                        spellCheck={false}
                        value={m.model}
                        onChange={(e) => updateCustomModel(m.id, { model: e.target.value })}
                        placeholder="model-name"
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/50 outline-none transition-all"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                        API key
                      </span>
                      <input
                        type="password"
                        spellCheck={false}
                        autoComplete="off"
                        value={m.apiKey}
                        onChange={(e) => updateCustomModel(m.id, { apiKey: e.target.value })}
                        placeholder="sk-…"
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/50 outline-none transition-all"
                      />
                    </label>
                    <label className="flex items-start gap-2 sm:col-span-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={m.noReasoning ?? false}
                        onChange={(e) => updateCustomModel(m.id, { noReasoning: e.target.checked })}
                        className="mt-0.5 accent-brand-500"
                      />
                      <span className="text-[11px] text-zinc-600 leading-snug">
                        Disable thinking (sends <code>reasoning.effort = none</code>). Uncheck if
                        your endpoint returns a 400 error because it doesn't accept this field.
                      </span>
                    </label>
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
