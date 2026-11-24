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
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">API &amp; Auto-pause</h1>
        <p className="opt-page-subtitle">
          Connection credentials and session billing controls for live stream subtitles.
        </p>
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="icon-badge">
                <KeyRound size={14} />
              </span>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">Soniox API key</h2>
            </div>
            {hasApiKey && (
              <span className="status-pill status-pill--success">
                <CheckCircle2 size={12} />
                <span>{savedFlash ? "Saved" : "Active"}</span>
              </span>
            )}
          </div>
          <p className="text-[11.5px] leading-snug text-muted m-0">
            Enter your Soniox API key to enable real-time speech translation. Stored locally in your
            browser. Get a key at{" "}
            <a
              href={SONIOX_DOC_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent font-medium hover:underline"
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
                className={`brand-input w-full pr-9 font-mono ${apiKeyError ? "brand-input--error" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="btn-icon-sm absolute right-1 top-1/2 -translate-y-1/2"
                title={showApiKey ? "Hide key" : "Show key"}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void saveApiKey()}
              disabled={isSaveDisabled}
              className="btn-brand shrink-0"
            >
              <Save size={14} />
              <span>{saving ? "Saving…" : "Save"}</span>
            </button>
            {hasApiKey && (
              <button
                type="button"
                onClick={() => void clearApiKey()}
                disabled={saving || state.isActive}
                className="btn-ghost shrink-0"
              >
                <Trash2 size={14} />
                <span>Delete key</span>
              </button>
            )}
          </div>
          {state.isActive && (
            <div className="alert-banner alert-banner--warning">
              <span>
                Stop the active live translation session before changing or deleting the key.
              </span>
            </div>
          )}
          {apiKeyError && (
            <div id="soniox-key-error" role="alert" className="alert-banner alert-banner--danger">
              <span>{apiKeyError}</span>
            </div>
          )}
        </section>
      </Section>

      <Section query={query} keywords={AUTO_PAUSE_KEYWORDS}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Pause size={14} />
            </span>
            <h2 className="text-[13.5px] font-semibold text-primary m-0">Auto-pause</h2>
          </div>
          <p className="text-[11.5px] leading-snug text-muted m-0">
            Soniox bills for the whole time a session is open. Pausing closes it, and translation
            resumes automatically when you return. After 8 seconds without audio, the session also
            enters standby.
          </p>
          <div
            className="grid grid-cols-3 gap-1.5 max-w-lg"
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
                className={`choice-chip ${state.autoPause === mode ? "choice-chip-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] leading-snug text-muted m-0">
            {AUTO_PAUSE_OPTIONS.find(([mode]) => mode === state.autoPause)?.[2]}
          </p>
          {autoPauseError && (
            <div role="alert" className="alert-banner alert-banner--danger">
              <span>{autoPauseError}</span>
            </div>
          )}
        </section>
      </Section>
    </div>
  );
}
