// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, attachThemeListener } from "../../ui/theme";

describe("theme detection", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies dark theme when set", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies light theme when set", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("switches when listener receives plugin THEME_CHANGE message", () => {
    attachThemeListener();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { pluginMessage: { type: "THEME_CHANGE", theme: "dark" } },
      }),
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("ignores unknown theme values from listener", () => {
    applyTheme("light");
    attachThemeListener();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { pluginMessage: { type: "THEME_CHANGE", theme: "sepia" } },
      }),
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
