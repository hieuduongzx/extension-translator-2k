import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isYouTubeHost,
  toYouTubeLangCode,
  youtubeCaptionPage,
  type YoutubeCaptionConfig
} from "./captions";

describe("isYouTubeHost", () => {
  it("matches YouTube and its embed hosts", () => {
    expect(isYouTubeHost("www.youtube.com")).toBe(true);
    expect(isYouTubeHost("m.youtube.com")).toBe(true);
    expect(isYouTubeHost("youtube.com")).toBe(true);
    expect(isYouTubeHost("www.youtube-nocookie.com")).toBe(true);
  });

  it("rejects look-alikes", () => {
    expect(isYouTubeHost("notyoutube.com")).toBe(false);
    expect(isYouTubeHost("youtube.com.evil.io")).toBe(false);
    expect(isYouTubeHost("example.com")).toBe(false);
  });
});

describe("toYouTubeLangCode", () => {
  it("maps Chinese and Hebrew to YouTube's codes", () => {
    expect(toYouTubeLangCode("zh-CN")).toBe("zh-Hans");
    expect(toYouTubeLangCode("zh-TW")).toBe("zh-Hant");
    expect(toYouTubeLangCode("he")).toBe("iw");
  });

  it("passes other codes through", () => {
    expect(toYouTubeLangCode("vi")).toBe("vi");
    expect(toYouTubeLangCode("en")).toBe("en");
  });
});

interface Track {
  languageCode?: string;
  kind?: string;
  is_translateable?: boolean;
  translationLanguage?: { languageCode?: string; languageName?: string } | null;
}

/** Minimal stand-in for YouTube's `#movie_player` element. */
function fakePlayer(init: { track: Track | null; tracklist: Track[]; videoId?: string }) {
  const state = { track: init.track, videoId: init.videoId ?? "vid1" };
  const setTrack = vi.fn((value: Track) => {
    state.track = value;
  });
  const player = {
    state,
    setTrack,
    loadModule: vi.fn(),
    getOption(_module: string, option: string) {
      if (option === "track") return state.track ?? {};
      if (option === "tracklist") return init.tracklist;
      if (option === "translationLanguages") {
        return [
          { languageCode: "en", languageName: "English" },
          { languageCode: "vi", languageName: "Tiếng Việt" }
        ];
      }
      return undefined;
    },
    setOption(_module: string, option: string, value: Track) {
      if (option === "track") setTrack(value);
    },
    getVideoData: () => ({ video_id: state.videoId }),
    getPlayerResponse: () => ({
      captions: { playerCaptionsTracklistRenderer: { captionTracks: init.tracklist } }
    }),
    querySelector: () => null
  };
  return player;
}

const KEY = "__translator2kYtCaptions";
const g = globalThis as unknown as Record<string, unknown>;

function install(players: unknown[]): void {
  g.window = globalThis;
  g.location = { href: "https://www.youtube.com/watch?v=x" };
  g.document = {
    querySelectorAll: () => players,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
}

const config = (patch: Partial<YoutubeCaptionConfig> = {}): YoutubeCaptionConfig => ({
  enabled: true,
  lang: "vi",
  autoOn: false,
  ...patch
});

describe("youtubeCaptionPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    const controller = g[KEY] as { update: (c: YoutubeCaptionConfig) => void } | undefined;
    controller?.update(config({ enabled: false }));
    delete g[KEY];
    delete g.window;
    delete g.document;
    delete g.location;
    vi.useRealTimers();
  });

  it("auto-translates English captions into Vietnamese", () => {
    const en = { languageCode: "en", kind: "", is_translateable: true };
    const player = fakePlayer({ track: en, tracklist: [en] });
    install([player]);

    youtubeCaptionPage(config());

    expect(player.setTrack).toHaveBeenCalledTimes(1);
    expect(player.state.track).toMatchObject({
      languageCode: "en",
      translationLanguage: { languageCode: "vi", languageName: "Tiếng Việt" }
    });

    // Already Vietnamese on the next poll: no more switching.
    vi.advanceTimersByTime(3000);
    expect(player.setTrack).toHaveBeenCalledTimes(1);
  });

  it("prefers a native Vietnamese track over auto-translate", () => {
    const en = { languageCode: "en", kind: "" };
    const viAsr = { languageCode: "vi", kind: "asr" };
    const viManual = { languageCode: "vi", kind: "" };
    const player = fakePlayer({ track: en, tracklist: [en, viAsr, viManual] });
    install([player]);

    youtubeCaptionPage(config());

    expect(player.state.track).toBe(viManual);
  });

  it("translates from the original track, not a previous translation", () => {
    const ja = { languageCode: "ja", kind: "" };
    const current = { ...ja, translationLanguage: { languageCode: "en" } };
    const player = fakePlayer({ track: current, tracklist: [ja] });
    install([player]);

    youtubeCaptionPage(config());

    expect(player.state.track).toMatchObject({
      languageCode: "ja",
      translationLanguage: { languageCode: "vi" }
    });
  });

  it("leaves captions off unless auto-on is enabled", () => {
    const en = { languageCode: "en", kind: "" };
    const player = fakePlayer({ track: null, tracklist: [en] });
    install([player]);

    youtubeCaptionPage(config());
    vi.advanceTimersByTime(2000);
    expect(player.loadModule).not.toHaveBeenCalled();
    expect(player.setTrack).not.toHaveBeenCalled();
  });

  it("turns captions on once per video when auto-on is enabled", () => {
    const en = { languageCode: "en", kind: "" };
    const player = fakePlayer({ track: null, tracklist: [en] });
    install([player]);

    youtubeCaptionPage(config({ autoOn: true }));
    vi.advanceTimersByTime(3000);
    // Player never reports captions on (user switched them off): try only once.
    expect(player.loadModule).toHaveBeenCalledTimes(1);
    expect(player.loadModule).toHaveBeenCalledWith("captions");
  });

  it("stops enforcing after being disabled", () => {
    const en = { languageCode: "en", kind: "" };
    const player = fakePlayer({ track: en, tracklist: [en] });
    install([player]);

    youtubeCaptionPage(config());
    youtubeCaptionPage(config({ enabled: false }));
    player.state.track = en;
    vi.advanceTimersByTime(3000);
    expect(player.setTrack).toHaveBeenCalledTimes(1);
  });

  it("gives up after repeated switches on the same video", () => {
    const en = { languageCode: "en", kind: "" };
    const player = fakePlayer({ track: en, tracklist: [en] });
    // The player ignores every switch.
    player.setOption = () => undefined;
    const spy = vi.spyOn(player, "getOption");
    install([player]);

    youtubeCaptionPage(config());
    vi.advanceTimersByTime(20_000);
    const switches = spy.mock.calls.filter(([, opt]) => opt === "tracklist").length;
    expect(switches).toBe(6);
  });

  it("skips players running AI subtitles or showing ads", () => {
    const en = { languageCode: "en", kind: "", is_translateable: true };
    const aiPlayer = {
      ...fakePlayer({ track: en, tracklist: [en] }),
      classList: { contains: (cls: string) => cls === "t2k-ai-subs" }
    };
    const adPlayer = {
      ...fakePlayer({ track: en, tracklist: [en] }),
      classList: { contains: (cls: string) => cls === "ad-showing" }
    };
    install([aiPlayer, adPlayer]);

    youtubeCaptionPage(config({ autoOn: true }));
    vi.advanceTimersByTime(3000);

    expect(aiPlayer.setTrack).not.toHaveBeenCalled();
    expect(adPlayer.setTrack).not.toHaveBeenCalled();
  });
});
