import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

// --- lint_styles ---
registerOperation({
  manifest: {
    name: "lint_styles",
    description:
      "Find layers using local styles instead of library styles, or no style at all. Reports fills, strokes, text styles, and effects that don't reference a shared style. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "lint" as const,
    defaultScope: "selection",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'selection' (default) or 'page'",
      },
    },
    returns: "{ total_nodes, issues: Array<{nodeId, nodeName, nodeType, issue}>, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    const issues: Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
      issue: string;
    }> = [];

    for (const node of nodes) {
      if ("fillStyleId" in node) {
        const fillStyleId = (node as any).fillStyleId;
        if (fillStyleId === "" && "fills" in node) {
          const fills = (node as any).fills;
          if (Array.isArray(fills) && fills.length > 0) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              issue: "Fill without style",
            });
          }
        }
      }

      if ("strokeStyleId" in node) {
        const strokeStyleId = (node as any).strokeStyleId;
        if (strokeStyleId === "" && "strokes" in node) {
          const strokes = (node as any).strokes;
          if (Array.isArray(strokes) && strokes.length > 0) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              issue: "Stroke without style",
            });
          }
        }
      }

      if (node.type === "TEXT") {
        const textNode = node as TextNode;
        if (textNode.textStyleId === "" || textNode.textStyleId === figma.mixed) {
          issues.push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            issue: "Text without style",
          });
        }
      }

      if ("effectStyleId" in node) {
        const effectStyleId = (node as any).effectStyleId;
        if (effectStyleId === "" && "effects" in node) {
          const effects = (node as any).effects;
          if (Array.isArray(effects) && effects.length > 0) {
            issues.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              issue: "Effect without style",
            });
          }
        }
      }
    }

    return {
      total_nodes: nodes.length,
      issues: issues.slice(0, MAX_RESULTS),
      total_issues: issues.length,
      summary: `Scanned ${nodes.length} nodes. Found ${issues.length} style issues.`,
    };
  },
});

// --- lint_detached ---
registerOperation({
  manifest: {
    name: "lint_detached",
    description:
      "Find all frames that were once component instances but have been detached. Uses naming heuristics to detect likely detached instances. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "lint" as const,
    defaultScope: "selection",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'selection' (default) or 'page'",
      },
    },
    returns: "{ detached: Array<{nodeId, nodeName, parentName}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, params, MAX_RESULTS } = ctx;

    const detached: Array<{
      nodeId: string;
      nodeName: string;
      parentName: string;
    }> = [];

    // Collect all component names used in instances on this page
    const instanceComponentNames = new Set<string>();
    for (const node of nodes) {
      if (node.type === "INSTANCE") {
        instanceComponentNames.add(node.name);
      }
    }

    for (const node of nodes) {
      if (node.type === "FRAME") {
        // Heuristic: A frame whose name matches an instance component name
        // is likely a detached instance
        if (instanceComponentNames.has(node.name)) {
          detached.push({
            nodeId: node.id,
            nodeName: node.name,
            parentName: node.parent?.name || "root",
          });
        }
      }
    }

    return {
      detached: detached.slice(0, MAX_RESULTS),
      count: detached.length,
      summary: `Found ${detached.length} likely detached instances on ${(params.scope as string) || "selection"}.`,
    };
  },
});

// --- lint_naming ---
registerOperation({
  manifest: {
    name: "lint_naming",
    description:
      "Find layers with default names like 'Frame 1', 'Rectangle 2', 'Group 3' that should be renamed for clarity. Defaults to selection; pass scope: 'page' to scan the whole page.",
    category: "lint" as const,
    defaultScope: "selection",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'selection' (default) or 'page'",
      },
    },
    returns: "{ unnamed: Array<{nodeId, nodeName, nodeType}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    const defaultNamePattern =
      /^(Frame|Rectangle|Ellipse|Group|Line|Vector|Text|Polygon|Star|Section|Slice|Image|Component|Instance) \d+$/;
    const unnamed: Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
    }> = [];

    for (const node of nodes) {
      if (defaultNamePattern.test(node.name)) {
        unnamed.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
        });
      }
    }

    return {
      unnamed: unnamed.slice(0, MAX_RESULTS),
      count: unnamed.length,
      summary: `Found ${unnamed.length} layers with default names.`,
    };
  },
});
