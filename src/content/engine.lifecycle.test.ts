import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationEngine, type EngineConfig } from "./engine";
import { sendTranslateRequest } from "./messaging";
import { collectSegmentsAsync, type TextSegment } from "./walker";
import type { TranslateResponseMessage } from "../types";

vi.mock("./messaging", () => ({ sendTranslateRequest: vi.fn() }));
vi.mock("./styles", () => ({ ensureStyles: vi.fn() }));
vi.mock("./walker", () => ({
  collectSegmentsAsync: vi.fn(),
  collectSelectionSegments: vi.fn(),
  withCollectCache: (fn: () => unknown) => fn(),
  isTranslatableElement: () => true
}));

const config: EngineConfig = {
  provider: "google",
  source: "en",
  target: "vi",
  displayMode: "replace"
};

function deferred() {
  let resolve!: (value: TranslateResponseMessage) => void;
  const promise = new Promise<TranslateResponseMessage>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function segments(count: number) {
  const classes = new Set<string>();
  const parent = {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name)
    },
    getBoundingClientRect: () => ({ top: 0, bottom: 10 })
  };
  const texts: TextSegment[] = Array.from({ length: count }, () => ({
    text: "Hello",
    node: {
      nodeValue: "Hello",
      parentElement: parent,
      parentNode: parent,
      isConnected: true
    } as unknown as Text
  }));
  return { texts, classes };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("document", { body: {} });
  vi.stubGlobal("window", { innerHeight: 800, setTimeout, clearTimeout });
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("TranslationEngine lifecycle", () => {
  it("reports queued batches as well as the four running requests", async () => {
    const page = segments(321); // five batches of at most 80 nodes
    vi.mocked(collectSegmentsAsync).mockResolvedValue(page.texts);
    const pending = deferred();
    vi.mocked(sendTranslateRequest).mockReturnValue(pending.promise);
    const engine = new TranslationEngine(config);
    const progress = vi.fn();
    engine.setProgressHandler(progress);
    const run = engine.enable(config);
    await vi.waitFor(() => expect(sendTranslateRequest).toHaveBeenCalledTimes(4));
    expect(progress).toHaveBeenLastCalledWith({ active: true, count: 0, pending: 5 });
    engine.disable();
    expect(progress).toHaveBeenLastCalledWith({ active: false, count: 0, pending: 0 });
    pending.resolve({
      type: "translate-response",
      translations: Array(80).fill("Hello") as string[]
    });
    await run;
    expect(sendTranslateRequest).toHaveBeenCalledTimes(4);
    expect(page.classes.size).toBe(0);
    expect(progress).toHaveBeenLastCalledWith({ active: false, count: 0, pending: 0 });
  });

  it("keeps a new run's loading markers and progress when an old request finishes", async () => {
    const page = segments(1);
    vi.mocked(collectSegmentsAsync).mockResolvedValue(page.texts);
    const old = deferred();
    const current = deferred();
    vi.mocked(sendTranslateRequest)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const engine = new TranslationEngine(config);
    const progress = vi.fn();
    const onError = vi.fn();
    engine.setProgressHandler(progress);
    engine.setErrorHandler(onError);
    const first = engine.enable(config);
    await vi.waitFor(() => expect(sendTranslateRequest).toHaveBeenCalledTimes(1));
    const second = engine.enable({ ...config, provider: "bing" });
    await vi.waitFor(() => expect(sendTranslateRequest).toHaveBeenCalledTimes(2));
    old.resolve({ type: "translate-response", translations: [], error: "Old failure" });
    await first;
    expect(onError).not.toHaveBeenCalled();
    expect(page.classes.has("wt-translating")).toBe(true);
    expect(progress).toHaveBeenLastCalledWith({ active: true, count: 0, pending: 1 });
    current.resolve({ type: "translate-response", translations: ["Hello"] });
    await second;
    expect(page.classes.size).toBe(0);
    expect(progress).toHaveBeenLastCalledWith({ active: true, count: 0, pending: 0 });
    engine.disable();
  });

  it("cancels a scan before sending provider requests", async () => {
    let finishScan!: (texts: TextSegment[]) => void;
    vi.mocked(collectSegmentsAsync).mockReturnValue(
      new Promise((resolve) => {
        finishScan = resolve;
      })
    );
    const engine = new TranslationEngine(config);
    const run = engine.enable(config);
    engine.disable();
    finishScan(segments(1).texts);
    await run;
    expect(sendTranslateRequest).not.toHaveBeenCalled();
  });
});
