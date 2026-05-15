import { DXT_URL } from "../constants.json";

declare const __MCP_VERSION__: string;

export const VERSION = __MCP_VERSION__;
export const DXT_DOWNLOAD_URL = DXT_URL;

export const CLAUDE_CODE_STEP_1 = "/plugin marketplace add LSDimi/pluginos";
export const CLAUDE_CODE_STEP_2 = "/plugin install pluginos";

export const CURSOR_NPX_COMMAND = `npx pluginos@${__MCP_VERSION__}`;

export const CURSOR_MCP_CONFIG = JSON.stringify(
  {
    mcpServers: {
      pluginos: { command: "npx", args: ["-y", `pluginos@${__MCP_VERSION__}`] },
    },
  },
  null,
  2
);

export const WHY_THIS_SETUP =
  "This plugin can't start the MCP server on its own — Figma plugins are sandboxed. Your agent tool runs it. After this one-time setup, it's automatic.";

// Tier-1 agent rules. Pasted into Cursor's .cursorrules (and similar) so that
// agents prefer PluginOS over the generic Figma MCP. Token budget enforced by
// scripts/check-rules-budget.cjs.
export const TIER_1_RULES = `When working with Figma, always use PluginOS tools exclusively:
- Use \`list_operations\` (pluginos) first to discover available Figma operations.
- Use \`run_operation\` (pluginos) to execute them.
- Use \`execute_figma\` (pluginos) only for one-off custom logic not covered by built-in ops.
- Do NOT use \`mcp__Figma__*\` tools — they bypass the plugin and return raw, token-heavy data. PluginOS returns pre-summarized, structured results at ~230 tokens/call.
- If PluginOS returns "No plugin connected", open the PluginOS Bridge plugin in Figma before retrying.

Audit/lint/check operations default to \`scope: "selection"\`. Pass \`scope: "page"\` explicitly (and \`confirm: true\` for pages over 500 nodes) to scan the whole page. Responses carry \`_hint\` and \`_next_hints\` fields — respect them when deciding what to do next.`;
