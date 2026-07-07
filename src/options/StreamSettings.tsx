import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { Eye, EyeOff, KeyRound, Save, CheckCircle2, Captions, RotateCcw } from "lucide-react";
import { ToggleSwitch } from "../popup/components/ToggleSwitch";
import { matchesSearch } from "../shared/search";
import {
  DEFAULT_STREAM_STATE,
  getStreamState,
  sendStreamMessage,
  watchStreamState,
  STREAM_SETTINGS_KEY,
  type StreamRuntimeState,
  type StreamOverlaySettings
} from "../stream/types";

const SONIOX_DOC_URL = "https://console.soniox.com";

interface StreamSettingsProps {
  query: string;
}

/**
 * Hides a settings section when the search query does not match any keyword.
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
 * Settings for the real-time stream translator feature. Reads/writes the
 * background worker's overlay settings (`streamTranslatorSettings`) plus the
 * Soniox API key. Each control round-trips through the background so a live
 * session picks up changes immediately.
 */
export function StreamSettings({ query }: StreamSettingsProps) {
  const [state, setState] = useState<StreamRuntimeState>(DEFAULT_STREAM_STATE);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [overlay, setOverlay] = useState<Pick<
    StreamOverlaySettings,
    "opacity" | "displayMode" | "showSource" | "showSpeaker" | "autoScroll"
  > | null>(null);
  const dirty = useRef(false);

  // Load runtime state (API key + flags) and persisted overlay extras.
  useEffect(() => {
    void (async () => {
      const next = await getStreamState();
      if (next) {
        setState(next);
        if (!dirty.current) setApiKeyDraft(next.apiKey ?? "");
      }
      const stored = await chrome.storage.local.get(STREAM_SETTINGS_KEY);
      const s = stored[STREAM_SETTINGS_KEY] as Partial<StreamOverlaySettings> | undefined;
      setOverlay({
        opacity: typeof s?.opacity === "number" ? s.opacity : 85,
        displayMode: s?.displayMode === "block" ? "block" : "transcript",
        showSource: s?.showSource !== false,
        showSpeaker: s?.showSpeaker === true,
        autoScroll: s?.autoScroll !== false
      });
    })();

    return watchStreamState((next) => {
      setState(next);
      if (!dirty.current) setApiKeyDraft(next.apiKey ?? "");
    });
  }, []);

  const saveApiKey = useCallback(async () => {
    const trimmed = apiKeyDraft.trim();

    // Validation
    if (!trimmed) {
      setApiKeyError("API key không được để trống");
      return;
    }
    if (trimmed.length < 10) {
      setApiKeyError("API key phải ít nhất 10 ký tự");
      return;
    }

    setApiKeyError("");
    const next = await sendStreamMessage({
      type: "UPDATE_API_KEY",
      payload: { apiKey: trimmed }
    });
    if (next) setState(next);
    dirty.current = false;
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }, [apiKeyDraft]);

  const patchOverlay = useCallback(async (payload: Partial<StreamOverlaySettings>) => {
    setOverlay((prev) => (prev ? { ...prev, ...payload } : prev));
    await sendStreamMessage({ type: "UPDATE_OVERLAY_SETTINGS", payload });
  }, []);

  const resetOverlay = useCallback(async () => {
    await sendStreamMessage({ type: "RESET_OVERLAY_LAYOUT" });
  }, []);

  const hasApiKey = useMemo(
    () => Boolean(state.apiKey && state.apiKey !== "YOUR_SONIOX_API_KEY"),
    [state.apiKey]
  );
  const opacityPercent = useMemo(
    () => (overlay ? ((overlay.opacity - 10) / 90) * 100 : 0),
    [overlay]
  );
  const isSaveDisabled = apiKeyDraft.trim() === (state.apiKey ?? "") || !!apiKeyError;

  const sectionKeywords = {
    apiKey: ["Soniox API key", "API key", "console.soniox.com", "Lưu", "Đang hoạt động"],
    overlay: [
      "Mặc định overlay phụ đề",
      "Hiện văn bản gốc",
      "Hiện người nói",
      "Tự cuộn tới dòng mới",
      "Chế độ hiển thị",
      "Liên tục",
      "Theo câu",
      "Độ mờ nền",
      "Đặt lại vị trí overlay"
    ]
  };

  const hasMatch = Object.values(sectionKeywords).some((kws) => matchesSearch(query, ...kws));

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Dịch Stream
        </h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Phụ đề thời gian thực cho video/stream bằng Soniox. API key và mặc định overlay lưu riêng
          cho chức năng này.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={sectionKeywords.apiKey}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center dark:bg-brand-900/20 dark:border-brand-800">
                <KeyRound className="w-3.5 h-3.5 text-brand-600" />
              </div>
              <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Soniox API key
              </h2>
            </div>
            {hasApiKey && (
              <span
                className={`status-pill transition-all duration-200 ${
                  savedFlash
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300 scale-105"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                <CheckCircle2 className={`w-3 h-3 ${savedFlash ? "animate-scale-in" : ""}`} />
                {savedFlash ? "Đã lưu" : "Đang hoạt động"}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            Nhập Soniox API key để bật dịch giọng nói thời gian thực. Key được lưu cục bộ trong
            trình duyệt. Lấy key tại{" "}
            <a
              href={SONIOX_DOC_URL}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 font-semibold hover:underline"
            >
              console.soniox.com
            </a>
            .
          </p>

          <div className="flex items-center gap-2 max-w-xl">
            <div className="relative flex-1">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyDraft}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  dirty.current = true;
                  setApiKeyDraft(e.target.value);
                  setApiKeyError("");
                }}
                placeholder="sk-xxxx…"
                className={`brand-input w-full pr-10 font-mono transition-all duration-200 ${apiKeyError ? "border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-200/50" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-700"
                title={showApiKey ? "Ẩn key" : "Hiện key"}
              >
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void saveApiKey()}
              disabled={isSaveDisabled}
              className="btn-brand shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              Lưu
            </button>
          </div>
          {apiKeyError && (
            <p className="text-[11px] text-red-600 font-medium animate-scale-in">⚠ {apiKeyError}</p>
          )}
        </section>
      </Section>

      <Section query={query} keywords={sectionKeywords.overlay}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center dark:bg-brand-900/20 dark:border-brand-800">
              <Captions className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Mặc định overlay phụ đề
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            Các thiết lập này áp dụng cho khung phụ đề hiển thị trên trang. Có thể chỉnh nhanh ngay
            trên overlay khi đang dịch.
          </p>

          {overlay && (
            <div className="space-y-3 pt-1">
              <ToggleRow
                label="Hiện văn bản gốc"
                hint="Hiển thị lời thoại gốc cùng bản dịch."
                checked={overlay.showSource}
                onChange={(v) => void patchOverlay({ showSource: v })}
              />
              <ToggleRow
                label="Hiện người nói"
                hint="Gắn nhãn [Speaker N] khi phát hiện nhiều người nói."
                checked={overlay.showSpeaker}
                onChange={(v) => void patchOverlay({ showSpeaker: v })}
              />
              <ToggleRow
                label="Tự cuộn tới dòng mới"
                hint="Luôn hiển thị nội dung mới nhất trong khung."
                checked={overlay.autoScroll}
                onChange={(v) => void patchOverlay({ autoScroll: v })}
              />

              <div className="h-px bg-zinc-200/60 dark:bg-zinc-700/60" />

              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-200">
                  Chế độ hiển thị
                </span>
                <div className="grid grid-cols-2 gap-1.5 max-w-xs">
                  {(
                    [
                      ["transcript", "Liên tục"],
                      ["block", "Theo câu"]
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => void patchOverlay({ displayMode: mode })}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold tracking-tight border transition-colors duration-200 active:scale-[0.97] ${
                        overlay.displayMode === mode
                          ? "bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-900/30 dark:border-brand-500/50 dark:text-brand-300"
                          : "bg-white border-zinc-200/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:border-zinc-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Độ mờ nền</span>
                  <span className="text-[11px] text-brand-700 font-bold tabular-nums bg-brand-50 px-2 py-0.5 rounded-md dark:bg-brand-900/30 dark:text-brand-300">
                    {overlay.opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={overlay.opacity}
                  onChange={(e) => void patchOverlay({ opacity: Number(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none outline-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                           [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500
                           [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                  style={{
                    background: `linear-gradient(to right, var(--brand-500) ${opacityPercent}%, var(--slider-track) ${opacityPercent}%)`
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => void resetOverlay()}
                className="btn-ghost hover-lift"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Đặt lại vị trí overlay
              </button>
            </div>
          )}
        </section>
      </Section>

      {!hasMatch && query.trim().length > 0 && (
        <div className="text-center py-8 animate-fade-in">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Không tìm thấy kết quả cho &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="flex flex-col">
        <span className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        <span className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{hint}</span>
      </span>
      <div className="mt-0.5">
        <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
      </div>
    </div>
  );
}
