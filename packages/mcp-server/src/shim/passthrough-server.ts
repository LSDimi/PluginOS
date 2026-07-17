import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

export const LINK_WAIT_MS = 10_000;
/** Must exceed wait_for_reconnect's 300s ceiling — the daemon owns real timeouts. */
export const FORWARD_TIMEOUT_MS = 600_000;

const UNAVAILABLE_TEXT =
  "PluginOS daemon restarting — retry this call, or call wait_for_reconnect.";

/**
 * The session layer: a stdio-facing MCP server that terminates the MCP
 * session locally (so the client never re-initializes) and forwards tool
 * traffic to whatever daemon link is current. Tool definitions are always
 * the DAEMON's — a version-skewed shim serves its daemon's surface.
 */
export function createShimServer(
  waitForLink: () => Promise<Client | null>,
  shimVersion: string
): Server {
  const server = new Server(
    { name: "pluginos", version: shimVersion },
    { capabilities: { tools: { listChanged: true } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const link = await waitForLink();
    if (!link) {
      throw new McpError(ErrorCode.InternalError, UNAVAILABLE_TEXT);
    }
    return await link.listTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const link = await waitForLink();
    if (!link) {
      return { content: [{ type: "text" as const, text: UNAVAILABLE_TEXT }], isError: true };
    }
    return await link.callTool(
      { name: req.params.name, arguments: req.params.arguments },
      undefined,
      { timeout: FORWARD_TIMEOUT_MS }
    );
  });

  return server;
}
