import { describe, it, expect, beforeAll } from "vitest";
import { listOperations } from "../operations/registry";
import "../operations"; // trigger self-registration of all ops

const FLIPPED = [
  "lint_styles",
  "lint_detached",
  "lint_naming",
  "check_contrast",
  "check_touch_targets",
  "audit_spacing",
  "audit_text_styles",
  "find_non_style_colors",
  "analyze_overrides",
] as const;

describe("defaultScope on flipped ops", () => {
  beforeAll(() => {
    // Some ops' registration modules touch the figma global during evaluation
    // (e.g., via captured refs in strings). Ensure a minimal global is present.
    (globalThis as any).figma = (globalThis as any).figma ?? {
      currentPage: { selection: [], findAll: () => [], children: [], name: "P" },
      mixed: Symbol("figma.mixed"),
    };
  });

  it.each(FLIPPED)("%s has defaultScope: 'selection'", (opName) => {
    const manifest = listOperations().find((m) => m.name === opName);
    expect(manifest, `manifest for ${opName} missing`).toBeDefined();
    expect(manifest!.defaultScope).toBe("selection");
  });

  it.each(FLIPPED)("%s description mentions 'Defaults to selection'", (opName) => {
    const manifest = listOperations().find((m) => m.name === opName);
    expect(manifest, `manifest for ${opName} missing`).toBeDefined();
    expect(manifest!.description).toMatch(/Defaults to selection/i);
  });
});
