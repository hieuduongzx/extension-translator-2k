import { afterEach, describe, expect, it, vi } from "vitest";
import { discardResponse, fetchWithRetry, fetchWithTimeout } from "./http";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("keeps the timeout active while the response body is being read", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init?: RequestInit) =>
        Promise.resolve({
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted")));
            })
        } as Response)
      )
    );

    const response = await fetchWithTimeout("https://example.test", { timeoutMs: 100 });
    const body = expect(response.json()).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(100);
    await body;
  });

  it("does not abort after a body finishes", async () => {
    vi.useFakeTimers();
    const abortSpy = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", abortSpy);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      })
    );

    const response = await fetchWithTimeout("https://example.test", { timeoutMs: 100 });
    await expect(response.json()).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it("clears the timeout and cancels the stream when discardResponse is called", async () => {
    vi.useFakeTimers();
    const abortSpy = vi.fn();
    const cancelSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", abortSpy);
        return Promise.resolve({
          ok: false,
          status: 404,
          body: { cancel: cancelSpy }
        } as unknown as Response);
      })
    );

    const response = await fetchWithTimeout("https://example.test", { timeoutMs: 100 });
    discardResponse(response);
    await vi.advanceTimersByTimeAsync(200);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(abortSpy).not.toHaveBeenCalled();
  });
});

describe("fetchWithRetry", () => {
  it("retries a 429 and returns the next good response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "slow down" })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ["ok"] });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchWithRetry("https://example.test", { timeoutMs: 30_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    const res = await pending;
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns non-retryable statuses immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.test", { timeoutMs: 30_000 });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors up to the attempt limit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(
      fetchWithRetry("https://example.test", { timeoutMs: 30_000, attempts: 3 })
    ).rejects.toThrow(/Failed to fetch/);
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
