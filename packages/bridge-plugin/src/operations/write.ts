import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

// --- create_frame ---
registerOperation({
  manifest: {
    name: "create_frame",
    description:
      "Create a new frame on the current page with specified dimensions, position, and optional auto-layout.",
    category: "components" as const,
    params: {
      name: { type: "string", required: true, description: "Frame name" },
      width: { type: "number", required: false, description: "Width in px (default: 100)" },
      height: { type: "number", required: false, description: "Height in px (default: 100)" },
      x: { type: "number", required: false, description: "X position (default: 0)" },
      y: { type: "number", required: false, description: "Y position (default: 0)" },
      auto_layout: {
        type: "string",
        required: false,
        description: "'HORIZONTAL', 'VERTICAL', or 'NONE' (default: 'NONE')",
      },
      padding: { type: "number", required: false, description: "Uniform padding (default: 0)" },
      item_spacing: {
        type: "number",
        required: false,
        description: "Gap between children (default: 0)",
      },
      fills: {
        type: "string",
        required: false,
        description: "Hex color for fill, e.g. '#FF0000'",
      },
    },
    returns: "{ nodeId, name, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma, hexToRgb } = ctx;
    var frame = figma.createFrame();
    frame.name = params.name as string;
    frame.resize((params.width as number) || 100, (params.height as number) || 100);
    frame.x = (params.x as number) || 0;
    frame.y = (params.y as number) || 0;

    var layout = (params.auto_layout as string) || "NONE";
    if (layout !== "NONE") {
      frame.layoutMode = layout as "HORIZONTAL" | "VERTICAL";
      frame.primaryAxisSizingMode = "AUTO";
      frame.counterAxisSizingMode = "AUTO";
    }

    if (params.padding) {
      var p = params.padding as number;
      frame.paddingTop = p;
      frame.paddingBottom = p;
      frame.paddingLeft = p;
      frame.paddingRight = p;
    }

    if (params.item_spacing) {
      frame.itemSpacing = params.item_spacing as number;
    }

    if (params.fills) {
      var { r, g, b } = hexToRgb(params.fills as string);
      frame.fills = [{ type: "SOLID", color: { r: r, g: g, b: b } }];
    }

    figma.currentPage.appendChild(frame);
    return {
      nodeId: frame.id,
      name: frame.name,
      summary:
        'Created frame "' +
        frame.name +
        '" (' +
        frame.width +
        "x" +
        frame.height +
        ") at (" +
        frame.x +
        ", " +
        frame.y +
        ").",
    };
  },
});

// --- set_fills ---
registerOperation({
  manifest: {
    name: "set_fills",
    description: "Set the fill color of one or more nodes by ID.",
    category: "colors" as const,
    params: {
      node_ids: {
        type: "string[]",
        required: true,
        description: "Array of node IDs to update",
      },
      color: {
        type: "string",
        required: true,
        description: "Hex color, e.g. '#3B82F6'",
      },
      opacity: {
        type: "number",
        required: false,
        description: "Fill opacity 0-1 (default: 1)",
      },
    },
    returns: "{ updated, failed, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma, hexToRgb } = ctx;
    var { r, g, b } = hexToRgb(params.color as string);
    var opacity = params.opacity !== undefined ? (params.opacity as number) : 1;

    var updated = 0;
    var failed = 0;
    for (var i = 0; i < (params.node_ids as string[]).length; i++) {
      var id = (params.node_ids as string[])[i];
      var node = figma.getNodeById(id);
      if (node && "fills" in node) {
        (node as GeometryMixin).fills = [
          { type: "SOLID", color: { r: r, g: g, b: b }, opacity: opacity },
        ];
        updated++;
      } else {
        failed++;
      }
    }
    figma.commitUndo();
    return {
      updated: updated,
      failed: failed,
      summary:
        "Set fill to " +
        params.color +
        " on " +
        updated +
        " nodes." +
        (failed ? " " + failed + " nodes not found or not fillable." : ""),
    };
  },
});

// --- set_text ---
registerOperation({
  manifest: {
    name: "set_text",
    description: "Set the text content of one or more text nodes by ID.",
    category: "content" as const,
    params: {
      node_ids: {
        type: "string[]",
        required: true,
        description: "Array of text node IDs",
      },
      text: {
        type: "string",
        required: true,
        description: "New text content",
      },
    },
    returns: "{ updated, failed, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma } = ctx;
    var updated = 0;
    var failed = 0;
    for (var i = 0; i < (params.node_ids as string[]).length; i++) {
      var id = (params.node_ids as string[])[i];
      var node = figma.getNodeById(id);
      if (node && node.type === "TEXT") {
        var textNode = node as TextNode;
        var fontName = textNode.fontName;
        if (fontName === figma.mixed) {
          var ranges = textNode.getStyledTextSegments(["fontName"]);
          for (var r = 0; r < ranges.length; r++) {
            await figma.loadFontAsync(ranges[r].fontName);
          }
        } else {
          await figma.loadFontAsync(fontName);
        }
        textNode.characters = params.text as string;
        updated++;
      } else {
        failed++;
      }
    }
    figma.commitUndo();
    return {
      updated: updated,
      failed: failed,
      summary:
        "Set text on " +
        updated +
        " nodes." +
        (failed ? " " + failed + " not found or not text." : ""),
    };
  },
});

// --- move_node ---
registerOperation({
  manifest: {
    name: "move_node",
    description: "Move one or more nodes to a new position.",
    category: "layout" as const,
    params: {
      node_ids: { type: "string[]", required: true, description: "Array of node IDs" },
      x: { type: "number", required: false, description: "New X position" },
      y: { type: "number", required: false, description: "New Y position" },
      dx: { type: "number", required: false, description: "Relative X offset" },
      dy: { type: "number", required: false, description: "Relative Y offset" },
    },
    returns: "{ moved, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma } = ctx;
    var moved = 0;
    for (var i = 0; i < (params.node_ids as string[]).length; i++) {
      var id = (params.node_ids as string[])[i];
      var node = figma.getNodeById(id);
      if (node && "x" in node) {
        var n = node as SceneNode;
        if (params.x !== undefined) n.x = params.x as number;
        if (params.y !== undefined) n.y = params.y as number;
        if (params.dx !== undefined) n.x += params.dx as number;
        if (params.dy !== undefined) n.y += params.dy as number;
        moved++;
      }
    }
    figma.commitUndo();
    return { moved: moved, summary: "Moved " + moved + " nodes." };
  },
});

// --- resize_node ---
registerOperation({
  manifest: {
    name: "resize_node",
    description: "Resize one or more nodes to new dimensions.",
    category: "layout" as const,
    params: {
      node_ids: { type: "string[]", required: true, description: "Array of node IDs" },
      width: { type: "number", required: false, description: "New width" },
      height: { type: "number", required: false, description: "New height" },
    },
    returns: "{ resized, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma } = ctx;
    var resized = 0;
    for (var i = 0; i < (params.node_ids as string[]).length; i++) {
      var id = (params.node_ids as string[])[i];
      var node = figma.getNodeById(id);
      if (node && "resize" in node) {
        var n = node as SceneNode & { resize(w: number, h: number): void };
        var w = params.width !== undefined ? (params.width as number) : n.width;
        var h = params.height !== undefined ? (params.height as number) : n.height;
        n.resize(w, h);
        resized++;
      }
    }
    figma.commitUndo();
    return { resized: resized, summary: "Resized " + resized + " nodes." };
  },
});

// --- delete_node ---
registerOperation({
  manifest: {
    name: "delete_node",
    description: "Delete one or more nodes by ID.",
    category: "cleanup" as const,
    params: {
      node_ids: { type: "string[]", required: true, description: "Array of node IDs to delete" },
    },
    returns: "{ deleted, not_found, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma } = ctx;
    var deleted = 0;
    var not_found = 0;
    for (var i = 0; i < (params.node_ids as string[]).length; i++) {
      var id = (params.node_ids as string[])[i];
      var node = figma.getNodeById(id);
      if (node && node.id !== figma.currentPage.id) {
        node.remove();
        deleted++;
      } else {
        not_found++;
      }
    }
    figma.commitUndo();
    return {
      deleted: deleted,
      not_found: not_found,
      summary:
        "Deleted " + deleted + " nodes." + (not_found ? " " + not_found + " not found." : ""),
    };
  },
});

// --- clone_node ---
registerOperation({
  manifest: {
    name: "clone_node",
    description: "Clone a node and optionally reposition the copy.",
    category: "components" as const,
    params: {
      node_id: { type: "string", required: true, description: "Node ID to clone" },
      x: { type: "number", required: false, description: "X position of clone" },
      y: { type: "number", required: false, description: "Y position of clone" },
      new_name: { type: "string", required: false, description: "Name for the clone" },
    },
    returns: "{ cloneId, cloneName, summary }",
  },
  async execute(ctx: OperationContext) {
    var { params, figma } = ctx;
    var node = figma.getNodeById(params.node_id as string);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
      return { cloneId: null, cloneName: null, summary: "Node not found or not cloneable." };
    }
    var clone = (node as FrameNode).clone();
    if (params.x !== undefined) clone.x = params.x as number;
    if (params.y !== undefined) clone.y = params.y as number;
    if (params.new_name) clone.name = params.new_name as string;
    return {
      cloneId: clone.id,
      cloneName: clone.name,
      summary: 'Cloned "' + node.name + '" → "' + clone.name + '" (' + clone.id + ").",
    };
  },
});
