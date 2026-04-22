import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

// --- audit_text_styles ---
registerOperation({
  manifest: {
    name: "audit_text_styles",
    description:
      "Audit all text nodes for style consistency. Reports font family, size, weight, and line height usage with counts. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "typography" as const,
    defaultScope: "selection",
    params: {
      scope: { type: "string", required: false, description: "'selection' (default) or 'page'" },
      confirm: {
        type: "boolean",
        required: false,
        description:
          "Set to true to proceed when page scan exceeds 500 nodes. Required when scope is 'page' on large pages.",
      },
    },
    returns:
      "{ styles: Array<{font, size, weight, lineHeight, count}>, total_text_nodes, unique_styles, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS, figma } = ctx;
    var textNodes = nodes.filter(function (n) {
      return n.type === "TEXT";
    }) as TextNode[];

    var styleMap = new Map<
      string,
      {
        font: string;
        size: number | string;
        weight: number | string;
        lineHeight: string;
        count: number;
      }
    >();

    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      var fontName = node.fontName;
      var font = fontName === figma.mixed ? "mixed" : fontName.family;
      var size: number | string = node.fontSize === figma.mixed ? "mixed" : node.fontSize;
      var weight: number | string = fontName === figma.mixed ? "mixed" : fontName.style;
      var lh = node.lineHeight;
      var lineHeight = "auto";
      if (lh !== figma.mixed) {
        if (lh.unit === "AUTO") lineHeight = "auto";
        else if (lh.unit === "PIXELS") lineHeight = lh.value + "px";
        else if (lh.unit === "PERCENT") lineHeight = lh.value + "%";
      } else {
        lineHeight = "mixed";
      }

      var key = font + "|" + size + "|" + weight + "|" + lineHeight;
      var entry = styleMap.get(key) || {
        font: font,
        size: size,
        weight: weight,
        lineHeight: lineHeight,
        count: 0,
      };
      entry.count++;
      styleMap.set(key, entry);
    }

    var styles = Array.from(styleMap.values()).sort(function (a, b) {
      return b.count - a.count;
    });
    return {
      styles: styles.slice(0, MAX_RESULTS),
      total_text_nodes: textNodes.length,
      unique_styles: styles.length,
      summary:
        textNodes.length + " text nodes using " + styles.length + " unique style combinations.",
    };
  },
});

// --- list_fonts ---
registerOperation({
  manifest: {
    name: "list_fonts",
    description: "List all fonts used in the file with usage counts.",
    category: "typography" as const,
    params: {
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
    },
    returns: "{ fonts: Array<{family, styles, count}>, total_fonts, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, figma } = ctx;
    var textNodes = nodes.filter(function (n) {
      return n.type === "TEXT";
    }) as TextNode[];

    var fontMap = new Map<string, { family: string; styles: Set<string>; count: number }>();

    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      var fontName = node.fontName;
      if (fontName === figma.mixed) {
        var mixedEntry = fontMap.get("mixed") || {
          family: "mixed",
          styles: new Set<string>(),
          count: 0,
        };
        mixedEntry.count++;
        fontMap.set("mixed", mixedEntry);
        continue;
      }
      var entry = fontMap.get(fontName.family) || {
        family: fontName.family,
        styles: new Set<string>(),
        count: 0,
      };
      entry.styles.add(fontName.style);
      entry.count++;
      fontMap.set(fontName.family, entry);
    }

    var fonts = Array.from(fontMap.values())
      .map(function (f) {
        return { family: f.family, styles: Array.from(f.styles), count: f.count };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });

    return {
      fonts: fonts,
      total_fonts: fonts.length,
      summary: fonts.length + " font families across " + textNodes.length + " text nodes.",
    };
  },
});
