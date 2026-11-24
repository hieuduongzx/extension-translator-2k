export interface CaptionFetchResult {
  ok: boolean;
  /** `pending`: the player hasn't requested captions yet (CC just turned on). */
  reason?: "no-player" | "no-captions" | "pending" | "fetch-failed";
  /** Human-readable diagnostics for the overlay / console. */
  detail?: string;
  videoId?: string;
  languageCode?: string;
  kind?: string;
  /** Raw `json3` timed-text body. */
  body?: string;
}

/**
 * Runs in the page MAIN world: get the current video's caption track in its
 * original language as `json3`.
 *
 * YouTube signs timed-text requests with a proof-of-origin token (`pot=`), so
 * a bare `baseUrl` from the player response usually returns an empty body.
 * Instead we watch the player's own caption requests (XHR/fetch hooks,
 * installed once per page) and keep their URLs and response bodies. If the
 * player hasn't fetched the source track yet, we switch its caption track to
 * it (YouTube's captions are hidden in AI mode anyway), which makes it fetch
 * one with a fresh token, and use that.
 *
 * (Resource timing alone is not enough: its buffer holds 250 entries and a
 * YouTube tab fills it within minutes, after which caption requests no longer
 * show up there.)
 *
 * Self-contained for `chrome.scripting.executeScript({ func })`: no imports,
 * no module-scope references.
 */
export async function fetchYoutubeCaptionTrackPage(): Promise<CaptionFetchResult> {
  interface CaptionTrack {
    baseUrl?: string;
    languageCode?: string;
    kind?: string;
  }
  interface PlayerTrack {
    languageCode?: string;
    kind?: string;
    translationLanguage?: unknown;
    [key: string]: unknown;
  }
  interface Player extends HTMLElement {
    getOption?: (module: string, option: string, extra?: unknown) => unknown;
    setOption?: (module: string, option: string, value: unknown) => void;
    loadModule?: (module: string) => void;
    unloadModule?: (module: string) => void;
    getVideoData?: () => { video_id?: string } | undefined;
    getPlayerResponse?: () => {
      videoDetails?: { videoId?: string };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
    };
  }
  interface Captured {
    url: string;
    body?: string;
  }
  interface Store {
    captured: Captured[];
  }

  const STORE_KEY = "__translator2kTimedText";
  const win = window as unknown as Record<string, Store | undefined>;
  const isTimedText = (url: string): boolean => url.includes("/api/timedtext");

  // ---- 1. Capture the player's timed-text traffic (installed once per page).
  let store = win[STORE_KEY];
  if (!store) {
    const created: Store = { captured: [] };
    store = created;
    win[STORE_KEY] = created;
    const remember = (url: string, body?: string): void => {
      const list = created.captured;
      const existing = list.find((c) => c.url === url);
      if (existing) {
        if (body) existing.body = body;
        return;
      }
      list.push({ url, body });
      if (list.length > 30) list.shift();
    };

    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    XHR.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
      try {
        const url = new URL(String(args[1]), location.href).toString();
        if (isTimedText(url)) {
          remember(url);
          this.addEventListener(
            "load",
            () => {
              try {
                let body = "";
                if (this.responseType === "" || this.responseType === "text") {
                  body = this.responseText;
                } else if (this.responseType === "json") {
                  body = JSON.stringify(this.response);
                } else if (this.responseType === "arraybuffer") {
                  body = new TextDecoder().decode(this.response as ArrayBuffer);
                }
                if (body) remember(url, body);
              } catch {
                /* ignore */
              }
            },
            { once: true }
          );
        }
      } catch {
        /* ignore */
      }
      (originalOpen as (...a: unknown[]) => void).apply(this, args);
    } as typeof XHR.open;

    const originalFetch = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      const promise = originalFetch.apply(this, args);
      try {
        const input = args[0];
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href).toString();
        if (isTimedText(url)) {
          remember(url);
          void promise
            .then((res) => res.clone().text())
            .then((body) => {
              if (body) remember(url, body);
            })
            .catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
      return promise;
    } as typeof fetch;

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (isTimedText(entry.name)) remember(entry.name);
        }
      }).observe({ type: "resource", buffered: true });
    } catch {
      /* unsupported */
    }
  }
  const captured = store.captured;

  // ---- 2. Player + caption tracks.
  const safe = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  const players = Array.from(
    document.querySelectorAll<Player>("#shorts-player, #movie_player, .html5-video-player")
  ).filter((p) => typeof p.getPlayerResponse === "function");
  const urlVideoId = (() => {
    try {
      const u = new URL(location.href);
      return (
        u.searchParams.get("v") ||
        u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1] ||
        ""
      );
    } catch {
      return "";
    }
  })();
  const isVisiblePlayer = (p: Player): boolean =>
    typeof p.offsetWidth === "number" && p.offsetWidth > 0 && p.offsetHeight > 0;
  const matchesUrlVideo = (p: Player): boolean => {
    if (!urlVideoId) return false;
    const id =
      safe(() => p.getVideoData?.()?.video_id) ||
      safe(() => p.getPlayerResponse?.()?.videoDetails?.videoId);
    return id === urlVideoId;
  };
  const player =
    players.find((p) => isVisiblePlayer(p) && matchesUrlVideo(p)) ??
    players.find(matchesUrlVideo) ??
    players.find(isVisiblePlayer) ??
    players[0];
  if (!player) return { ok: false, reason: "no-player", detail: "player API not found" };

  const response = safe(() => player.getPlayerResponse?.());
  const videoId =
    safe(() => player.getVideoData?.()?.video_id) || response?.videoDetails?.videoId || "";
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!videoId || tracks.length === 0) {
    return { ok: false, reason: "no-captions", videoId, detail: "no caption tracks" };
  }

  // Source: the human track in the spoken language, else the track the viewer
  // has on, else auto-generated, else any.
  const current = safe(() => player.getOption?.("captions", "track")) as PlayerTrack | undefined;
  const asrTrack = tracks.find((t) => t.kind === "asr");
  const spoken = asrTrack?.languageCode;
  const source =
    (spoken ? tracks.find((t) => t.kind !== "asr" && t.languageCode === spoken) : undefined) ??
    (current?.languageCode
      ? tracks.find(
          (t) =>
            t.languageCode === current.languageCode &&
            (t.kind === "asr") === (current.kind === "asr")
        )
      : undefined) ??
    asrTrack ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0];
  if (!source?.languageCode) {
    return { ok: false, reason: "no-captions", videoId, detail: "no usable track" };
  }
  const sourceLang = source.languageCode;
  const sourceAsr = source.kind === "asr";

  const params = (url: string): URLSearchParams | null => {
    try {
      return new URL(url, location.href).searchParams;
    } catch {
      return null;
    }
  };
  const forVideo = (): Captured[] =>
    [
      ...captured,
      ...performance
        .getEntriesByType("resource")
        .filter((e) => isTimedText(e.name))
        .map((e) => ({ url: e.name }))
    ].filter((c) => params(c.url)?.get("v") === videoId);
  const isSourceRequest = (c: Captured): boolean => {
    const p = params(c.url);
    return (
      !!p &&
      p.get("lang") === sourceLang &&
      !p.get("tlang") &&
      (p.get("kind") === "asr") === sourceAsr
    );
  };
  const usable = (body: string | undefined): body is string => !!body && body.includes('"events"');
  const done = (body: string): CaptionFetchResult => ({
    ok: true,
    videoId,
    languageCode: sourceLang,
    kind: source.kind ?? "",
    body
  });
  const latestSourceBody = (list: Captured[]): string | undefined =>
    [...list].reverse().find((c) => isSourceRequest(c) && usable(c.body))?.body;

  const withJson3 = (url: string): string | null => {
    try {
      const u = new URL(url, location.href);
      u.searchParams.set("fmt", "json3");
      return u.toString();
    } catch {
      return null;
    }
  };
  const triedUrls = new Set<string>();
  const failures: string[] = [];
  const tryFetchUrls = async (urls: string[], cap = 5): Promise<string | null> => {
    let attempts = 0;
    for (const url of urls) {
      if (triedUrls.has(url)) continue;
      if (attempts >= cap) break;
      triedUrls.add(url);
      attempts++;
      try {
        const init: RequestInit = { credentials: "include" };
        if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
          init.signal = AbortSignal.timeout(8000);
        }
        const res = await fetch(url, init);
        const body = await res.text();
        if (res.ok && usable(body)) return body;
        failures.push(`HTTP ${res.status}, ${body.length} bytes`);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    return null;
  };

  // ---- 3. The player already downloaded the source track: use its body.
  let mine = forVideo();
  const ready = latestSourceBody(mine);
  if (ready) return done(ready);

  // If a bodyless source URL already exists (e.g. from Resource Timing before
  // our hooks were installed), try re-fetching it first. If its token expired
  // or returned 0 bytes, fall through to Step 4 so the player mints a fresh one.
  const preExistingSourceUrls = [...mine]
    .reverse()
    .filter(isSourceRequest)
    .map((c) => withJson3(c.url))
    .filter((u): u is string => Boolean(u));
  if (preExistingSourceUrls.length > 0) {
    const body = await tryFetchUrls(preExistingSourceUrls, 3);
    if (body) return done(body);
  }

  // ---- 4. Make the player fetch the source track (with a fresh token).
  {
    const knownSourceUrls = new Set(mine.filter(isSourceRequest).map((c) => c.url));
    const hasFreshSourceRequest = (list: Captured[]): boolean =>
      list.some((c) => isSourceRequest(c) && !knownSourceUrls.has(c.url));

    const list = safe(() => player.getOption?.("captions", "tracklist", { includeAsr: true }));
    const playerTracks = (Array.isArray(list) ? list : []) as PlayerTrack[];
    const wanted: PlayerTrack = playerTracks.find(
      (t) =>
        !t.translationLanguage && t.languageCode === sourceLang && (t.kind === "asr") === sourceAsr
    ) ?? { languageCode: sourceLang, kind: source.kind ?? "" };
    const selectSource = (): void => {
      safe(() =>
        player.setOption?.("captions", "track", { ...wanted, translationLanguage: undefined })
      );
    };
    if (!current?.languageCode) safe(() => player.loadModule?.("captions"));
    selectSource();
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      mine = forVideo();
      const body = latestSourceBody(mine);
      if (body) return done(body);
      if (i >= 10 && hasFreshSourceRequest(mine)) break;
      // Still nothing: the player may be serving that track from memory.
      // Reloading the captions module makes it download the track again.
      if (i === 6 && !hasFreshSourceRequest(mine)) {
        safe(() => player.unloadModule?.("captions"));
        safe(() => player.loadModule?.("captions"));
        selectSource();
      }
    }
  }

  // ---- 5. Re-fetch: a captured source URL, the latest captured URL rewritten
  //         to the source language, then the bare baseUrl.
  const candidates: string[] = [];
  const add = (url: string | null): void => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };
  for (const c of [...mine].reverse()) if (isSourceRequest(c)) add(withJson3(c.url));
  const latest = mine[mine.length - 1];
  if (latest) {
    try {
      const u = new URL(latest.url, location.href);
      u.searchParams.delete("tlang");
      u.searchParams.set("lang", sourceLang);
      u.searchParams.set("fmt", "json3");
      if (sourceAsr) u.searchParams.set("kind", "asr");
      else u.searchParams.delete("kind");
      add(u.toString());
    } catch {
      /* ignore */
    }
  }
  if (source.baseUrl) add(withJson3(source.baseUrl));

  const fetchedBody = await tryFetchUrls(candidates, 5);
  if (fetchedBody) return done(fetchedBody);

  return {
    ok: false,
    reason: mine.length > 0 ? "fetch-failed" : "pending",
    videoId,
    detail:
      `source ${sourceLang}${sourceAsr ? " (auto)" : ""}; ` +
      `${mine.length} player caption request(s) seen; ` +
      (failures.length > 0 ? `tried ${failures.join(" / ")}` : "nothing to try yet")
  };
}
