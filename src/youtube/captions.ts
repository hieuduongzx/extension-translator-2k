/**
 * "YouTube Subtitle": force YouTube's own captions into the user's language.
 *
 * YouTube usually opens captions in English (or the video's original
 * language). When the feature is on, every caption track the player shows is
 * switched to the chosen language: a native track in that language when the
 * video has one, otherwise YouTube's built-in auto-translate.
 *
 * The player API (`#movie_player.getOption/setOption`) lives in the page's
 * MAIN world, so {@link youtubeCaptionPage} is injected with
 * `chrome.scripting.executeScript({ world: "MAIN", func, args })`. Like the
 * stream overlay renderer it must stay self-contained: no imports, no
 * module-scope references, only its argument + DOM/window APIs.
 */

export interface YoutubeCaptionConfig {
  enabled: boolean;
  /** YouTube caption language code (see {@link toYouTubeLangCode}). */
  lang: string;
  /** Turn captions on automatically for videos that have them. */
  autoOn: boolean;
}

/** Hosts whose pages embed the YouTube HTML5 player. */
export function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  );
}

/** Map the extension's BCP-47 language codes to the codes YouTube captions use. */
export function toYouTubeLangCode(code: string): string {
  switch (code) {
    case "zh-CN":
      return "zh-Hans";
    case "zh-TW":
      return "zh-Hant";
    case "he":
      return "iw";
    default:
      return code;
  }
}

/**
 * Runs in the page MAIN world. The first call installs a small watcher on the
 * page; later calls (settings changed) only update its config.
 */
export function youtubeCaptionPage(config: YoutubeCaptionConfig): void {
  interface Lang {
    languageCode?: string;
    languageName?: string;
  }
  interface Track extends Lang {
    kind?: string;
    is_translateable?: boolean;
    translationLanguage?: Lang | null;
    [key: string]: unknown;
  }
  interface Player extends HTMLElement {
    getOption?: (module: string, option: string, extra?: unknown) => unknown;
    setOption?: (module: string, option: string, value: unknown) => void;
    loadModule?: (module: string) => void;
    getVideoData?: () => { video_id?: string } | undefined;
    getPlayerResponse?: () => {
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } };
    };
  }
  interface Controller {
    update: (next: YoutubeCaptionConfig) => void;
  }

  const KEY = "__translator2kYtCaptions";
  const store = window as unknown as Record<string, Controller | undefined>;
  const existing = store[KEY];
  if (existing) {
    existing.update(config);
    return;
  }
  if (!config.enabled) return;

  const POLL_MS = 800;
  /** Give up on a video after this many switches so we never fight the player forever. */
  const MAX_SWITCHES = 6;

  let cfg = config;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** Per-video bookkeeping, reset whenever the player loads another video. */
  const perPlayer = new WeakMap<
    Player,
    { videoId: string; switches: number; autoOnTried: boolean }
  >();

  const lower = (s: unknown): string => (typeof s === "string" ? s.toLowerCase() : "");
  const base = (s: string): string => s.split(/[-_]/)[0];

  /** `vi` matches `vi` / `vi-VN`; a regional target (`zh-hans`) needs an exact match. */
  function matchesLang(code: unknown, target: string): boolean {
    const c = lower(code);
    const t = lower(target);
    if (!c || !t) return false;
    if (c === t) return true;
    return !t.includes("-") && base(c) === t;
  }

  function call<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch {
      return undefined;
    }
  }

  function players(): Player[] {
    return Array.from(document.querySelectorAll<Player>(".html5-video-player")).filter(
      (p) => typeof p.getOption === "function" && typeof p.setOption === "function"
    );
  }

  function currentTrack(p: Player): Track | null {
    const t = call(() => p.getOption!("captions", "track")) as Track | undefined;
    return t && typeof t === "object" && t.languageCode ? t : null;
  }

  function isTarget(track: Track, target: string): boolean {
    const translated = track.translationLanguage?.languageCode;
    return matchesLang(translated || track.languageCode, target);
  }

  function hasCaptions(p: Player): boolean {
    const resp = call(() => p.getPlayerResponse?.());
    const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks)) return tracks.length > 0;
    const button = p.querySelector<HTMLElement>(".ytp-subtitles-button");
    return !!button && button.style.display !== "none" && !button.hasAttribute("disabled");
  }

  function turnCaptionsOn(p: Player): void {
    const button = p.querySelector<HTMLElement>(".ytp-subtitles-button");
    if (button && button.getAttribute("aria-pressed") === "false") {
      button.click();
      return;
    }
    call(() => p.loadModule?.("captions"));
  }

  function switchToTarget(p: Player, current: Track, target: string): void {
    const raw = call(() => p.getOption!("captions", "tracklist", { includeAsr: true }));
    const list = (Array.isArray(raw) ? raw : []) as Track[];

    // 1. A real track already in the target language: prefer human captions over ASR.
    const native = list.filter(
      (t) => !t.translationLanguage && matchesLang(t.languageCode, target)
    );
    const nativePick = native.find((t) => t.kind !== "asr") ?? native[0];
    if (nativePick) {
      call(() => p.setOption!("captions", "track", nativePick));
      return;
    }

    // 2. Auto-translate. Translate from the track YouTube picked (normally the
    //    video's own language); fall back to any translatable track.
    const plain = (t: Track): Track => ({ ...t, translationLanguage: undefined });
    const translatable = (t: Track): boolean => t.is_translateable !== false;
    const candidates = [plain(current), ...list.filter((t) => t.kind !== "asr"), ...list];
    const source = candidates.find((t) => t.languageCode && translatable(t));
    if (!source) return;

    const langs = call(() => p.getOption!("captions", "translationLanguages")) as
      Lang[] | undefined;
    const lang = (Array.isArray(langs) ? langs : []).find((l) =>
      matchesLang(l.languageCode, target)
    );
    call(() =>
      p.setOption!("captions", "track", {
        ...source,
        translationLanguage: {
          languageCode: lang?.languageCode ?? target,
          languageName: lang?.languageName ?? target
        }
      })
    );
  }

  function tick(): void {
    if (!cfg.enabled) return;
    for (const p of players()) {
      // Never fight AI subtitles (which switches to the untranslated source
      // track to download captions) or waste switches on pre-roll ads.
      if (p.classList?.contains("t2k-ai-subs") || p.classList?.contains("ad-showing")) continue;
      const videoId = call(() => p.getVideoData?.()?.video_id) || location.href;
      let state = perPlayer.get(p);
      if (!state || state.videoId !== videoId) {
        state = { videoId, switches: 0, autoOnTried: false };
        perPlayer.set(p, state);
      }

      const track = currentTrack(p);
      if (!track) {
        // Captions are off. Respect that unless auto-on is enabled, and only
        // try once per video so the user can still switch them off.
        if (cfg.autoOn && !state.autoOnTried && hasCaptions(p)) {
          state.autoOnTried = true;
          turnCaptionsOn(p);
        }
        continue;
      }
      if (isTarget(track, cfg.lang) || state.switches >= MAX_SWITCHES) continue;
      state.switches += 1;
      switchToTarget(p, track, cfg.lang);
    }
  }

  function onNavigate(): void {
    tick();
  }

  function start(): void {
    if (timer !== undefined) return;
    timer = setInterval(tick, POLL_MS);
    document.addEventListener("yt-navigate-finish", onNavigate);
    tick();
  }

  function stop(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    document.removeEventListener("yt-navigate-finish", onNavigate);
  }

  store[KEY] = {
    update(next) {
      const langChanged = next.lang !== cfg.lang;
      cfg = next;
      if (!cfg.enabled) {
        stop();
        return;
      }
      if (langChanged) {
        for (const p of players()) perPlayer.delete(p);
      }
      start();
      tick();
    }
  };
  start();
}
