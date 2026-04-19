import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOperation } from "../registry";
import "../lint";
import "../accessibility";
import "../tokens";
import "../colors";

const mockFigma = {
  currentPage: {
    selection: [{ id: "1", type: "FRAME", fills: [], fillStyleId: "", strokes: [], strokeStyleId: "", effects: [], effectStyleId: "" }],
    findAll: vi.fn(() => [{ id: "1", type: "FRAME" }]),
    children: [],
    name: "P",
  },
  mixed: Symbol("figma.mixed"),
  variables: {
    getLocalVariableCollectionsAsync: vi.fn(async () => []),
    getVariableByIdAsync: vi.fn(async () => null),
  },
};
beforeEach(() => { (globalThis as any).figma = mockFigma; });

const expectNextHints = async (op: string, expected: string[]) => {
  const handler = getOperation(op)!;
  const result: any = await handler.execute({
    nodes: mockFigma.currentPage.selection,
    figma: mockFigma as any,
    params: {},
    MAX_RESULTS: 200,
  } as any);
  expect(result._next_hints).toEqual(expected);
};

describe("_next_hints protocol", () => {
  it("lint_styles → [lint_detached, check_contrast]", () => expectNextHints("lint_styles", ["lint_detached", "check_contrast"]));
  it("lint_detached → [analyze_overrides]", () => expectNextHints("lint_detached", ["analyze_overrides"]));
  it("check_contrast → [check_touch_targets]", () => expectNextHints("check_contrast", ["check_touch_targets"]));
  it("list_variables → [export_tokens, find_non_style_colors]", () => expectNextHints("list_variables", ["export_tokens", "find_non_style_colors"]));
  it("extract_palette → [find_non_style_colors]", () => expectNextHints("extract_palette", ["find_non_style_colors"]));
});
