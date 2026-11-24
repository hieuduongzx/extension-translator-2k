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

/**
 * Defaults for the subtitle overlay shown on pages while the real-time stream
 * translator is active. Every control round-trips through the background worker
 * so a live session picks up changes immediately.
 */
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

  // Runtime state is authoritative so forced setting combinations stay in sync.
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
    <div className="space-y-4 pb-4">
      <header className="pb-1">
        <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">Overlay</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Defaults for the subtitle overlay shown on the page.
        </p>
        <div className="accent-line mt-3" />
      </header>

      <Section query={query} keywords={SECTION_KEYWORDS}>
        <section className="surface-card surface-card-hover p-4 space-y-3 transition-all duration-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Captions className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Default subtitle overlay
            </h2>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500">
            These settings apply to the subtitle overlay shown on the page. You can also adjust them
            quickly on the overlay while translating.
          </p>

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

              <div className="h-px bg-zinc-200/60" />

              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-medium text-zinc-800">Display mode</span>
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
                      className={`choice-chip py-1.5 ${
                        overlay.displayMode === mode ? "choice-chip-active" : ""
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-zinc-800">Subtitle size</span>
                  <span className="text-[11px] text-brand-700 font-bold tabular-nums bg-brand-50 px-2 py-0.5 rounded-md">
                    {overlay.fontScale}%
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="180"
                  step="5"
                  value={overlay.fontScale}
                  aria-label="Subtitle size"
                  onChange={(e) => void patchOverlay({ fontScale: Number(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                           [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500
                           [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                  style={{
                    background: `linear-gradient(to right, var(--brand-500) ${fontPercent}%, var(--slider-track) ${fontPercent}%)`
                  }}
                />
              </div>

              <div className="flex flex-col gap-2 max-w-md">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-zinc-800">Background opacity</span>
                  <span className="text-[11px] text-brand-700 font-bold tabular-nums bg-brand-50 px-2 py-0.5 rounded-md">
                    {overlay.opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={overlay.opacity}
                  aria-label="Background opacity"
                  onChange={(e) => void patchOverlay({ opacity: Number(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                           [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-500
                           [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                  style={{
                    background: `linear-gradient(to right, var(--brand-500) ${opacityPercent}%, var(--slider-track) ${opacityPercent}%)`
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => void resetOverlay()}
                className="btn-ghost hover-lift"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset overlay position
              </button>
              {error && (
                <p role="alert" className="text-[11px] text-red-600 font-medium">
                  {error}
                </p>
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
      <span className="flex flex-col">
        <span className="text-[12.5px] font-medium text-zinc-800">{label}</span>
        <span className="text-[11px] leading-snug text-zinc-500">{hint}</span>
      </span>
      <div className="mt-0.5">
        <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
      </div>
    </div>
  );
}
