import { describe, expect, it } from "vitest";
import { toBingCode, parseBootstrapTokens } from "./bing";

describe("toBingCode", () => {
  it("maps auto to the Bing auto-detect sentinel", () => {
    expect(toBingCode("auto")).toBe("auto-detect");
  });

  it("maps Chinese variants to Microsoft script codes", () => {
    expect(toBingCode("zh-CN")).toBe("zh-Hans");
    expect(toBingCode("zh-TW")).toBe("zh-Hant");
  });

  it("passes other codes through unchanged", () => {
    expect(toBingCode("vi")).toBe("vi");
    expect(toBingCode("en")).toBe("en");
  });
});

describe("parseBootstrapTokens", () => {
  const SAMPLE = `
    <html>
    <head><script>var IG:"ABCD1234";</script></head>
    <body data-iid="translator.5012">
      <script>
        var params_AbusePreventionHelper = [9876543210,"abc-token-XYZ",3600000];
      </script>
    </body></html>
  `;

  it("extracts ig, iid, key, token and ttl from the translator HTML", () => {
    const parsed = parseBootstrapTokens(SAMPLE);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({
      ig: "ABCD1234",
      iid: "translator.5012",
      key: "9876543210",
      token: "abc-token-XYZ",
      ttlMs: 3600000
    });
  });

  it("returns null when IG is missing", () => {
    const html = SAMPLE.replace(/IG:"ABCD1234";/, "");
    expect(parseBootstrapTokens(html)).toBeNull();
  });

  it("returns null when the abuse-prevention helper tuple is missing", () => {
    const html = SAMPLE.replace(/var params_AbusePreventionHelper[\s\S]*?];/, "");
    expect(parseBootstrapTokens(html)).toBeNull();
  });

  it("falls back to a 30-minute ttl when the third helper field is not a number", () => {
    const html = `
      <script>IG:"IG1";</script>
      <body data-iid="iid.1">
        <script>var params_AbusePreventionHelper = [111,"tok","not-a-number"];</script>
      </body>
    `;
    expect(parseBootstrapTokens(html)?.ttlMs).toBe(30 * 60 * 1000);
  });

  it("returns null when the key or token is empty", () => {
    const html = `
      <script>IG:"IG1";</script>
      <body data-iid="iid.1">
        <script>var params_AbusePreventionHelper = [,"tok",3600000];</script>
      </body>
    `;
    expect(parseBootstrapTokens(html)).toBeNull();
  });
});
