import { describe, expect, it } from "vitest";
import { mergeSettings } from "./storage";
import { DEFAULT_SETTINGS } from "./types";

/** Loosely-typed stored blob, mirroring data persisted by older versions. */
type StoredBlob = Parameters<typeof mergeSettings>[0];
const stored = (provider: string): StoredBlob =>
  ({ provider } as unknown as StoredBlob);

describe("mergeSettings", () => {
  it("migrates the legacy `microsoft` provider to `bing`", () => {
    expect(mergeSettings(stored("microsoft")).provider).toBe("bing");
  });

  it("falls back to the default for discontinued providers", () => {
    expect(mergeSettings(stored("lingva")).provider).toBe(
      DEFAULT_SETTINGS.provider
    );
    expect(mergeSettings(stored("mymemory")).provider).toBe(
      DEFAULT_SETTINGS.provider
    );
  });

  it("keeps valid providers", () => {
    expect(mergeSettings(stored("google")).provider).toBe("google");
    expect(mergeSettings(stored("bing")).provider).toBe("bing");
  });

  it("falls back to the default for an unknown provider", () => {
    expect(mergeSettings(stored("nonsense")).provider).toBe(
      DEFAULT_SETTINGS.provider
    );
  });

  it("merges host rules over the defaults", () => {
    const merged = mergeSettings({ hostRules: { "example.com": "always" } });
    expect(merged.hostRules).toEqual({ "example.com": "always" });
  });

  it("fills missing fields from DEFAULT_SETTINGS", () => {
    const merged = mergeSettings({ targetLang: "ja" });
    expect(merged.targetLang).toBe("ja");
    expect(merged.displayMode).toBe(DEFAULT_SETTINGS.displayMode);
    expect(merged.sourceLang).toBe(DEFAULT_SETTINGS.sourceLang);
  });

  it("preserves the providers sub-object shape", () => {
    const merged = mergeSettings({});
    expect(merged.providers.google).toBeDefined();
  });

  it("defaults aiProvider when missing", () => {
    expect(mergeSettings({}).aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
  });

  it("keeps a valid aiProvider", () => {
    const merged = mergeSettings({ aiProvider: "gemma" });
    expect(merged.aiProvider).toBe("gemma");
  });

  it("accepts an existing custom model as provider and aiProvider", () => {
    const blob = {
      provider: "custom:abc",
      aiProvider: "custom:abc",
      customModels: [
        { id: "abc", name: "Mine", endpoint: "http://x/v1", apiKey: "k", model: "m" }
      ]
    } as unknown as Parameters<typeof mergeSettings>[0];
    const merged = mergeSettings(blob);
    expect(merged.provider).toBe("custom:abc");
    expect(merged.aiProvider).toBe("custom:abc");
  });

  it("falls back when provider/aiProvider point to a missing custom model", () => {
    const blob = {
      provider: "custom:gone",
      aiProvider: "custom:gone",
      customModels: []
    } as unknown as Parameters<typeof mergeSettings>[0];
    const merged = mergeSettings(blob);
    expect(merged.provider).toBe(DEFAULT_SETTINGS.provider);
    expect(merged.aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
  });

  it("forces the gemma config back to the bundled default, ignoring stored overrides", () => {
    const merged = mergeSettings({
      providers: {
        google: {},
        ai: {
          gemma: { endpoint: "http://evil/v1", apiKey: "hacked", model: "x" }
        }
      }
    } as unknown as Parameters<typeof mergeSettings>[0]);
    expect(merged.providers.ai.gemma).toEqual(
      DEFAULT_SETTINGS.providers.ai.gemma
    );
  });

  it("sanitizes custom models and drops malformed / duplicate entries", () => {
    const blob = {
      customModels: [
        { id: "a", name: "A", endpoint: "http://a/v1", apiKey: "k", model: "m" },
        { id: "a", name: "dup", endpoint: "", apiKey: "", model: "" }, // duplicate id
        { name: "no-id" }, // missing id
        null,
        "garbage"
      ]
    } as unknown as Parameters<typeof mergeSettings>[0];
    const merged = mergeSettings(blob);
    expect(merged.customModels).toEqual([
      { id: "a", name: "A", endpoint: "http://a/v1", apiKey: "k", model: "m" }
    ]);
  });

  it("preserves user-supplied custom models", () => {
    const blob = {
      customModels: [
        {
          id: "x1",
          name: "Local",
          endpoint: "http://localhost:1234/v1",
          apiKey: "sk-mine",
          model: "my-model"
        }
      ]
    } as unknown as Parameters<typeof mergeSettings>[0];
    expect(mergeSettings(blob).customModels[0]).toEqual({
      id: "x1",
      name: "Local",
      endpoint: "http://localhost:1234/v1",
      apiKey: "sk-mine",
      model: "my-model"
    });
  });

  it("falls back to the default for a non-AI / unknown aiProvider", () => {
    const blob = { aiProvider: "google" } as unknown as Parameters<
      typeof mergeSettings
    >[0];
    expect(mergeSettings(blob).aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
    const bogus = { aiProvider: "nonsense" } as unknown as Parameters<
      typeof mergeSettings
    >[0];
    expect(mergeSettings(bogus).aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
  });

  it("defaults aiTranslationMode when missing", () => {
    expect(mergeSettings({}).aiTranslationMode).toBe(
      DEFAULT_SETTINGS.aiTranslationMode
    );
  });

  it("keeps a valid aiTranslationMode and rejects unknown values", () => {
    expect(mergeSettings({ aiTranslationMode: "replace" }).aiTranslationMode).toBe(
      "replace"
    );
    expect(mergeSettings({ aiTranslationMode: "below" }).aiTranslationMode).toBe(
      "below"
    );
    const bogus = { aiTranslationMode: "sidebyside" } as unknown as Parameters<
      typeof mergeSettings
    >[0];
    expect(mergeSettings(bogus).aiTranslationMode).toBe(
      DEFAULT_SETTINGS.aiTranslationMode
    );
  });
});
