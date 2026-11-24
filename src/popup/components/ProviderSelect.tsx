import { Dropdown } from "./Dropdown";
import {
  customProviderId,
  BUILTIN_PROVIDER_LABELS,
  type AIProviderId,
  type CustomModel,
  type ProviderId
} from "../../types";

/** Sentinel option value: selecting it triggers "add a new custom model". */
const ADD_NEW = "__add_custom__";

interface ProviderSelectProps {
  value: ProviderId;
  customModels: CustomModel[];
  onChange: (provider: ProviderId) => void;
  /** Called when the user picks the "add new model" entry. */
  onAddCustom: () => void;
  /** Header label above the dropdown. */
  label?: string;
}

interface AIProviderSelectProps {
  value: AIProviderId;
  customModels: CustomModel[];
  onChange: (provider: AIProviderId) => void;
  onAddCustom: () => void;
}

/**
 * Inline SVG marks for the supported translation providers.
 * Using SVG (not external favicons) keeps the popup offline-friendly and
 * avoids any third-party network request from `chrome-extension://`.
 */
export function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" className="block">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 16.1 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.3c-2.1 1.4-4.6 2.2-7.3 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.2 5.3C41 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

export function BingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" className="block">
      <defs>
        <linearGradient id="wt-bing-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#36c5f0" />
          <stop offset="100%" stopColor="#0078d4" />
        </linearGradient>
      </defs>
      <path
        fill="url(#wt-bing-grad)"
        d="M5 3v22.6l6.5-2.7v-12L20 14l-3 1.3 5 2.2 6 2.5L11.5 28 5 25.7V3z"
      />
    </svg>
  );
}

export function AutoFreeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="block">
      <defs>
        <linearGradient id="wt-auto-free-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#wt-auto-free-grad)" />
      <path
        fill="#fff"
        d="M12 5.5l1.4 3.9 3.9 1.4-3.9 1.4L12 16.1l-1.4-3.9-3.9-1.4 3.9-1.4L12 5.5zm5.2 7.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z"
      />
    </svg>
  );
}

export function CustomIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0d9488"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="block"
    >
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <circle cx="9" cy="13" r="1.5" />
      <circle cx="15" cy="13" r="1.5" />
      <path d="M12 2v4M8 18v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="block text-muted"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

type Option = {
  value: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
};

const GOOGLE_OPTION: Option = {
  value: "google",
  label: BUILTIN_PROVIDER_LABELS.google,
  description: "Machine translation",
  icon: <GoogleIcon />
};
const BING_OPTION: Option = {
  value: "bing",
  label: BUILTIN_PROVIDER_LABELS.bing,
  description: "Machine translation",
  icon: <BingIcon />
};
const AUTO_FREE_OPTION: Option = {
  value: "auto-free",
  label: BUILTIN_PROVIDER_LABELS["auto-free"],
  description: "AI translation",
  icon: <AutoFreeIcon />
};
const ADD_OPTION: Option = {
  value: ADD_NEW,
  label: "Add new model…",
  description: "Configure your own OpenAI endpoint",
  icon: <AddIcon />
};

/** Map a custom model to a dropdown option keyed by its `custom:<id>` value. */
function customOption(m: CustomModel): Option {
  return {
    value: customProviderId(m.id),
    label: m.name || "Unnamed model",
    description: m.model ? `${m.model} · custom` : "custom",
    icon: <CustomIcon />
  };
}

/** Generate all provider options (including custom models). Used for main translation. */
export function getAllProviderOptions(
  customModels: CustomModel[],
  disabledProviders: readonly ProviderId[] = []
): Option[] {
  return [
    GOOGLE_OPTION,
    BING_OPTION,
    AUTO_FREE_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ].filter((o) => !disabledProviders.includes(o.value as ProviderId));
}

/** Generate AI-only provider options (built-in + custom). Used for AI button. */
export function getAIProviderOptions(
  customModels: CustomModel[],
  disabledProviders: readonly ProviderId[] = []
): Option[] {
  return [AUTO_FREE_OPTION, ...customModels.map(customOption), ADD_OPTION].filter(
    (o) => !disabledProviders.includes(o.value as ProviderId)
  );
}

export function ProviderSelect({
  value,
  customModels,
  onChange,
  onAddCustom,
  label = "Main translation service"
}: ProviderSelectProps) {
  const options = getAllProviderOptions(customModels);
  return (
    <div className="surface-card flex flex-col gap-1 p-2.5">
      <span className="section-label">{label}</span>
      <Dropdown
        value={value}
        options={options}
        ariaLabel={label}
        onChange={(v) => (v === ADD_NEW ? onAddCustom() : onChange(v as ProviderId))}
      />
    </div>
  );
}

export function AIProviderSelect({
  value,
  customModels,
  onChange,
  onAddCustom
}: AIProviderSelectProps) {
  const options = getAIProviderOptions(customModels);
  return (
    <div className="surface-card flex flex-col gap-1 p-2.5">
      <span className="section-label">AI service</span>
      <Dropdown
        value={value}
        options={options}
        ariaLabel="AI service"
        onChange={(v) => (v === ADD_NEW ? onAddCustom() : onChange(v as AIProviderId))}
      />
      <p className="mt-0.5 text-[11px] leading-snug text-muted">
        Used by the AI translation button in the selection popup.
      </p>
    </div>
  );
}

interface ProviderPairProps {
  provider: ProviderId;
  quickProvider: ProviderId;
  aiProvider: AIProviderId;
  customModels: CustomModel[];
  /** Services turned off in settings; hidden from every picker. */
  disabledProviders?: readonly ProviderId[];
  onProviderChange: (provider: ProviderId) => void;
  onQuickProviderChange: (provider: ProviderId) => void;
  onAIProviderChange: (provider: AIProviderId) => void;
  onAddProvider: () => void;
  onAddQuickProvider: () => void;
  onAddAIProvider: () => void;
  bare?: boolean;
}

/**
 * Combined provider card: the main translation service and the AI service
 * grouped into one tidy card (a labelled row each), instead of two stacked
 * cards. Used by the popup to keep the UI compact. Pass `bare` to drop the
 * card wrapper when composing into a larger unified card.
 */
export function ProviderPair({
  provider,
  quickProvider,
  aiProvider,
  customModels,
  disabledProviders = [],
  onProviderChange,
  onQuickProviderChange,
  onAIProviderChange,
  onAddProvider,
  onAddQuickProvider,
  onAddAIProvider,
  bare = false
}: ProviderPairProps) {
  const mainOptions = getAllProviderOptions(customModels, disabledProviders);
  const quickOptions = mainOptions;
  const aiOptions = getAIProviderOptions(customModels, disabledProviders);
  const inner = (
    <>
      <div className="flex flex-col gap-1">
        <span className="section-label">Page translation service</span>
        <Dropdown
          value={provider}
          options={mainOptions}
          ariaLabel="Page translation service"
          onChange={(v) => (v === ADD_NEW ? onAddProvider() : onProviderChange(v as ProviderId))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="section-label">Selection translation service</span>
        <Dropdown
          value={quickProvider}
          options={quickOptions}
          ariaLabel="Selection translation service"
          onChange={(v) =>
            v === ADD_NEW ? onAddQuickProvider() : onQuickProviderChange(v as ProviderId)
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="section-label">AI service</span>
        <Dropdown
          value={aiProvider}
          options={aiOptions}
          ariaLabel="AI service"
          onChange={(v) =>
            v === ADD_NEW ? onAddAIProvider() : onAIProviderChange(v as AIProviderId)
          }
        />
      </div>
    </>
  );

  if (bare) return <div className="flex flex-col gap-2.5">{inner}</div>;
  return <div className="surface-card p-2.5 flex flex-col gap-2.5">{inner}</div>;
}
