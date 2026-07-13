import { describe, it, expect, vi } from "vitest";
import { resolvePageTarget, createOperationContext } from "../context";

function makeFigma(pages: Array<{ id: string; name: string; nodes: any[] }>) {
  return {
    mixed: Symbol("figma.mixed"),
    loadAllPagesAsync: vi.fn(async () => {}),
    root: {
      children: pages.map((p) => ({
        type: "PAGE",
        id: p.id,
        name: p.name,
        findAll: () => p.nodes,
      })),
    },
    currentPage: { selection: [], findAll: () => [] },
  } as any;
}

describe("resolvePageTarget", () => {
  it("returns null when no page params are given", async () => {
    expect(await resolvePageTarget({}, makeFigma([]))).toBeNull();
  });

  it("resolves a page by name without changing currentPage", async () => {
    const figma = makeFigma([{ id: "1:0", name: "Screens", nodes: [{ id: "a" }] }]);
    const res = await resolvePageTarget({ page_name: "Screens" }, figma);
    expect(res!.nodes).toHaveLength(1);
    expect(res!.pageName).toBe("Screens");
    expect(figma.setCurrentPageAsync).toBeUndefined();
  });

  it("returns an error value with available_pages when not found", async () => {
    const figma = makeFigma([{ id: "1:0", name: "Screens", nodes: [] }]);
    const res = await resolvePageTarget({ page_name: "Nope" }, figma);
    expect(res!.error).toContain("not found");
    expect(res!.available_pages).toEqual(["Screens"]);
  });
});

describe("createOperationContext preResolvedNodes", () => {
  it("uses pre-resolved nodes instead of currentPage", () => {
    (globalThis as any).figma = makeFigma([]);
    const ctx = createOperationContext({ scope: "page" }, "page", {
      preResolvedNodes: [{ id: "x" }] as any,
    });
    expect(ctx.nodes).toHaveLength(1);
  });
});
