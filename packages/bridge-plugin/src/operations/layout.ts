import { registerOperation } from "./registry";
import type { OperationContext } from "./context";
import { checkSpacing } from "./checks/spacing";

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
      base_unit: {
        type: "number",
        required: false,
        description:
          "Grid base unit; values not multiples of it are flagged (default: 8). Ignored if allowed_values is given.",
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
    const baseUnit =
      params.base_unit !== undefined && params.base_unit !== null ? Number(params.base_unit) : 8;

    const allValues = new Set<number>();
    const violations: Array<{
      nodeId: string;
      nodeName: string;
      property: string;
      value: number;
    }> = [];

    for (const node of nodes) {
      // In allowed-list (legacy) mode, disable grid violations (baseUnit 0).
      const r = checkSpacing(node, allowed ? 0 : baseUnit);
      for (const e of r.entries) {
        allValues.add(e.value);
        if (allowed && !allowed.includes(e.value)) {
          violations.push({
            nodeId: node.id,
            nodeName: node.name,
            property: e.property,
            value: e.value,
          });
        }
      }
      if (!allowed) {
        for (const f of r.violations) {
          violations.push({
            nodeId: f.nodeId,
            nodeName: f.nodeName,
            property: (f.meta as any).property,
            value: (f.meta as any).value,
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
        ? `Found ${violations.length} non-standard spacing values (allowed-list mode). Unique values: ${sortedValues.join(", ")}`
        : `Found ${violations.length} off-grid spacing values (base unit ${baseUnit}). Unique values: ${sortedValues.join(", ")}`,
    };
  },
});
