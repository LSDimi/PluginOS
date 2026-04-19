import { registerOperation } from "./registry";
import type { OperationContext } from "./context";
import { withHint } from "@pluginos/shared";

function rgbToHex(r: number, g: number, b: number): string {
  var toHex = function (c: number) {
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// --- extract_palette ---
registerOperation({
  manifest: {
    name: "extract_palette",
    description:
      "Extract all unique solid fill colors used on the current page, with usage counts and which nodes use them.",
    category: "colors" as const,
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ colors: Array<{hex, count, nodeIds}>, total_unique, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    var colorMap = new Map<string, { hex: string; count: number; nodeIds: string[] }>();

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!("fills" in node)) continue;
      var fills = (node as GeometryMixin).fills;
      if (!Array.isArray(fills)) continue;
      for (var j = 0; j < fills.length; j++) {
        var fill = fills[j];
        if (fill.type === "SOLID" && fill.visible !== false) {
          var hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          var entry = colorMap.get(hex) || { hex: hex, count: 0, nodeIds: [] };
          entry.count++;
          if (entry.nodeIds.length < 10) entry.nodeIds.push(node.id);
          colorMap.set(hex, entry);
        }
      }
    }

    var colors = Array.from(colorMap.values()).sort(function (a, b) {
      return b.count - a.count;
    });
    var result = {
      colors: colors.slice(0, MAX_RESULTS),
      total_unique: colors.length,
      summary: "Found " + colors.length + " unique colors across " + nodes.length + " nodes.",
    };
    return withHint(result, undefined, ["find_non_style_colors"]);
  },
});

// --- find_non_style_colors ---
registerOperation({
  manifest: {
    name: "find_non_style_colors",
    description:
      "Find all nodes using hardcoded fill colors that are not linked to a local or library style. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "colors" as const,
    defaultScope: "selection",
    params: {
      scope: { type: "string", required: false, description: "'selection' (default) or 'page'" },
    },
    returns: "{ violations: Array<{nodeId, nodeName, hex}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    var violations: { nodeId: string; nodeName: string; hex: string }[] = [];

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!("fills" in node) || !("fillStyleId" in node)) continue;
      var styleId = (node as any).fillStyleId;
      if (styleId && styleId !== "" && styleId !== figma.mixed) continue;

      var fills = (node as GeometryMixin).fills;
      if (!Array.isArray(fills)) continue;
      for (var j = 0; j < fills.length; j++) {
        var fill = fills[j];
        if (fill.type === "SOLID" && fill.visible !== false) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            hex: rgbToHex(fill.color.r, fill.color.g, fill.color.b),
          });
          break;
        }
      }
    }

    return {
      violations: violations.slice(0, MAX_RESULTS),
      count: violations.length,
      summary: "Found " + violations.length + " nodes with hardcoded colors (no style linked).",
    };
  },
});
