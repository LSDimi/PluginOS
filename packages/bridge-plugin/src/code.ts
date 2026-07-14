import { getOperation, listOperations } from "./operations/index";
import { createOperationContext, resolvePageTarget } from "./operations/context";
import { safeSerialize } from "./utils/serializer";
import { handleOpenExternal } from "./handlers/open-external";
import { resolveFileId } from "./utils/file-identity";
import { getPat, setPat, clearPat } from "./utils/pat";

// Show the UI (which handles WebSocket)
figma.showUI(__html__, { width: 360, height: 600, themeColors: true });

function sendTheme(): void {
  // @ts-expect-error figma.editorPreferences is not in older @figma/plugin-typings
  const theme = (figma.editorPreferences as { theme?: string } | undefined)?.theme;
  figma.ui.postMessage({ type: "THEME_CHANGE", theme: theme === "dark" ? "dark" : "light" });
}

function sendFileName(): void {
  figma.ui.postMessage({ type: "FILE_NAME", name: figma.root.name });
}

sendTheme();
sendFileName();

// Send file status to MCP server on connection
async function sendFileStatus(): Promise<void> {
  const fileKey = resolveFileId(figma);
  const fileName = figma.root.name;
  const currentPage = figma.currentPage.name;
  const restConfigured = (await getPat(figma)) !== null;

  figma.ui.postMessage({
    type: "ws-send",
    payload: {
      type: "status",
      fileKey,
      fileName,
      currentPage,
      rest_configured: restConfigured,
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

  if (msg.type === "SET_PAT") {
    await setPat(figma, String(msg.token ?? ""));
    figma.ui.postMessage({ type: "PAT_STATUS", configured: (await getPat(figma)) !== null });
    await sendFileStatus();
    return;
  }
  if (msg.type === "CLEAR_PAT") {
    await clearPat(figma);
    figma.ui.postMessage({ type: "PAT_STATUS", configured: false });
    await sendFileStatus();
    return;
  }
  if (msg.type === "GET_PAT_STATUS") {
    figma.ui.postMessage({ type: "PAT_STATUS", configured: (await getPat(figma)) !== null });
    return;
  }

  if (msg.type === "ws-connected") {
    // The startup sendFileName landed in the bootloader iframe, which
    // document.write()s itself away when it swaps in the real UI — resend
    // so the post-swap UI has it. Deliberately NOT resending the theme:
    // editorPreferences.theme reports "system" when the user follows the
    // OS theme, which sendTheme coerces to "light" and would clobber the
    // UI's own (correct) matchMedia detection from bootstrap.
    sendFileName();
    void sendFileStatus();
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

      const opParams = params || {};

      // Resolve an explicit page target (page_name/page_id) without moving the
      // viewport. Not-found returns a value, not a throw.
      const pageRes = await resolvePageTarget(opParams, figma);
      if (pageRes && pageRes.error) {
        sendResult(id, true, { error: pageRes.error, available_pages: pageRes.available_pages });
        return;
      }

      const startTime = Date.now();
      const ctx = createOperationContext(opParams, handler.manifest.defaultScope ?? "page", {
        opName: handler.manifest.name,
        preResolvedNodes: pageRes ? pageRes.nodes : undefined,
      });
      if (ctx.guard) {
        sendResult(id, true, ctx.guard);
        return;
      }
      let result = await handler.execute(ctx);
      const duration = Date.now() - startTime;

      // Warn-on-empty: a page-scope scan that matches 0 nodes is almost always
      // the wrong page (e.g. currentPage drifted). Surface a hint instead of a
      // silent clean pass.
      const scope =
        typeof opParams.scope === "string"
          ? opParams.scope
          : (handler.manifest.defaultScope ?? "page");
      const usedPageScope = pageRes != null || scope === "page";
      if (
        usedPageScope &&
        result &&
        typeof result === "object" &&
        !(result as any)._hint &&
        ctx.nodes.length === 0
      ) {
        result = {
          ...(result as object),
          _hint: `Page ${pageRes && pageRes.pageName ? `'${pageRes.pageName}' ` : ""}has 0 nodes — likely the wrong page. Pass page_name to target a specific page.`,
        };
      }

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
figma.on("currentpagechange", () => void sendFileStatus());

// NOTE: figma.on("documentchange", ...) requires figma.loadAllPagesAsync() first
// when the manifest uses documentAccess: "dynamic-page" (which we do). The filename
// is captured once at plugin open via sendFileName(); rename-during-session is rare
// enough that we accept the staleness rather than pay the loadAllPagesAsync cost.

// Re-send theme whenever Figma's editor theme changes (light/dark toggle).
// `themechange` is a newer event; wrap in try/catch so older clients don't crash.
try {
  // @ts-expect-error themechange is not in older @figma/plugin-typings
  figma.on("themechange", sendTheme);
} catch {
  // ignored — event unsupported in this Figma client
}
