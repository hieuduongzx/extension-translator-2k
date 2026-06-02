import { Globe2, Keyboard, MousePointerClick, Plus, Sparkles, Trash2 } from "lucide-react";
import { GemmaIcon } from "../popup/components/ProviderSelect";
import { ModeToggle } from "../popup/components/ModeToggle";
import { Dropdown } from "../popup/components/Dropdown";
import {
  customProviderId,
  DEFAULT_SETTINGS,
  type AutoRule,
  type CustomModel,
  type DictionaryMode,
  type Settings
} from "../types";

interface WebSettingsProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
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
 * Settings for the web/page translation feature. Operates on the shared
 * {@link Settings} object (selection popup, dictionary, AI providers,
 * auto-translate rules). This is the former popup `SettingsPanel`, reshaped for
 * the full-width options layout (no back button — the sidebar navigates).
 */
export function WebSettings({ settings, onChange }: WebSettingsProps) {
  const removeHostRule = (host: string) => {
    const next = { ...settings.hostRules };
    delete next[host];
    onChange({ ...settings, hostRules: next });
  };

  const updateCustomModel = (id: string, patch: Partial<CustomModel>) => {
    onChange({
      ...settings,
      customModels: settings.customModels.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      )
    });
  };

  const addCustomModel = () => {
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
  };

  const removeCustomModel = (id: string) => {
    const pid = customProviderId(id);
    onChange({
      ...settings,
      customModels: settings.customModels.filter((m) => m.id !== id),
      provider: settings.provider === pid ? DEFAULT_SETTINGS.provider : settings.provider,
      aiProvider:
        settings.aiProvider === pid ? DEFAULT_SETTINGS.aiProvider : settings.aiProvider
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight text-zinc-900">
          Dịch Web
        </h1>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          Tuỳ chỉnh dịch trang, popup bôi đen, từ điển và dịch vụ AI.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <section className="surface-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Keyboard className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Phím tắt
          </h2>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500 -mt-1">
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
        <ul className="flex flex-col gap-1.5 max-w-md">
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

      <section className="surface-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Globe2 className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Chế độ hiển thị bản dịch
          </h2>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500 -mt-1">
          Cách hiển thị nội dung sau khi dịch trang.
        </p>
        <div className="max-w-md">
          <ModeToggle
            value={settings.displayMode}
            onChange={(displayMode) => onChange({ ...settings, displayMode })}
          />
        </div>
      </section>

      <section className="surface-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <MousePointerClick className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Popup chọn văn bản
          </h2>
        </div>

        <label className="flex items-start justify-between gap-3 cursor-pointer">
          <span className="flex flex-col">
            <span className="text-[12.5px] font-medium text-zinc-800">
              Hiện biểu tượng dịch nổi
            </span>
            <span className="text-[11px] leading-snug text-zinc-500">
              Hiển thị một biểu tượng nhỏ cạnh đoạn bạn bôi đen. Bấm vào đó để
              mở popup dịch mà không cần dùng menu chuột phải.
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
            <span className="text-[12.5px] font-medium text-zinc-800">
              Cách tra từ điển
            </span>
            <span className="text-[11px] leading-snug text-zinc-500">
              Mở popup từ điển (định nghĩa, phát âm, ví dụ). Tự chuyển sang trình
              dịch khi không tìm thấy từ.
            </span>
          </span>
          <div className="w-[200px] shrink-0">
            <Dropdown
              value={settings.dictionaryMode}
              options={DICTIONARY_MODE_OPTIONS}
              onChange={(dictionaryMode) =>
                onChange({ ...settings, dictionaryMode: dictionaryMode as DictionaryMode })
              }
            />
          </div>
        </div>

        <label className="flex items-start justify-between gap-3 cursor-pointer">
          <span className="flex flex-col">
            <span className="text-[12.5px] font-medium text-zinc-800">
              Hiện văn bản gốc
            </span>
            <span className="text-[11px] leading-snug text-zinc-500">
              Khi popup mở ra, hiển thị cả văn bản gốc bên cạnh bản dịch.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.showSelectionOriginal}
            onChange={(e) =>
              onChange({ ...settings, showSelectionOriginal: e.target.checked })
            }
            className="mt-0.5 h-4 w-4 accent-brand-600 cursor-pointer shrink-0"
          />
        </label>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[12.5px] font-medium text-zinc-800">Giao diện popup</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...settings, selectionPopupTheme: t })}
                className={`px-3 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider border transition-all active:scale-[0.97] ${
                  settings.selectionPopupTheme === t
                    ? "bg-brand-50 border-brand-300 text-brand-700 shadow-glow-sm"
                    : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Dịch vụ AI
          </h2>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">
          Điểm cuối tương thích OpenAI (chat completions). API key lưu cục bộ
          trong trình duyệt.
        </p>

        <div className="flex flex-col gap-1.5 pt-0.5">
          <span className="text-[11.5px] font-medium text-zinc-800">
            Khi bấm dịch bằng AI
          </span>
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
                className={`px-2 py-1.5 rounded-md text-[11px] font-medium tracking-tight border transition-all active:scale-[0.97] ${
                  settings.aiTranslationMode === mode
                    ? "bg-brand-50 border-brand-300 text-brand-700 shadow-glow-sm"
                    : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
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

        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[11.5px] font-semibold tracking-tight text-zinc-800">
            Model có sẵn
          </span>
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 max-w-xl">
            <GemmaIcon />
            <span className="text-[12.5px] font-medium text-zinc-800">Gemma 4</span>
            <span className="ml-auto inline-flex items-center rounded-full bg-brand-100/60 border border-brand-200 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-brand-700">
              Mặc định
            </span>
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 text-[11px] font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Thêm model
            </button>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500 -mt-1">
            Thêm endpoint tương thích OpenAI của riêng bạn. Mỗi model sẽ xuất
            hiện trong danh sách chọn dịch vụ.
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
                  className="flex flex-col gap-1.5 rounded-md border border-zinc-200 bg-zinc-50/60 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      spellCheck={false}
                      value={m.name}
                      onChange={(e) => updateCustomModel(m.id, { name: e.target.value })}
                      placeholder="Tên hiển thị"
                      className="flex-1 px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] font-medium text-zinc-800 focus:border-brand-300 focus:ring-1 focus:ring-brand-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomModel(m.id)}
                      aria-label="Xoá model"
                      title="Xoá model"
                      className="inline-flex items-center justify-center shrink-0 h-7 w-7 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Endpoint
                    </span>
                    <input
                      type="text"
                      spellCheck={false}
                      value={m.endpoint}
                      onChange={(e) => updateCustomModel(m.id, { endpoint: e.target.value })}
                      placeholder="http://host:port/v1"
                      className="px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] text-zinc-800 focus:border-brand-300 focus:ring-1 focus:ring-brand-200 outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Model
                    </span>
                    <input
                      type="text"
                      spellCheck={false}
                      value={m.model}
                      onChange={(e) => updateCustomModel(m.id, { model: e.target.value })}
                      placeholder="model-name"
                      className="px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] text-zinc-800 focus:border-brand-300 focus:ring-1 focus:ring-brand-200 outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      API key
                    </span>
                    <input
                      type="password"
                      spellCheck={false}
                      autoComplete="off"
                      value={m.apiKey}
                      onChange={(e) => updateCustomModel(m.id, { apiKey: e.target.value })}
                      placeholder="sk-…"
                      className="px-2 py-1.5 rounded-md border border-zinc-200 bg-white text-[12px] text-zinc-800 focus:border-brand-300 focus:ring-1 focus:ring-brand-200 outline-none"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="surface-card p-4 space-y-2">
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
          Hành vi mặc định
        </h2>
        <div className="grid grid-cols-3 gap-1.5 max-w-sm">
          {(["always", "ask", "never"] as AutoRule[]).map((rule) => (
            <button
              key={rule}
              type="button"
              onClick={() => onChange({ ...settings, autoRule: rule })}
              className={`px-2 py-1.5 rounded-md text-[11px] font-medium uppercase tracking-wider border transition-all active:scale-[0.97] ${
                settings.autoRule === rule
                  ? "bg-brand-50 border-brand-300 text-brand-700 shadow-glow-sm"
                  : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
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

      <section className="surface-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Globe2 className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
            Quy tắc theo trang
          </h2>
        </div>
        {Object.keys(settings.hostRules).length === 0 ? (
          <p className="text-[11px] leading-snug text-zinc-500">
            Chưa có quy tắc nào. Đặt một quy tắc từ popup chính khi đang xem trang.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {Object.entries(settings.hostRules).map(([host, rule]) => (
              <li
                key={host}
                className="flex items-center justify-between bg-zinc-50 border border-zinc-200/70 rounded-md px-2.5 py-1.5"
              >
                <span className="text-[12.5px] font-medium text-zinc-800 truncate">
                  {host}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-semibold tracking-wider ${
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
                    className="text-[10.5px] font-medium text-zinc-400 hover:text-red-600 transition-colors"
                  >
                    Xoá
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
    <li className="flex items-start justify-between gap-3 bg-zinc-50 border border-zinc-200/70 rounded-md px-2.5 py-2">
      <span className="flex flex-col min-w-0">
        <span className="text-[12.5px] font-medium text-zinc-800">{label}</span>
        <span className="text-[11px] leading-snug text-zinc-500">{description}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 pt-0.5">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-zinc-400">+</span>}
            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border border-zinc-300 bg-white text-[11px] font-semibold text-zinc-700 shadow-sm">
              {k}
            </kbd>
          </span>
        ))}
      </span>
    </li>
  );
}
