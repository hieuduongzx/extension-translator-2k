import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCcw,
  AlertCircle,
  Globe2,
  KeyRound,
  Type,
  Radio
} from "lucide-react";
import { Dropdown } from "./components/Dropdown";
import { ToggleSwitch } from "./components/ToggleSwitch";
import {
  DEFAULT_STREAM_STATE,
  getStreamState,
  sendStreamMessage,
  watchStreamState,
  normalizeStreamTargetLanguage,
  STREAM_LANGUAGE_OPTIONS,
  type StreamRuntimeState
} from "../stream/types";

const TARGET_OPTIONS = STREAM_LANGUAGE_OPTIONS.map((lang) => ({
  value: lang.value,
  label: lang.label,
  description: lang.short
}));
const STREAM_DRAFT_LANG_KEY = "streamTranslatorDraftLanguage";

/**
 * The "Stream Translate" tab of the popup: real-time speech-to-text + translation
 * powered by Soniox. Controls the offscreen tab-audio capture lifecycle plus
 * the overlay appearance (source text, speakers, display mode, opacity, size)
 * — the same controls available in the options page, surfaced here for quick
 * access while watching.
 */
export function StreamPanel() {
  const [state, setState] = useState<StreamRuntimeState>(DEFAULT_STREAM_STATE);
  const [draftLang, setDraftLang] = useState(DEFAULT_STREAM_STATE.targetLang);
  const [fontScaleDraft, setFontScaleDraft] = useState(DEFAULT_STREAM_STATE.fontScale);
  const [opacityDraft, setOpacityDraft] = useState(DEFAULT_STREAM_STATE.opacity);
  const [busy, setBusy] = useState(false);
  const busyCount = useRef(0);
  const pendingOverlayUpdates = useRef(0);
  const userChangedLang = useRef(false);
  const latestRevision = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    function sync(next: StreamRuntimeState, syncLanguage: boolean) {
      if (cancelled || next.revision < latestRevision.current) return;
      latestRevision.current = next.revision;
      setState(next);
      if (syncLanguage && !userChangedLang.current) setDraftLang(next.targetLang);
      if (pendingOverlayUpdates.current === 0) {
        setFontScaleDraft(next.fontScale);
        setOpacityDraft(next.opacity);
      }
    }
    void (async () => {
      const [next, stored] = await Promise.all([
        getStreamState(),
        chrome.storage.local.get(STREAM_DRAFT_LANG_KEY)
      ]);
      if (cancelled) return;
      if (next) sync(next, true);
      const saved = stored[STREAM_DRAFT_LANG_KEY];
      if (!next?.isActive && !userChangedLang.current && typeof saved === "string") {
        const normalized = normalizeStreamTargetLanguage(saved);
        if (normalized) setDraftLang(normalized);
      }
    })();
    const unwatch = watchStreamState((next) => sync(next, false));
    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);

  const send = useCallback(
    async (message: Record<string, unknown>, trackBusy = true, isOverlaySlider = false) => {
      if (trackBusy) {
        busyCount.current++;
        setBusy(true);
      }
      if (isOverlaySlider) pendingOverlayUpdates.current++;
      try {
        const response = await sendStreamMessage(message);
        if (response && response.revision >= latestRevision.current) {
          latestRevision.current = response.revision;
          setState(response);
          if (!isOverlaySlider || pendingOverlayUpdates.current <= 1) {
            setFontScaleDraft(response.fontScale);
            setOpacityDraft(response.opacity);
          }
        }
      } finally {
        if (isOverlaySlider) {
          pendingOverlayUpdates.current = Math.max(0, pendingOverlayUpdates.current - 1);
        }
        if (trackBusy) {
          busyCount.current = Math.max(0, busyCount.current - 1);
          if (busyCount.current === 0) setBusy(false);
        }
      }
    },
    []
  );

  const toggleTranslation = useCallback(async () => {
    const nextActive = !state.isActive;
    let targetTabId: number | undefined;
    if (nextActive) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
        setState((current) => ({
          ...current,
          statusMessage: "Open a website (http/https) and try again.",
          error: current.error
        }));
        return;
      }
      targetTabId = tab.id;
    }
    await send({
      type: "TOGGLE_TRANSLATION",
      payload: { active: nextActive, lang: draftLang, tabId: targetTabId }
    });
  }, [state.isActive, draftLang, send]);

  const togglePause = useCallback(async () => {
    await send({ type: state.isPaused ? "RESUME_TRANSLATION" : "PAUSE_TRANSLATION" });
  }, [state.isPaused, send]);

  const updateOverlaySettings = useCallback(
    async (
      payload: Partial<
        Pick<
          StreamRuntimeState,
          "fontScale" | "opacity" | "showSource" | "showSpeaker" | "autoScroll" | "displayMode"
        >
      >
    ) => {
      const isSlider = payload.fontScale !== undefined || payload.opacity !== undefined;
      await send({ type: "UPDATE_OVERLAY_SETTINGS", payload }, false, isSlider);
    },
    [send]
  );

  const resetOverlayLayout = useCallback(async () => {
    await send({ type: "RESET_OVERLAY_LAYOUT" }, false);
  }, [send]);

  const hasApiKey = state.hasApiKey;
  const stateLabel = useMemo(
    () =>
      state.isActive ? (state.isPaused ? "Paused" : state.isStandby ? "Standby" : "Live") : "Off",
    [state.isActive, state.isPaused, state.isStandby]
  );
  const fontPercent = useMemo(() => ((fontScaleDraft - 30) / (180 - 30)) * 100, [fontScaleDraft]);
  const opacityPercent = opacityDraft;

  const startDisabled = busy || (!state.isActive && !hasApiKey);
  const startStopClass = startDisabled
    ? "bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200"
    : state.isActive
      ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
      : "bg-brand-600 text-white border-brand-600 hover:bg-brand-700";

  const pauseClass = !state.isActive
    ? "bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed"
    : state.isPaused
      ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
      : "bg-white border-zinc-200/80 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300";

  const resetClass = !state.isActive
    ? "bg-zinc-50 border-zinc-200 text-zinc-300 cursor-not-allowed"
    : "bg-white border-zinc-200/80 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300";

  return (
    <div className="p-3 space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-md bg-zinc-100 border border-zinc-200/80 flex items-center justify-center shrink-0">
            <Radio className="w-3 h-3 text-zinc-500" />
          </div>
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
      </div>

      {/* Error banner */}
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11.5px] leading-relaxed animate-scale-in"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">{state.error}</p>
        </div>
      )}

      {/* API key warning */}
      {!hasApiKey && (
        <button
          type="button"
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#stream") })}
          className="w-full flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] leading-relaxed text-left hover:bg-amber-100 transition-colors animate-scale-in"
        >
          <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">
            No Soniox API key yet. Click to open Settings and add a key before translating.
          </span>
        </button>
      )}

      {/* Primary actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleTranslation()}
          disabled={startDisabled}
          className={`group flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-all duration-200 border active:scale-[0.98] hover-lift ${startStopClass}`}
        >
          {state.isActive ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4 group-hover:scale-110 transition-transform" />
          )}
          <span>{state.isActive ? "Stop translating" : "Start translating"}</span>
        </button>

        <button
          type="button"
          onClick={() => void togglePause()}
          disabled={busy || !state.isActive}
          className={`h-11 w-11 flex items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 hover-lift ${pauseClass}`}
          title={state.isPaused ? "Resume" : "Pause"}
          aria-label={state.isPaused ? "Resume translation" : "Pause translation"}
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
          className={`h-11 w-11 flex items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 hover-lift ${resetClass}`}
          title="Reset overlay position"
          aria-label="Reset overlay position"
        >
          <RefreshCcw
            className={`w-3.5 h-3.5 ${state.isActive ? "hover:rotate-180 transition-transform duration-500" : ""}`}
          />
        </button>
      </div>

      {/* Status message */}
      <div className="flex items-center justify-center gap-2 py-0.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            state.isActive
              ? state.isPaused
                ? "bg-amber-500"
                : "bg-emerald-500 animate-pulse"
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

      {/* Settings card */}
      <div className="surface-card surface-card-hover p-2.5 flex flex-col gap-2.5 transition-all duration-200">
        <div className="flex flex-col gap-1">
          <span className="section-label flex items-center gap-1.5">
            <Globe2 className="w-3 h-3 text-zinc-400" />
            Translate to
          </span>
          <Dropdown
            value={draftLang}
            options={TARGET_OPTIONS}
            disabled={busy}
            onChange={(value) => {
              userChangedLang.current = true;
              setDraftLang(value);
              void chrome.storage.local.set({ [STREAM_DRAFT_LANG_KEY]: value });
            }}
            ariaLabel="Subtitle language"
          />
          {state.isActive && draftLang !== state.targetLang && (
            <p className="text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              The new language applies when you stop and restart the translation session.
            </p>
          )}
        </div>

        <div className="h-px bg-zinc-200/60" />

        <ToggleRow
          label="Show original"
          checked={state.showSource}
          onChange={(v) => void updateOverlaySettings({ showSource: v })}
        />
        <ToggleRow
          label="Show speaker"
          checked={state.showSpeaker}
          onChange={(v) => void updateOverlaySettings({ showSpeaker: v })}
        />
        <ToggleRow
          label="Auto-scroll to new line"
          checked={state.autoScroll}
          onChange={(v) => void updateOverlaySettings({ autoScroll: v })}
        />

        <div className="h-px bg-zinc-200/60" />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-zinc-800">Display mode</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["transcript", "Continuous"],
                ["block", "By sentence"]
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => void updateOverlaySettings({ displayMode: mode })}
                aria-pressed={state.displayMode === mode}
                className={`choice-chip ${state.displayMode === mode ? "choice-chip-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-zinc-200/60" />

        <SliderRow
          label="Subtitle size"
          icon={<Type className="w-3 h-3 text-zinc-400" />}
          value={fontScaleDraft}
          suffix="%"
          min={30}
          max={180}
          step={5}
          percent={fontPercent}
          onChange={(v) => {
            setFontScaleDraft(v);
            void updateOverlaySettings({ fontScale: v });
          }}
        />

        <SliderRow
          label="Background opacity"
          value={opacityDraft}
          suffix="%"
          min={0}
          max={100}
          step={5}
          percent={opacityPercent}
          onChange={(v) => {
            setOpacityDraft(v);
            void updateOverlaySettings({ opacity: v });
          }}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[12px] font-medium text-zinc-800">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function SliderRow({
  label,
  icon,
  value,
  suffix,
  min,
  max,
  step,
  percent,
  onChange
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step: number;
  percent: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-medium text-zinc-800 flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="text-[11px] text-brand-700 font-semibold tabular-nums bg-brand-50 px-2 py-0.5 rounded-md">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                   [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500
                   [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
        style={{
          background: `linear-gradient(to right, var(--brand-500) ${percent}%, var(--slider-track) ${percent}%)`
        }}
      />
    </div>
  );
}
