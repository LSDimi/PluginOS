import { describe, it, expect } from "vitest";
import { generateRecipesSection } from "../scripts/sync-recipes.ts";

describe("sync-recipes generator", () => {
  it("includes all five helpers", () => {
    const section = generateRecipesSection();
    expect(section).toContain("PluginOS.createStyledText");
    expect(section).toContain("PluginOS.bindSpacing");
    expect(section).toContain("PluginOS.combineAsVariantsTiled");
    expect(section).toContain("PluginOS.tileTopLevel");
    expect(section).toContain("PluginOS.layoutSpaceBetween");
  });

  it("starts with the section header", () => {
    expect(generateRecipesSection()).toMatch(/^## Recipes for bulk-seed scripts/m);
  });
});
