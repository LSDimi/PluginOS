import { describe, it, expect, beforeEach } from "vitest";
import { collectInstanceComponentNames, checkDetached } from "../checks/detached";
import { checkNaming } from "../checks/naming";
import { checkContrast } from "../checks/contrast";

const mockFigma = { mixed: Symbol("figma.mixed") };
beforeEach(() => {
  (globalThis as any).figma = mockFigma;
});

describe("checkDetached", () => {
  it("flags a FRAME whose name matches a live instance component name", () => {
    const nodes = [
      { id: "i", name: "Button", type: "INSTANCE" },
      { id: "f", name: "Button", type: "FRAME", parent: { name: "Page" } },
    ] as any;
    const names = collectInstanceComponentNames(nodes);
    expect(checkDetached(nodes[1], names)[0]).toMatchObject({
      check: "detached",
      meta: { parentName: "Page" },
    });
    expect(checkDetached(nodes[0], names)).toEqual([]);
  });
});

describe("checkNaming", () => {
  it("flags default names only", () => {
    expect(checkNaming({ id: "1", name: "Frame 12", type: "FRAME" } as any)).toHaveLength(1);
    expect(checkNaming({ id: "2", name: "Hero", type: "FRAME" } as any)).toEqual([]);
  });
});

describe("checkContrast", () => {
  it("computes ratio and AA pass/fail for a text node", () => {
    const node = {
      id: "t",
      name: "T",
      type: "TEXT",
      characters: "Hi",
      opacity: 1,
      fontSize: 16,
      fontWeight: 400,
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
      parent: {
        fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
        parent: null,
      },
    } as any;
    const r = checkContrast(node)!;
    expect(r.aa_pass).toBe(true);
    expect(r.ratio).toBeGreaterThan(20);
  });
  it("returns null for non-text nodes", () => {
    expect(checkContrast({ id: "r", name: "R", type: "RECTANGLE" } as any)).toBeNull();
  });
  it("does not throw when fills is figma.mixed (a Symbol) — returns null", () => {
    const node = {
      id: "t",
      name: "T",
      type: "TEXT",
      characters: "Hi",
      opacity: 1,
      fontSize: 16,
      fontWeight: 400,
      fills: Symbol("figma.mixed"),
      parent: {
        fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
        parent: null,
      },
    } as any;
    expect(() => checkContrast(node)).not.toThrow();
    expect(checkContrast(node)).toBeNull();
  });
  it("does not throw when a fills array contains a null element", () => {
    const node = {
      id: "t",
      name: "T",
      type: "TEXT",
      characters: "Hi",
      opacity: 1,
      fontSize: 16,
      fontWeight: 400,
      fills: [null, { type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
      parent: {
        fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
        parent: null,
      },
    } as any;
    expect(() => checkContrast(node)).not.toThrow();
    expect(checkContrast(node)!.aa_pass).toBe(true);
  });
});
