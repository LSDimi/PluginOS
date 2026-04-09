import { registerOperation } from "./index";

// --- find_instances ---
registerOperation({
  manifest: {
    name: "find_instances",
    description:
      "Find all instances of a component by name or component key across the current page.",
    category: "components",
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
    returns:
      "{ instances: Array<{nodeId, nodeName, componentName}>, count, summary }",
  },
  async execute(params) {
    const instances: Array<{
      nodeId: string;
      nodeName: string;
      componentName: string;
    }> = [];

    const allInstances = figma.currentPage.findAll(
      (n) => n.type === "INSTANCE"
    ) as InstanceNode[];

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
        mainComp.name.toLowerCase().includes(params.name.toLowerCase())
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
      instances: instances.slice(0, 200),
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
      "Analyze all component instances and report which have overrides applied, what fields are overridden, and how many.",
    category: "components",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'page' (default) or 'selection'",
      },
    },
    returns:
      "{ instances: Array<{nodeId, nodeName, overrideCount, overriddenFields}>, total_instances, with_overrides, summary }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes: InstanceNode[] =
      scope === "selection"
        ? (figma.currentPage.selection.filter(
            (n) => n.type === "INSTANCE"
          ) as InstanceNode[])
        : (figma.currentPage.findAll(
            (n) => n.type === "INSTANCE"
          ) as InstanceNode[]);

    const results: Array<{
      nodeId: string;
      nodeName: string;
      overrideCount: number;
      overriddenFields: string[];
    }> = [];

    for (const inst of nodes) {
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
      instances: results.slice(0, 200),
      total_instances: nodes.length,
      with_overrides: results.length,
      summary: `${results.length} of ${nodes.length} instances have overrides.`,
    };
  },
});
