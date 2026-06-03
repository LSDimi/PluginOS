import { describe, it, expect } from "vitest";
import { wrapScript, PRELUDE_VERSION } from "../index.js";

describe("wrapScript", () => {
  it("returns wrapped with userJs after prelude", () => {
    const userJs = `return figma.currentPage.name;`;
    const { wrapped } = wrapScript(userJs);
    expect(wrapped.endsWith(userJs)).toBe(true);
    expect(wrapped).toContain("PluginOS");
  });

  it("reports prelude line count consistent with prelude size", () => {
    const { wrapped, preludeLineCount } = wrapScript(`x`);
    const lines = wrapped.split("\n");
    expect(lines[preludeLineCount]).toBe("x");
  });

  it("exports a non-empty PRELUDE_VERSION", () => {
    expect(PRELUDE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
