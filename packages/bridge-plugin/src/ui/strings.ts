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
