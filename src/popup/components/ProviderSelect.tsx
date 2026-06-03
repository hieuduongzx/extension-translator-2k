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
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="block">
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#wt-gem-0)" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#wt-gem-1)" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#wt-gem-2)" />
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id="wt-gem-0" x1="7" x2="11" y1="15.5" y2="12">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="wt-gem-1" x1="8" x2="11.5" y1="5.5" y2="11">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="wt-gem-2" x1="3.5" x2="17.5" y1="13.5" y2="12">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
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
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <circle cx="9" cy="13" r="1.5" />
      <circle cx="15" cy="13" r="1.5" />
      <path d="M12 2v4M8 18v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function QwenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="block">
      <path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z" fill="url(#wt-qwen-g)" fillRule="nonzero" />
      <defs>
        <linearGradient id="wt-qwen-g" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="#6336E7" stopOpacity=".84" />
          <stop offset="100%" stopColor="#6F69F7" stopOpacity=".84" />
        </linearGradient>
      </defs>
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
  description: "AI dịch theo ngữ cảnh",
  icon: <GemmaIcon />
};
const QWEN_OPTION: Option = {
  value: "qwen",
  label: "Qwen 3.7 max",
  description: "AI dịch theo ngữ cảnh",
  icon: <QwenIcon />
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

/** Generate all provider options (including custom models). Used for main translation. */
export function getAllProviderOptions(customModels: CustomModel[]): Option[] {
  return [
    GOOGLE_OPTION,
    BING_OPTION,
    GEMMA_OPTION,
    QWEN_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
}

/** Generate AI-only provider options (Gemma, Qwen, custom). Used for AI button. */
export function getAIProviderOptions(customModels: CustomModel[]): Option[] {
  return [
    GEMMA_OPTION,
    QWEN_OPTION,
    ...customModels.map(customOption),
    ADD_OPTION
  ];
}

export function ProviderSelect({
  value,
  customModels,
  onChange,
  onAddCustom,
  label = "Dịch vụ dịch chính"
}: ProviderSelectProps) {
  const options = getAllProviderOptions(customModels);
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
  const options = getAIProviderOptions(customModels);
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
  const mainOptions = getAllProviderOptions(customModels);
  const quickOptions = getAllProviderOptions(customModels);
  const aiOptions = getAIProviderOptions(customModels);
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
