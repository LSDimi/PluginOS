import { registerOperation } from "./registry";
import type { OperationContext } from "./context";
import { withHint } from "@pluginos/shared";
import { checkStyleBinding } from "./checks/style";
import { collectInstanceComponentNames, checkDetached } from "./checks/detached";
import { checkNaming } from "./checks/naming";

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
      confirm: {
        type: "boolean",
        required: false,
        description:
          "Set to true to proceed when page scan exceeds 500 nodes. Required when scope is 'page' on large pages.",
      },
    },
    returns:
      "{ total_nodes, issues: Array<{nodeId, nodeName, nodeType, issue, binding}>, total_issues, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    const issues: Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
      issue: string;
      binding: "raw";
    }> = [];

    for (const node of nodes) {
      for (const f of checkStyleBinding(node)) {
        issues.push({
          nodeId: f.nodeId,
          nodeName: f.nodeName,
          nodeType: f.nodeType,
          issue: f.detail,
          binding: "raw",
        });
      }
    }

    const result = {
      total_nodes: nodes.length,
      issues: issues.slice(0, MAX_RESULTS),
      total_issues: issues.length,
      summary: `Scanned ${nodes.length} nodes. Found ${issues.length} style issues (raw fills/strokes/text/effects; variable- and style-bound properties are not flagged).`,
    };
    return withHint(result, undefined, ["lint_detached", "check_contrast"]);
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
      confirm: {
        type: "boolean",
        required: false,
        description:
          "Set to true to proceed when page scan exceeds 500 nodes. Required when scope is 'page' on large pages.",
      },
    },
    returns: "{ detached: Array<{nodeId, nodeName, parentName}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, params, MAX_RESULTS } = ctx;

    const instanceNames = collectInstanceComponentNames(nodes);
    const detached: Array<{ nodeId: string; nodeName: string; parentName: string }> = [];

    for (const node of nodes) {
      for (const f of checkDetached(node, instanceNames)) {
        detached.push({
          nodeId: f.nodeId,
          nodeName: f.nodeName,
          parentName: (f.meta as any).parentName,
        });
      }
    }

    const result = {
      detached: detached.slice(0, MAX_RESULTS),
      count: detached.length,
      summary: `Found ${detached.length} likely detached instances on ${(params.scope as string) || "selection"}.`,
    };
    return withHint(result, undefined, ["analyze_overrides"]);
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
      confirm: {
        type: "boolean",
        required: false,
        description:
          "Set to true to proceed when page scan exceeds 500 nodes. Required when scope is 'page' on large pages.",
      },
    },
    returns: "{ unnamed: Array<{nodeId, nodeName, nodeType}>, count, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, MAX_RESULTS } = ctx;

    const unnamed: Array<{ nodeId: string; nodeName: string; nodeType: string }> = [];
    for (const node of nodes) {
      for (const f of checkNaming(node)) {
        unnamed.push({ nodeId: f.nodeId, nodeName: f.nodeName, nodeType: f.nodeType });
      }
    }

    return {
      unnamed: unnamed.slice(0, MAX_RESULTS),
      count: unnamed.length,
      summary: `Found ${unnamed.length} layers with default names.`,
    };
  },
});
