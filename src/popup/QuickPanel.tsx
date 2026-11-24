import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ArrowRightLeft, Copy, Check, X, Languages, Loader2, Volume2, Square } from "lucide-react";
import { Dropdown } from "./components/Dropdown";
import { getAllProviderOptions } from "./components/ProviderSelect";
import { useSpeak } from "./useSpeak";
import { sendTranslateRequest } from "../content/messaging";
import { loadSettings, watchSettings } from "../storage";
import {
  DEFAULT_QUICK_SETTINGS,
  loadQuickSettings,
  watchQuickSettings,
  type QuickSettings as QuickSettingsType
} from "../quick/settings";
import { LANGUAGES } from "../languages";
import { DEFAULT_SETTINGS, type ProviderId, type Settings } from "../types";

const SOURCE_OPTIONS = LANGUAGES.map((lang) => ({
  value: lang.code,
  label: lang.native,
  description: lang.name
}));

const TARGET_OPTIONS = LANGUAGES.filter((l) => l.code !== "auto").map((lang) => ({
  value: lang.code,
  label: lang.native,
  description: lang.name
}));

const MAX_CHARS = 2000;

/** Session-scoped draft so reopening the popup (or switching tabs) resumes. */
const DRAFT_KEY = "translator2k:quickDraft";

interface QuickDraft {
  input: string;
  output: string;
  detected?: string;
  sourceLang: string;
  targetLang: string;
  provider: ProviderId;
}

async function loadDraft(): Promise<QuickDraft | null> {
  try {
    const stored = await chrome.storage.session.get(DRAFT_KEY);
    const draft = stored[DRAFT_KEY] as QuickDraft | undefined;
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: QuickDraft): void {
  try {
    void chrome.storage.session.set({ [DRAFT_KEY]: draft }).catch(() => undefined);
  } catch {
    /* session storage unavailable */
  }
}

/**
 * Standalone quick-translate tab for the popup.
 */
export function QuickPanel({ active }: { active: boolean }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [quickSettings, setQuickSettings] = useState<QuickSettingsType>(DEFAULT_QUICK_SETTINGS);
  const [ready, setReady] = useState(false);
  const pastedRef = useRef(false);

  const [sourceLang, setSourceLang] = useState(DEFAULT_SETTINGS.sourceLang);
  const [targetLang, setTargetLang] = useState(DEFAULT_SETTINGS.targetLang);
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_SETTINGS.provider);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [detected, setDetected] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const requestIdRef = useRef(0);
  const { speakingId, speak, stop } = useSpeak();
  const latestDraftRef = useRef<QuickDraft | null>(null);
  const speakTarget = sourceLang === "auto" ? (detected ?? "") : sourceLang;

  useEffect(() => {
    let unwatchMain: (() => void) | undefined;
    let unwatchQuick: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const [main, quick, draft] = await Promise.all([
        loadSettings(),
        loadQuickSettings(),
        loadDraft()
      ]);
      if (cancelled) return;
      setSettings(main);
      setQuickSettings(quick);
      if (draft) {
        setInput(draft.input ?? "");
        setOutput(draft.output ?? "");
        setDetected(draft.detected);
        setSourceLang(draft.sourceLang || main.sourceLang);
        setTargetLang(draft.targetLang || main.targetLang);
        setProvider(draft.provider || main.quickProvider);
        if (draft.input) pastedRef.current = true;
      } else {
        setSourceLang(main.sourceLang);
        setTargetLang(main.targetLang);
        setProvider(main.quickProvider);
      }
      setReady(true);
      unwatchMain = watchSettings((next) => setSettings(next));
      unwatchQuick = watchQuickSettings((next) => setQuickSettings(next));
    })();
    return () => {
      cancelled = true;
      unwatchMain?.();
      unwatchQuick?.();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const draft = { input, output, detected, sourceLang, targetLang, provider };
    latestDraftRef.current = draft;
    const timer = window.setTimeout(() => saveDraft(draft), 300);
    return () => window.clearTimeout(timer);
  }, [ready, input, output, detected, sourceLang, targetLang, provider]);

  useEffect(() => {
    const requestState = requestIdRef;
    const flushDraft = () => {
      if (latestDraftRef.current) saveDraft(latestDraftRef.current);
    };
    window.addEventListener("pagehide", flushDraft);
    return () => {
      requestState.current++;
      flushDraft();
      window.removeEventListener("pagehide", flushDraft);
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!active || !ready || !quickSettings.pasteFromClipboard || pastedRef.current) return;
    let cancelled = false;

    const attempt = async () => {
      if (cancelled || pastedRef.current) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!cancelled && text && !pastedRef.current) {
          pastedRef.current = true;
          setInput((current) => (current.length === 0 ? text.slice(0, MAX_CHARS) : current));
        }
      } catch {
        // Clipboard read may fail if permission is denied or not available.
      }
    };

    if (document.hasFocus()) {
      void attempt();
      return () => {
        cancelled = true;
      };
    }

    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      void attempt();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [active, ready, quickSettings.pasteFromClipboard]);

  const providerOptions = useMemo(
    () =>
      getAllProviderOptions(settings.customModels, settings.disabledProviders).filter(
        (o) => o.value !== "__add_custom__"
      ),
    [settings.customModels, settings.disabledProviders]
  );

  const trimmed = input.trim();
  const hasSelectedProvider = providerOptions.some((option) => option.value === provider);
  const canTranslate =
    ready && hasSelectedProvider && trimmed.length > 0 && trimmed.length <= MAX_CHARS && !busy;

  const handleTranslate = useCallback(async () => {
    if (!canTranslate) return;
    const requestId = ++requestIdRef.current;
    setBusy(true);
    setError("");
    setOutput("");
    setDetected(undefined);
    try {
      const res = await sendTranslateRequest({
        type: "translate",
        provider,
        texts: [trimmed],
        source: sourceLang,
        target: targetLang
      });
      if (requestId !== requestIdRef.current) return;
      if (res.error) throw new Error(res.error);
      const translation = res.translations[0];
      if (!translation) {
        throw new Error("No translation returned. Try again or choose another service.");
      }
      setOutput(translation);
      setDetected(res.detected);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setOutput("");
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      if (requestId === requestIdRef.current) setBusy(false);
    }
  }, [canTranslate, provider, sourceLang, targetLang, trimmed]);

  const clearResult = useCallback(() => {
    requestIdRef.current++;
    setBusy(false);
    setOutput("");
    setError("");
    setDetected(undefined);
    setCopied(false);
    stop();
  }, [stop]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      clearResult();
    },
    [clearResult]
  );

  useEffect(() => {
    if (!ready || providerOptions.some((option) => option.value === provider)) return;
    const fallback =
      providerOptions.find((option) => option.value === settings.quickProvider)?.value ??
      providerOptions[0]?.value;
    if (!fallback || fallback === provider) return;
    setProvider(fallback as ProviderId);
    clearResult();
  }, [ready, providerOptions, provider, settings.quickProvider, clearResult]);

  const handleSwap = useCallback(() => {
    if (sourceLang === "auto") return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    clearResult();
  }, [sourceLang, targetLang, clearResult]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors.
    }
  }, [output]);

  const detectedLabel = useMemo(() => {
    if (!detected || sourceLang !== "auto") return null;
    return detected.toUpperCase();
  }, [detected, sourceLang]);

  const speakingInput = speakingId === "input";
  const speakingOutput = speakingId === "output";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Language + provider controls */}
      <div className="surface-card p-2.5 flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="section-label">From</span>
            <Dropdown
              value={sourceLang}
              options={SOURCE_OPTIONS}
              onChange={(value) => {
                setSourceLang(value);
                clearResult();
              }}
              ariaLabel="Source language"
            />
          </div>
          <button
            type="button"
            onClick={handleSwap}
            disabled={sourceLang === "auto"}
            className="btn-ghost-sm w-8 h-8 p-0 shrink-0"
            title="Swap languages"
            aria-label="Swap languages"
          >
            <ArrowRightLeft size={14} />
          </button>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="section-label">To</span>
            <Dropdown
              value={targetLang}
              options={TARGET_OPTIONS}
              onChange={(value) => {
                setTargetLang(value);
                clearResult();
              }}
              ariaLabel="Target language"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="section-label">Service</span>
          <Dropdown
            value={provider}
            options={providerOptions}
            onChange={(v) => {
              setProvider(v as ProviderId);
              clearResult();
            }}
            ariaLabel="Translation service"
          />
        </div>
      </div>

      {/* Source box */}
      <div className="surface-card flex flex-col overflow-hidden">
        <div
          style={{ borderBottom: "1px solid var(--border)" }}
          className="flex items-center justify-between px-2.5 py-1.5"
        >
          <span className="section-label">Source text</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (speakingInput ? stop() : void speak(input, speakTarget, "input"))}
              disabled={!input || busy}
              className="btn-icon-sm"
              title={speakingInput ? "Stop speaking" : "Read text"}
              aria-label={speakingInput ? "Stop speaking" : "Read text"}
            >
              {speakingInput ? (
                <Square size={13} className="fill-current" />
              ) : (
                <Volume2 size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleInputChange("")}
              disabled={!input}
              className="btn-icon-sm"
              title="Clear"
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleTranslate();
              }
            }}
            placeholder="Enter text…"
            rows={4}
            maxLength={MAX_CHARS}
            style={{ color: "var(--text)" }}
            className="w-full p-2.5 pb-6 bg-transparent text-[13.5px] placeholder:text-[var(--text-muted)] resize-none focus:outline-none"
          />
          <span className="absolute right-2.5 bottom-1.5 text-[10.5px] text-muted tabular-nums">
            {input.length}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Translate action */}
      <button
        type="button"
        onClick={() => void handleTranslate()}
        disabled={!canTranslate}
        className="btn-brand w-full h-9"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
        <span>{busy ? "Translating…" : "Translate"}</span>
      </button>

      {busy && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 text-[11px] text-muted"
        >
          <span>
            {elapsed < 8
              ? `Waiting for translation · ${elapsed}s`
              : `Taking longer than usual · ${elapsed}s.`}
          </span>
          <button
            type="button"
            onClick={clearResult}
            className="shrink-0 text-accent font-medium hover:underline cursor-pointer bg-transparent border-0"
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="alert-banner alert-banner--danger">
          <span>{error}</span>
        </div>
      )}

      {/* Output box */}
      <div aria-busy={busy} className="surface-card flex flex-col overflow-hidden">
        <div
          style={{ borderBottom: "1px solid var(--border)" }}
          className="flex items-center justify-between px-2.5 py-1.5"
        >
          <span className="section-label">Translation</span>
          <div className="flex items-center gap-1.5">
            {detectedLabel && <span className="value-pill">{detectedLabel}</span>}
            <button
              type="button"
              onClick={() => (speakingOutput ? stop() : void speak(output, targetLang, "output"))}
              disabled={!output || busy}
              className="btn-icon-sm"
              title={speakingOutput ? "Stop speaking" : "Read translation"}
              aria-label={speakingOutput ? "Stop speaking" : "Read translation"}
            >
              {speakingOutput ? (
                <Square size={13} className="fill-current" />
              ) : (
                <Volume2 size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!output}
              className="btn-icon-sm"
              title={copied ? "Copied" : "Copy"}
              aria-label={copied ? "Copied" : "Copy"}
            >
              {copied ? (
                <Check size={14} style={{ color: "var(--success)" }} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
        <textarea
          value={output}
          readOnly
          placeholder="Translation will appear here…"
          rows={4}
          style={{ backgroundColor: "var(--surface-2)", color: "var(--text)" }}
          className="w-full p-2.5 text-[13.5px] placeholder:text-[var(--text-muted)] resize-none focus:outline-none"
        />
      </div>
    </div>
  );
}
