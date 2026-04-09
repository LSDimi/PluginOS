import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PluginOSWebSocketServer } from "./websocket.js";
import { createPluginOSServer } from "./server.js";

export { createPluginOSServer } from "./server.js";
export { PluginOSWebSocketServer } from "./websocket.js";

async function main() {
  const wsServer = new PluginOSWebSocketServer();
  const port = await wsServer.start();
  console.error(`PluginOS WebSocket server listening on port ${port}`);

  const mcpServer = createPluginOSServer(wsServer);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
