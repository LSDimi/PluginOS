import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOperation } from "../index";

const mockFigma = { mixed: Symbol("figma.mixed") };
beforeEach(() => {
  (globalThis as any).figma = mockFigma;
});

function fixture() {
  return [
    // raw fill → P1 style
    {
      id: "raw",
      name: "raw",
      type: "RECTANGLE",
      fillStyleId: "",
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }],
    },
    // default name → P3 naming
    { id: "fn", name: "Frame 3", type: "FRAME", layoutMode: "NONE" },
    // off-grid auto-layout → P2 spacing
    {
      id: "al",
      name: "Row",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      itemSpacing: 9,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      counterAxisSpacing: null,
    },
    // failing contrast → P0 (black on black)
    {
      id: "tx",
      name: "T",
      type: "TEXT",
      characters: "Hi",
      opacity: 1,
      fontSize: 12,
      fontWeight: 400,
      textStyleId: "T:1",
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
      parent: {
        fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
        parent: null,
      },
    },
  ] as any;
}

describe("validate_ds_compliance", () => {
  it("returns findings bucketed by severity across all five checks in one call", async () => {
    const nodes = fixture();
    const findAll = vi.fn(() => nodes);
    (globalThis as any).figma.currentPage = { selection: nodes, findAll };
    const result: any = await getOperation("validate_ds_compliance")!.execute({
      nodes,
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);

    expect(result.total_nodes).toBe(4);
    expect(result.counts.style).toBe(1);
    expect(result.counts.naming).toBe(1);
    expect(result.counts.spacing).toBe(1);
    expect(result.counts.contrast).toBe(1);
    expect(result.by_severity.P0).toHaveLength(1);
    expect(result.by_severity.P1).toHaveLength(1);
    expect(result.by_severity.P2).toHaveLength(1);
    expect(result.by_severity.P3).toHaveLength(1);
  });

  it("caps findings at MAX_RESULTS, P0 first", async () => {
    const nodes = fixture();
    const result: any = await getOperation("validate_ds_compliance")!.execute({
      nodes,
      params: {},
      MAX_RESULTS: 1,
      figma: mockFigma,
    } as any);
    expect(result.by_severity.P0).toHaveLength(1);
    expect(result.by_severity.P1).toHaveLength(0);
  });

  it("does not set _hint when nothing is truncated", async () => {
    const nodes = fixture();
    const result: any = await getOperation("validate_ds_compliance")!.execute({
      nodes,
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);
    expect(result._hint).toBeUndefined();
  });

  it("signals truncation via _hint when total findings exceed MAX_RESULTS", async () => {
    const contrastNodes = Array.from({ length: 205 }, (_, i) => ({
      id: `tx${i}`,
      name: "T",
      type: "TEXT",
      characters: "Hi",
      opacity: 1,
      fontSize: 12,
      fontWeight: 400,
      textStyleId: "T:1",
      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
      parent: {
        fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
        parent: null,
      },
    }));
    const styleNode = {
      id: "raw",
      name: "raw",
      type: "RECTANGLE",
      fillStyleId: "",
      fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }],
    };
    const nodes = [...contrastNodes, styleNode] as any;

    const result: any = await getOperation("validate_ds_compliance")!.execute({
      nodes,
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);

    expect(result.counts.contrast).toBe(205);
    expect(result.counts.style).toBe(1);
    expect(result.by_severity.P0).toHaveLength(200);
    expect(result.by_severity.P1).toHaveLength(0);
    expect(result._hint).toMatch(/Showing 200 of 206 findings/);
  });
});
