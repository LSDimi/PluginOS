import type { CheckFinding } from "./types";
import { resolveBindingState } from "./binding";

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Emit a finding for each fill/stroke/text/effect property that is raw
 * (neither style-bound nor variable-bound). Fill findings include meta.hex.
 */
export function checkStyleBinding(node: SceneNode): CheckFinding[] {
  const out: CheckFinding[] = [];
  const anyNode = node as any;

  if ("fillStyleId" in node && "fills" in node) {
    const fills = anyNode.fills;
    if (Array.isArray(fills) && fills.length > 0 && resolveBindingState(node, "fill") === "raw") {
      const solid = fills.find((f: any) => f && f.type === "SOLID" && f.visible !== false);
      out.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        check: "style",
        detail: "Fill without style",
        meta: {
          property: "fill",
          hex: solid ? rgbToHex(solid.color.r, solid.color.g, solid.color.b) : undefined,
        },
      });
    }
  }

  if ("strokeStyleId" in node && "strokes" in node) {
    const strokes = anyNode.strokes;
    if (Array.isArray(strokes) && strokes.length > 0 && resolveBindingState(node, "stroke") === "raw") {
      out.push({
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        check: "style", detail: "Stroke without style", meta: { property: "stroke" },
      });
    }
  }

  if (node.type === "TEXT" && resolveBindingState(node, "text") === "raw") {
    out.push({
      nodeId: node.id, nodeName: node.name, nodeType: node.type,
      check: "style", detail: "Text without style", meta: { property: "text" },
    });
  }

  if ("effectStyleId" in node && "effects" in node) {
    const effects = anyNode.effects;
    if (Array.isArray(effects) && effects.length > 0 && resolveBindingState(node, "effect") === "raw") {
      out.push({
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        check: "style", detail: "Effect without style", meta: { property: "effect" },
      });
    }
  }

  return out;
}
