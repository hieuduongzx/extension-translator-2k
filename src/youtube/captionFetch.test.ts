import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYoutubeCaptionTrackPage } from "./captionFetch";

const g = globalThis as unknown as Record<string, unknown>;
const saved = { fetch: g.fetch, XMLHttpRequest: g.XMLHttpRequest };

const BODY = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "hi" }] }]
});
const SIGNED = "https://www.youtube.com/api/timedtext?v=vid1&lang=en&kind=asr&pot=TOKEN&fmt=json3";

/** Minimal XHR whose `send` fires `load` with a canned body, like the player's request. */
class FakeXHR {
  responseType = "";
  responseText = "";
  private url = "";
  private listeners: (() => void)[] = [];
  open(_method: string, url: string): void {
    this.url = url;
  }
  addEventListener(_type: string, fn: () => void): void {
    this.listeners.push(fn);
  }
  send(): void {
    this.responseText = this.url.includes("pot=") ? BODY : "";
    for (const fn of this.listeners) fn();
  }
}

function setup(opts: { playerFetchesOnSwitch: boolean; bareUrlWorks: boolean }) {
  const setOption = vi.fn(() => {
    if (!opts.playerFetchesOnSwitch) return;
    const xhr = new (g.XMLHttpRequest as typeof FakeXHR)();
    xhr.open("GET", SIGNED);
    xhr.send();
  });
  const player = {
    getPlayerResponse: () => ({
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://www.youtube.com/api/timedtext?v=vid1&lang=en&kind=asr",
              languageCode: "en",
              kind: "asr"
            }
          ]
        }
      }
    }),
    getVideoData: () => ({ video_id: "vid1" }),
    getOption: (_m: string, option: string) =>
      option === "tracklist" ? [{ languageCode: "en", kind: "asr" }] : {},
    setOption,
    loadModule: vi.fn()
  };
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => (opts.bareUrlWorks || url.includes("pot=") ? BODY : ""),
    clone() {
      return this;
    }
  }));
  g.window = globalThis;
  g.location = { href: "https://www.youtube.com/watch?v=vid1" };
  g.document = { querySelectorAll: () => [player] };
  g.XMLHttpRequest = FakeXHR;
  g.fetch = fetchMock;
  // Simulates a full resource-timing buffer: the player's request isn't listed.
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
  return { setOption, fetchMock };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete g.__translator2kTimedText;
  delete g.window;
  delete g.location;
  delete g.document;
  g.fetch = saved.fetch;
  g.XMLHttpRequest = saved.XMLHttpRequest;
});

describe("fetchYoutubeCaptionTrackPage", () => {
  it("makes the player fetch the source track and uses its captured response", async () => {
    const { setOption } = setup({ playerFetchesOnSwitch: true, bareUrlWorks: false });
    const result = await fetchYoutubeCaptionTrackPage();
    expect(setOption).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, videoId: "vid1", languageCode: "en", kind: "asr" });
    expect(result.body).toBe(BODY);
  });

  it("falls back to the bare baseUrl and reports diagnostics when nothing works", async () => {
    const { fetchMock } = setup({ playerFetchesOnSwitch: false, bareUrlWorks: false });
    const result = await fetchYoutubeCaptionTrackPage();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("pending");
    expect(result.detail).toContain("source en (auto)");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("fmt=json3"), expect.anything());
  });

  it("uses the bare baseUrl when YouTube still serves it", async () => {
    setup({ playerFetchesOnSwitch: false, bareUrlWorks: true });
    const result = await fetchYoutubeCaptionTrackPage();
    expect(result.ok).toBe(true);
  });
});
