import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createRunOperationMessage,
  createExecuteMessage,
  CATEGORY_DESCRIPTIONS,
} from "@pluginos/shared";
import type { IPluginBridge } from "@pluginos/shared";

export function createPluginOSServer(bridge: IPluginBridge) {
  const server = new McpServer({
    name: "pluginos",
    version: "0.1.0",
  });

  // @ts-expect-error TS2589: MCP SDK's .tool() triggers infinite type depth
  server.tool(
    "list_operations",
    "List all available Figma operations, optionally filtered by category. " +
      "Categories: " +
      Object.keys(CATEGORY_DESCRIPTIONS).join(", "),
    {
      category: z
        .string()
        .optional()
        .describe("Filter by category. Options: " + Object.keys(CATEGORY_DESCRIPTIONS).join(", ")),
    },
    async ({ category }) => {
      const msg = createRunOperationMessage("__list_operations", {
        category: category || null,
      });

      try {
        const result = await bridge.sendAndWait(msg, 5000);
        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result.result, null, 2),
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // @ts-expect-error TS2589: MCP SDK's .tool() triggers infinite type depth
  server.tool(
    "run_operation",
    "Execute a pre-built Figma operation by name. Use list_operations to discover available operations. " +
      "Operations run inside the Figma plugin with full Plugin API access. " +
      "Results are structured and summarized — no raw node data.",
    {
      name: z.string().describe("Operation name (e.g., 'lint_styles', 'check_contrast')"),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .default({})
        .describe("Operation parameters"),
      file_key: z
        .string()
        .optional()
        .describe("Target a specific connected file by its key. If omitted, uses the active file."),
    },
    async ({ name, params, file_key }) => {
      const msg = createRunOperationMessage(name, params);

      try {
        const result = await bridge.sendAndWait(msg, 30000, file_key);
        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result.result, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Operation '${name}' failed: ${result.error}`,
            },
          ],
          isError: true,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // @ts-expect-error TS2589: MCP SDK's .tool() triggers infinite type depth
  server.tool(
    "execute_figma",
    "Execute arbitrary Figma Plugin API JavaScript code in the plugin sandbox. " +
      "Use this as a fallback when no pre-built operation covers your need. " +
      "The code runs in an async context with full access to the `figma` global. " +
      "Return data via `return` statement. Max timeout 30 seconds.",
    {
      code: z.string().describe("JavaScript code to execute in Figma's Plugin API context"),
      timeout: z.number().optional().default(5000).describe("Timeout in ms (max 30000)"),
      file_key: z.string().optional().describe("Target a specific connected file by its key."),
    },
    async ({ code, timeout, file_key }) => {
      const safeTimeout = Math.min(timeout, 30000);
      const msg = createExecuteMessage(code, safeTimeout);

      try {
        const result = await bridge.sendAndWait(msg, safeTimeout + 2000, file_key);
        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result.result, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Execution failed: ${result.error}`,
            },
          ],
          isError: true,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_status",
    "Check if the PluginOS Bridge plugin is connected and which Figma file is active.",
    {},
    async () => {
      const status = bridge.getStatus();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_files",
    "List all Figma files currently connected to PluginOS via the bridge plugin.",
    {},
    async () => {
      const files = bridge.listFiles();
      const status = bridge.getStatus();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              active_file: status.fileKey,
              connected_files: files,
              total: files.length,
            }),
          },
        ],
      };
    }
  );

  return server;
}
