import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOperationContext, PAGE_SCAN_CONFIRM_THRESHOLD, GUARDED_OPS } from "../context";

const mockFigma = {
  currentPage: {
    selection: [] as any[],
    findAll: vi.fn(() => Array.from({ length: 501 }, (_, i) => ({ id: String(i) }))),
    children: [],
    name: "Page 1",
  },
};
beforeEach(() => {
  (globalThis as any).figma = mockFigma;
});

describe("page scan guard", () => {
  it("triggers requires_confirm when scope=page and node count > threshold and op is guarded", () => {
    const ctx = createOperationContext({ scope: "page" }, "page", { opName: "lint_styles" });
    expect(ctx.guard).toEqual({
      requires_confirm: true,
      estimated_nodes: 501,
      _hint: expect.stringContaining("501"),
    });
  });

  it("does NOT trigger when confirm: true is passed", () => {
    const ctx = createOperationContext({ scope: "page", confirm: true }, "page", {
      opName: "lint_styles",
    });
    expect(ctx.guard).toBeUndefined();
  });

  it("does NOT trigger when node count is below threshold", () => {
    mockFigma.currentPage.findAll = vi.fn(() =>
      Array.from({ length: 10 }, (_, i) => ({ id: String(i) }))
    );
    const ctx = createOperationContext({ scope: "page" }, "page", { opName: "lint_styles" });
    expect(ctx.guard).toBeUndefined();
  });

  it("does NOT trigger for non-guarded ops (e.g., extract_palette)", () => {
    mockFigma.currentPage.findAll = vi.fn(() =>
      Array.from({ length: 501 }, (_, i) => ({ id: String(i) }))
    );
    const ctx = createOperationContext({ scope: "page" }, "page", { opName: "extract_palette" });
    expect(ctx.guard).toBeUndefined();
  });

  it("exposes the threshold constant as 500", () => {
    expect(PAGE_SCAN_CONFIRM_THRESHOLD).toBe(500);
  });

  it("exposes GUARDED_OPS set containing the 9 flipped ops", () => {
    [
      "lint_styles",
      "lint_detached",
      "lint_naming",
      "check_contrast",
      "check_touch_targets",
      "audit_spacing",
      "audit_text_styles",
      "find_non_style_colors",
      "analyze_overrides",
    ].forEach((op) => {
      expect(GUARDED_OPS.has(op)).toBe(true);
    });
  });
});
