import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkStyleBinding } from "../checks/style";
import { getOperation } from "../index";

const mockFigma = { mixed: Symbol("figma.mixed") };
beforeEach(() => {
  (globalThis as any).figma = mockFigma;
});

function rawFillNode() {
  return {
    id: "r",
    name: "raw",
    type: "RECTANGLE",
    fillStyleId: "",
    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }],
  } as any;
}
function varFillNode() {
  return {
    id: "v",
    name: "bound",
    type: "RECTANGLE",
    fillStyleId: "",
    fills: [
      {
        type: "SOLID",
        visible: true,
        color: { r: 0, g: 0, b: 0 },
        boundVariables: { color: { id: "V:1" } },
      },
    ],
  } as any;
}

describe("checkStyleBinding", () => {
  it("flags a raw fill with hex, not a variable-bound fill", () => {
    expect(checkStyleBinding(rawFillNode()).map((f) => f.detail)).toEqual(["Fill without style"]);
    expect(checkStyleBinding(rawFillNode())[0].meta).toMatchObject({
      property: "fill",
      hex: "#ff0000",
    });
    expect(checkStyleBinding(varFillNode())).toEqual([]);
  });
});

describe("lint_styles + find_non_style_colors are variable-aware", () => {
  it("lint_styles does not flag variable-bound fills", async () => {
    (globalThis as any).figma.currentPage = {
      selection: [varFillNode(), rawFillNode()],
      findAll: vi.fn(),
    };
    const result: any = await getOperation("lint_styles")!.execute({
      nodes: [varFillNode(), rawFillNode()],
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);
    expect(result.total_issues).toBe(1);
    expect(result.issues[0].binding).toBe("raw");
  });

  it("find_non_style_colors excludes variable-bound fills", async () => {
    const result: any = await getOperation("find_non_style_colors")!.execute({
      nodes: [varFillNode(), rawFillNode()],
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);
    expect(result.count).toBe(1);
    expect(result.violations[0].hex).toBe("#ff0000");
  });
});
