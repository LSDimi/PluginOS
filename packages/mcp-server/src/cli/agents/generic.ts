/* eslint-disable no-console -- CLI module emits user-facing stdout messages */
const SNIPPET = `{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["-y", "pluginos@latest"]
    }
  }
}`;

export function printGenericMcpConfig(): void {
  console.log("For any MCP-compatible agent, add this to your config:");
  console.log("");
  console.log(SNIPPET);
  console.log("");
  console.log("Common config locations:");
  console.log("  - Cursor:        ~/.cursor/mcp.json");
  console.log("  - Windsurf:      ~/.codeium/windsurf/mcp_config.json");
  console.log("  - Custom:        check your agent's docs");
}

export async function runGenericAgent(): Promise<number> {
  printGenericMcpConfig();
  return 0;
}
