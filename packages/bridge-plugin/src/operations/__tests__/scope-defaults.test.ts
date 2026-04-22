import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOperationContext } from "../context";

// Minimal figma global mock
const mockFigma = {
  currentPage: {
    selection: [] as any[],
    findAll: vi.fn(() => []),
    children: [] as any[],
    name: "Page 1",
  },
};

beforeEach(() => {
  (globalThis as any).figma = mockFigma;
  mockFigma.currentPage.selection = [];
});

describe("no_selection error behavior", () => {
  it("returns no_selection error when defaultScope is 'selection' and selection is empty", () => {
    const ctx = createOperationContext({}, "selection");
    expect(ctx.guard).toEqual({
      error: "no_selection",
      _hint: expect.stringContaining("Nothing is selected"),
    });
  });

  it("does NOT return no_selection error when explicit scope is 'page'", () => {
    const ctx = createOperationContext({ scope: "page" }, "selection");
    expect(ctx.guard).toBeUndefined();
  });

  it("does NOT return no_selection error when selection is non-empty", () => {
    mockFigma.currentPage.selection = [{ id: "1" } as any];
    const ctx = createOperationContext({}, "selection");
    expect(ctx.guard).toBeUndefined();
  });
});
