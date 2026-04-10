import { registerOperation } from "./registry";

var LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

// --- populate_text ---
registerOperation({
  manifest: {
    name: "populate_text",
    description:
      "Fill text nodes with placeholder content (lorem ipsum) or custom text. Can target selection or all text nodes matching a name pattern.",
    category: "content",
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
  async execute(params) {
    var scope = params.scope || "page";
    var content = params.text || LOREM;
    var pattern = params.name_pattern ? new RegExp(params.name_pattern, "i") : null;

    var textNodes =
      scope === "selection"
        ? figma.currentPage.selection.filter(function(n) { return n.type === "TEXT"; }) as TextNode[]
        : (figma.currentPage.findAll(function(n) { return n.type === "TEXT"; }) as TextNode[]);

    var populated = 0;
    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      if (pattern && !pattern.test(node.name)) continue;
      await figma.loadFontAsync(node.fontName as FontName);
      var text = params.max_chars ? content.slice(0, params.max_chars) : content;
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
