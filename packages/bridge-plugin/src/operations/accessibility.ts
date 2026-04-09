import { registerOperation } from "./registry";

function computeColor(
  fills: readonly Paint[],
  opacity: number = 1
): [number, number, number, number] | null {
  for (let i = fills.length - 1; i >= 0; i--) {
    const fill = fills[i];
    if (fill.type === "SOLID" && fill.visible !== false) {
      const a = (fill.opacity ?? 1) * opacity;
      return [
        fill.color.r * 255,
        fill.color.g * 255,
        fill.color.b * 255,
        a,
      ];
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

// --- check_contrast ---
registerOperation({
  manifest: {
    name: "check_contrast",
    description:
      "Check color contrast ratios for all text nodes against their parent backgrounds. Reports WCAG AA and AAA compliance.",
    category: "accessibility",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'page' (default) or 'selection'",
      },
    },
    returns:
      "{ results: Array<{nodeId, text_preview, ratio, aa_pass, aaa_pass, font_size}>, passing, failing, summary }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const textNodes: TextNode[] =
      scope === "selection"
        ? (figma.currentPage.selection.filter(
            (n) => n.type === "TEXT"
          ) as TextNode[])
        : (figma.currentPage.findAll(
            (n) => n.type === "TEXT"
          ) as TextNode[]);

    const results: Array<{
      nodeId: string;
      text_preview: string;
      ratio: number;
      aa_pass: boolean;
      aaa_pass: boolean;
      font_size: number | string;
    }> = [];

    for (const textNode of textNodes) {
      const textColor = computeColor(
        textNode.fills as readonly Paint[],
        textNode.opacity
      );
      if (!textColor) continue;

      // Walk up to find background
      let bgColor: [number, number, number, number] | null = null;
      let parent: BaseNode | null = textNode.parent;
      while (parent && !bgColor) {
        if ("fills" in parent) {
          bgColor = computeColor(
            (parent as GeometryMixin).fills as readonly Paint[]
          );
        }
        parent = parent.parent;
      }
      if (!bgColor) bgColor = [255, 255, 255, 1];

      const fgLum = luminance(textColor[0], textColor[1], textColor[2]);
      const bgLum = luminance(bgColor[0], bgColor[1], bgColor[2]);
      const ratio =
        Math.round(contrastRatio(fgLum, bgLum) * 100) / 100;

      const fontSize = textNode.fontSize;
      const fontWeight =
        typeof textNode.fontWeight === "number" ? textNode.fontWeight : 400;
      const isLargeText =
        typeof fontSize === "number" &&
        (fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700));

      const aaThreshold = isLargeText ? 3 : 4.5;
      const aaaThreshold = isLargeText ? 4.5 : 7;

      results.push({
        nodeId: textNode.id,
        text_preview: textNode.characters.slice(0, 40),
        ratio,
        aa_pass: ratio >= aaThreshold,
        aaa_pass: ratio >= aaaThreshold,
        font_size: typeof fontSize === "number" ? fontSize : "mixed",
      });
    }

    const passing = results.filter((r) => r.aa_pass).length;
    const failing = results.length - passing;

    return {
      results: results.slice(0, 200),
      total_checked: results.length,
      passing,
      failing,
      summary: `Checked ${results.length} text nodes. ${passing} pass WCAG AA, ${failing} fail.`,
    };
  },
});

// --- check_touch_targets ---
registerOperation({
  manifest: {
    name: "check_touch_targets",
    description:
      "Find interactive elements (buttons, links, inputs) smaller than 44x44px minimum touch target size (WCAG 2.5.8).",
    category: "accessibility",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'page' (default) or 'selection'",
      },
      min_size: {
        type: "number",
        required: false,
        description: "Minimum touch target size in px (default: 44)",
      },
    },
    returns: "{ violations: Array<{nodeId, nodeName, width, height}>, count, summary }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const minSize = params.min_size || 44;

    const nodes: readonly SceneNode[] =
      scope === "selection"
        ? figma.currentPage.selection
        : figma.currentPage.findAll();

    const interactivePatterns =
      /button|btn|link|input|toggle|switch|checkbox|radio|tab|chip|tag|cta/i;
    const violations: Array<{
      nodeId: string;
      nodeName: string;
      width: number;
      height: number;
    }> = [];

    for (const node of nodes) {
      if (!interactivePatterns.test(node.name)) continue;
      if (!("width" in node)) continue;

      const width = Math.round((node as any).width);
      const height = Math.round((node as any).height);

      if (width < minSize || height < minSize) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          width,
          height,
        });
      }
    }

    return {
      violations: violations.slice(0, 200),
      count: violations.length,
      summary: `Found ${violations.length} interactive elements below ${minSize}x${minSize}px.`,
    };
  },
});
