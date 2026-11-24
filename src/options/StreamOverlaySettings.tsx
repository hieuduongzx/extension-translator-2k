import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Captions, RotateCcw } from "lucide-react";
import { ToggleSwitch } from "../popup/components/ToggleSwitch";
import { Section } from "./settingsShared";
import { matchesSearch } from "../shared/search";
import {
  DEFAULT_STREAM_STATE,
  getStreamState,
  sendStreamMessage,
  watchStreamState,
  type StreamRuntimeState,
  type StreamOverlaySettings
} from "../stream/types";

interface StreamOverlaySettingsProps {
  query: string;
}

const SECTION_KEYWORDS = [
  "Default subtitle overlay",
  "Show original text",
  "Show speaker",
  "Auto-scroll to new line",
  "Display mode",
  "Continuous",
  "By sentence",
  "Subtitle size",
  "Background opacity",
  "Reset overlay position"
];

export const KEYWORDS = [...SECTION_KEYWORDS];

export function StreamOverlaySettings({ query }: StreamOverlaySettingsProps) {
  const [overlay, setOverlay] = useState<Pick<
    StreamOverlaySettings,
    "fontScale" | "opacity" | "displayMode" | "showSource" | "showSpeaker" | "autoScroll"
  > | null>(null);
  const [error, setError] = useState("");
  const latestRevision = useRef(-1);
  const pendingUpdates = useRef(0);

  const syncState = useCallback((next: StreamRuntimeState) => {
    if (next.revision < latestRevision.current) return;
    latestRevision.current = next.revision;
    if (pendingUpdates.current > 0) return;
    setOverlay({
      fontScale: next.fontScale,
      opacity: next.opacity,
      displayMode: next.displayMode,
      showSource: next.showSource,
      showSpeaker: next.showSpeaker,
      autoScroll: next.autoScroll
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await getStreamState();
      if (!cancelled) syncState(next ?? DEFAULT_STREAM_STATE);
    })();

    const unwatch = watchStreamState(syncState);
    return () => {
      cancelled = true;
      unwatch();
    };
  }, [syncState]);

  const patchOverlay = useCallback(async (payload: Partial<StreamOverlaySettings>) => {
    setError("");
    setOverlay((prev) => (prev ? { ...prev, ...payload } : prev));
    pendingUpdates.current++;
    try {
      const next = await sendStreamMessage({ type: "UPDATE_OVERLAY_SETTINGS", payload });
      if (next && next.revision >= latestRevision.current) {
        latestRevision.current = next.revision;
        if (pendingUpdates.current === 1) {
          setOverlay({
            fontScale: next.fontScale,
            opacity: next.opacity,
            displayMode: next.displayMode,
            showSource: next.showSource,
            showSpeaker: next.showSpeaker,
            autoScroll: next.autoScroll
          });
        }
      } else if (!next) {
        setError("Couldn't save overlay setting. Try again.");
        if (pendingUpdates.current === 1) {
          const fresh = await getStreamState();
          if (fresh) {
            setOverlay({
              fontScale: fresh.fontScale,
              opacity: fresh.opacity,
              displayMode: fresh.displayMode,
              showSource: fresh.showSource,
              showSpeaker: fresh.showSpeaker,
              autoScroll: fresh.autoScroll
            });
          }
        }
      }
    } finally {
      pendingUpdates.current = Math.max(0, pendingUpdates.current - 1);
    }
  }, []);

  const resetOverlay = useCallback(async () => {
    setError("");
    const next = await sendStreamMessage({ type: "RESET_OVERLAY_LAYOUT" });
    if (!next) setError("Couldn't reset overlay position. Try again.");
  }, []);

  const fontPercent = useMemo(
    () => (overlay ? ((overlay.fontScale - 30) / (180 - 30)) * 100 : 0),
    [overlay]
  );
  const opacityPercent = useMemo(() => (overlay ? overlay.opacity : 0), [overlay]);

  if (!matchesSearch(query, ...SECTION_KEYWORDS)) return null;

  return (
    <div className="space-y-4">
      <header className="opt-page-header">
        <h1 className="opt-page-title">Subtitle Overlay</h1>
        <p className="opt-page-subtitle">Defaults for the live subtitle overlay shown on pages.</p>
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS}>
        <section className="surface-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-badge">
              <Captions size={14} />
            </span>
            <div>
              <h2 className="text-[13.5px] font-semibold text-primary m-0">
                Default subtitle overlay
              </h2>
              <p className="text-[11.5px] text-muted m-0">
                You can also adjust these directly from the overlay toolbar while translating.
              </p>
            </div>
          </div>

          {overlay && (
            <div className="space-y-3 pt-1">
              <ToggleRow
                label="Show original text"
                hint="Show the original speech alongside the translation."
                checked={overlay.showSource}
                onChange={(v) => void patchOverlay({ showSource: v })}
              />
              <ToggleRow
                label="Show speaker"
                hint="Label [Speaker N] when multiple speakers are detected."
                checked={overlay.showSpeaker}
                onChange={(v) => void patchOverlay({ showSpeaker: v })}
              />
              <ToggleRow
                label="Auto-scroll to new line"
                hint="Always show the newest content in the frame."
                checked={overlay.autoScroll}
                onChange={(v) => void patchOverlay({ autoScroll: v })}
              />

              <div className="ui-divider" />

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-primary">Display mode</span>
                <div className="grid grid-cols-2 gap-1.5 max-w-xs">
                  {(
                    [
                      ["transcript", "Continuous"],
                      ["block", "By sentence"]
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => void patchOverlay({ displayMode: mode })}
                      aria-pressed={overlay.displayMode === mode}
                      className={`choice-chip ${
                        overlay.displayMode === mode ? "choice-chip-active" : ""
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-primary">Subtitle size</span>
                  <span className="value-pill">{overlay.fontScale}%</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="180"
                  step="5"
                  value={overlay.fontScale}
                  aria-label="Subtitle size"
                  onChange={(e) => void patchOverlay({ fontScale: Number(e.target.value) })}
                  className="ui-range"
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${fontPercent}%, var(--slider-track) ${fontPercent}%)`
                  }}
                />
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-primary">Background opacity</span>
                  <span className="value-pill">{overlay.opacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={overlay.opacity}
                  aria-label="Background opacity"
                  onChange={(e) => void patchOverlay({ opacity: Number(e.target.value) })}
                  className="ui-range"
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${opacityPercent}%, var(--slider-track) ${opacityPercent}%)`
                  }}
                />
              </div>

              <button type="button" onClick={() => void resetOverlay()} className="btn-ghost-sm">
                <RotateCcw size={14} />
                <span>Reset overlay position</span>
              </button>
              {error && (
                <div role="alert" className="alert-banner alert-banner--danger">
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </Section>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <div className="flex flex-col">
        <span className="text-[13px] font-medium text-primary">{label}</span>
        <span className="text-[11.5px] leading-snug text-muted">{hint}</span>
      </div>
      <div className="mt-0.5">
        <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
      </div>
    </div>
  );
}
