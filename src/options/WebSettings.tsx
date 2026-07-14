import { useCallback, useMemo, type ReactNode } from "react";
import {
  Globe2,
  Keyboard,
  MousePointerClick,
  Plus,
  Settings2,
  Sparkles,
  Trash2
} from "lucide-react";
import { GptOssIcon, MistralIcon } from "../popup/components/ProviderSelect";
import { getAllProviderOptions, getAIProviderOptions } from "../popup/components/ProviderSelect";
import { ModeToggle } from "../popup/components/ModeToggle";
import { Dropdown } from "../popup/components/Dropdown";
import {
  customProviderId,
  DEFAULT_SETTINGS,
  type AIProviderId,
  type AutoRule,
  type CustomModel,
  type DictionaryMode,
  type ProviderId,
  type Settings
} from "../types";
import { matchesSearch } from "../shared/search";

interface WebSettingsProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  query: string;
}

const AUTO_RULE_LABELS: Record<AutoRule, string> = {
  always: "Luôn luôn",
  ask: "Hỏi",
  never: "Không bao giờ"
};

const THEME_LABELS: Record<"light" | "dark", string> = {
  light: "Sáng",
  dark: "Tối"
};

const DICTIONARY_MODE_OPTIONS: {
  value: DictionaryMode;
  label: string;
  description: string;
}[] = [
  {
    value: "doubleclick",
    label: "Nhấp đúp",
    description: "Nhấp đúp một từ để tra từ điển"
  },
  {
    value: "alt-doubleclick",
    label: "Giữ Alt + nhấp đúp",
    description: "Giữ phím Alt rồi nhấp đúp một từ"
  },
  {
    value: "off",
    label: "Tắt",
    description: "Không tra từ điển"
  }
];

/**
 * Wrapper that hides a settings section when the search query does not match
 * any of its keywords. Keywords should include the section title, descriptions,
 * labels, and any distinctive control text.
 */
function Section({
  query,
  keywords,
  children
}: {
  query: string;
  keywords: string[];
  children: ReactNode;
}) {
  if (!matchesSearch(query, ...keywords)) return null;
  return <>{children}</>;
}

/**
 * Settings for the web/page translation feature. Operates on the shared
 * {@link Settings} object (selection popup, dictionary, AI providers,
 * auto-translate rules). This is the former popup `SettingsPanel`, reshaped for
 * the full-width options layout (no back button — the sidebar navigates).
 */
export function WebSettings({ settings, onChange, query }: WebSettingsProps) {
  const removeHostRule = useCallback(
    (host: string) => {
      const next = { ...settings.hostRules };
      delete next[host];
      onChange({ ...settings, hostRules: next });
    },
    [settings, onChange]
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
        { id, name: "", endpoint: "", apiKey: "", model: "" }
      ]
    });
  }, [settings, onChange]);

  const removeCustomModel = useCallback(
    (id: string) => {
      const pid = customProviderId(id);
      onChange({
        ...settings,
        customModels: settings.customModels.filter((m) => m.id !== id),
        provider: settings.provider === pid ? DEFAULT_SETTINGS.provider : settings.provider,
        aiProvider: settings.aiProvider === pid ? DEFAULT_SETTINGS.aiProvider : settings.aiProvider
      });
    },
    [settings, onChange]
  );

  const providerOptions = useMemo(
    () => getAllProviderOptions(settings.customModels).filter((o) => o.value !== "__add_custom__"),
    [settings.customModels]
  );

  const aiProviderOptions = useMemo(
    () => getAIProviderOptions(settings.customModels).filter((o) => o.value !== "__add_custom__"),
    [settings.customModels]
  );

  const sectionKeywords = {
    shortcuts: [
      "Phím tắt",
      "Dịch / bỏ dịch cả trang",
      "Dịch phần đã bôi đen",
      "Alt",
      "chrome://extensions/shortcuts"
    ],
    display: ["Chế độ hiển thị bản dịch", "Song ngữ", "Chỉ bản dịch"],
    selection: [
      "Popup chọn văn bản",
      "Hiện biểu tượng dịch nổi",
      "Cách tra từ điển",
      "Hiện văn bản gốc",
      "Giao diện popup",
      "Sáng",
      "Tối"
    ],
    ai: ["Dịch vụ AI", "Khi bấm dịch bằng AI", "Hiện bên dưới", "Thay thế bản cũ"],
    models: [
      "Quản lý Model",
      "Chọn dịch vụ",
      "Dịch vụ dịch trang",
      "Dịch vụ bôi đen",
      "Dịch vụ AI",
      "Model có sẵn",
      "Model tuỳ chỉnh",
      "Mistral Small",
      "GPT-OSS 120B"
    ],
    defaultRule: ["Hành vi mặc định", "Luôn luôn", "Hỏi", "Không bao giờ"],
    hostRules: [
      "Quy tắc theo trang",
      ...Object.keys(settings.hostRules),
      ...Object.values(settings.hostRules).map((r) => AUTO_RULE_LABELS[r])
    ]
  };

  const hasMatch = Object.values(sectionKeywords).some((kws) => matchesSearch(query, ...kws));

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">Dịch Web</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Tuỳ chỉnh dịch trang, popup bôi đen, từ điển, model và dịch vụ AI.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={sectionKeywords.shortcuts}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Keyboard className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Phím tắt</h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Tăng tốc thao tác dịch ngay trên trang. Có thể đổi phím tại{" "}
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}
              className="text-brand-700 font-medium hover:underline"
            >
              chrome://extensions/shortcuts
            </button>
            .
          </p>
          <ul className="flex flex-col gap-2 max-w-md">
            <ShortcutRow
              keys={["Alt", "A"]}
              label="Dịch / bỏ dịch cả trang"
              description="Bật hoặc tắt dịch toàn bộ trang đang xem."
            />
            <ShortcutRow
              keys={["Alt", "S"]}
              label="Dịch phần đã bôi đen"
              description="Bôi đen một đoạn rồi nhấn để chỉ dịch đoạn đó tại chỗ."
            />
          </ul>
        </section>
      </Section>

      <Section query={query} keywords={sectionKeywords.display}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Globe2 className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Chế độ hiển thị bản dịch
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Cách hiển thị nội dung sau khi dịch trang.
          </p>
          <div className="max-w-md">
            <ModeToggle
              value={settings.displayMode}
              onChange={(displayMode) => onChange({ ...settings, displayMode })}
            />
          </div>
        </section>
      </Section>

      <Section query={query} keywords={sectionKeywords.selection}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <MousePointerClick className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Popup chọn văn bản
            </h2>
          </div>

          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Hiện biểu tượng dịch nổi
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Hiển thị một biểu tượng cạnh đoạn bạn bôi đen. Bấm vào đó để mở popup dịch mà không
                cần dùng menu chuột phải.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.selectionTrigger}
              onChange={(e) => onChange({ ...settings, selectionTrigger: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
            />
          </label>

          <div className="flex items-start justify-between gap-3">
            <span className="flex flex-col flex-1 min-w-0">
              <span className="text-[12.5px] font-medium text-zinc-800">Cách tra từ điển</span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Mở popup từ điển (định nghĩa, phát âm, ví dụ). Tự chuyển sang trình dịch khi không
                tìm thấy từ.
              </span>
            </span>
            <div className="w-[200px] shrink-0">
              <Dropdown
                value={settings.dictionaryMode}
                options={DICTIONARY_MODE_OPTIONS}
                onChange={(dictionaryMode) =>
                  onChange({ ...settings, dictionaryMode: dictionaryMode as DictionaryMode })
                }
                ariaLabel="Cách tra từ điển"
              />
            </div>
          </div>

          <label className="flex items-start justify-between gap-3 cursor-pointer group">
            <span className="flex flex-col">
              <span className="text-[12.5px] font-medium text-zinc-800 group-hover:text-zinc-900 transition-colors">
                Hiện văn bản gốc
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Khi popup mở ra, hiển thị cả văn bản gốc bên cạnh bản dịch.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.showSelectionOriginal}
              onChange={(e) => onChange({ ...settings, showSelectionOriginal: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
            />
          </label>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="flex flex-col flex-1 min-w-0">
              <span className="text-[12.5px] font-medium text-zinc-800">
                Giao diện popup trên trang
              </span>
              <span className="text-[11px] leading-snug text-zinc-500">
                Màu nền của popup dịch/từ điển hiển thị trên trang web.
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

      <Section query={query} keywords={sectionKeywords.ai}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Dịch vụ AI</h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Cấu hình cách hiển thị bản dịch AI trong popup.
          </p>

          <div className="flex flex-col gap-2 pt-0.5">
            <span className="text-[11.5px] font-medium text-zinc-800">Khi bấm dịch bằng AI</span>
            <div className="grid grid-cols-2 gap-1.5 max-w-xs">
              {(
                [
                  ["below", "Hiện bên dưới"],
                  ["replace", "Thay thế bản cũ"]
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
                ? "Bản dịch AI sẽ ghi đè lên bản dịch chính trong popup."
                : "Bản dịch AI hiện trong khung riêng, ngay dưới bản dịch chính."}
            </p>
          </div>
        </section>
      </Section>

      <Section query={query} keywords={sectionKeywords.models}>
        <section
          id="models-section"
          className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Quản lý Model
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Chọn dịch vụ dịch thuật và quản lý model tuỳ chỉnh.
          </p>

          <div className="flex flex-col gap-2 pt-0.5">
            <span className="text-[11.5px] font-semibold tracking-tight text-zinc-800">
              Chọn dịch vụ
            </span>
            <p className="text-[11px] leading-snug text-zinc-500 -mt-1">
              Cấu hình provider cho từng tính năng dịch thuật.
            </p>
            <div className="grid grid-cols-1 gap-2.5 pt-0.5 max-w-xl">
              <div>
                <span className="section-label">Dịch vụ dịch trang</span>
                <Dropdown
                  value={settings.provider}
                  options={providerOptions}
                  onChange={(v) => onChange({ ...settings, provider: v as ProviderId })}
                />
              </div>
              <div>
                <span className="section-label">Dịch vụ bôi đen</span>
                <Dropdown
                  value={settings.quickProvider}
                  options={providerOptions}
                  onChange={(v) => onChange({ ...settings, quickProvider: v as ProviderId })}
                />
              </div>
              <div>
                <span className="section-label">Dịch vụ AI</span>
                <Dropdown
                  value={settings.aiProvider}
                  options={aiProviderOptions}
                  onChange={(v) => onChange({ ...settings, aiProvider: v as AIProviderId })}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[11.5px] font-semibold tracking-tight text-zinc-800">
              Model có sẵn
            </span>
            <div className="flex flex-col gap-2 max-w-xl">
              <div className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 hover:border-brand-200 hover:bg-brand-50/30 transition-colors duration-200">
                <MistralIcon />
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-zinc-800">Mistral Small</span>
                  <span className="text-[10.5px] text-zinc-500 truncate">
                    mistral/mistral-small-2603
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 hover:border-brand-200 hover:bg-brand-50/30 transition-colors duration-200">
                <GptOssIcon />
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-zinc-800">GPT-OSS 120B</span>
                  <span className="text-[10.5px] text-zinc-500 truncate">
                    groq/openai/gpt-oss-120b
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold tracking-tight text-zinc-800">
                Model tuỳ chỉnh
              </span>
              <button
                type="button"
                onClick={addCustomModel}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-[11px] font-semibold text-zinc-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-all duration-200 active:scale-[0.97]"
              >
                <Plus className="w-3 h-3" />
                Thêm model
              </button>
            </div>
            <p className="text-[11px] leading-snug text-zinc-500 -mt-1">
              Thêm endpoint tương thích OpenAI của riêng bạn. Mỗi model sẽ xuất hiện trong danh sách
              chọn dịch vụ.
            </p>

            {settings.customModels.length === 0 ? (
              <p className="text-[11px] leading-snug text-zinc-400 italic">
                Chưa có model nào. Bấm &ldquo;Thêm model&rdquo; để tạo.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {settings.customModels.map((m) => (
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
                        placeholder="Tên hiển thị"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[12px] font-medium text-zinc-800 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/50 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => removeCustomModel(m.id)}
                        aria-label="Xoá model"
                        title="Xoá model"
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
                        placeholder="http://host:port/v1"
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </Section>

      <Section query={query} keywords={sectionKeywords.defaultRule}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Hành vi mặc định
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
            Áp dụng cho các trang chưa có quy tắc riêng bên dưới.
          </p>
        </section>
      </Section>

      <Section query={query} keywords={sectionKeywords.hostRules}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Globe2 className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Quy tắc theo trang
            </h2>
          </div>
          {Object.keys(settings.hostRules).length === 0 ? (
            <p className="text-[11px] leading-snug text-zinc-500">
              Chưa có quy tắc nào. Đặt một quy tắc từ popup chính khi đang xem trang.
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
                      Xoá
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Section>

      {!hasMatch && query.trim().length > 0 && (
        <div className="text-center py-8 animate-fade-in">
          <p className="text-[13px] text-zinc-500">
            Không tìm thấy kết quả cho &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

function ShortcutRow({
  keys,
  label,
  description
}: {
  keys: string[];
  label: string;
  description: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 bg-zinc-50 border border-zinc-200/70 rounded-lg px-3 py-2.5 hover:border-zinc-300 transition-colors duration-200">
      <span className="flex flex-col min-w-0">
        <span className="text-[12.5px] font-medium text-zinc-800">{label}</span>
        <span className="text-[11px] leading-snug text-zinc-500">{description}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 pt-0.5">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-zinc-400">+</span>}
            <kbd className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md border border-zinc-300 bg-white text-[11px] font-bold text-zinc-700 shadow-sm">
              {k}
            </kbd>
          </span>
        ))}
      </span>
    </li>
  );
}
