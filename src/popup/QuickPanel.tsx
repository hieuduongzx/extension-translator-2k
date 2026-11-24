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
 * Standalone quick-translate tab for the popup. Two big text areas
 * (source / output) plus language and provider controls, similar to
 * Google Translate's input/output layout. The whole working state (text,
 * result, language/provider picks) lives in `chrome.storage.session`, so
 * closing the popup or hopping between tabs never loses work.
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

  // Initial load: settings provide the defaults, a session draft (if any)
  // wins over them so in-progress work survives popup reopen / tab switches.
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

  // Coalesce keystrokes into one write; flush the latest draft on popup close.
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

  // Auto-paste clipboard content when the Quick tab is shown, the setting is
  // enabled and the input is still empty. We wait until the panel is `active`
  // (not just mounted): all three popup panels mount at once, so firing on
  // mount would read the clipboard while the user is on another tab and never
  // retry when they switch here. `navigator.clipboard.readText()` also requires
  // the document to be focused — on popup open focus may not have landed yet,
  // so we defer to the next `focus` event in that case.
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
      if (!translation)
        throw new Error("No translation returned. Try again or choose another service.");
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
    <div className="p-3 space-y-3">
      {/* Language + provider controls */}
      <div className="surface-card p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
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
            className="mt-4 h-8 w-8 inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Swap languages"
            aria-label="Swap languages"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 min-w-0">
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

        <div>
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
      <div className="surface-card surface-card-hover focus-within:ring-2 focus-within:ring-brand-400 flex flex-col transition-all duration-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200/80">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Source text
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (speakingInput ? stop() : void speak(input, speakTarget, "input"))}
              disabled={!input || busy}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40"
              title={speakingInput ? "Stop speaking" : "Read text"}
              aria-label={speakingInput ? "Stop speaking" : "Read text"}
            >
              {speakingInput ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleInputChange("")}
              disabled={!input}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40"
              title="Clear"
              aria-label="Clear"
            >
              <X className="w-3.5 h-3.5" />
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
            rows={5}
            maxLength={MAX_CHARS}
            className="w-full p-3 bg-transparent text-[14px] text-zinc-900 placeholder:text-zinc-500 resize-none focus:outline-none"
          />
          <span className="absolute right-2.5 bottom-2 text-[10px] text-zinc-500 tabular-nums">
            {input.length}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Translate action */}
      <button
        type="button"
        onClick={() => void handleTranslate()}
        disabled={!canTranslate}
        className="group w-full h-10 flex items-center justify-center gap-2 rounded-xl text-[13px] font-semibold bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin-slow" />
        ) : (
          <Languages className="w-4 h-4 group-hover:scale-110 transition-transform" />
        )}
        {busy ? "Translating…" : "Translate"}
      </button>

      {busy && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 text-[11px] text-zinc-500"
        >
          <span>
            {elapsed < 8
              ? `Waiting for translation · ${elapsed}s`
              : `Service is taking longer · ${elapsed}s. You can try another service.`}
          </span>
          <button
            type="button"
            onClick={clearResult}
            className="shrink-0 text-brand-700 font-medium hover:underline"
          >
            Stop waiting
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-red-600 font-medium animate-scale-in">
          {error}
        </p>
      )}

      {/* Output box */}
      <div
        aria-busy={busy}
        className="surface-card surface-card-hover flex flex-col transition-all duration-200"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200/80">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Translation
          </span>
          <div className="flex items-center gap-2">
            {detectedLabel && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                {detectedLabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => (speakingOutput ? stop() : void speak(output, targetLang, "output"))}
              disabled={!output || busy}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40"
              title={speakingOutput ? "Stop speaking" : "Read translation"}
              aria-label={speakingOutput ? "Stop speaking" : "Read translation"}
            >
              {speakingOutput ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!output}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40"
              title={copied ? "Copied" : "Copy"}
              aria-label={copied ? "Copied" : "Copy"}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
        <textarea
          value={output}
          readOnly
          placeholder="Translation will appear here…"
          rows={5}
          className="w-full p-3 bg-zinc-50/50 text-[14px] text-zinc-900 placeholder:text-zinc-500 resize-none focus:outline-none"
        />
      </div>
    </div>
  );
}
