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
 * powered by Soniox.
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
  const statusPillClass = state.isActive
    ? state.isPaused || state.isStandby
      ? "status-pill status-pill--warning"
      : "status-pill status-pill--success"
    : "status-pill";
  const statusDotColor = state.isActive
    ? state.isPaused || state.isStandby
      ? "var(--warning)"
      : "var(--success)"
    : "var(--text-muted)";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Status header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
            className="w-6 h-6 rounded-[6px] border flex items-center justify-center shrink-0 text-muted"
          >
            <Radio size={13} />
          </div>
          <span className={statusPillClass}>
            <span
              style={{ backgroundColor: statusDotColor }}
              className={`w-1.5 h-1.5 rounded-full ${state.isActive && !state.isPaused && !state.isStandby ? "animate-pulse" : ""}`}
            />
            {stateLabel}
          </span>
          <span className="text-[11.5px] text-muted truncate" title={state.statusMessage}>
            {state.statusMessage}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {state.error && (
        <div role="alert" className="alert-banner alert-banner--danger">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <p className="flex-1 m-0">{state.error}</p>
        </div>
      )}

      {/* API key warning */}
      {!hasApiKey && (
        <button
          type="button"
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#stream") })}
          className="alert-banner alert-banner--warning w-full text-left cursor-pointer"
        >
          <KeyRound size={15} className="shrink-0 mt-0.5" />
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
          className={`flex-1 h-10 ${state.isActive ? "btn-danger" : "btn-brand"}`}
        >
          {state.isActive ? <MicOff size={15} /> : <Mic size={15} />}
          <span>{state.isActive ? "Stop translating" : "Start translating"}</span>
        </button>

        <button
          type="button"
          onClick={() => void togglePause()}
          disabled={busy || !state.isActive}
          style={
            state.isActive && state.isPaused
              ? {
                  backgroundColor: "var(--warning-soft)",
                  borderColor: "var(--warning-border)",
                  color: "var(--warning-text)"
                }
              : undefined
          }
          className="btn-ghost w-10 h-10 p-0 shrink-0"
          title={state.isPaused ? "Resume" : "Pause"}
          aria-label={state.isPaused ? "Resume translation" : "Pause translation"}
        >
          {state.isPaused ? (
            <Play size={15} className="fill-current" />
          ) : (
            <Pause size={15} className="fill-current" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void resetOverlayLayout()}
          disabled={!state.isActive}
          className="btn-ghost w-10 h-10 p-0 shrink-0"
          title="Reset overlay position"
          aria-label="Reset overlay position"
        >
          <RefreshCcw size={14} />
        </button>
      </div>

      {/* Settings card */}
      <div className="surface-card p-2.5 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="section-label flex items-center gap-1.5">
            <Globe2 size={12} />
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
            <p className="alert-banner alert-banner--warning m-0 py-1.5 px-2 text-[11px]">
              The new language applies when you stop and restart the translation session.
            </p>
          )}
        </div>

        <div className="ui-divider" />

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

        <div className="ui-divider" />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-medium text-primary">Display mode</span>
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
                className={`choice-chip h-7 px-2.5 ${state.displayMode === mode ? "choice-chip-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-divider" />

        <SliderRow
          label="Subtitle size"
          icon={<Type size={12} className="text-muted" />}
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
      <span className="text-[12.5px] font-medium text-primary">{label}</span>
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
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-primary flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="value-pill">
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
        className="ui-range"
        style={{
          background: `linear-gradient(to right, var(--accent) ${percent}%, var(--slider-track) ${percent}%)`
        }}
      />
    </div>
  );
}
