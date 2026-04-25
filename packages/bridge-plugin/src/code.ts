import { getOperation, listOperations } from "./operations/index";
import { createOperationContext } from "./operations/context";
import { safeSerialize } from "./utils/serializer";
import { handleOpenExternal } from "./handlers/open-external";

// Show the UI (which handles WebSocket)
figma.showUI(__html__, { width: 320, height: 480, themeColors: true });

// Send file status to MCP server on connection
function sendFileStatus(): void {
  const fileKey = figma.fileKey;
  const fileName = figma.root.name;
  const currentPage = figma.currentPage.name;

  figma.ui.postMessage({
    type: "ws-send",
    payload: {
      type: "status",
      fileKey: fileKey || "unknown",
      fileName,
      currentPage,
    },
  });
}

// Handle messages from the UI (which come from the WebSocket)
figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "__ui_list_operations") {
    figma.ui.postMessage({ type: "__ui_list_operations_result", operations: listOperations() });
    return;
  }

  if (handleOpenExternal(msg, figma)) {
    return;
  }

  if (msg.type === "ws-connected") {
    sendFileStatus();
    return;
  }

  if (msg.type === "ws-disconnected") {
    return;
  }

  if (msg.type === "ws-message") {
    const data = msg.payload;
    await handleServerMessage(data);
  }
};

async function handleServerMessage(msg: any): Promise<void> {
  const { id, type } = msg;

  try {
    if (type === "run_operation") {
      const { operation, params } = msg;

      // Special internal operation: list all operations
      if (operation === "__list_operations") {
        const manifests = listOperations(params?.category || undefined);
        sendResult(id, true, manifests);
        return;
      }

      const handler = getOperation(operation);
      if (!handler) {
        sendResult(id, false, undefined, `Unknown operation: '${operation}'`);
        return;
      }

      const startTime = Date.now();
      const ctx = createOperationContext(params || {}, handler.manifest.defaultScope ?? "page", {
        opName: handler.manifest.name,
      });
      if (ctx.guard) {
        sendResult(id, true, ctx.guard);
        return;
      }
      const result = await handler.execute(ctx);
      const duration = Date.now() - startTime;
      sendResult(id, true, { ...(safeSerialize(result) as object), _duration_ms: duration });
    } else if (type === "execute") {
      const { code, timeout } = msg;
      const wrappedCode = `(async function() {\n${code}\n})()`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeout}ms`)), timeout)
      );

      const codePromise = eval(wrappedCode);
      const result = await Promise.race([codePromise, timeoutPromise]);
      sendResult(id, true, safeSerialize(result));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendResult(id, false, undefined, errorMessage);
  }
}

function sendResult(id: string, success: boolean, result?: unknown, error?: string): void {
  figma.ui.postMessage({
    type: "ws-send",
    payload: { id, type: "result", success, result, error },
  });
}

// Catch unhandled promise rejections (safety net)
if (typeof self !== "undefined" && "addEventListener" in self) {
  (self as any).addEventListener("unhandledrejection", function (event: any) {
    console.error("[PluginOS] Unhandled rejection:", event.reason);
  });
}

// Update status when page changes
figma.on("currentpagechange", sendFileStatus);
