import { afterEach, describe, expect, it, vi } from "vitest";
import { BATCH_SEGMENT_LIMIT } from "./constants";
import {
  isTransientRuntimeError,
  sendChunkedTranslateRequest,
  sendTranslateRequest
} from "./messaging";

function stubRuntime(reply: (texts: string[]) => unknown) {
  const sendMessage = vi.fn((request: { texts: string[] }, callback: (r: unknown) => void) => {
    callback(reply(request.texts));
  });
  vi.stubGlobal("chrome", { runtime: { id: "test", lastError: undefined, sendMessage } });
  return sendMessage;
}

describe("sendChunkedTranslateRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits oversized requests and stitches results back in order", async () => {
    const sendMessage = stubRuntime((texts) => ({
      type: "translate-response",
      translations: texts.map((t) => `vi:${t}`)
    }));
    const texts = Array.from({ length: BATCH_SEGMENT_LIMIT * 2 + 1 }, (_, i) => `t${i}`);

    const res = await sendChunkedTranslateRequest({
      type: "translate",
      texts,
      source: "en",
      target: "vi",
      provider: "google"
    });

    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(res.error).toBeUndefined();
    expect(res.translations).toEqual(texts.map((t) => `vi:${t}`));
  });

  it("fails the whole call when any chunk fails", async () => {
    stubRuntime((texts) =>
      texts[0] === "t0"
        ? { type: "translate-response", translations: texts }
        : { type: "translate-response", translations: [], error: "boom" }
    );
    const texts = Array.from({ length: BATCH_SEGMENT_LIMIT + 1 }, (_, i) => `t${i}`);

    const res = await sendChunkedTranslateRequest({
      type: "translate",
      texts,
      source: "en",
      target: "vi",
      provider: "google"
    });

    expect(res).toEqual({ type: "translate-response", translations: [], error: "boom" });
  });
});

describe("sendTranslateRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resends once when the service worker was restarting", async () => {
    const runtime: { id: string; lastError?: { message: string }; sendMessage: unknown } = {
      id: "test",
      lastError: undefined,
      sendMessage: undefined
    };
    let calls = 0;
    runtime.sendMessage = vi.fn((request: { texts: string[] }, callback: (r: unknown) => void) => {
      calls++;
      if (calls === 1) {
        runtime.lastError = {
          message: "Could not establish connection. Receiving end does not exist."
        };
        callback(undefined);
        runtime.lastError = undefined;
        return;
      }
      callback({ type: "translate-response", translations: request.texts.map((t) => `vi:${t}`) });
    });
    vi.stubGlobal("chrome", { runtime });

    const res = await sendTranslateRequest({
      type: "translate",
      texts: ["a"],
      source: "en",
      target: "vi",
      provider: "google"
    });
    expect(calls).toBe(2);
    expect(res.error).toBeUndefined();
    expect(res.translations).toEqual(["vi:a"]);
  });

  it("does not resend real translation errors", async () => {
    const sendMessage = stubRuntime(() => ({
      type: "translate-response",
      translations: [],
      error: "[Google] Translation error: boom"
    }));
    const res = await sendTranslateRequest({
      type: "translate",
      texts: ["a"],
      source: "en",
      target: "vi",
      provider: "google"
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(res.error).toMatch(/boom/);
  });
});

describe("isTransientRuntimeError", () => {
  it("matches service-worker restart errors only", () => {
    expect(isTransientRuntimeError("The message port closed before a response was received.")).toBe(
      true
    );
    expect(
      isTransientRuntimeError("Could not establish connection. Receiving end does not exist.")
    ).toBe(true);
    expect(isTransientRuntimeError("[Google] Network error")).toBe(false);
    expect(isTransientRuntimeError(undefined)).toBe(false);
  });
});
