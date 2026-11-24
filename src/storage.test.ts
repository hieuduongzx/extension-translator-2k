import { describe, expect, it } from "vitest";
import { mergeSettings, sanitizeSettingsForContent } from "./storage";
import { DEFAULT_SETTINGS } from "./types";

/** Loosely-typed stored blob, mirroring data persisted by older versions. */
type StoredBlob = Parameters<typeof mergeSettings>[0];
const stored = (provider: string): StoredBlob => ({ provider }) as unknown as StoredBlob;

describe("mergeSettings", () => {
  it("migrates the legacy `microsoft` provider to `bing`", () => {
    expect(mergeSettings(stored("microsoft")).provider).toBe("bing");
  });

  it("falls back to the default for discontinued providers", () => {
    expect(mergeSettings(stored("lingva")).provider).toBe(DEFAULT_SETTINGS.provider);
    expect(mergeSettings(stored("mymemory")).provider).toBe(DEFAULT_SETTINGS.provider);
  });

  it("keeps valid providers", () => {
    expect(mergeSettings(stored("google")).provider).toBe("google");
    expect(mergeSettings(stored("bing")).provider).toBe("bing");
  });

  it("falls back to the default for an unknown provider", () => {
    expect(mergeSettings(stored("nonsense")).provider).toBe(DEFAULT_SETTINGS.provider);
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

  it("defaults YouTube Subtitle to off / Vietnamese", () => {
    const merged = mergeSettings({});
    expect(merged.youtubeSubtitle).toBe(false);
    expect(merged.youtubeSubtitleLang).toBe("vi");
    expect(merged.youtubeSubtitleAutoOn).toBe(false);
  });

  it("sanitizes YouTube Subtitle settings", () => {
    const bad = mergeSettings({
      youtubeSubtitle: "yes",
      youtubeSubtitleLang: "auto",
      youtubeSubtitleAutoOn: 1
    } as unknown as StoredBlob);
    expect(bad.youtubeSubtitle).toBe(false);
    expect(bad.youtubeSubtitleLang).toBe("vi");
    expect(bad.youtubeSubtitleAutoOn).toBe(false);
    const good = mergeSettings({ youtubeSubtitle: true, youtubeSubtitleLang: "ja" });
    expect(good.youtubeSubtitle).toBe(true);
    expect(good.youtubeSubtitleLang).toBe("ja");
  });

  it("defaults aiProvider when missing", () => {
    expect(mergeSettings({}).aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
  });

  it("keeps a valid aiProvider", () => {
    expect(mergeSettings({ aiProvider: "auto-free" }).aiProvider).toBe("auto-free");
  });

  it("sanitizes malformed scalar settings", () => {
    const merged = mergeSettings({
      displayMode: "sideways",
      sourceLang: "invalid",
      targetLang: "auto",
      autoRule: "sometimes",
      selectionPopupTheme: "blue",
      selectionTrigger: "yes",
      showSelectionOriginal: 1,
      hostRules: { "good.test": "always", "bad.test": "sometimes" }
    } as unknown as StoredBlob);
    expect(merged.displayMode).toBe(DEFAULT_SETTINGS.displayMode);
    expect(merged.sourceLang).toBe(DEFAULT_SETTINGS.sourceLang);
    expect(merged.targetLang).toBe(DEFAULT_SETTINGS.targetLang);
    expect(merged.autoRule).toBe(DEFAULT_SETTINGS.autoRule);
    expect(merged.selectionPopupTheme).toBe(DEFAULT_SETTINGS.selectionPopupTheme);
    expect(merged.selectionTrigger).toBe(DEFAULT_SETTINGS.selectionTrigger);
    expect(merged.showSelectionOriginal).toBe(DEFAULT_SETTINGS.showSelectionOriginal);
    expect(merged.hostRules).toEqual({ "good.test": "always" });
  });

  it("migrates retired AI providers to the default AI model", () => {
    for (const retired of [
      "gemma",
      "qwen",
      "hy3",
      "mimo",
      "mistral",
      "ling",
      "deepseek",
      "gpt-oss"
    ]) {
      expect(mergeSettings(stored(retired)).provider).toBe(DEFAULT_SETTINGS.aiProvider);
      expect(mergeSettings({ aiProvider: retired } as unknown as StoredBlob).aiProvider).toBe(
        DEFAULT_SETTINGS.aiProvider
      );
    }
  });

  it("accepts an existing custom model as provider and aiProvider", () => {
    const blob = {
      provider: "custom:abc",
      aiProvider: "custom:abc",
      customModels: [{ id: "abc", name: "Mine", endpoint: "http://x/v1", apiKey: "k", model: "m" }]
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

  it("forces built-in AI configs back to the bundled defaults, ignoring stored overrides", () => {
    const merged = mergeSettings({
      providers: {
        google: {},
        ai: {
          "auto-free": { endpoint: "http://evil/v1", apiKey: "hacked", model: "x" }
        }
      }
    } as unknown as Parameters<typeof mergeSettings>[0]);
    expect(merged.providers.ai).toEqual(DEFAULT_SETTINGS.providers.ai);
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
      { id: "a", name: "A", endpoint: "http://a/v1", apiKey: "k", model: "m", noReasoning: false }
    ]);
  });

  it("keeps the noReasoning flag on custom models", () => {
    const blob = {
      customModels: [
        { id: "a", name: "A", endpoint: "http://a/v1", apiKey: "k", model: "m", noReasoning: true },
        { id: "b", name: "B", endpoint: "http://b/v1", apiKey: "k", model: "m", noReasoning: "yes" }
      ]
    } as unknown as Parameters<typeof mergeSettings>[0];
    const merged = mergeSettings(blob);
    expect(merged.customModels[0].noReasoning).toBe(true);
    expect(merged.customModels[1].noReasoning).toBe(false);
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
      model: "my-model",
      noReasoning: false
    });
  });

  it("removes API keys before settings are sent to content scripts", () => {
    const settings = mergeSettings({
      customModels: [
        {
          id: "x1",
          name: "Private",
          endpoint: "https://example.com/v1",
          apiKey: "sk-secret",
          model: "model"
        }
      ]
    });
    const sanitized = sanitizeSettingsForContent(settings);
    expect(sanitized.customModels[0].apiKey).toBe("");
    for (const config of Object.values(sanitized.providers.ai)) {
      expect(config.apiKey).toBe("");
    }
    expect(JSON.stringify(sanitized)).not.toContain("sk-secret");
  });

  it("falls back to the default for a non-AI / unknown aiProvider", () => {
    const blob = { aiProvider: "google" } as unknown as Parameters<typeof mergeSettings>[0];
    expect(mergeSettings(blob).aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
    const bogus = { aiProvider: "nonsense" } as unknown as Parameters<typeof mergeSettings>[0];
    expect(mergeSettings(bogus).aiProvider).toBe(DEFAULT_SETTINGS.aiProvider);
  });

  it("defaults aiTranslationMode when missing", () => {
    expect(mergeSettings({}).aiTranslationMode).toBe(DEFAULT_SETTINGS.aiTranslationMode);
  });

  it("keeps a valid aiTranslationMode and rejects unknown values", () => {
    expect(mergeSettings({ aiTranslationMode: "replace" }).aiTranslationMode).toBe("replace");
    expect(mergeSettings({ aiTranslationMode: "below" }).aiTranslationMode).toBe("below");
    const bogus = { aiTranslationMode: "sidebyside" } as unknown as Parameters<
      typeof mergeSettings
    >[0];
    expect(mergeSettings(bogus).aiTranslationMode).toBe(DEFAULT_SETTINGS.aiTranslationMode);
  });

  it("falls back to an enabled provider when google or auto-free is disabled", () => {
    const merged = mergeSettings({
      provider: "google",
      quickProvider: "google",
      aiProvider: "auto-free",
      disabledProviders: ["google", "auto-free"],
      customModels: [
        { id: "m1", name: "Mine", endpoint: "https://x.test/v1", apiKey: "k", model: "m" }
      ]
    });
    expect(merged.provider).toBe("bing");
    expect(merged.quickProvider).toBe("bing");
    expect(merged.aiProvider).toBe("custom:m1");
  });
});
