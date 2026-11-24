import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Captions, Languages, Globe2, Loader2, Sparkles } from "lucide-react";
import { ProviderPair } from "./components/ProviderSelect";
import { LanguagePair } from "./components/LanguagePair";
import { ModeSwitch } from "./components/ModeSwitch";
import { StatusBadge } from "./components/StatusBadge";
import { ToggleSwitch } from "./components/ToggleSwitch";
import { diffSettings, loadSettings, updateSettings, watchSettings } from "../storage";
import { formatShortcutKeys } from "../shared/shortcuts";
import type { AIProviderId, AutoRule, ProviderId, Settings } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { LANGUAGES } from "../languages";

/** Labels for the per-site auto-translate rules. */
const AUTO_RULE_LABELS: Record<AutoRule, string> = {
  always: "Always",
  ask: "Ask",
  never: "Never"
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
 * The "Web Translate" tab of the popup: page translation controls.
 */
export function WebPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<TabContext | null>(null);
  const [status, setStatus] = useState<PageStatus>({ active: false, count: 0, pending: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toggleShortcut, setToggleShortcut] = useState("");
  const pendingSaves = useRef(0);

  // Initial load
  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const initial = await loadSettings();
      if (cancelled) return;
      setSettings(initial);
      unwatch = watchSettings((next) => {
        if (pendingSaves.current === 0) setSettings(next);
      });

      chrome.commands
        .getAll()
        .then((commands) => {
          if (!cancelled) {
            setToggleShortcut(
              commands.find((c) => c.name === "toggle-translation")?.shortcut ?? ""
            );
          }
        })
        .catch(() => {
          if (!cancelled) setToggleShortcut("");
        });

      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (cancelled) return;
      if (active?.id && active.url) {
        try {
          const url = new URL(active.url);
          setTab({ tabId: active.id, hostname: url.hostname, url: active.url });
          chrome.tabs
            .sendMessage(active.id, { type: "get-status" }, { frameId: 0 })
            .then((res: PageStatus | undefined) => {
              if (!cancelled && res && typeof res === "object") {
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
    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, []);

  // Listen for live status updates while the popup is open
  useEffect(() => {
    const listener = (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (
        message &&
        typeof message === "object" &&
        (message as { type?: string }).type === "status" &&
        sender.frameId === 0 &&
        sender.tab?.id === tab?.tabId
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
  }, [tab?.tabId]);

  const hostRule: AutoRule = useMemo(() => {
    if (!tab?.hostname) return settings.autoRule;
    return settings.hostRules[tab.hostname] ?? settings.autoRule;
  }, [settings, tab]);

  const restricted = useMemo(() => {
    if (!tab?.url) return false;
    if (!/^https?:\/\//i.test(tab.url)) return true;
    try {
      const { hostname, pathname } = new URL(tab.url);
      if (hostname === "chromewebstore.google.com") return true;
      if (hostname === "chrome.google.com" && pathname.startsWith("/webstore")) return true;
    } catch {
      return true;
    }
    return false;
  }, [tab]);

  const isLoading = useMemo(() => (busy || status.pending > 0) && !status.active, [busy, status]);

  const update = useCallback(
    async (next: Settings): Promise<void> => {
      const patch = diffSettings(settings, next);
      setSettings(next);
      setError("");
      pendingSaves.current++;
      try {
        const saved = await updateSettings(patch);
        if (pendingSaves.current === 1) setSettings(saved);
      } catch {
        setError("Couldn't save settings. Try again.");
        if (pendingSaves.current === 1) {
          setSettings(await loadSettings().catch(() => settings));
        }
      } finally {
        pendingSaves.current--;
      }
    },
    [settings]
  );

  const triggerTranslate = useCallback(async (): Promise<void> => {
    if (!tab || restricted) return;
    setBusy(true);
    setError("");
    try {
      try {
        await chrome.tabs.sendMessage(tab.tabId, { type: "get-status" }, { frameId: 0 });
      } catch {
        const files = getContentScriptFiles();
        if (files.length === 0) throw new Error("No content script declared in manifest");
        await chrome.scripting.executeScript({
          target: { tabId: tab.tabId, allFrames: true },
          files
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await chrome.tabs.sendMessage(tab.tabId, { type: "toggle" });
      setBusy(false);
    } catch (err) {
      console.warn("Failed to translate page", err);
      setError("Couldn't translate this page. Reload the page and try again.");
      setBusy(false);
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

  const setProvider = useCallback(
    async (provider: ProviderId): Promise<void> => {
      await update({ ...settings, provider });
    },
    [settings, update]
  );

  const setQuickProvider = useCallback(
    async (quickProvider: ProviderId): Promise<void> => {
      await update({ ...settings, quickProvider });
    },
    [settings, update]
  );

  const setAIProvider = useCallback(
    async (aiProvider: AIProviderId): Promise<void> => {
      await update({ ...settings, aiProvider });
    },
    [settings, update]
  );

  const openModelSettings = useCallback(() => {
    const url = chrome.runtime.getURL("options.html#models");
    void chrome.tabs.create({ url });
  }, []);

  const swapLangs = useCallback(async (): Promise<void> => {
    if (settings.sourceLang === "auto") return;
    await update({
      ...settings,
      sourceLang: settings.targetLang,
      targetLang: settings.sourceLang
    });
  }, [settings, update]);

  const setHostRule = useCallback(
    async (rule: AutoRule): Promise<void> => {
      if (!tab?.hostname || restricted) return;
      const hostRules = { ...settings.hostRules };
      if (rule === settings.autoRule) {
        delete hostRules[tab.hostname];
      } else {
        hostRules[tab.hostname] = rule;
      }
      await update({ ...settings, hostRules });
    },
    [settings, tab, restricted, update]
  );

  const buttonLabel = useMemo(
    () => (status.active ? "Show original" : isLoading ? "Translating…" : "Translate this page"),
    [status.active, isLoading]
  );

  const hostLabel = restricted ? "Unsupported page" : tab?.hostname || "No active tab";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Site info + display mode switch */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
            className="w-6 h-6 rounded-[6px] border flex items-center justify-center shrink-0 text-muted"
          >
            <Globe2 size={13} />
          </div>
          <p className="text-[12px] font-medium text-primary truncate" title={tab?.hostname || ""}>
            {hostLabel}
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
        className={`w-full h-10 ${status.active ? "btn-ghost font-semibold" : "btn-brand"}`}
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
        <span>{restricted ? "Can't translate this page" : buttonLabel}</span>
      </button>

      {!restricted && toggleShortcut && (
        <div className="flex items-center justify-center gap-1.5 -mt-1 text-[11px] text-muted">
          <span>Shortcut:</span>
          {formatShortcutKeys(toggleShortcut).map((key, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="opacity-60">+</span>}
              <kbd className="kbd-key">{key}</kbd>
            </Fragment>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="alert-banner alert-banner--danger">
          <span>{error}</span>
        </div>
      )}

      <StatusBadge active={status.active} count={status.count} pending={status.pending} />

      {/* Language + services card */}
      <section className="surface-card p-2.5 flex flex-col gap-2.5">
        <LanguagePair
          source={settings.sourceLang}
          target={settings.targetLang}
          onSourceChange={(sourceLang) => update({ ...settings, sourceLang })}
          onTargetChange={(targetLang) => update({ ...settings, targetLang })}
          onSwap={swapLangs}
          swapDisabled={settings.sourceLang === "auto"}
          bare
        />

        <div className="ui-divider" />

        <ProviderPair
          provider={settings.provider}
          quickProvider={settings.quickProvider}
          aiProvider={settings.aiProvider}
          customModels={settings.customModels}
          disabledProviders={settings.disabledProviders}
          onProviderChange={setProvider}
          onQuickProviderChange={setQuickProvider}
          onAIProviderChange={setAIProvider}
          onAddProvider={openModelSettings}
          onAddQuickProvider={openModelSettings}
          onAddAIProvider={openModelSettings}
          bare
        />
      </section>

      {/* Auto-translate */}
      <section className="surface-card p-2.5 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-muted">
          <Sparkles size={12} />
          <h2 className="section-label">Auto-translate</h2>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["always", "ask", "never"] as AutoRule[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={!tab?.hostname || restricted}
              onClick={() => setHostRule(r)}
              aria-pressed={hostRule === r}
              className={`choice-chip ${hostRule === r ? "choice-chip-active" : ""}`}
            >
              {AUTO_RULE_LABELS[r]}
            </button>
          ))}
        </div>
      </section>

      {/* YouTube Subtitle */}
      <section className="surface-card p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <Captions size={13} className="mt-0.5 text-muted shrink-0" />
            <div className="flex flex-col min-w-0">
              <h2 className="section-label">YouTube Subtitle</h2>
              <p className="text-[11px] leading-snug text-muted mt-0.5">
                Always show captions in{" "}
                {LANGUAGES.find((l) => l.code === settings.youtubeSubtitleLang)?.native ??
                  settings.youtubeSubtitleLang}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={settings.youtubeSubtitle}
            onChange={(youtubeSubtitle) => update({ ...settings, youtubeSubtitle })}
            ariaLabel="YouTube Subtitle"
          />
        </div>
        <p className="text-[11px] leading-snug text-muted">
          For AI subtitles, click <strong className="text-primary font-semibold">AI</strong> in the
          YouTube player bar.
        </p>
      </section>
    </div>
  );
}
