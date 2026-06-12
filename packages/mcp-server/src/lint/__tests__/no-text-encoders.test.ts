import { describe, it, expect } from "vitest";
import { noTextEncodersRule } from "../rules/no-text-encoders.js";

describe("no-text-encoders rule", () => {
  it.each([
    [`new TextEncoder().encode("x")`, "TextEncoder"],
    [`const d = new TextDecoder();`, "TextDecoder"],
    [`await crypto.subtle.digest("SHA-256", buf);`, "crypto.subtle"],
  ])("flags %s", (code, mention) => {
    const results = noTextEncodersRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain(mention);
  });

  it("does not flag arbitrary code", () => {
    expect(noTextEncodersRule.check(`const x = "encoder";`)).toEqual([]);
  });
});
