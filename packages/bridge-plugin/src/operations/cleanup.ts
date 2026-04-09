import { registerOperation } from "./registry";

// --- rename_layers ---
registerOperation({
  manifest: {
    name: "rename_layers",
    description:
      "Batch rename layers using find/replace, prefix, suffix, or sequential numbering.",
    category: "cleanup",
    params: {
      find: {
        type: "string",
        required: false,
        description: "Text to find in layer names",
      },
      replace: {
        type: "string",
        required: false,
        description: "Replacement text",
      },
      prefix: {
        type: "string",
        required: false,
        description: "Prefix to add",
      },
      suffix: {
        type: "string",
        required: false,
        description: "Suffix to add",
      },
      scope: {
        type: "string",
        required: false,
        description: "'page' (default) or 'selection'",
      },
    },
    returns: "{ renamed, summary }",
  },
  async execute(params) {
    const scope = params.scope || "page";
    const nodes: SceneNode[] =
      scope === "selection"
        ? [...figma.currentPage.selection]
        : figma.currentPage.findAll();

    let renamed = 0;

    for (const node of nodes) {
      let newName = node.name;

      if (params.find && params.replace !== undefined) {
        const regex = new RegExp(params.find, "g");
        newName = newName.replace(regex, params.replace);
      }
      if (params.prefix) {
        newName = params.prefix + newName;
      }
      if (params.suffix) {
        newName = newName + params.suffix;
      }

      if (newName !== node.name) {
        node.name = newName;
        renamed++;
      }
    }

    figma.commitUndo();
    return {
      renamed,
      summary: `Renamed ${renamed} layers.`,
    };
  },
});

// --- remove_hidden ---
registerOperation({
  manifest: {
    name: "remove_hidden",
    description:
      "Find and optionally remove all hidden (invisible) layers on the current page.",
    category: "cleanup",
    params: {
      dry_run: {
        type: "boolean",
        required: false,
        description:
          "If true, only report without removing (default: true)",
      },
      scope: {
        type: "string",
        required: false,
        description: "'page' (default) or 'selection'",
      },
    },
    returns: "{ hidden: Array<{nodeId, nodeName}>, count, removed, summary }",
  },
  async execute(params) {
    const dryRun = params.dry_run !== false;
    const scope = params.scope || "page";
    const nodes: SceneNode[] =
      scope === "selection"
        ? [...figma.currentPage.selection]
        : figma.currentPage.findAll();

    const hidden: Array<{ nodeId: string; nodeName: string }> = [];

    for (const node of nodes) {
      if (!node.visible) {
        hidden.push({ nodeId: node.id, nodeName: node.name });
      }
    }

    if (!dryRun) {
      for (const item of [...hidden].reverse()) {
        const node = figma.getNodeById(item.nodeId);
        if (node) node.remove();
      }
      figma.commitUndo();
    }

    return {
      hidden: hidden.slice(0, 200),
      count: hidden.length,
      removed: !dryRun,
      summary: dryRun
        ? `Found ${hidden.length} hidden layers (dry run — not removed).`
        : `Removed ${hidden.length} hidden layers.`,
    };
  },
});

// --- round_values ---
registerOperation({
  manifest: {
    name: "round_values",
    description:
      "Round all fractional x, y, width, height values to whole pixels for pixel-perfect designs.",
    category: "cleanup",
    params: {
      scope: {
        type: "string",
        required: false,
        description: "'page' (default) or 'selection'",
      },
      dry_run: {
        type: "boolean",
        required: false,
        description: "If true, only report (default: true)",
      },
    },
    returns:
      "{ fractional: Array<{nodeId, nodeName, property, before, after}>, count, summary }",
  },
  async execute(params) {
    const dryRun = params.dry_run !== false;
    const scope = params.scope || "page";
    const nodes: SceneNode[] =
      scope === "selection"
        ? [...figma.currentPage.selection]
        : figma.currentPage.findAll();

    const fractional: Array<{
      nodeId: string;
      nodeName: string;
      property: string;
      before: number;
      after: number;
    }> = [];

    for (const node of nodes) {
      for (const prop of ["x", "y"] as const) {
        if (prop in node) {
          const val = (node as any)[prop];
          if (typeof val === "number" && val !== Math.round(val)) {
            fractional.push({
              nodeId: node.id,
              nodeName: node.name,
              property: prop,
              before: val,
              after: Math.round(val),
            });
            if (!dryRun) (node as any)[prop] = Math.round(val);
          }
        }
      }

      if ("width" in node && "height" in node) {
        const w = (node as any).width;
        const h = (node as any).height;
        if (typeof w === "number" && w !== Math.round(w)) {
          fractional.push({
            nodeId: node.id,
            nodeName: node.name,
            property: "width",
            before: w,
            after: Math.round(w),
          });
        }
        if (typeof h === "number" && h !== Math.round(h)) {
          fractional.push({
            nodeId: node.id,
            nodeName: node.name,
            property: "height",
            before: h,
            after: Math.round(h),
          });
        }
        if (
          !dryRun &&
          (w !== Math.round(w) || h !== Math.round(h))
        ) {
          (node as any).resize(Math.round(w), Math.round(h));
        }
      }
    }

    if (!dryRun) figma.commitUndo();

    return {
      fractional: fractional.slice(0, 200),
      count: fractional.length,
      summary: dryRun
        ? `Found ${fractional.length} fractional values (dry run).`
        : `Rounded ${fractional.length} values to whole pixels.`,
    };
  },
});
