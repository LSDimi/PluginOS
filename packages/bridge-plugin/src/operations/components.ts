import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

// --- find_instances ---
registerOperation({
  manifest: {
    name: "find_instances",
    description:
      "Find all instances of a component by name or component key across the current page.",
    category: "components" as const,
    params: {
      name: {
        type: "string",
        required: false,
        description: "Component name to search for (partial match)",
      },
      component_key: {
        type: "string",
        required: false,
        description: "Exact component key",
      },
    },
    returns: "{ instances: Array<{nodeId, nodeName, componentName}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    const { params, MAX_RESULTS, figma } = ctx;
    const instances: Array<{
      nodeId: string;
      nodeName: string;
      componentName: string;
    }> = [];

    const allInstances = figma.currentPage.findAll((n) => n.type === "INSTANCE") as InstanceNode[];

    for (const inst of allInstances) {
      const mainComp = await inst.getMainComponentAsync();
      if (!mainComp) continue;

      if (params.component_key && mainComp.key === params.component_key) {
        instances.push({
          nodeId: inst.id,
          nodeName: inst.name,
          componentName: mainComp.name,
        });
      } else if (
        params.name &&
        mainComp.name.toLowerCase().includes((params.name as string).toLowerCase())
      ) {
        instances.push({
          nodeId: inst.id,
          nodeName: inst.name,
          componentName: mainComp.name,
        });
      } else if (!params.name && !params.component_key) {
        instances.push({
          nodeId: inst.id,
          nodeName: inst.name,
          componentName: mainComp.name,
        });
      }
    }

    return {
      instances: instances.slice(0, MAX_RESULTS),
      count: instances.length,
      summary: `Found ${instances.length} instances${params.name ? ` matching "${params.name}"` : ""}.`,
    };
  },
});

// --- analyze_overrides ---
registerOperation({
  manifest: {
    name: "analyze_overrides",
    description:
      "Analyze all component instances and report which have overrides applied, what fields are overridden, and how many. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "components" as const,
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
      "{ instances: Array<{nodeId, nodeName, overrideCount, overriddenFields}>, total_instances, with_overrides, summary }",
  },
  async execute(ctx: OperationContext) {
    const { nodes, MAX_RESULTS } = ctx;
    const instanceNodes = nodes.filter((n) => n.type === "INSTANCE") as InstanceNode[];

    const results: Array<{
      nodeId: string;
      nodeName: string;
      overrideCount: number;
      overriddenFields: string[];
    }> = [];

    for (const inst of instanceNodes) {
      const overrides = inst.overrides;
      if (overrides && overrides.length > 0) {
        const fields = new Set<string>();
        for (const ov of overrides) {
          for (const field of ov.overriddenFields) {
            fields.add(field);
          }
        }
        results.push({
          nodeId: inst.id,
          nodeName: inst.name,
          overrideCount: overrides.length,
          overriddenFields: Array.from(fields),
        });
      }
    }

    return {
      instances: results.slice(0, MAX_RESULTS),
      total_instances: instanceNodes.length,
      with_overrides: results.length,
      summary: `${results.length} of ${instanceNodes.length} instances have overrides.`,
    };
  },
});
