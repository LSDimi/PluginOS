import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

function rgbToHex(r: number, g: number, b: number): string {
  var toHex = function (c: number) {
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// --- extract_css ---
registerOperation({
  manifest: {
    name: "extract_css",
    description:
      "Extract CSS-like properties from selected nodes or the current page. Returns layout, typography, colors, and sizing as CSS key-value pairs.",
    category: "export" as const,
    params: {
      scope: { type: "string", required: false, description: "'selection' (default) or 'page'" },
      max_nodes: {
        type: "number",
        required: false,
        description: "Max nodes to extract (default: 20)",
      },
    },
    returns: "{ nodes: Array<{nodeId, nodeName, css}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, params, figma } = ctx;
    var maxNodes = (params.max_nodes as number) || 20;

    var results: { nodeId: string; nodeName: string; css: Record<string, string> }[] = [];

    for (var i = 0; i < Math.min(nodes.length, maxNodes); i++) {
      var node = nodes[i];
      var css: Record<string, string> = {};

      // Dimensions
      if ("width" in node) {
        css["width"] = Math.round(node.width) + "px";
        css["height"] = Math.round((node as any).height) + "px";
      }

      // Position
      if ("x" in node) {
        css["left"] = Math.round(node.x) + "px";
        css["top"] = Math.round(node.y) + "px";
      }

      // Border radius
      if ("cornerRadius" in node) {
        var cr = (node as any).cornerRadius;
        if (cr !== figma.mixed && cr > 0) css["border-radius"] = cr + "px";
      }

      // Fills
      if ("fills" in node) {
        var fills = (node as any).fills;
        if (Array.isArray(fills) && fills.length > 0) {
          var fill = fills[0];
          if (fill.type === "SOLID" && fill.visible !== false) {
            var hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
            var opacity = fill.opacity !== undefined ? fill.opacity : 1;
            css["background-color"] =
              opacity < 1
                ? hex +
                  Math.round(opacity * 255)
                    .toString(16)
                    .padStart(2, "0")
                : hex;
          }
        }
      }

      // Strokes
      if ("strokes" in node) {
        var strokes = (node as any).strokes;
        if (Array.isArray(strokes) && strokes.length > 0) {
          var stroke = strokes[0];
          if (stroke.type === "SOLID" && stroke.visible !== false) {
            var strokeHex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
            var weight = "strokeWeight" in node ? (node as any).strokeWeight : 1;
            css["border"] = weight + "px solid " + strokeHex;
          }
        }
      }

      // Text properties
      if (node.type === "TEXT") {
        var textNode = node as TextNode;
        var fontName = textNode.fontName;
        if (fontName !== figma.mixed) {
          var fn = fontName as FontName;
          css["font-family"] = fn.family;
          css["font-weight"] = fn.style.toLowerCase().indexOf("bold") >= 0 ? "700" : "400";
        }
        var fontSize = textNode.fontSize;
        if (fontSize !== figma.mixed) css["font-size"] = (fontSize as number) + "px";
        var lh = textNode.lineHeight;
        if (lh !== figma.mixed) {
          var lineHeight = lh as LineHeight;
          if (lineHeight.unit === "PIXELS") css["line-height"] = lineHeight.value + "px";
          else if (lineHeight.unit === "PERCENT") css["line-height"] = lineHeight.value + "%";
        }

        // Text color from fills
        var textFills = textNode.fills;
        if (Array.isArray(textFills) && textFills.length > 0 && textFills[0].type === "SOLID") {
          css["color"] = rgbToHex(textFills[0].color.r, textFills[0].color.g, textFills[0].color.b);
        }
      }

      // Auto-layout → flexbox
      if ("layoutMode" in node) {
        var n = node as FrameNode;
        if (n.layoutMode !== "NONE") {
          css["display"] = "flex";
          css["flex-direction"] = n.layoutMode === "HORIZONTAL" ? "row" : "column";
          css["gap"] = n.itemSpacing + "px";
          if (n.paddingTop > 0 || n.paddingBottom > 0 || n.paddingLeft > 0 || n.paddingRight > 0) {
            css["padding"] =
              n.paddingTop +
              "px " +
              n.paddingRight +
              "px " +
              n.paddingBottom +
              "px " +
              n.paddingLeft +
              "px";
          }
        }
      }

      if (Object.keys(css).length > 0) {
        results.push({ nodeId: node.id, nodeName: node.name, css: css });
      }
    }

    return {
      nodes: results,
      count: results.length,
      summary: "Extracted CSS from " + results.length + " nodes.",
    };
  },
});
