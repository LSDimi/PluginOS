import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketPluginBridge } from "./WebSocketPluginBridge.js";
import { createPluginOSServer } from "./server.js";
import { createHttpServer } from "./http-server.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export { createPluginOSServer } from "./server.js";
export {
  WebSocketPluginBridge,
  WebSocketPluginBridge as PluginOSWebSocketServer,
} from "./WebSocketPluginBridge.js";
export type { IPluginBridge, BridgeStatus, FileInfo } from "@pluginos/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUiContent(): string {
  const candidates = [
    // Bundled alongside dist (npm/npx installs)
    join(__dirname, "ui.html"),
    // Monorepo development
    join(__dirname, "../../bridge-plugin/dist/ui.html"),
    join(process.cwd(), "packages/bridge-plugin/dist/ui.html"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf-8");
    }
  }
  return "<html><body><p>PluginOS UI not found. Run: npm run build -w packages/bridge-plugin</p></body></html>";
}

async function main() {
  // Re-read on every request so rebuilds land without restarting the server.
  // ui.html is ~70KB; the tradeoff is worth the smoother dev loop and avoids
  // stale UIs when users swap between local and published builds.
  const httpServer = createHttpServer(() => loadUiContent());

  const wsServer = new WebSocketPluginBridge({ httpServer });
  const port = await wsServer.start();
  console.error(`PluginOS WebSocket + HTTP server on port ${port}`);

  const mcpServer = createPluginOSServer(wsServer);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
