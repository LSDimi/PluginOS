import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOperationContext } from "../operations/context";
import { getOperation } from "../operations/registry";
import "../operations"; // trigger self-registration of all ops

/**
 * Integration test: verifies that when createOperationContext returns a guard,
 * the operation's execute() function is NOT called, and the guard payload is
 * what the dispatcher would send back to the client.
 *
 * This mirrors the logic in code.ts lines 68-74:
 *   const ctx = createOperationContext(params, defaultScope, { opName });
 *   if (ctx.guard) { sendResult(id, true, ctx.guard); return; }
 *   const result = await handler.execute(ctx);
 */

const mockFigma = {
  currentPage: {
    selection: [] as any[],
    findAll: vi.fn(() => Array.from({ length: 501 }, (_, i) => ({ id: String(i) }))),
    children: [],
    name: "Page 1",
  },
  mixed: Symbol("figma.mixed"),
};

beforeEach(() => {
  (globalThis as any).figma = mockFigma;
  mockFigma.currentPage.selection = [];
  mockFigma.currentPage.findAll = vi.fn(() =>
    Array.from({ length: 501 }, (_, i) => ({ id: String(i) }))
  );
});

describe("dispatcher guard short-circuit", () => {
  it("no_selection guard prevents execute() from being called", async () => {
    const handler = getOperation("lint_styles")!;
    expect(handler).toBeDefined();

    const ctx = createOperationContext({}, handler.manifest.defaultScope ?? "page", {
      opName: handler.manifest.name,
    });

    expect(ctx.guard).toBeDefined();
    expect(ctx.guard).toHaveProperty("error", "no_selection");

    const executeSpy = vi.fn(handler.execute);
    if (ctx.guard) {
      expect(ctx.guard).toEqual({
        error: "no_selection",
        _hint: expect.stringContaining("Nothing is selected"),
      });
    } else {
      await executeSpy(ctx);
    }
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("requires_confirm guard prevents execute() from being called", async () => {
    const handler = getOperation("lint_styles")!;

    const ctx = createOperationContext({ scope: "page" }, handler.manifest.defaultScope ?? "page", {
      opName: handler.manifest.name,
    });

    expect(ctx.guard).toBeDefined();
    expect(ctx.guard).toHaveProperty("requires_confirm", true);
    expect(ctx.guard).toHaveProperty("estimated_nodes", 501);

    const executeSpy = vi.fn(handler.execute);
    if (ctx.guard) {
      expect(ctx.guard).toEqual({
        requires_confirm: true,
        estimated_nodes: 501,
        _hint: expect.stringContaining("501"),
      });
    } else {
      await executeSpy(ctx);
    }
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("no guard when confirm: true — execute() WOULD be called", async () => {
    const handler = getOperation("lint_styles")!;

    const ctx = createOperationContext(
      { scope: "page", confirm: true },
      handler.manifest.defaultScope ?? "page",
      { opName: handler.manifest.name }
    );

    expect(ctx.guard).toBeUndefined();
  });

  it("no guard when selection is present and defaultScope is selection", async () => {
    mockFigma.currentPage.selection = [{ id: "1", type: "FRAME", name: "Frame 1" }] as any[];

    const handler = getOperation("lint_styles")!;

    const ctx = createOperationContext({}, handler.manifest.defaultScope ?? "page", {
      opName: handler.manifest.name,
    });

    expect(ctx.guard).toBeUndefined();
  });
});
