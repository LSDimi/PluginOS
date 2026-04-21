import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

// --- audit_spacing ---
registerOperation({
  manifest: {
    name: "audit_spacing",
    description:
      "Audit spacing values (padding, gap, item spacing) across auto-layout frames. Reports non-standard values. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "layout" as const,
    defaultScope: "selection",
    params: {
      allowed_values: {
        type: "string[]",
        required: false,
        description: "Allowed spacing values (e.g., ['0','4','8','12','16','24','32','48'])",
      },
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
      "{ violations: Array<{nodeId, nodeName, property, value}>, unique_values, total_violations, summary }",
  },
  async execute(ctx: OperationContext) {
    const { nodes, params, MAX_RESULTS } = ctx;
    const allowed = params.allowed_values ? (params.allowed_values as string[]).map(Number) : null;

    const allValues = new Set<number>();
    const violations: Array<{
      nodeId: string;
      nodeName: string;
      property: string;
      value: number;
    }> = [];

    for (const node of nodes) {
      if (!("layoutMode" in node)) continue;
      const frame = node as FrameNode;
      if (frame.layoutMode === "NONE") continue;

      const spacingProps: Array<[string, number]> = [
        ["itemSpacing", frame.itemSpacing],
        ["paddingLeft", frame.paddingLeft],
        ["paddingRight", frame.paddingRight],
        ["paddingTop", frame.paddingTop],
        ["paddingBottom", frame.paddingBottom],
      ];

      if (frame.counterAxisSpacing !== null) {
        spacingProps.push(["counterAxisSpacing", frame.counterAxisSpacing]);
      }

      for (const [prop, val] of spacingProps) {
        allValues.add(val);
        if (allowed && !allowed.includes(val)) {
          violations.push({
            nodeId: frame.id,
            nodeName: frame.name,
            property: prop,
            value: val,
          });
        }
      }
    }

    const sortedValues = Array.from(allValues).sort((a, b) => a - b);

    return {
      violations: violations.slice(0, MAX_RESULTS),
      total_violations: violations.length,
      unique_values: sortedValues,
      summary: allowed
        ? `Found ${violations.length} non-standard spacing values. Unique values: ${sortedValues.join(", ")}`
        : `Found ${allValues.size} unique spacing values: ${sortedValues.join(", ")}`,
    };
  },
});
