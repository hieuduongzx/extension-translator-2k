import { useEffect, useRef, useState, useCallback } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Pause, Save, Trash2 } from "lucide-react";
import { Section } from "./settingsShared";
import { matchesSearch } from "../shared/search";
import {
  DEFAULT_STREAM_STATE,
  getStreamState,
  sendStreamMessage,
  watchStreamState,
  type StreamAutoPauseMode,
  type StreamRuntimeState
} from "../stream/types";

const SONIOX_DOC_URL = "https://console.soniox.com";

interface StreamGeneralSettingsProps {
  query: string;
}

const SECTION_KEYWORDS = ["Soniox API key", "API key", "console.soniox.com", "Save", "Active"];
const AUTO_PAUSE_KEYWORDS = [
  "Auto-pause",
  "Pause when not focused",
  "Window loses focus",
  "Tab hidden",
  "Standby",
  "Silence"
];

const AUTO_PAUSE_OPTIONS: [StreamAutoPauseMode, string, string][] = [
  ["unfocused", "Not focused", "Tab hidden or the browser window loses focus."],
  ["hidden", "Tab hidden", "Only when you switch tabs or minimize the window."],
  ["off", "Never", "Keep translating in the background."]
];

export const KEYWORDS = [...SECTION_KEYWORDS, ...AUTO_PAUSE_KEYWORDS];

/**
 * Connection settings for the real-time stream translator: the Soniox API key.
 * Round-trips through the background worker so a live session picks up the
 * change immediately.
 */
export function StreamGeneralSettings({ query }: StreamGeneralSettingsProps) {
  const [state, setState] = useState<StreamRuntimeState>(DEFAULT_STREAM_STATE);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [autoPauseError, setAutoPauseError] = useState("");
  const dirty = useRef(false);
  const latestRevision = useRef(-1);

  const syncState = useCallback((next: StreamRuntimeState) => {
    if (next.revision < latestRevision.current) return;
    latestRevision.current = next.revision;
    setState(next);
  }, []);

  useEffect(() => {
    void (async () => {
      const next = await getStreamState();
      syncState(next ?? DEFAULT_STREAM_STATE);
    })();

    return watchStreamState(syncState);
  }, [syncState]);

  const saveApiKey = useCallback(async () => {
    const trimmed = apiKeyDraft.trim();

    // Validation
    if (!trimmed) {
      setApiKeyError("API key cannot be empty");
      return;
    }
    if (trimmed.length < 10) {
      setApiKeyError("API key must be at least 10 characters");
      return;
    }

    setApiKeyError("");
    setSaving(true);
    try {
      const next = await sendStreamMessage({
        type: "UPDATE_API_KEY",
        payload: { apiKey: trimmed }
      });
      if (!next) {
        setApiKeyError("Couldn't save the API key. Try again later.");
        return;
      }
      if (next.error) {
        setApiKeyError(next.error);
        return;
      }
      syncState(next);
      setApiKeyDraft("");
      dirty.current = false;
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [apiKeyDraft, syncState]);

  const clearApiKey = useCallback(async () => {
    setApiKeyError("");
    setSaving(true);
    try {
      const next = await sendStreamMessage({
        type: "UPDATE_API_KEY",
        payload: { apiKey: "" }
      });
      if (!next) {
        setApiKeyError("Couldn't delete the API key. Try again later.");
        return;
      }
      if (next.error) {
        setApiKeyError(next.error);
        return;
      }
      syncState(next);
      setApiKeyDraft("");
      dirty.current = false;
    } finally {
      setSaving(false);
    }
  }, [syncState]);

  const setAutoPause = useCallback(
    async (autoPause: StreamAutoPauseMode) => {
      setAutoPauseError("");
      const previous = state.autoPause;
      setState((prev) => ({ ...prev, autoPause }));
      const next = await sendStreamMessage({
        type: "UPDATE_OVERLAY_SETTINGS",
        payload: { autoPause }
      });
      if (next) {
        syncState(next);
      } else {
        setState((prev) => ({ ...prev, autoPause: previous }));
        setAutoPauseError("Couldn't update auto-pause setting. Try again.");
      }
    },
    [state.autoPause, syncState]
  );

  const hasApiKey = state.hasApiKey;
  const isSaveDisabled =
    saving || state.isActive || apiKeyDraft.trim().length === 0 || !!apiKeyError;

  if (!matchesSearch(query, ...SECTION_KEYWORDS, ...AUTO_PAUSE_KEYWORDS)) return null;

  return (
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">General</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Connection and credentials for the real-time stream translator.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
                <KeyRound className="w-3.5 h-3.5 text-brand-600" />
              </div>
              <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
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
                {savedFlash ? "Saved" : "Active"}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Enter your Soniox API key to enable real-time speech translation. The key is stored
            locally in your browser. Get a key at{" "}
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
                aria-label="New Soniox API key"
                aria-invalid={apiKeyError ? "true" : "false"}
                aria-describedby={apiKeyError ? "soniox-key-error" : undefined}
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
                className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors rounded-lg hover:bg-zinc-100"
                title={showApiKey ? "Hide key" : "Show key"}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
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
              {saving ? "Saving…" : "Save"}
            </button>
            {hasApiKey && (
              <button
                type="button"
                onClick={() => void clearApiKey()}
                disabled={saving || state.isActive}
                className="btn-ghost shrink-0 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete key
              </button>
            )}
          </div>
          {state.isActive && (
            <p className="text-[11px] text-amber-700 font-medium">
              Stop the active live translation session before changing or deleting the API key.
            </p>
          )}
          {apiKeyError && (
            <p
              id="soniox-key-error"
              role="alert"
              className="text-[11px] text-red-600 font-medium animate-scale-in"
            >
              {apiKeyError}
            </p>
          )}
        </section>
      </Section>

      <Section query={query} keywords={AUTO_PAUSE_KEYWORDS}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Pause className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Auto-pause</h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            Soniox bills for the whole time a session is open. Pausing closes it, and translation
            resumes by itself when you come back. After 8 seconds without sound (paused video, muted
            tab) the session also goes on standby until audio returns.
          </p>
          <div
            className="grid grid-cols-3 gap-1.5 max-w-xl"
            role="radiogroup"
            aria-label="Auto-pause"
          >
            {AUTO_PAUSE_OPTIONS.map(([mode, label, hint]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={state.autoPause === mode}
                title={hint}
                onClick={() => void setAutoPause(mode)}
                className={`choice-chip py-1.5 ${state.autoPause === mode ? "choice-chip-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            {AUTO_PAUSE_OPTIONS.find(([mode]) => mode === state.autoPause)?.[2]}
          </p>
          {autoPauseError && (
            <p role="alert" className="text-[11px] text-red-600 font-medium">
              {autoPauseError}
            </p>
          )}
        </section>
      </Section>
    </div>
  );
}
