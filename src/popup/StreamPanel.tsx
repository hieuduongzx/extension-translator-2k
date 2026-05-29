import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCcw,
  Settings as SettingsIcon,
  AlertCircle,
  Radio,
  Globe2,
  KeyRound
} from "lucide-react";
import { Dropdown } from "./components/Dropdown";
import { LANGUAGES } from "../languages";
import {
  DEFAULT_STREAM_STATE,
  getStreamState,
  sendStreamMessage,
  watchStreamState,
  type StreamRuntimeState
} from "../stream/types";

/**
 * The "Dịch Stream" tab of the popup: real-time speech-to-text + translation
 * powered by Soniox. Controls the offscreen tab-audio capture lifecycle via the
 * background worker. Detailed configuration (API key, overlay defaults) lives
 * in the dedicated options page.
 */
export function StreamPanel() {
  const [state, setState] = useState<StreamRuntimeState>(DEFAULT_STREAM_STATE);
  const [draftLang, setDraftLang] = useState(DEFAULT_STREAM_STATE.targetLang);
  const [fontScaleDraft, setFontScaleDraft] = useState(DEFAULT_STREAM_STATE.fontScale);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const next = await getStreamState();
      if (next) {
        setState(next);
        setDraftLang(next.targetLang);
        setFontScaleDraft(next.fontScale);
      }
    })();
    return watchStreamState((next) => {
      setState(next);
      setDraftLang(next.targetLang);
      setFontScaleDraft(next.fontScale);
    });
  }, []);

  async function send(message: Record<string, unknown>, trackBusy = true) {
    if (trackBusy) setBusy(true);
    try {
      const response = await sendStreamMessage(message);
      if (response) {
        setState(response);
        setFontScaleDraft(response.fontScale);
      }
    } finally {
      if (trackBusy) setBusy(false);
    }
  }

  async function toggleTranslation() {
    const nextActive = !state.isActive;
    if (nextActive) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
        setState((current) => ({
          ...current,
          statusMessage: "Hãy mở một trang web (http/https) rồi thử lại.",
          error: undefined
        }));
        return;
      }
    }
    await send({
      type: "TOGGLE_TRANSLATION",
      payload: { active: nextActive, lang: draftLang }
    });
  }

  async function togglePause() {
    await send({ type: state.isPaused ? "RESUME_TRANSLATION" : "PAUSE_TRANSLATION" });
  }

  async function updateOverlaySettings(
    payload: Partial<Pick<StreamRuntimeState, "fontScale" | "showSource">>
  ) {
    await send({ type: "UPDATE_OVERLAY_SETTINGS", payload }, false);
  }

  async function resetOverlayLayout() {
    await send({ type: "RESET_OVERLAY_LAYOUT" }, false);
  }

  const hasApiKey = Boolean(state.apiKey && state.apiKey !== "YOUR_SONIOX_API_KEY");
  const stateLabel = state.isActive ? (state.isPaused ? "Tạm dừng" : "Trực tiếp") : "Tắt";
  const sliderPercent = ((fontScaleDraft - 30) / (180 - 30)) * 100;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`status-pill ${
              state.isActive
                ? state.isPaused
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-zinc-100 text-zinc-500 border-zinc-200"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                state.isActive
                  ? state.isPaused
                    ? "bg-amber-500"
                    : "bg-emerald-500 animate-pulse"
                  : "bg-zinc-400"
              }`}
            />
            {stateLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage()}
          className="btn-icon-sm"
          title="Cài đặt dịch stream"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {state.error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11.5px] leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">{state.error}</p>
        </div>
      )}

      {!hasApiKey && (
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage()}
          className="w-full flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] leading-relaxed text-left hover:bg-amber-100 transition-colors"
        >
          <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">
            Chưa có Soniox API key. Bấm để mở Cài đặt và nhập key trước khi dịch.
          </span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="surface-card p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="section-label">Nguồn</span>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-md ${
                state.isActive ? "bg-emerald-50" : "bg-zinc-100"
              }`}
            >
              <Radio
                className={`w-3 h-3 ${
                  state.isActive ? "text-emerald-600" : "text-zinc-400"
                }`}
              />
            </div>
          </div>
          <span
            className={`text-[13px] font-semibold ${
              state.isActive
                ? state.isPaused
                  ? "text-amber-600"
                  : "text-emerald-600"
                : "text-zinc-500"
            }`}
          >
            {state.isActive ? (state.isPaused ? "Tạm dừng" : "Đang nghe") : "Nghỉ"}
          </span>
        </div>

        <div className="surface-card p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="section-label">Đích</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50">
              <Globe2 className="w-3 h-3 text-brand-600" />
            </div>
          </div>
          <LanguageStreamSelect value={draftLang} onChange={setDraftLang} disabled={busy} />
        </div>
      </div>

      <section className="surface-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[12.5px] font-medium text-zinc-900 leading-tight">
              Hiện bản gốc
            </span>
            <span className="text-[10px] text-zinc-500 mt-0.5">
              Hiển thị lời thoại gốc trên overlay
            </span>
          </div>
          <button
            type="button"
            onClick={() => void updateOverlaySettings({ showSource: !state.showSource })}
            className={`relative w-10 h-[22px] rounded-full transition-colors ${
              state.showSource ? "bg-brand-600" : "bg-zinc-300"
            }`}
          >
            <span
              className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${
                state.showSource ? "left-[22px]" : "left-[3px]"
              }`}
            />
          </button>
        </div>

        <div className="h-px bg-zinc-200 w-full" />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-medium text-zinc-900">Cỡ phụ đề</span>
            <span className="text-[11px] text-brand-700 font-semibold tabular-nums bg-brand-50 px-2 py-0.5 rounded-md">
              {fontScaleDraft}%
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="180"
            step="5"
            value={fontScaleDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              setFontScaleDraft(nextValue);
              void updateOverlaySettings({ fontScale: nextValue });
            }}
            className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow
                       [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500"
            style={{
              background: `linear-gradient(to right, #14b8a6 ${sliderPercent}%, #e4e4e7 ${sliderPercent}%)`
            }}
          />
          <div className="flex justify-between text-[9px] text-zinc-400 font-medium px-0.5">
            <span>Nhỏ</span>
            <span>Lớn</span>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleTranslation()}
          disabled={busy}
          className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-all border ${
            busy
              ? "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200"
              : state.isActive
                ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                : "bg-brand-600 text-white border-brand-600 hover:bg-brand-700"
          }`}
        >
          {state.isActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span>{state.isActive ? "Dừng dịch" : "Bắt đầu dịch"}</span>
        </button>

        <button
          type="button"
          onClick={() => void togglePause()}
          disabled={busy || !state.isActive}
          className={`h-11 w-11 flex items-center justify-center rounded-xl border transition-colors ${
            state.isActive
              ? state.isPaused
                ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              : "bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed"
          }`}
          title={state.isPaused ? "Tiếp tục" : "Tạm dừng"}
        >
          {state.isPaused ? (
            <Play className="w-4 h-4 fill-current" />
          ) : (
            <Pause className="w-4 h-4 fill-current" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void resetOverlayLayout()}
          disabled={!state.isActive}
          className={`h-11 w-11 flex items-center justify-center rounded-xl border transition-colors ${
            state.isActive
              ? "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              : "bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed"
          }`}
          title="Đặt lại vị trí overlay"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 py-0.5">
        <span
          className={`w-1 h-1 rounded-full ${
            state.isActive
              ? state.isPaused
                ? "bg-amber-500"
                : "bg-emerald-500"
              : "bg-zinc-300"
          }`}
        />
        <p
          className="text-[11px] font-medium text-zinc-500 truncate max-w-[300px]"
          title={state.statusMessage}
        >
          {state.statusMessage}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact target-language picker for the stream tab. Soniox one-way translation
 * accepts a target language code; we reuse the shared light Dropdown with the
 * curated language list (no "auto").
 */
function LanguageStreamSelect({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const options = LANGUAGES.filter((l) => l.code !== "auto").map((lang) => ({
    value: lang.code,
    label: lang.native,
    description: lang.name
  }));
  return (
    <div className={disabled ? "opacity-60 pointer-events-none" : ""}>
      <Dropdown value={value} options={options} onChange={onChange} />
    </div>
  );
}
