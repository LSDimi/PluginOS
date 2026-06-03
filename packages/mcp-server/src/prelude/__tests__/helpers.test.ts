import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { wrapScript } from "../index.js";

function makeContext(figma: object) {
  const ctx: Record<string, unknown> = { figma, console };
  vm.createContext(ctx);
  return ctx;
}

function runWith(figma: object, userJs: string): Record<string, unknown> {
  const ctx = makeContext(figma);
  const { wrapped } = wrapScript(`${userJs}\nglobalThis.__out = out;`);
  vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
  return ctx;
}

describe("createStyledText", () => {
  it("calls loadFontAsync, createText, setTextStyleIdAsync, and sets characters", async () => {
    const calls: string[] = [];
    const textNode: Record<string, unknown> = {
      setTextStyleIdAsync: async (id: string) => { calls.push("setTextStyle:" + id); },
      setFillStyleIdAsync: async (id: string) => { calls.push("setFill:" + id); },
    };
    const figma = {
      loadFontAsync: async (font: { family: string; style: string }) => { calls.push(`loadFont:${font.family}/${font.style}`); },
      createText: () => { calls.push("createText"); return textNode; },
    };
    const userJs = `
const out = await PluginOS.createStyledText({
  characters: "Hello",
  family: "Inter",
  weight: "Bold",
  size: 16,
  textStyleId: "tsid",
  fillStyleId: "fsid",
  name: "Title",
});
`;
    const ctx = runWith(figma, userJs);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toContain("loadFont:Inter/Bold");
    expect(calls).toContain("createText");
    expect(calls).toContain("setTextStyle:tsid");
    expect(calls).toContain("setFill:fsid");
    expect(textNode.characters).toBe("Hello");
    expect(textNode.name).toBe("Title");
    expect(ctx.__out).toBe(textNode);
  });

  it("throws when neither textStyleId nor family+size is provided", async () => {
    const figma = { loadFontAsync: async () => {}, createText: () => ({}) };
    const ctx = makeContext(figma);
    const { wrapped } = wrapScript(`
try {
  await PluginOS.createStyledText({ characters: "x" });
  globalThis.__err = null;
} catch (e) {
  globalThis.__err = String(e.message);
}
`);
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(String(ctx.__err)).toContain("[PluginOS.createStyledText]");
  });
});
