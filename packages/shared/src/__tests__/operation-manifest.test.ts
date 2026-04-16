import { describe, it, expect, expectTypeOf } from "vitest";
import type { OperationManifest } from "../types.js";

describe("OperationManifest.defaultScope", () => {
  it("defaultScope is optional on the type", () => {
    // A manifest without defaultScope must still compile (field is optional)
    const withoutDefault: OperationManifest = {
      name: "test_op",
      description: "Test operation",
      category: "lint",
      params: {},
      returns: "{}",
    };
    expect(withoutDefault.defaultScope).toBeUndefined();
  });

  it('defaultScope accepts "page"', () => {
    const m: OperationManifest = {
      name: "test_op",
      description: "Test",
      category: "colors",
      params: {},
      returns: "{}",
      defaultScope: "page",
    };
    expect(m.defaultScope).toBe("page");
  });

  it('defaultScope accepts "selection"', () => {
    const m: OperationManifest = {
      name: "extract_css",
      description: "Extract CSS",
      category: "export",
      params: {},
      returns: "{}",
      defaultScope: "selection",
    };
    expect(m.defaultScope).toBe("selection");
  });

  it("defaultScope type is correctly narrowed", () => {
    expectTypeOf<OperationManifest["defaultScope"]>().toEqualTypeOf<
      "page" | "selection" | undefined
    >();
  });
});
