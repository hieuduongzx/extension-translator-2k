import { LANGUAGES } from "../languages";
import type { YoutubeAiTranslateResponse } from "../types";
import { toYouTubeLangCode } from "./captions";
import type { CaptionFetchResult } from "./captionFetch";
import {
  baseLang,
  BUFFER_LINES,
  bufferStatus,
  DEFAULT_SCHEDULE,
  findSegmentAt,
  parseJson3,
  pickChunks,
  planChunks,
  stallAhead,
  type BufferStatus,
  type Chunk,
  type ChunkState,
  type Segment
} from "./subtitleCues";

/**
 * YouTube AI subtitles, page side (content-script isolated world).
 *
 * YouTube's own captions stay the default. The extension adds a button to the
 * player's control bar; its menu switches the current tab between "YouTube
 * subtitles" and "AI subtitles". With AI subtitles on (and CC on) it:
 *  1. asks the background for the video's original caption track,
 *  2. re-segments it into readable lines and translates them with the AI
 *     service in small chunks — the part being watched first, then ahead of
 *     the playhead (a seek re-prioritises immediately),
 *  3. pauses playback and asks the viewer to wait until the next
 *     {@link BUFFER_LINES} lines are translated, so fast dialogue never
 *     outruns the translation; if it does later on, it pauses again, like
 *     video buffering. Pressing play while waiting skips the wait,
 *  4. hides YouTube's caption renderer and draws the translated line in an
 *     overlay inside the player (also in fullscreen).
 *
 * The choice lasts for the tab (it survives moving to the next video) and
 * resets to YouTube subtitles on reload.
 */

export interface AiSubtitleOptions {
  /** Target language (extension language code, e.g. `vi`). */
  lang: string;
  /** Also show the original line under the translation. */
  bilingual: boolean;
}

type LoadState = "idle" | "fetching" | "waiting" | "ready" | "unavailable";

const TICK_MS = 400;
const CONTEXT_LINES = 6;
const CUE_RETRY_MS = 1500;
const MAX_CUE_ATTEMPTS = 6;
const NOTE_VISIBLE_MS = 10000;
/** Pause again when an untranslated line is due within this long. */
const STALL_LEAD_MS = 1000;

const HIDE_NATIVE_CLASS = "t2k-ai-subs";
const PAGE_STYLE_ID = "t2k-ai-subs-style";
const BUTTON_CLASS = "t2k-yt-button";
const SVG_NS = "http://www.w3.org/2000/svg";

const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.subs {
  position: absolute; left: 0; right: 0; bottom: var(--t2k-bottom, 60px);
  display: flex; flex-direction: column; align-items: center; gap: 0.25em;
  padding: 0 4%; pointer-events: none;
  font-family: "YouTube Noto", Roboto, "Segoe UI", Arial, sans-serif;
  font-size: var(--t2k-fs, 20px);
}
.line {
  display: inline-block; max-width: 92%;
  padding: 0.12em 0.5em; border-radius: 0.2em;
  background: rgba(8, 8, 8, 0.75); color: #fff;
  line-height: 1.35; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere;
}
.main { font-weight: 500; }
.main.pending { color: #d4d4d4; font-weight: 400; }
.main.pending::after { content: " · AI…"; font-size: 0.65em; color: #93c5fd; }
.orig { font-size: 0.72em; color: #e4e4e7; }
.note {
  font-size: max(11px, 0.6em); color: #e4e4e7; background: rgba(8, 8, 8, 0.6);
  padding: 0.2em 0.6em; border-radius: 0.3em;
}
.wait {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  max-width: 80%; padding: 14px 20px; border-radius: 12px;
  background: rgba(15, 15, 15, 0.88); color: #fff; text-align: center;
  font: 500 14px/1.4 Roboto, "Segoe UI", Arial, sans-serif; pointer-events: none;
}
.wait-row { display: flex; align-items: center; gap: 10px; }
.spinner {
  width: 18px; height: 18px; border-radius: 50%; flex: none;
  border: 2px solid rgba(255, 255, 255, 0.25); border-top-color: #3ea6ff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.bar { width: 200px; max-width: 100%; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.2); overflow: hidden; }
.bar > div { height: 100%; width: 0; background: #3ea6ff; transition: width 0.25s; }
.wait-sub { font-size: 12px; font-weight: 400; color: #c4c4c4; }
.menu {
  position: absolute; right: 12px; bottom: var(--t2k-menu-bottom, 60px);
  min-width: 250px; max-width: calc(100% - 24px); padding: 8px 0; border-radius: 12px;
  background: rgba(28, 28, 28, 0.94); color: #eee; pointer-events: auto;
  font: 400 13px/1.4 Roboto, "Segoe UI", Arial, sans-serif;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}
.menu-title { padding: 6px 16px 8px; font-weight: 500; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.12); margin-bottom: 4px; }
.item {
  all: unset; display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 9px 16px; cursor: pointer; color: #eee; box-sizing: border-box;
}
.item:hover, .item:focus-visible { background: rgba(255, 255, 255, 0.1); }
.mark {
  width: 16px; height: 16px; flex: none; border-radius: 50%;
  border: 2px solid #aaa; display: flex; align-items: center; justify-content: center;
}
.mark.box { border-radius: 3px; }
.item[aria-checked="true"] .mark { border-color: #3ea6ff; }
.item[aria-checked="true"] .mark::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #3ea6ff; }
.item[aria-checked="true"] .mark.box::after { border-radius: 1px; }
.item small { color: #aaa; margin-left: 4px; }
.status { padding: 8px 16px 4px; font-size: 12px; color: #aaa; border-top: 1px solid rgba(255,255,255,0.12); margin-top: 4px; }
[hidden] { display: none !important; }
`;

const PAGE_CSS = `
.${HIDE_NATIVE_CLASS} .ytp-caption-window-container,
.${HIDE_NATIVE_CLASS} .caption-window { display: none !important; }
.${BUTTON_CLASS} { position: relative; display: inline-flex !important; align-items: center; justify-content: center; vertical-align: top; }
.${BUTTON_CLASS} svg { width: 100%; height: 100%; pointer-events: none; }
.${BUTTON_CLASS}.t2k-on::after {
  content: ""; position: absolute; left: 28%; right: 28%; bottom: 20%;
  height: 3px; border-radius: 2px; background: #3ea6ff;
}
`;

interface Dom {
  host: HTMLDivElement;
  subs: HTMLDivElement;
  main: HTMLDivElement;
  orig: HTMLDivElement;
  note: HTMLDivElement;
  wait: HTMLDivElement;
  waitText: HTMLSpanElement;
  waitBar: HTMLDivElement;
  waitSub: HTMLDivElement;
  menu: HTMLDivElement;
  itemYoutube: HTMLButtonElement;
  itemAi: HTMLButtonElement;
  aiLangLabel: HTMLElement;
  itemBilingual: HTMLButtonElement;
  status: HTMLDivElement;
}

export class YoutubeAiSubtitles {
  private opts: AiSubtitleOptions;
  private readonly onBilingualChange: (value: boolean) => void;
  private timer: ReturnType<typeof setInterval> | undefined;
  private raf = 0;
  private generation = 0;

  /** "AI subtitles" chosen in the player menu (lasts for this tab). */
  private aiActive = false;
  private ccTurnedOnByUs = false;
  private menuOpen = false;

  private videoKey = "";
  private load: LoadState = "idle";
  private cueAttempts = 0;
  private nextCueTry = 0;
  private unavailableAt = 0;
  private note = "";

  private source = "";
  private needsTranslation = true;
  private segments: Segment[] = [];
  private chunks: Chunk[] = [];
  private chunkOf: number[] = [];
  private states: ChunkState[] = [];
  private translations: (string | null)[] = [];
  private lastError = "";

  /** Waiting for the translation buffer to fill. */
  private waiting = false;
  /** The next wait must fill a whole buffer (start, new video, language change). */
  private requireBuffer = true;
  private pausedByUs = false;
  /** The viewer pressed play during a wait: don't pause again until it ends. */
  private userOverride = false;
  private buffer: BufferStatus = { done: 0, total: 0, ready: false };

  private dom: Dom | null = null;
  private button: HTMLButtonElement | null = null;
  private player: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private shown = "";

  constructor(opts: AiSubtitleOptions, onBilingualChange: (value: boolean) => void) {
    this.opts = opts;
    this.onBilingualChange = onBilingualChange;
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    document.addEventListener("click", this.onDocumentClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    this.tick();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener("click", this.onDocumentClick, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    this.setAiActive(false);
    this.teardownDom();
    this.videoKey = "";
  }

  update(opts: AiSubtitleOptions): void {
    const langChanged = opts.lang !== this.opts.lang;
    this.opts = opts;
    if (langChanged && this.load === "ready") {
      // Keep the downloaded captions, translate them again.
      this.generation++;
      this.prepareTranslations();
      this.requireBuffer = true;
    }
    this.shown = "";
    this.render();
    this.renderMenu();
  }

  // ---------------------------------------------------------------- state

  private setAiActive(active: boolean): void {
    if (active === this.aiActive) return;
    this.aiActive = active;
    const player = this.player;
    const ccButton = player?.querySelector<HTMLElement>(".ytp-subtitles-button");
    if (active) {
      // Allow the user to retry after an earlier caption-load failure by
      // toggling AI subtitles off and back on.
      if (this.load === "unavailable") {
        this.load = "idle";
        this.cueAttempts = 0;
        this.nextCueTry = 0;
        this.note = "";
      }
      this.requireBuffer = true;
      // The player only downloads captions (with its signed URL) once CC is on.
      if (ccButton && ccButton.getAttribute("aria-pressed") === "false") {
        ccButton.click();
        this.ccTurnedOnByUs = true;
      }
    } else {
      this.endWait(true);
      player?.classList.remove(HIDE_NATIVE_CLASS);
      if (this.ccTurnedOnByUs && ccButton?.getAttribute("aria-pressed") === "true") {
        ccButton.click();
      }
      this.ccTurnedOnByUs = false;
    }
    this.shown = "";
    if (this.timer !== undefined) this.tick();
  }

  private resetVideo(): void {
    this.generation++;
    this.load = "idle";
    this.cueAttempts = 0;
    this.nextCueTry = 0;
    this.note = "";
    this.source = "";
    this.segments = [];
    this.chunks = [];
    this.chunkOf = [];
    this.states = [];
    this.translations = [];
    this.lastError = "";
    this.shown = "";
    // A new video starts with a fresh buffer; never carry a pause over.
    this.waiting = false;
    this.pausedByUs = false;
    this.userOverride = false;
    this.requireBuffer = true;
  }

  private prepareTranslations(): void {
    const src = this.source.toLowerCase();
    const target = toYouTubeLangCode(this.opts.lang).toLowerCase();
    this.needsTranslation = !(
      src === target ||
      (!target.includes("-") && baseLang(src) === target)
    );
    this.chunks = planChunks(this.segments);
    this.chunkOf = [];
    this.chunks.forEach((chunk, c) => {
      for (let i = chunk.from; i < chunk.to; i++) this.chunkOf[i] = c;
    });
    this.states = this.chunks.map(() => ({ status: "idle", attempts: 0, retryAt: 0 }));
    this.translations = this.needsTranslation
      ? this.segments.map(() => null)
      : this.segments.map((s) => s.text);
    this.lastError = "";
  }

  /** Translated, or given up on (then the original is shown). */
  private isSettled = (index: number): boolean => {
    if (this.translations[index]) return true;
    const state = this.states[this.chunkOf[index]];
    return !!state && state.status === "failed" && state.attempts >= DEFAULT_SCHEDULE.maxAttempts;
  };

  // ---------------------------------------------------------------- loop

  private tick(): void {
    const player = pickActivePlayer();
    const video = player?.querySelector("video") ?? null;
    if (player !== this.player) {
      this.teardownDom();
      this.player = player;
    }
    this.video = video;
    if (!player || !video) return;

    ensurePageStyle();
    this.ensureDom(player);
    this.ensureButton(player);
    this.layout(player);

    const key = currentVideoKey();
    if (key !== this.videoKey) {
      this.resetVideo();
      this.videoKey = key;
    }

    const ad = player.classList.contains("ad-showing");
    const active = this.aiActive && !!key && captionsOn(player) && !ad;
    player.classList.toggle(
      HIDE_NATIVE_CLASS,
      this.aiActive && !!key && !ad && this.load !== "unavailable"
    );

    if (!active) {
      // CC switched off (or no video): stop holding playback. During an ad,
      // leave the player alone entirely.
      if (!ad) this.endWait(true);
      this.setLayerVisible(false);
      this.renderMenu();
      return;
    }

    if (this.load === "idle" || (this.load === "waiting" && Date.now() >= this.nextCueTry)) {
      void this.loadCues(key);
    }
    if (this.load === "ready" && this.needsTranslation) {
      for (const index of pickChunks(
        this.chunks,
        this.states,
        video.currentTime * 1000,
        Date.now(),
        DEFAULT_SCHEDULE
      )) {
        void this.translateChunk(index);
      }
    }
    this.updateBuffering(video);

    this.setLayerVisible(true);
    this.render();
    this.renderMenu();
    if (!video.paused && !this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    if (!this.dom || this.dom.subs.hidden) {
      this.raf = 0;
      return;
    }
    this.render();
    this.raf =
      this.video && !this.video.paused && this.timer && !this.dom.subs.hidden
        ? requestAnimationFrame(this.frame)
        : 0;
  };

  /** Pause until the next lines are translated; resume when they are. */
  private updateBuffering(video: HTMLVideoElement): void {
    if (this.load === "unavailable") {
      this.endWait(true);
      return;
    }
    const time = video.currentTime * 1000;
    let needWait: boolean;
    if (this.load !== "ready") {
      needWait = true;
      this.buffer = { done: 0, total: BUFFER_LINES, ready: false };
    } else {
      this.buffer = bufferStatus(this.segments, this.isSettled, time, BUFFER_LINES);
      if (this.waiting || this.requireBuffer) {
        needWait = !this.buffer.ready;
      } else {
        needWait = stallAhead(this.segments, this.isSettled, time, STALL_LEAD_MS);
      }
      if (this.buffer.ready) this.requireBuffer = false;
    }

    if (!needWait) {
      this.endWait(true);
      return;
    }
    if (!this.waiting) {
      this.waiting = true;
      this.userOverride = false;
    }
    if (this.userOverride) return;
    if (!video.paused) {
      if (this.pausedByUs) {
        // We paused it and the viewer pressed play: let them watch.
        this.userOverride = true;
        this.pausedByUs = false;
      } else {
        video.pause();
        this.pausedByUs = true;
      }
    }
  }

  private endWait(resume: boolean): void {
    const wasPausedByUs = this.pausedByUs;
    this.waiting = false;
    this.pausedByUs = false;
    this.userOverride = false;
    if (resume && wasPausedByUs && this.video?.paused) {
      void this.video.play().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- data

  private async loadCues(key: string): Promise<void> {
    const generation = this.generation;
    this.load = "fetching";
    let res: CaptionFetchResult | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      res = (await Promise.race([
        chrome.runtime.sendMessage({ type: "youtube-ai-cues" }) as Promise<
          CaptionFetchResult | undefined
        >,
        new Promise<CaptionFetchResult>((resolve) => {
          timeoutId = setTimeout(
            () =>
              resolve({ ok: false, reason: "fetch-failed", detail: "caption request timed out" }),
            20_000
          );
        })
      ])) as CaptionFetchResult | undefined;
    } catch {
      res = undefined;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
    if (generation !== this.generation) return;

    // The player may still hold the previous video right after navigation.
    const sameVideo = res?.videoId === key;
    if (res?.ok && sameVideo && res.body) {
      const segments = parseJson3(res.body, res.kind === "asr");
      if (segments.length > 0) {
        this.segments = segments;
        this.source = res.languageCode ?? "";
        this.load = "ready";
        this.prepareTranslations();
        return;
      }
    }
    if (sameVideo && res?.reason === "no-captions") {
      this.markUnavailable("This video has no captions to translate.");
      return;
    }
    const detail = res?.detail ?? (res ? res.reason : "no response from the extension");
    console.warn("[Translator2k] AI subtitles: captions not loaded yet", detail);
    this.cueAttempts++;
    if (this.cueAttempts >= MAX_CUE_ATTEMPTS) {
      this.markUnavailable(
        `Couldn't load captions for AI subtitles (${detail}). Showing YouTube's captions.`
      );
      return;
    }
    this.load = "waiting";
    this.nextCueTry = Date.now() + CUE_RETRY_MS;
  }

  private markUnavailable(note: string): void {
    this.load = "unavailable";
    this.note = note;
    this.unavailableAt = Date.now();
  }

  private async translateChunk(index: number): Promise<void> {
    const generation = this.generation;
    const chunk = this.chunks[index];
    const state = this.states[index];
    state.status = "pending";
    state.attempts++;
    const lines = this.segments.slice(chunk.from, chunk.to).map((s) => s.text);
    const context = this.segments
      .slice(Math.max(0, chunk.from - CONTEXT_LINES), chunk.from)
      .map((s) => s.text);

    let res: YoutubeAiTranslateResponse | undefined;
    try {
      res = (await chrome.runtime.sendMessage({
        type: "youtube-ai-translate",
        lines,
        context,
        source: this.source,
        target: this.opts.lang
      })) as YoutubeAiTranslateResponse | undefined;
    } catch (err) {
      res = { translations: [], error: err instanceof Error ? err.message : String(err) };
    }
    if (generation !== this.generation) return;

    if (!res || res.error || !Array.isArray(res.translations) || res.translations.length === 0) {
      state.status = "failed";
      state.retryAt = Date.now() + 4000 * state.attempts;
      this.lastError = res?.error ?? "AI translation failed";
      return;
    }
    let anyFailed = false;
    const failed = res.failed;
    res.translations.forEach((text, i) => {
      if (text && !failed?.[i]) this.translations[chunk.from + i] = text;
      else anyFailed = true;
    });
    state.status = anyFailed ? "failed" : "done";
    state.retryAt = Date.now() + 3000;
    if (anyFailed) {
      this.lastError = res.error || "Some subtitle lines could not be translated.";
    } else {
      this.lastError = "";
    }
    this.render();
  }

  // ---------------------------------------------------------------- DOM

  private ensureDom(player: HTMLElement): void {
    if (this.dom?.host.isConnected && this.dom.host.parentElement === player) return;
    this.dom?.host.remove();

    const host = document.createElement("div");
    host.setAttribute("translate", "no");
    host.dataset.t2kAiSubtitles = "true";
    host.style.cssText = "position:absolute;inset:0;z-index:60;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;

    const subs = div("subs");
    const main = div("line main");
    const orig = div("line orig");
    const note = div("note");
    subs.append(main, orig, note);

    const wait = div("wait");
    const waitRow = div("wait-row");
    const waitText = document.createElement("span");
    waitRow.append(div("spinner"), waitText);
    const bar = div("bar");
    const waitBar = div("");
    bar.append(waitBar);
    const waitSub = div("wait-sub");
    wait.append(waitRow, bar, waitSub);

    const menu = div("menu");
    menu.setAttribute("role", "menu");
    const title = div("menu-title");
    title.textContent = "Translator2k subtitles";
    const itemYoutube = menuItem("radio", "YouTube subtitles");
    const itemAi = menuItem("radio", "AI subtitles");
    const aiLangLabel = document.createElement("small");
    itemAi.append(aiLangLabel);
    const itemBilingual = menuItem("checkbox", "Show original line");
    const status = div("status");
    menu.append(title, itemYoutube, itemAi, itemBilingual, status);

    itemYoutube.addEventListener("click", () => {
      this.setAiActive(false);
      this.closeMenu();
    });
    itemAi.addEventListener("click", () => {
      this.setAiActive(true);
      this.closeMenu();
    });
    itemBilingual.addEventListener("click", () => {
      this.opts = { ...this.opts, bilingual: !this.opts.bilingual };
      this.onBilingualChange(this.opts.bilingual);
      this.shown = "";
      this.render();
      this.renderMenu();
    });
    // Keep the player from treating menu clicks as play/pause.
    for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "dblclick"]) {
      menu.addEventListener(type, (e) => e.stopPropagation());
    }

    shadow.append(style, subs, wait, menu);
    player.appendChild(host);
    this.dom = {
      host,
      subs,
      main,
      orig,
      note,
      wait,
      waitText,
      waitBar,
      waitSub,
      menu,
      itemYoutube,
      itemAi,
      aiLangLabel,
      itemBilingual,
      status
    };
    this.shown = "";
    this.setLayerVisible(false);
    this.renderMenu();
  }

  /** The extension's button in the player's right-hand controls. */
  private ensureButton(player: HTMLElement): void {
    if (this.button?.isConnected && player.contains(this.button)) return;
    this.button?.remove();
    this.button = null;
    const controls = player.querySelector<HTMLElement>(".ytp-right-controls");
    if (!controls) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ytp-button ${BUTTON_CLASS}`;
    button.setAttribute("translate", "no");
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-label", "Translator2k subtitles");
    button.title = "Translator2k subtitles";
    button.append(buttonIcon());
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.menuOpen) this.closeMenu();
      else this.openMenu();
    });
    const cc = controls.querySelector(".ytp-subtitles-button");
    if (cc) cc.before(button);
    else controls.prepend(button);
    this.button = button;
    this.renderMenu();
  }

  private teardownDom(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.player?.classList.remove(HIDE_NATIVE_CLASS);
    this.dom?.host.remove();
    this.dom = null;
    this.button?.remove();
    this.button = null;
    this.menuOpen = false;
    this.player = null;
    this.video = null;
  }

  private openMenu(): void {
    this.menuOpen = true;
    this.renderMenu();
    this.dom?.itemAi.focus({ preventScroll: true });
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.renderMenu();
  }

  private onDocumentClick = (e: MouseEvent): void => {
    if (!this.menuOpen) return;
    const path = e.composedPath();
    if ((this.dom && path.includes(this.dom.host)) || (this.button && path.includes(this.button))) {
      return;
    }
    this.closeMenu();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.menuOpen && e.key === "Escape") {
      e.stopPropagation();
      this.closeMenu();
      this.button?.focus();
    }
  };

  /** Scale with the player and sit above the control bar when it is visible. */
  private layout(player: HTMLElement): void {
    if (!this.dom) return;
    const height = player.clientHeight || 360;
    const fontSize = Math.round(Math.min(44, Math.max(14, height * 0.042)));
    const bar = player.querySelector<HTMLElement>(".ytp-chrome-bottom");
    const barHeight = bar?.offsetHeight ?? 48;
    const controlsHidden = player.classList.contains("ytp-autohide");
    const bottom = controlsHidden
      ? Math.round(height * 0.04)
      : barHeight + Math.round(height * 0.02) + 4;
    const style = this.dom.host.style;
    style.setProperty("--t2k-fs", `${fontSize}px`);
    style.setProperty("--t2k-bottom", `${bottom}px`);
    style.setProperty("--t2k-menu-bottom", `${barHeight + 12}px`);
  }

  private setLayerVisible(visible: boolean): void {
    if (!this.dom) return;
    this.dom.subs.hidden = !visible;
    if (!visible) {
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
      this.dom.wait.hidden = true;
      this.shown = "";
    }
  }

  private render(): void {
    const dom = this.dom;
    const video = this.video;
    if (!dom || !video || dom.subs.hidden) return;
    let main = "";
    let orig = "";
    let note = "";
    let pending = false;
    let waitText = "";
    let waitSub = "";
    let progress = 0;

    if (this.load === "ready") {
      const index = findSegmentAt(this.segments, video.currentTime * 1000);
      if (index !== -1) {
        const translated = this.translations[index];
        if (translated) {
          main = translated;
          if (this.opts.bilingual && this.needsTranslation) orig = this.segments[index].text;
        } else {
          main = this.segments[index].text;
          pending = !this.isSettled(index);
        }
      }
    } else if (this.load === "unavailable") {
      if (Date.now() - this.unavailableAt < NOTE_VISIBLE_MS) note = this.note;
    }

    if (this.waiting && !this.userOverride) {
      const total = this.buffer.total || BUFFER_LINES;
      progress = Math.round((this.buffer.done / total) * 100);
      waitText =
        this.load === "ready"
          ? `Translating subtitles with AI… ${this.buffer.done}/${total}`
          : "Loading captions for AI subtitles…";
      waitSub = this.lastError
        ? `Retrying: ${this.lastError}`.slice(0, 160)
        : "Please wait — playback resumes automatically. Press play to skip waiting.";
    } else if (this.waiting) {
      note = "AI translation is catching up — some lines may show untranslated.";
    } else if (pending && this.lastError) {
      note = `AI subtitles: ${this.lastError}`.slice(0, 140);
    }

    const signature = [main, orig, note, pending, waitText, waitSub, progress].join("\u0000");
    if (signature === this.shown) return;
    this.shown = signature;
    dom.main.textContent = main;
    dom.main.hidden = !main;
    dom.main.classList.toggle("pending", pending);
    dom.orig.textContent = orig;
    dom.orig.hidden = !orig;
    dom.note.textContent = note;
    dom.note.hidden = !note;
    dom.wait.hidden = !waitText;
    dom.waitText.textContent = waitText;
    dom.waitSub.textContent = waitSub;
    dom.waitBar.style.width = `${progress}%`;
  }

  private renderMenu(): void {
    this.button?.classList.toggle("t2k-on", this.aiActive);
    this.button?.setAttribute("aria-pressed", String(this.aiActive));
    this.button?.setAttribute("aria-expanded", String(this.menuOpen));
    const dom = this.dom;
    if (!dom) return;
    dom.menu.hidden = !this.menuOpen;
    if (!this.menuOpen) return;

    const langName = LANGUAGES.find((l) => l.code === this.opts.lang)?.native ?? this.opts.lang;
    dom.aiLangLabel.textContent = `· ${langName}`;
    dom.itemYoutube.setAttribute("aria-checked", String(!this.aiActive));
    dom.itemAi.setAttribute("aria-checked", String(this.aiActive));
    dom.itemBilingual.setAttribute("aria-checked", String(this.opts.bilingual));
    dom.itemBilingual.hidden = !this.aiActive;

    let status: string;
    const player = this.player;
    if (!this.aiActive) {
      status = "Default: YouTube's own captions. Choose AI subtitles to translate them with AI.";
    } else if (player && !player.querySelector(".ytp-subtitles-button")) {
      status = "This video has no captions.";
    } else if (player && !captionsOn(player)) {
      status = "Turn on captions (CC) to see AI subtitles.";
    } else if (this.load === "ready") {
      const done = this.translations.filter(Boolean).length;
      status = this.needsTranslation
        ? `AI translated ${done}/${this.segments.length} lines`
        : "Captions are already in this language.";
    } else if (this.load === "unavailable") {
      status = this.note;
    } else {
      status = "Loading captions…";
    }
    dom.status.textContent = status;
  }
}

function div(className: string): HTMLDivElement {
  const el = document.createElement("div");
  if (className) el.className = className;
  return el;
}

function menuItem(role: "radio" | "checkbox", label: string): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "item";
  item.setAttribute("role", role === "radio" ? "menuitemradio" : "menuitemcheckbox");
  item.setAttribute("aria-checked", "false");
  const mark = document.createElement("span");
  mark.className = role === "radio" ? "mark" : "mark box";
  const text = document.createElement("span");
  text.textContent = label;
  item.append(mark, text);
  return item;
}

function setAttributes(el: Element, attrs: Record<string, string>): void {
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
}

/** Captions box with "AI", drawn like YouTube's own 36×36 control icons. */
function buttonIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  setAttributes(svg, { viewBox: "0 0 36 36", "aria-hidden": "true" });
  const rect = document.createElementNS(SVG_NS, "rect");
  setAttributes(rect, {
    x: "8",
    y: "11",
    width: "20",
    height: "14",
    rx: "3",
    fill: "none",
    stroke: "#fff",
    "stroke-width": "2"
  });
  const text = document.createElementNS(SVG_NS, "text");
  setAttributes(text, {
    x: "18",
    y: "21.5",
    "text-anchor": "middle",
    "font-size": "8.5",
    "font-weight": "700",
    "font-family": "Roboto, Arial, sans-serif",
    fill: "#fff"
  });
  text.textContent = "AI";
  svg.append(rect, text);
  return svg;
}

/** Prefer `#shorts-player` on Shorts, or whichever player is actually visible. */
function pickActivePlayer(): HTMLElement | null {
  if (location.pathname.startsWith("/shorts/")) {
    const shorts = document.querySelector<HTMLElement>("#shorts-player");
    if (shorts && shorts.offsetWidth > 0 && shorts.offsetHeight > 0) return shorts;
  }
  const players = Array.from(
    document.querySelectorAll<HTMLElement>("#movie_player, .html5-video-player")
  );
  return players.find((p) => p.offsetWidth > 0 && p.offsetHeight > 0) ?? players[0] ?? null;
}

/** Video id from the URL (watch, shorts, embed, live); empty on other pages. */
function currentVideoKey(): string {
  try {
    const url = new URL(location.href);
    const v = url.searchParams.get("v");
    if (v) return v;
    const match = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function captionsOn(player: HTMLElement): boolean {
  const button = player.querySelector<HTMLElement>(".ytp-subtitles-button");
  return button?.getAttribute("aria-pressed") === "true";
}

function ensurePageStyle(): void {
  if (document.getElementById(PAGE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = PAGE_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
