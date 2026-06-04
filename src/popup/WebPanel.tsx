import { useEffect, useMemo, useState, useCallback } from "react";
import { Languages, Globe2, Loader2, Sparkles } from "lucide-react";
import { ProviderPair } from "./components/ProviderSelect";
import { LanguagePair } from "./components/LanguagePair";
import { ModeSwitch } from "./components/ModeSwitch";
import { StatusBadge } from "./components/StatusBadge";
import { loadSettings, updateSettings, watchSettings, diffSettings } from "../storage";
import type { AIProviderId, AutoRule, CustomModel, ProviderId, Settings } from "../types";
import { customProviderId, DEFAULT_SETTINGS } from "../types";

/** Vietnamese labels for the per-site auto-translate rules. */
const AUTO_RULE_LABELS: Record<AutoRule, string> = {
  always: "Luôn luôn",
  ask: "Hỏi",
  never: "Không bao giờ"
};

interface TabContext {
  tabId: number;
  hostname: string;
  url: string;
}

interface PageStatus {
  active: boolean;
  count: number;
  pending: number;
}

/**
 * The "Dịch Web" tab of the popup: page translation controls. Settings that
 * used to live behind the inline gear now open the dedicated options page so
 * both features can share one settings surface with a sidebar.
 */
export function WebPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<TabContext | null>(null);
  const [status, setStatus] = useState<PageStatus>({ active: false, count: 0, pending: 0 });
  const [busy, setBusy] = useState(false);

  // Initial load
  useEffect(() => {
    let unwatch: (() => void) | undefined;
    void (async () => {
      const initial = await loadSettings();
      setSettings(initial);
      unwatch = watchSettings((next) => setSettings(next));

      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active?.id && active.url) {
        try {
          const url = new URL(active.url);
          setTab({ tabId: active.id, hostname: url.hostname, url: active.url });
          chrome.tabs
            .sendMessage(active.id, { type: "get-status" })
            .then((res: PageStatus | undefined) => {
              if (res && typeof res === "object") {
                setStatus({
                  active: !!res.active,
                  count: res.count ?? 0,
                  pending: res.pending ?? 0
                });
              }
            })
            .catch(() => {
              /* content script not loaded yet */
            });
        } catch {
          setTab({ tabId: active.id, hostname: "", url: active.url ?? "" });
        }
      }
    })();
    return () => unwatch?.();
  }, []);

  // Listen for live status updates while the popup is open
  useEffect(() => {
    const listener = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        (message as { type?: string }).type === "status"
      ) {
        const m = message as PageStatus;
        setStatus({
          active: !!m.active,
          count: m.count ?? 0,
          pending: m.pending ?? 0
        });
        if (m.pending === 0) setBusy(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const hostRule: AutoRule = useMemo(() => {
    if (!tab?.hostname) return settings.autoRule;
    return settings.hostRules[tab.hostname] ?? settings.autoRule;
  }, [settings, tab]);

  const restricted = useMemo(() => {
    if (!tab?.url) return false;
    return /^(chrome|edge|about|chrome-extension|view-source):/i.test(tab.url);
  }, [tab]);

  const isLoading = useMemo(() => (busy || status.pending > 0) && !status.active, [busy, status]);

  const update = useCallback(async (next: Settings, notifyTab = true): Promise<void> => {
    setSettings(next);
    const patch = diffSettings(settings, next);
    const saved = await updateSettings(patch);
    if (!notifyTab || !tab) return;
    chrome.tabs
      .sendMessage(tab.tabId, { type: "apply-settings", settings: saved })
      .catch(() => {
        /* content script may not be loaded */
      });
  }, [settings, tab]);

  const triggerTranslate = useCallback(async (): Promise<void> => {
    if (!tab || restricted) return;
    setBusy(true);
    try {
      await chrome.tabs.sendMessage(tab.tabId, { type: "toggle" });
      window.close();
    } catch {
      try {
        const files = getContentScriptFiles();
        if (files.length === 0) throw new Error("No content script declared in manifest");
        await chrome.scripting.executeScript({
          target: { tabId: tab.tabId },
          files
        });
        await new Promise((r) => setTimeout(r, 50));
        await chrome.tabs.sendMessage(tab.tabId, { type: "toggle" });
        window.close();
      } catch (err) {
        console.warn("Failed to translate page", err);
        setBusy(false);
      }
    }
  }, [tab, restricted]);

  function getContentScriptFiles(): string[] {
    try {
      const manifest = chrome.runtime.getManifest();
      const files = manifest.content_scripts?.flatMap((cs) => cs.js ?? []) ?? [];
      return Array.from(new Set(files));
    } catch {
      return [];
    }
  }

  const setProvider = useCallback(async (provider: ProviderId): Promise<void> => {
    await update({ ...settings, provider });
  }, [settings, update]);

  const setQuickProvider = useCallback(async (quickProvider: ProviderId): Promise<void> => {
    await update({ ...settings, quickProvider });
  }, [settings, update]);

  const setAIProvider = useCallback(async (aiProvider: AIProviderId): Promise<void> => {
    await update({ ...settings, aiProvider });
  }, [settings, update]);

  const addCustomModel = useCallback(async (role: "provider" | "quick" | "ai"): Promise<void> => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `m${Date.now()}`;
    const model: CustomModel = { id, name: "", endpoint: "", apiKey: "", model: "" };
    const pid = customProviderId(id);
    const next: Settings = {
      ...settings,
      customModels: [...settings.customModels, model],
      ...(role === "provider"
        ? { provider: pid }
        : role === "quick"
          ? { quickProvider: pid }
          : { aiProvider: pid })
    };
    await update(next, false);
    chrome.runtime.openOptionsPage();
  }, [settings, update]);

  const setHostRule = useCallback(async (rule: AutoRule): Promise<void> => {
    if (!tab?.hostname) return;
    const hostRules = { ...settings.hostRules };
    if (rule === settings.autoRule) {
      delete hostRules[tab.hostname];
    } else {
      hostRules[tab.hostname] = rule;
    }
    await update({ ...settings, hostRules });
  }, [settings, tab, update]);

  const buttonLabel = useMemo(() => status.active
    ? "Hiện bản gốc"
    : isLoading
      ? "Đang dịch…"
      : "Dịch trang này", [status.active, isLoading]);

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      {/* Site info + mode switch */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-zinc-100 border border-zinc-200/80 flex items-center justify-center shrink-0">
            <Globe2 className="w-3 h-3 text-zinc-500" />
          </div>
          <p className="text-[11.5px] font-semibold text-zinc-700 truncate max-w-[190px] leading-tight">
            {tab?.hostname || "Không có tab nào"}
          </p>
        </div>
        <ModeSwitch
          value={settings.displayMode}
          onChange={(displayMode) => update({ ...settings, displayMode })}
        />
      </div>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={triggerTranslate}
        disabled={!tab || restricted || busy}
        className={`group w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border transition-all duration-200 text-[14px] font-semibold tracking-tight active:scale-[0.98] hover-lift ${
          status.active
            ? "bg-white border-zinc-200 text-zinc-900 shadow-card hover:border-zinc-300 hover:shadow-card-hover"
            : "bg-brand-600 border-brand-600 text-white shadow-glow hover:bg-brand-700 hover:shadow-[0_12px_32px_-8px_rgba(20,184,166,0.5)]"
        } disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none disabled:hover:translate-y-0`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin-slow" />
        ) : (
          <Languages className={`w-4 h-4 transition-transform duration-200 ${status.active ? "" : "group-hover:scale-110"}`} />
        )}
        {restricted ? "Không thể dịch trang này" : buttonLabel}
      </button>

      {!restricted && (
        <div className="flex items-center justify-center gap-1.5 -mt-1 text-[10.5px] text-zinc-500">
          <span>Phím tắt:</span>
          <kbd className="kbd-key">Alt</kbd>
          <span className="opacity-60">+</span>
          <kbd className="kbd-key">A</kbd>
        </div>
      )}

      <StatusBadge active={status.active} count={status.count} pending={status.pending} />

      {/* Settings card */}
      <section className="surface-card surface-card-hover p-2.5 flex flex-col gap-2.5 transition-all duration-200">
        <LanguagePair
          source={settings.sourceLang}
          target={settings.targetLang}
          onSourceChange={(sourceLang) => update({ ...settings, sourceLang })}
          onTargetChange={(targetLang) => update({ ...settings, targetLang })}
          bare
        />

        <div className="h-px bg-zinc-200/60" />

        <ProviderPair
          provider={settings.provider}
          quickProvider={settings.quickProvider}
          aiProvider={settings.aiProvider}
          customModels={settings.customModels}
          onProviderChange={setProvider}
          onQuickProviderChange={setQuickProvider}
          onAIProviderChange={setAIProvider}
          onAddProvider={() => void addCustomModel("provider")}
          onAddQuickProvider={() => void addCustomModel("quick")}
          onAddAIProvider={() => void addCustomModel("ai")}
          bare
        />
      </section>

      {/* Auto-translate */}
      <section className="surface-card surface-card-hover p-2.5 flex flex-col gap-2 transition-all duration-200">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-zinc-400" />
          <h2 className="section-label">
            Tự động dịch
          </h2>
        </div>
        <div className="flex gap-1.5">
          {(["always", "ask", "never"] as AutoRule[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setHostRule(r)}
              className={`flex-1 px-2 py-1 rounded-lg text-[10.5px] font-semibold uppercase tracking-wider border transition-all duration-200 active:scale-[0.97] ${
                hostRule === r
                  ? "bg-brand-50 border-brand-300 text-brand-700 shadow-glow-sm"
                  : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {AUTO_RULE_LABELS[r]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
