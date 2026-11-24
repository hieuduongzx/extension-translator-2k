import { describe, expect, it, vi } from "vitest";
import { assertSecureAIConfig, parseAIContent, parseAIResult, translateAI } from "./ai";
import { DEFAULT_SETTINGS } from "../types";

describe("parseAIContent", () => {
  const inputs2 = ["Hello", "World"];

  it("parses a plain JSON array", () => {
    expect(parseAIContent('["Xin chào", "Thế giới"]', inputs2)).toEqual(["Xin chào", "Thế giới"]);
  });

  it("strips ```json fences", () => {
    const content = '```json\n["Xin chào", "Thế giới"]\n```';
    expect(parseAIContent(content, inputs2)).toEqual(["Xin chào", "Thế giới"]);
  });

  it("strips bare ``` fences", () => {
    const content = '```\n["A", "B"]\n```';
    expect(parseAIContent(content, inputs2)).toEqual(["A", "B"]);
  });

  it("extracts the first [...] block from surrounding prose", () => {
    const content = 'Sure! Here you go: ["Một", "Hai"] — hope that helps.';
    expect(parseAIContent(content, inputs2)).toEqual(["Một", "Hai"]);
  });

  it("returns originals when the model returns too few items", () => {
    expect(parseAIContent('["Chỉ một"]', inputs2)).toEqual(inputs2);
  });

  it("returns originals when the model returns too many items", () => {
    expect(parseAIContent('["A", "B", "C"]', inputs2)).toEqual(inputs2);
  });

  it("keeps the original for non-string array items", () => {
    expect(parseAIContent('[1, "Thế giới"]', inputs2)).toEqual(["Hello", "Thế giới"]);
  });

  it("uses the raw reply for a single input when not an array", () => {
    expect(parseAIContent("Xin chào", ["Hello"])).toEqual(["Xin chào"]);
  });

  it("uses the raw reply for a single input whose brackets parse as a non-string array", () => {
    expect(parseAIContent("Chương [3]", ["Chapter [3]"])).toEqual(["Chương [3]"]);
  });

  it("returns originals unchanged when multi-input reply is unparseable", () => {
    expect(parseAIContent("not json at all", inputs2)).toEqual(inputs2);
  });

  it("strips <think>...</think> reasoning blocks before parsing JSON or prose", () => {
    expect(
      parseAIContent('<think>Need [array] format</think>\n["Xin chào", "Thế giới"]', inputs2)
    ).toEqual(["Xin chào", "Thế giới"]);
    expect(parseAIContent("<think>thinking...</think>\nXin chào", ["Hello"])).toEqual(["Xin chào"]);
  });

  it("preserves single-input prose that contains a quoted bracketed string", () => {
    expect(parseAIContent('Nhấn ["OK"] để tiếp tục', ['Click ["OK"] to continue'])).toEqual([
      'Nhấn ["OK"] để tiếp tục'
    ]);
  });
});

describe("parseAIResult failure flags", () => {
  const inputs2 = ["Hello", "World"];

  it("flags nothing when every slot came back translated", () => {
    expect(parseAIResult('["Xin chào", "Thế giới"]', inputs2).failed).toBeUndefined();
  });

  it("flags every slot when the item count does not match", () => {
    // Which segment the model dropped is unknown, so no slot can be trusted —
    // caching a shifted translation would pin it for the whole TTL.
    expect(parseAIResult('["Chỉ một"]', inputs2).failed).toEqual([true, true]);
  });

  it("flags a single-input JSON reply it could not read instead of caching it", () => {
    expect(parseAIResult('{"translation":"Xin chào"}', ["Hello"]).failed).toEqual([true]);
  });

  it("flags every slot when a multi-input reply is unparseable", () => {
    expect(parseAIResult("not json at all", inputs2).failed).toEqual([true, true]);
  });

  it("does not flag a single-input raw reply", () => {
    expect(parseAIResult("Xin chào", ["Hello"]).failed).toBeUndefined();
  });

  it("does not flag a translation that legitimately equals its source", () => {
    // "Windows" is a proper noun; returning it unchanged is a real result.
    expect(parseAIResult('["Windows"]', ["Windows"])).toEqual({
      translations: ["Windows"]
    });
  });
});

describe("assertSecureAIConfig", () => {
  it("rejects an empty endpoint", () => {
    expect(() => assertSecureAIConfig({ endpoint: "  ", apiKey: "x", model: "m" })).toThrow(
      /not configured/
    );
  });

  it("rejects an unparseable endpoint", () => {
    expect(() => assertSecureAIConfig({ endpoint: "not a url", apiKey: "x", model: "m" })).toThrow(
      /invalid/
    );
  });

  it("rejects a non-HTTP scheme", () => {
    expect(() =>
      assertSecureAIConfig({ endpoint: "ftp://example.com/v1", apiKey: "x", model: "m" })
    ).toThrow(/http/);
  });

  it("allows the bundled plain-HTTP gateway, HTTPS, and loopback endpoints", () => {
    for (const endpoint of [
      DEFAULT_SETTINGS.providers.ai["auto-free"].endpoint,
      "https://example.com/v1",
      "http://localhost:1234/v1"
    ]) {
      expect(() => assertSecureAIConfig({ endpoint, apiKey: "x", model: "m" })).not.toThrow();
    }
  });
});

describe("bundled AI defaults", () => {
  it("ships a usable endpoint, key and model for every built-in backend", () => {
    for (const config of Object.values(DEFAULT_SETTINGS.providers.ai)) {
      expect(config.endpoint).not.toBe("");
      expect(config.apiKey).not.toBe("");
      expect(config.model).not.toBe("");
    }
  });

  it("sends reasoningEffort=low for the bundled auto-free backend", () => {
    expect(DEFAULT_SETTINGS.providers.ai["auto-free"].reasoningEffort).toBe("low");
  });
});

describe("translateAI request body", () => {
  const config = { endpoint: "https://x.test/v1", apiKey: "k", model: "m" };

  async function bodyFor(
    extra: Partial<typeof config> & {
      noReasoning?: boolean;
      reasoningEffort?: "none" | "low" | "medium" | "high";
    }
  ) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["xin chào"]' } }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    await translateAI(["hello"], "en", "vi", { ...config, ...extra });
    vi.unstubAllGlobals();
    return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
  }

  it("sends reasoning.effort according to reasoningEffort / noReasoning", async () => {
    expect(await bodyFor({ noReasoning: true })).toMatchObject({
      reasoning: { effort: "none" }
    });
    expect(await bodyFor({ reasoningEffort: "low" })).toMatchObject({
      reasoning: { effort: "low" }
    });
    expect(await bodyFor({ noReasoning: true, reasoningEffort: "low" })).toMatchObject({
      reasoning: { effort: "low" }
    });
    expect(await bodyFor({})).not.toHaveProperty("reasoning");
  });

  it("trims endpoint/apiKey/model and preserves endpoint query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["xin chào"]' } }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await translateAI(["hello"], "en", "vi", {
        endpoint: "  https://x.test/openai/v1/?api-version=2024-06-01  ",
        apiKey: "  sk-test  ",
        model: "  gpt-4o-mini  "
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://x.test/openai/v1/chat/completions?api-version=2024-06-01"
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer sk-test"
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      model: "gpt-4o-mini"
    });
  });
});

describe("translateAI retry", () => {
  const config = { endpoint: "https://x.test/v1", apiKey: "k", model: "m" };

  it("uses one 60s budget for retries when the network stalls", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const assertion = expect(translateAI(["hello"], "en", "vi", config)).rejects.toThrow(
        /timed out after 60s/
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("retries a 429 with backoff and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '["xin chào"]' } }] })
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const promise = translateAI(["hello"], "en", "vi", config);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toEqual({ translations: ["xin chào"] });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 503 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '["xin chào"]' } }] })
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const promise = translateAI(["hello"], "en", "vi", config);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toEqual({ translations: ["xin chào"] });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400 (bad request)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "bad request" } })
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(translateAI(["hello"], "en", "vi", config)).rejects.toThrow(/HTTP 400/);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries with reasoning.effort=low when backend requires low/medium/high", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message:
              '[400]: {"error":{"message":"`reasoning_effort` must be one of `low`, `medium`, or `high`","type":"invalid_request_error"}}'
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '["xin chào"]' } }] })
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(
        translateAI(["hello"], "en", "vi", { ...config, noReasoning: true })
      ).resolves.toEqual({ translations: ["xin chào"] });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      reasoning: { effort: "none" }
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      reasoning: { effort: "low" }
    });
  });

  it("retries without reasoning when backend rejects the reasoning field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Unknown parameter: 'reasoning'" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '["xin chào"]' } }] })
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(
        translateAI(["hello"], "en", "vi", { ...config, reasoningEffort: "low" })
      ).resolves.toEqual({ translations: ["xin chào"] });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty("reasoning");
  });

  it("gives up after max retries on a persistent 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited"
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const promise = translateAI(["hello"], "en", "vi", config);
      const assertion = expect(promise).rejects.toThrow(/HTTP 429/);
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("translateAI multi-chunk failure flags", () => {
  const config = { endpoint: "https://x.test/v1", apiKey: "k", model: "m" };

  it("flags the slots of a failed chunk so they are not cached", async () => {
    // Two segments over the 6000-char chunk limit → two chunks. The first fails
    // with a non-retryable 400; its slot is padded with the original text purely
    // to keep alignment, so it must be flagged rather than treated as a result.
    const big = "a".repeat(5000);
    const other = "b".repeat(5000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "bad request" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '["dịch rồi"]' } }] })
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await translateAI([big, other], "en", "vi", config);
      expect(result.translations).toEqual([big, "dịch rồi"]);
      expect(result.failed).toEqual([true, false]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
