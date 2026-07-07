import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ArrowRightLeft, Copy, Check, X, Languages, Loader2 } from "lucide-react";
import { Dropdown } from "./components/Dropdown";
import { getAllProviderOptions } from "./components/ProviderSelect";
import { translateWith } from "../providers";
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

/**
 * Standalone quick-translate tab for the popup. Two big text areas
 * (source / output) plus language and provider controls, similar to
 * Google Translate's input/output layout.
 */
export function QuickPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [quickSettings, setQuickSettings] = useState<QuickSettingsType>(DEFAULT_QUICK_SETTINGS);
  const pastedRef = useRef(false);

  useEffect(() => {
    let unwatchMain: (() => void) | undefined;
    let unwatchQuick: (() => void) | undefined;
    void (async () => {
      const [main, quick] = await Promise.all([loadSettings(), loadQuickSettings()]);
      setSettings(main);
      setQuickSettings(quick);
      unwatchMain = watchSettings((next) => setSettings(next));
      unwatchQuick = watchQuickSettings((next) => setQuickSettings(next));
    })();
    return () => {
      unwatchMain?.();
      unwatchQuick?.();
    };
  }, []);

  // Auto-paste clipboard content when enabled and the input is still empty.
  useEffect(() => {
    if (!quickSettings.pasteFromClipboard || pastedRef.current) return;
    void (async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && !pastedRef.current) {
          pastedRef.current = true;
          setInput((current) => (current.length === 0 ? text.slice(0, MAX_CHARS) : current));
        }
      } catch {
        // Clipboard read may fail if permission is denied or not available.
      }
    })();
  }, [quickSettings.pasteFromClipboard]);

  const [sourceLang, setSourceLang] = useState(settings.sourceLang);
  const [targetLang, setTargetLang] = useState(settings.targetLang);
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [detected, setDetected] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Sync local controls with settings once loaded.
  useEffect(() => {
    setSourceLang(settings.sourceLang);
    setTargetLang(settings.targetLang);
    setProvider(settings.provider);
  }, [settings.sourceLang, settings.targetLang, settings.provider]);

  const providerOptions = useMemo(
    () => getAllProviderOptions(settings.customModels).filter((o) => o.value !== "__add_custom__"),
    [settings.customModels]
  );

  const trimmed = input.trim();
  const canTranslate = trimmed.length > 0 && trimmed.length <= MAX_CHARS && !busy;

  const handleTranslate = useCallback(async () => {
    if (!canTranslate) return;
    setBusy(true);
    setError("");
    setOutput("");
    setDetected(undefined);
    try {
      const res = await translateWith(provider, [trimmed], sourceLang, targetLang, settings);
      setOutput(res.translations[0] ?? "");
      setDetected(res.detected);
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Dịch thất bại");
    } finally {
      setBusy(false);
    }
  }, [canTranslate, provider, sourceLang, targetLang, settings, trimmed]);

  const handleSwap = useCallback(() => {
    if (sourceLang === "auto") return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  }, [sourceLang, targetLang]);

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

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      {/* Language + provider controls */}
      <div className="surface-card p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <span className="section-label">Từ</span>
            <Dropdown value={sourceLang} options={SOURCE_OPTIONS} onChange={setSourceLang} />
          </div>
          <button
            type="button"
            onClick={handleSwap}
            disabled={sourceLang === "auto"}
            className="mt-4 h-8 w-8 inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            title="Hoán đổi ngôn ngữ"
            aria-label="Hoán đổi ngôn ngữ"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 min-w-0">
            <span className="section-label">Sang</span>
            <Dropdown value={targetLang} options={TARGET_OPTIONS} onChange={setTargetLang} />
          </div>
        </div>

        <div>
          <span className="section-label">Dịch vụ</span>
          <Dropdown
            value={provider}
            options={providerOptions}
            onChange={(v) => setProvider(v as ProviderId)}
          />
        </div>
      </div>

      {/* Source box */}
      <div className="surface-card surface-card-hover flex flex-col transition-all duration-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200/80 dark:border-zinc-700/50">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Văn bản gốc
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setInput("")}
              disabled={!input}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40 dark:hover:bg-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
              title="Xoá"
              aria-label="Xoá"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập văn bản…"
            rows={5}
            maxLength={MAX_CHARS}
            className="w-full p-3 bg-transparent text-[14px] text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none dark:text-zinc-100"
          />
          <span className="absolute right-2.5 bottom-2 text-[10px] text-zinc-400 dark:text-zinc-500">
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
        {busy ? "Đang dịch…" : "Dịch"}
      </button>

      {error && (
        <p className="text-[11px] text-red-600 font-medium animate-scale-in dark:text-red-400">
          {error}
        </p>
      )}

      {/* Output box */}
      <div className="surface-card surface-card-hover flex flex-col transition-all duration-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200/80 dark:border-zinc-700/50">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Bản dịch
          </span>
          <div className="flex items-center gap-2">
            {detectedLabel && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded dark:bg-brand-900/30 dark:text-brand-300">
                {detectedLabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!output}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40 dark:hover:bg-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-100"
              title={copied ? "Đã sao chép" : "Sao chép"}
              aria-label={copied ? "Đã sao chép" : "Sao chép"}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
        <textarea
          value={output}
          readOnly
          placeholder="Bản dịch sẽ hiện ở đây…"
          rows={5}
          className="w-full p-3 bg-zinc-50/50 dark:bg-zinc-800/50 text-[14px] text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none dark:text-zinc-100"
        />
      </div>
    </div>
  );
}
