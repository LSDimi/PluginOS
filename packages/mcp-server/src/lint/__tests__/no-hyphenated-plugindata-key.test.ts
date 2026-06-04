import { describe, it, expect } from "vitest";
import { noHyphenatedPluginDataKeyRule } from "../rules/no-hyphenated-plugindata-key.js";

describe("no-hyphenated-plugindata-key rule", () => {
  it("flags hyphen in setPluginData key", () => {
    const code = `figma.root.setPluginData("my-key", "value");`;
    const results = noHyphenatedPluginDataKeyRule.check(code);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
    expect(results[0].fix).toContain("my_key");
  });

  it("flags hyphen in setSharedPluginData key", () => {
    const code = `node.setSharedPluginData("ns", "shared-key", "v");`;
    expect(noHyphenatedPluginDataKeyRule.check(code)).toHaveLength(1);
  });

  it("does not flag valid keys", () => {
    expect(noHyphenatedPluginDataKeyRule.check(`figma.root.setPluginData("my_key", "v");`)).toEqual(
      []
    );
  });
});
