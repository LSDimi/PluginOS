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
      setTextStyleIdAsync: async (id: string) => {
        calls.push("setTextStyle:" + id);
      },
      setFillStyleIdAsync: async (id: string) => {
        calls.push("setFill:" + id);
      },
    };
    const figma = {
      loadFontAsync: async (font: { family: string; style: string }) => {
        calls.push(`loadFont:${font.family}/${font.style}`);
      },
      createText: () => {
        calls.push("createText");
        return textNode;
      },
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

describe("bindSpacing", () => {
  it("binds all four padding fields when given `padding`", async () => {
    const bound: Array<[string, string]> = [];
    const node = {
      layoutMode: "VERTICAL",
      setBoundVariable: (field: string, v: { id: string }) => bound.push([field, v.id]),
    };
    const figma = {};
    const ctx = makeContext(figma);
    const { wrapped } = wrapScript(`
const node = globalThis.__node;
await PluginOS.bindSpacing(node, { padding: { id: "v1" } });
`);
    (ctx as Record<string, unknown>).__node = node;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    const fields = bound.map(([f]) => f).sort();
    expect(fields).toEqual(["paddingBottom", "paddingLeft", "paddingRight", "paddingTop"]);
    expect(bound.every(([, id]) => id === "v1")).toBe(true);
  });

  it("specificity: paddingTop overrides padding", async () => {
    const bound: Array<[string, string]> = [];
    const node = {
      layoutMode: "VERTICAL",
      setBoundVariable: (field: string, v: { id: string }) => bound.push([field, v.id]),
    };
    const ctx = makeContext({});
    const { wrapped } = wrapScript(`
await PluginOS.bindSpacing(globalThis.__node, { padding: { id: "all" }, paddingTop: { id: "top" } });
`);
    (ctx as Record<string, unknown>).__node = node;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    const top = bound.find(([f]) => f === "paddingTop");
    expect(top).toEqual(["paddingTop", "top"]);
  });

  it("no-ops on non-autolayout node", async () => {
    const bound: Array<[string, string]> = [];
    const node = {
      layoutMode: "NONE",
      setBoundVariable: (field: string, v: { id: string }) => bound.push([field, v.id]),
    };
    const ctx = makeContext({});
    const { wrapped } = wrapScript(`
await PluginOS.bindSpacing(globalThis.__node, { padding: { id: "v1" } });
`);
    (ctx as Record<string, unknown>).__node = node;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(bound).toEqual([]);
  });
});

describe("combineAsVariantsTiled", () => {
  it("calls combineAsVariants and sets layout fields", async () => {
    const set: Record<string, unknown> = {
      resize: function (w: number, h: number) {
        this.width = w;
        this.height = h;
      },
    };
    set.width = 0;
    set.height = 0;
    const calls: string[] = [];
    const figma = {
      combineAsVariants: (cells: unknown[], _parent: unknown) => {
        calls.push("combine:" + cells.length);
        return set;
      },
    };
    const cells = [
      { width: 100, height: 50 },
      { width: 100, height: 50 },
      { width: 100, height: 50 },
      { width: 100, height: 50 },
    ];
    const ctx = makeContext(figma);
    const { wrapped } = wrapScript(`
const set = PluginOS.combineAsVariantsTiled(globalThis.__cells, {}, { cols: 2, gutter: 10 });
globalThis.__out = set;
`);
    (ctx as Record<string, unknown>).__cells = cells;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toContain("combine:4");
    expect(set.layoutMode).toBe("HORIZONTAL");
    expect(set.layoutWrap).toBe("WRAP");
    expect(set.itemSpacing).toBe(10);
    expect(set.primaryAxisSizingMode).toBe("FIXED");
    expect(set.counterAxisSizingMode).toBe("AUTO");
    expect(set.width).toBeGreaterThan(0);
    expect(ctx.__out).toBe(set);
  });
});

describe("tileTopLevel", () => {
  it("places nodes in a grid with the configured cols and gutter", async () => {
    const appended: unknown[] = [];
    const page = { appendChild: (n: unknown) => appended.push(n) };
    const nodes = [
      { width: 100, height: 50, x: 0, y: 0 },
      { width: 100, height: 50, x: 0, y: 0 },
      { width: 100, height: 50, x: 0, y: 0 },
      { width: 100, height: 50, x: 0, y: 0 },
    ];
    const ctx = makeContext({});
    const { wrapped } = wrapScript(`
const place = PluginOS.tileTopLevel(globalThis.__page, { cols: 2, gutter: 10 });
globalThis.__nodes.forEach(place);
`);
    (ctx as Record<string, unknown>).__page = page;
    (ctx as Record<string, unknown>).__nodes = nodes;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
    expect(nodes[1].x).toBe(110);
    expect(nodes[1].y).toBe(0);
    expect(nodes[2].x).toBe(0);
    expect(nodes[2].y).toBe(60);
    expect(nodes[3].x).toBe(110);
    expect(nodes[3].y).toBe(60);
    expect(appended).toEqual(nodes);
  });
});

describe("layoutSpaceBetween", () => {
  it("for 2 children, picks the last child as grow target (non-TEXT → layoutGrow=1)", async () => {
    const left = { type: "FRAME", layoutGrow: 0 };
    const right = { type: "FRAME", layoutGrow: 0 };
    const frame: Record<string, unknown> = { primaryAxisAlignItems: "INIT" };
    const ctx = makeContext({});
    const { wrapped } = wrapScript(`
PluginOS.layoutSpaceBetween(globalThis.__frame, { children: [globalThis.__left, globalThis.__right] });
`);
    (ctx as Record<string, unknown>).__frame = frame;
    (ctx as Record<string, unknown>).__left = left;
    (ctx as Record<string, unknown>).__right = right;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(frame.primaryAxisAlignItems).toBe("MIN");
    expect(right.layoutGrow).toBe(1);
    expect(left.layoutGrow).toBe(0);
  });

  it("for TEXT grow target, uses layoutSizingHorizontal=FILL", async () => {
    const left = { type: "TEXT", layoutSizingHorizontal: "HUG" };
    const right = { type: "FRAME", layoutGrow: 0 };
    const frame: Record<string, unknown> = {};
    const ctx = makeContext({});
    const { wrapped } = wrapScript(`
PluginOS.layoutSpaceBetween(globalThis.__frame, { growChild: globalThis.__left });
`);
    (ctx as Record<string, unknown>).__frame = frame;
    (ctx as Record<string, unknown>).__left = left;
    (ctx as Record<string, unknown>).__right = right;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(left.layoutSizingHorizontal).toBe("FILL");
  });

  it("for 3 children, picks the middle child", async () => {
    const a = { type: "FRAME", layoutGrow: 0 };
    const b = { type: "FRAME", layoutGrow: 0 };
    const c = { type: "FRAME", layoutGrow: 0 };
    const frame: Record<string, unknown> = {};
    const ctx = makeContext({});
    const { wrapped } = wrapScript(`
PluginOS.layoutSpaceBetween(globalThis.__frame, { children: [globalThis.__a, globalThis.__b, globalThis.__c] });
`);
    (ctx as Record<string, unknown>).__frame = frame;
    (ctx as Record<string, unknown>).__a = a;
    (ctx as Record<string, unknown>).__b = b;
    (ctx as Record<string, unknown>).__c = c;
    vm.runInContext(`(async()=>{${wrapped}})()`, ctx);
    await new Promise((r) => setTimeout(r, 10));
    expect(b.layoutGrow).toBe(1);
    expect(a.layoutGrow).toBe(0);
    expect(c.layoutGrow).toBe(0);
  });
});
