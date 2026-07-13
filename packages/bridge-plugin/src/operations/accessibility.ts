import { registerOperation } from "./registry";
import type { OperationContext } from "./context";
import { withHint } from "@pluginos/shared";
import { checkContrast } from "./checks/contrast";

// --- check_contrast ---
registerOperation({
  manifest: {
    name: "check_contrast",
    description:
      "Check color contrast ratios for all text nodes against their parent backgrounds. Reports WCAG AA and AAA compliance. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "accessibility" as const,
    defaultScope: "selection",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'selection' (default) or 'page'",
      },
      confirm: {
        type: "boolean",
        required: false,
        description:
          "Set to true to proceed when page scan exceeds 500 nodes. Required when scope is 'page' on large pages.",
      },
    },
    returns:
      "{ results: Array<{nodeId, text_preview, ratio, aa_pass, aaa_pass, font_size}>, passing, failing, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    const results = [] as ReturnType<typeof checkContrast>[];
    for (const node of nodes) {
      const r = checkContrast(node);
      if (r) results.push(r);
    }

    const passing = results.filter((r) => r!.aa_pass).length;
    const failing = results.length - passing;

    const result = {
      results: results.slice(0, MAX_RESULTS),
      total_checked: results.length,
      passing,
      failing,
      summary: `Checked ${results.length} text nodes. ${passing} pass WCAG AA, ${failing} fail.`,
    };
    return withHint(result, undefined, ["check_touch_targets"]);
  },
});

// --- check_touch_targets ---
registerOperation({
  manifest: {
    name: "check_touch_targets",
    description:
      "Find interactive elements (buttons, links, inputs) smaller than 44x44px minimum touch target size (WCAG 2.5.8). Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "accessibility" as const,
    defaultScope: "selection",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'selection' (default) or 'page'",
      },
      min_size: {
        type: "number",
        required: false,
        description: "Minimum touch target size in px (default: 44)",
      },
      confirm: {
        type: "boolean",
        required: false,
        description:
          "Set to true to proceed when page scan exceeds 500 nodes. Required when scope is 'page' on large pages.",
      },
    },
    returns: "{ violations: Array<{nodeId, nodeName, width, height}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, params, MAX_RESULTS } = ctx;

    const minSize = (params.min_size as number) || 44;

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
      violations: violations.slice(0, MAX_RESULTS),
      count: violations.length,
      summary: `Found ${violations.length} interactive elements below ${minSize}x${minSize}px.`,
    };
  },
});
