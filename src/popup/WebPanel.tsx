import { useEffect, useMemo, useState } from "react";
import { Languages, Globe2, Loader2 } from "lucide-react";
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

  async function update(next: Settings, notifyTab = true): Promise<void> {
    setSettings(next);
    // Persist only the fields that actually changed, merged over the freshest
    // stored settings. This prevents the popup's snapshot from clobbering
    // fields written elsewhere (e.g. provider/theme from an in-page popup, or
    // host rules) between renders.
    const patch = diffSettings(settings, next);
    const saved = await updateSettings(patch);
    if (!notifyTab || !tab) return;
    chrome.tabs
      .sendMessage(tab.tabId, { type: "apply-settings", settings: saved })
      .catch(() => {
        /* content script may not be loaded */
      });
  }

  async function triggerTranslate(): Promise<void> {
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
  }

  function getContentScriptFiles(): string[] {
    try {
      const manifest = chrome.runtime.getManifest();
      const files = manifest.content_scripts?.flatMap((cs) => cs.js ?? []) ?? [];
      return Array.from(new Set(files));
    } catch {
      return [];
    }
  }

  async function setProvider(provider: ProviderId): Promise<void> {
    await update({ ...settings, provider });
  }

  async function setAIProvider(aiProvider: AIProviderId): Promise<void> {
    await update({ ...settings, aiProvider });
  }

  /**
   * Create a blank custom model, select it for the requested role, and open the
   * options page so the user can fill in its endpoint/model/key right away.
   */
  async function addCustomModel(role: "provider" | "ai"): Promise<void> {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `m${Date.now()}`;
    const model: CustomModel = { id, name: "", endpoint: "", apiKey: "", model: "" };
    const pid = customProviderId(id);
    const next: Settings = {
      ...settings,
      customModels: [...settings.customModels, model],
      ...(role === "provider" ? { provider: pid } : { aiProvider: pid })
    };
    await update(next, false);
    chrome.runtime.openOptionsPage();
  }

  async function setHostRule(rule: AutoRule): Promise<void> {
    if (!tab?.hostname) return;
    const hostRules = { ...settings.hostRules };
    if (rule === settings.autoRule) {
      delete hostRules[tab.hostname];
    } else {
      hostRules[tab.hostname] = rule;
    }
    await update({ ...settings, hostRules });
  }

  const buttonLabel = status.active
    ? "Hiện bản gốc"
    : status.pending > 0 || busy
      ? "Đang dịch…"
      : "Dịch trang này";

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <p className="text-[11.5px] font-medium text-zinc-600 truncate max-w-[210px] leading-tight">
            {tab?.hostname || "Không có tab nào"}
          </p>
        </div>
        <ModeSwitch
          value={settings.displayMode}
          onChange={(displayMode) => update({ ...settings, displayMode })}
        />
      </div>

      <button
        type="button"
        onClick={triggerTranslate}
        disabled={!tab || restricted || busy}
        className={`group w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border transition-all text-[14px] font-semibold tracking-tight active:scale-[0.99] ${
          status.active
            ? "bg-white border-zinc-200 text-zinc-900 shadow-card hover:border-zinc-300 hover:shadow-card-hover"
            : "bg-brand-600 border-brand-600 text-white shadow-glow hover:bg-brand-700"
        } disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none`}
      >
        {(busy || status.pending > 0) && !status.active ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Languages className="w-4 h-4" />
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

      <section className="surface-card p-2.5 flex flex-col gap-2.5">
        <LanguagePair
          source={settings.sourceLang}
          target={settings.targetLang}
          onSourceChange={(sourceLang) => update({ ...settings, sourceLang })}
          onTargetChange={(targetLang) => update({ ...settings, targetLang })}
          bare
        />

        <div className="h-px bg-zinc-200/70" />

        <ProviderPair
          provider={settings.provider}
          aiProvider={settings.aiProvider}
          customModels={settings.customModels}
          onProviderChange={setProvider}
          onAIProviderChange={setAIProvider}
          onAddProvider={() => void addCustomModel("provider")}
          onAddAIProvider={() => void addCustomModel("ai")}
          bare
        />
      </section>

      <section className="surface-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Globe2 className="w-3.5 h-3.5 text-zinc-500" />
          <h2 className="text-[12px] font-semibold tracking-tight text-zinc-900">
            Tự động dịch trang này
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["always", "ask", "never"] as AutoRule[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setHostRule(r)}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider border transition-all active:scale-[0.97] ${
                hostRule === r
                  ? "bg-brand-50 border-brand-300 text-brand-700 shadow-glow-sm"
                  : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {AUTO_RULE_LABELS[r]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-zinc-500">
          {hostRule === "always"
            ? "Các trang trên site này sẽ tự dịch khi mở."
            : hostRule === "never"
              ? "Site này không bao giờ tự động dịch."
              : "Bấm nút Dịch (hoặc dùng phím tắt) để dịch trang."}
        </p>
      </section>
    </div>
  );
}
