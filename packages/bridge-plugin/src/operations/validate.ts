import { registerOperation } from "./registry";
import type { OperationContext } from "./context";
import { withHint } from "@pluginos/shared";
import type { CheckFinding, Severity } from "./checks/types";
import { checkStyleBinding } from "./checks/style";
import { collectInstanceComponentNames, checkDetached } from "./checks/detached";
import { checkNaming } from "./checks/naming";
import { checkContrast } from "./checks/contrast";
import { checkSpacing } from "./checks/spacing";

const SEVERITY_ORDER: Severity[] = ["P0", "P1", "P2", "P3"];

registerOperation({
  manifest: {
    name: "validate_ds_compliance",
    description:
      "Full design-system compliance audit in ONE pass over the node set: variable-aware style lint, detached instances, default naming, WCAG AA contrast, and spacing grid. Returns findings bucketed by severity (P0 contrast, P1 raw colors, P2 detached+spacing, P3 naming). Replaces ~5 separate audit calls. Defaults to selection; pass scope: 'page' (optionally page_name/page_id) to scan a whole page.",
    category: "lint" as const,
    defaultScope: "selection",
    params: {
      scope: { type: "string", required: false, description: "'selection' (default) or 'page'" },
      base_unit: {
        type: "number",
        required: false,
        description: "Spacing grid base unit for the spacing check (default: 8)",
      },
      page_name: {
        type: "string",
        required: false,
        description: "With scope 'page': target a page by name; reads it without moving your viewport.",
      },
      page_id: { type: "string", required: false, description: "With scope 'page': target a page by id." },
      confirm: {
        type: "boolean",
        required: false,
        description: "Set to true to proceed when page scan exceeds 500 nodes.",
      },
    },
    returns:
      "{ total_nodes, counts:{contrast,style,detached,spacing,naming}, by_severity:{P0,P1,P2,P3}, summary }",
  },
  async execute(ctx: OperationContext) {
    const { nodes, params, MAX_RESULTS } = ctx;
    const baseUnit =
      params.base_unit !== undefined && params.base_unit !== null ? Number(params.base_unit) : 8;

    const instanceNames = collectInstanceComponentNames(nodes);
    const buckets: Record<Severity, CheckFinding[]> = { P0: [], P1: [], P2: [], P3: [] };
    const counts = { contrast: 0, style: 0, detached: 0, spacing: 0, naming: 0 };

    for (const node of nodes) {
      try {
        for (const f of checkStyleBinding(node)) {
          buckets.P1.push(f);
          counts.style++;
        }
      } catch {
        /* one node's check must not abort the pass */
      }
      try {
        for (const f of checkDetached(node, instanceNames)) {
          buckets.P2.push(f);
          counts.detached++;
        }
      } catch {
        /* ignore */
      }
      try {
        for (const f of checkNaming(node)) {
          buckets.P3.push(f);
          counts.naming++;
        }
      } catch {
        /* ignore */
      }
      try {
        const c = checkContrast(node);
        if (c && !c.aa_pass) {
          buckets.P0.push({
            nodeId: c.nodeId,
            nodeName: node.name,
            nodeType: node.type,
            check: "contrast",
            detail: `Contrast ${c.ratio}:1 fails WCAG AA`,
            meta: { ratio: c.ratio, font_size: c.font_size },
          });
          counts.contrast++;
        }
      } catch {
        /* ignore */
      }
      try {
        for (const f of checkSpacing(node, baseUnit).violations) {
          buckets.P2.push(f);
          counts.spacing++;
        }
      } catch {
        /* ignore */
      }
    }

    // Cap total findings across buckets, P0 first.
    let budget = MAX_RESULTS;
    const by_severity: Record<Severity, CheckFinding[]> = { P0: [], P1: [], P2: [], P3: [] };
    for (const sev of SEVERITY_ORDER) {
      if (budget <= 0) break;
      by_severity[sev] = buckets[sev].slice(0, budget);
      budget -= by_severity[sev].length;
    }

    const total = counts.contrast + counts.style + counts.detached + counts.spacing + counts.naming;
    const shown =
      by_severity.P0.length + by_severity.P1.length + by_severity.P2.length + by_severity.P3.length;
    const result = {
      total_nodes: nodes.length,
      counts,
      by_severity,
      summary: `Scanned ${nodes.length} nodes. ${total} findings: ${counts.contrast} contrast (P0), ${counts.style} style (P1), ${counts.detached} detached + ${counts.spacing} spacing (P2), ${counts.naming} naming (P3).`,
    };
    const hint =
      total > shown
        ? `Showing ${shown} of ${total} findings (capped at ${MAX_RESULTS}, highest severity first). 'counts' holds true totals; lower-severity buckets may be truncated — narrow 'scope' or call a single-category audit op for full detail.`
        : undefined;
    return withHint(result, hint, []);
  },
});
