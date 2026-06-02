import { Dropdown } from "./Dropdown";
import { customProviderId, type AIProviderId, type CustomModel, type ProviderId } from "../../types";

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
function GoogleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="block"
    >
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

function BingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="block"
    >
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

export function GemmaIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="block"
    >
      <defs>
        <linearGradient
          id="wt-gemini-grad"
          x1="0%"
          x2="68.73%"
          y1="100%"
          y2="30.395%"
        >
          <stop offset="0%" stopColor="#1C7DFF" />
          <stop offset="52.021%" stopColor="#1C69FF" />
          <stop offset="100%" stopColor="#F0DCD6" />
        </linearGradient>
      </defs>
      <path
        fill="url(#wt-gemini-grad)"
        fillRule="nonzero"
        d="M12 24A14.304 14.304 0 000 12 14.304 14.304 0 0012 0a14.305 14.305 0 0012 12 14.305 14.305 0 00-12 12"
      />
    </svg>
  );
}

function CustomIcon() {
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
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
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
      className="block text-zinc-500"
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
  label: "Google Translate",
  description: "translate.googleapis.com · nhanh, chất lượng cao",
  icon: <GoogleIcon />
};
const BING_OPTION: Option = {
  value: "bing",
  label: "Bing Translator",
  description: "bing.com/translator · không cần API key",
  icon: <BingIcon />
};
const GEMMA_OPTION: Option = {
  value: "gemma",
  label: "Gemma 4",
  description: "AI dịch theo ngữ cảnh · mặc định",
  icon: <GemmaIcon />
};
const ADD_OPTION: Option = {
  value: ADD_NEW,
  label: "Thêm model mới…",
  description: "Cấu hình endpoint OpenAI của riêng bạn",
  icon: <AddIcon />
};

/** Map a custom model to a dropdown option keyed by its `custom:<id>` value. */
function customOption(m: CustomModel): Option {
  return {
    value: customProviderId(m.id),
    label: m.name || "Model chưa đặt tên",
    description: m.model ? `${m.model} · tuỳ chỉnh` : "tuỳ chỉnh",
    icon: <CustomIcon />
  };
}

export function ProviderSelect({
  value,
  customModels,
  onChange,
  onAddCustom,
  label = "Dịch vụ dịch chính"
}: ProviderSelectProps) {
  const options: Option[] = [
    GOOGLE_OPTION,
    BING_OPTION,
    GEMMA_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
  return (
    <div className="surface-card flex flex-col gap-1 p-2.5">
      <span className="section-label">{label}</span>
      <Dropdown
        value={value}
        options={options}
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
  const options: Option[] = [
    GEMMA_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
  return (
    <div className="surface-card flex flex-col gap-1 p-2.5">
      <span className="section-label">Dịch vụ AI</span>
      <Dropdown
        value={value}
        options={options}
        onChange={(v) =>
          v === ADD_NEW ? onAddCustom() : onChange(v as AIProviderId)
        }
      />
      <p className="mt-0.5 text-[10.5px] leading-snug text-zinc-500">
        Dùng cho nút lấy bản dịch AI trong popup chọn văn bản.
      </p>
    </div>
  );
}

interface ProviderPairProps {
  provider: ProviderId;
  quickProvider: ProviderId;
  aiProvider: AIProviderId;
  customModels: CustomModel[];
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
  onProviderChange,
  onQuickProviderChange,
  onAIProviderChange,
  onAddProvider,
  onAddQuickProvider,
  onAddAIProvider,
  bare = false
}: ProviderPairProps) {
  const mainOptions: Option[] = [
    GOOGLE_OPTION,
    BING_OPTION,
    GEMMA_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
  const quickOptions: Option[] = [
    GOOGLE_OPTION,
    BING_OPTION,
    GEMMA_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
  const aiOptions: Option[] = [
    GEMMA_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
  const inner = (
    <>
      <div className="flex flex-col gap-1">
        <span className="section-label">Dịch vụ dịch trang</span>
        <Dropdown
          value={provider}
          options={mainOptions}
          onChange={(v) => (v === ADD_NEW ? onAddProvider() : onProviderChange(v as ProviderId))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="section-label">Dịch vụ bôi đen</span>
        <Dropdown
          value={quickProvider}
          options={quickOptions}
          onChange={(v) => (v === ADD_NEW ? onAddQuickProvider() : onQuickProviderChange(v as ProviderId))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="section-label">Dịch vụ AI</span>
        <Dropdown
          value={aiProvider}
          options={aiOptions}
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
