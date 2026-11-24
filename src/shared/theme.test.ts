import { describe, expect, it } from "vitest";
import { cycleThemeMode, resolveTheme } from "./theme";

describe("theme helpers", () => {
  it("resolves explicit light and dark modes regardless of system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows system preference when mode is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("cycles system -> light -> dark -> system", () => {
    expect(cycleThemeMode("system")).toBe("light");
    expect(cycleThemeMode("light")).toBe("dark");
    expect(cycleThemeMode("dark")).toBe("system");
  });
});
