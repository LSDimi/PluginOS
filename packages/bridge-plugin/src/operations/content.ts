import { registerOperation } from "./registry";
import type { OperationContext } from "./context";

var LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

// --- populate_text ---
registerOperation({
  manifest: {
    name: "populate_text",
    description:
      "Fill text nodes with placeholder content (lorem ipsum) or custom text. Can target selection or all text nodes matching a name pattern.",
    category: "content" as const,
    params: {
      text: {
        type: "string",
        required: false,
        description: "Custom text to populate. If omitted, uses lorem ipsum.",
      },
      name_pattern: {
        type: "string",
        required: false,
        description: "Regex pattern to match node names (e.g. 'placeholder|lorem')",
      },
      scope: { type: "string", required: false, description: "'page' (default) or 'selection'" },
      max_chars: {
        type: "number",
        required: false,
        description: "Max characters per node (default: no limit)",
      },
    },
    returns: "{ populated, summary }",
  },
  async execute(ctx: OperationContext) {
    var { nodes, params, figma } = ctx;
    var content = (params.text as string) || LOREM;
    var pattern = params.name_pattern ? new RegExp(params.name_pattern as string, "i") : null;

    var textNodes = nodes.filter(function (n) {
      return n.type === "TEXT";
    }) as TextNode[];

    var populated = 0;
    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      if (pattern && !pattern.test(node.name)) continue;
      var fontName = node.fontName;
      if (fontName === figma.mixed) {
        var ranges = node.getStyledTextSegments(["fontName"]);
        for (var r = 0; r < ranges.length; r++) {
          await figma.loadFontAsync(ranges[r].fontName);
        }
      } else {
        await figma.loadFontAsync(fontName);
      }
      var text = params.max_chars ? content.slice(0, params.max_chars as number) : content;
      node.characters = text;
      populated++;
    }

    figma.commitUndo();
    return {
      populated: populated,
      summary: "Populated " + populated + " text nodes.",
    };
  },
});
