function computeColor(
  fills: readonly Paint[],
  opacity: number = 1
): [number, number, number, number] | null {
  for (let i = fills.length - 1; i >= 0; i--) {
    const fill = fills[i];
    if (fill.type === "SOLID" && fill.visible !== false) {
      const a = (fill.opacity ?? 1) * opacity;
      return [fill.color.r * 255, fill.color.g * 255, fill.color.b * 255, a];
    }
  }
  return null;
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastResult {
  nodeId: string;
  text_preview: string;
  ratio: number;
  aa_pass: boolean;
  aaa_pass: boolean;
  font_size: number | string;
}

/** Contrast of a text node vs its nearest filled ancestor. Null if not text. */
export function checkContrast(node: SceneNode): ContrastResult | null {
  if (node.type !== "TEXT") return null;
  const textNode = node as TextNode;
  const textColor = computeColor(textNode.fills as readonly Paint[], textNode.opacity);
  if (!textColor) return null;

  let bgColor: [number, number, number, number] | null = null;
  let parent: BaseNode | null = textNode.parent;
  while (parent && !bgColor) {
    if ("fills" in parent) {
      bgColor = computeColor((parent as GeometryMixin).fills as readonly Paint[]);
    }
    parent = parent.parent;
  }
  if (!bgColor) bgColor = [255, 255, 255, 1];

  const fgLum = luminance(textColor[0], textColor[1], textColor[2]);
  const bgLum = luminance(bgColor[0], bgColor[1], bgColor[2]);
  const ratio = Math.round(contrastRatio(fgLum, bgLum) * 100) / 100;

  const fontSize = textNode.fontSize;
  const fontWeight = typeof textNode.fontWeight === "number" ? textNode.fontWeight : 400;
  const isLargeText =
    typeof fontSize === "number" && (fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700));
  const aaThreshold = isLargeText ? 3 : 4.5;
  const aaaThreshold = isLargeText ? 4.5 : 7;

  return {
    nodeId: textNode.id,
    text_preview: textNode.characters.slice(0, 40),
    ratio,
    aa_pass: ratio >= aaThreshold,
    aaa_pass: ratio >= aaaThreshold,
    font_size: typeof fontSize === "number" ? fontSize : "mixed",
  };
}
