import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPluginOSServer } from "./server.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runDaemon } from "./daemon.js";
import { defaultStateDir } from "./singleton/index.js";

export { createPluginOSServer } from "./server.js";
export {
  WebSocketPluginBridge,
  WebSocketPluginBridge as PluginOSWebSocketServer,
} from "./WebSocketPluginBridge.js";
export type { IPluginBridge, BridgeStatus, FileInfo } from "@pluginos/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

  const result = await runDaemon({
    stateDir: defaultStateDir(),
    portRange: [9500, 9510],
    version: pkg.version,
    parentPid: process.ppid,
  });
  if (result === null || "attachInsteadPort" in result) {
    // Shim mode lands in Task 11; until then, mirror old newest-wins startup.
    console.error("PluginOS: another equal-version daemon is running; exiting (shim in Task 11).");
    process.exit(0);
    return;
  }
  const mcpServer = createPluginOSServer(result.bridge, {
    getAgentCount: () => result.agentEndpoint.getCount(),
  });
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
