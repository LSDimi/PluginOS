import { initAgentPicker, getCurrentAgent } from "./ui/agent-picker";
import { attachThemeListener, detectInitialTheme, applyTheme } from "./ui/theme";
import { getLastPort, setLastPort } from "./ui/storage";
import { ActivityLog, type LogEntry } from "./ui/activity-log";
import { isCompatible } from "./ui/version-check";
import {
  VERSION,
  DXT_DOWNLOAD_URL,
  CLAUDE_CODE_STEP_1,
  CLAUDE_CODE_STEP_2,
  CURSOR_NPX_COMMAND,
  CURSOR_MCP_CONFIG,
  TIER_1_RULES,
  WHY_THIS_SETUP,
} from "./ui/strings";

const PORT_MIN = 9500;
const PORT_MAX = 9510;
const RECONNECT_BACKOFF_MS = [1000, 3000, 5000, 10000];
const RECONNECT_GIVEUP_MS = 30_000;

type StatusState = "disconnected" | "connecting" | "connected" | "running" | "mismatch";

let activeSocket: WebSocket | null = null;
let isScanning = false;
let reconnectIndex = 0;
let reconnectTimer: number | null = null;
let reconnectStartedAt = 0;
let activityLog: ActivityLog;
let runStartedAt = 0;
let elapsedTimer: number | null = null;
let cachedFileName = "—";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function setStatus(state: StatusState, text?: string): void {
  const pill = $("status-pill");
  pill.dataset.state = state;
  const textMap: Record<StatusState, string> = {
    disconnected: "Not connected",
    connecting: "Connecting…",
    connected: "Connected",
    running: "Running",
    mismatch: "Update needed",
  };
  $("status-text").textContent = text ?? textMap[state];
}

function showView(view: "disconnected" | "connected" | "mismatch"): void {
  $("view-disconnected").hidden = view !== "disconnected";
  $("view-connected").hidden = view !== "connected";
  $("view-mismatch").hidden = view !== "mismatch";
}

function showRunning(running: boolean, op?: string, params?: Record<string, unknown>): void {
  $("running-block").hidden = !running;
  $("idle-block").hidden = running;
  if (running) {
    runStartedAt = Date.now();
    $("run-op").textContent = op ?? "—";
    $("run-params").textContent = formatParams(params);
    if (elapsedTimer != null) window.clearInterval(elapsedTimer);
    elapsedTimer = window.setInterval(() => {
      const s = ((Date.now() - runStartedAt) / 1000).toFixed(1);
      $("run-elapsed").textContent = `${s}s elapsed`;
    }, 100);
    setStatus("running");
  } else {
    if (elapsedTimer != null) window.clearInterval(elapsedTimer);
    elapsedTimer = null;
    setStatus("connected");
  }
}

function formatParams(p: Record<string, unknown> | undefined): string {
  if (!p) return "—";
  const entries = Object.entries(p);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
    .join(" · ");
}

function wireCopyButtons(): void {
  const map: Record<string, () => string> = {
    "cc-1": () => CLAUDE_CODE_STEP_1,
    "cc-2": () => CLAUDE_CODE_STEP_2,
    "other-1": () => CURSOR_NPX_COMMAND,
    "other-2": () => CURSOR_MCP_CONFIG,
    "other-3": () => TIER_1_RULES,
    mismatch: () => $("mismatch-cmd").textContent ?? "",
  };
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.copy ?? "";
      const text = map[key]?.() ?? "";
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add("copied");
        btn.textContent = "✓ Copied";
      } catch {
        btn.textContent = "⚠ Copy failed";
      }
      window.setTimeout(() => {
        btn.classList.remove("copied");
        btn.textContent = original ?? "Copy";
      }, 1500);
    });
  });
}

function populateStaticStrings(): void {
  $("cc-cmd-1").textContent = CLAUDE_CODE_STEP_1;
  $("cc-cmd-2").textContent = CLAUDE_CODE_STEP_2;
  $("other-cmd").textContent = CURSOR_NPX_COMMAND;
  $("other-config").textContent = CURSOR_MCP_CONFIG;
  $("why-text").textContent = WHY_THIS_SETUP;
}

function wireWhyToggle(): void {
  const wrap = document.querySelector(".why") as HTMLElement;
  $("why-toggle").addEventListener("click", () => {
    const expanded = wrap.getAttribute("aria-expanded") === "true";
    wrap.setAttribute("aria-expanded", expanded ? "false" : "true");
  });
}

function wireRetryButton(): void {
  $("btn-check").addEventListener("click", () => {
    cancelReconnect();
    void scanAndConnect();
  });
}

function wireDxtButton(): void {
  // Use figma.openExternal via code.ts — clicking an <a href> would navigate
  // the plugin iframe itself and blank the UI (see handlers/open-external.ts).
  $("btn-dxt").addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "open-external", url: DXT_DOWNLOAD_URL } }, "*");
  });
}

function recordHistory(entry: LogEntry): void {
  activityLog.push(entry);
  activityLog.render();
}

function showMismatch(serverVersion: string): void {
  const agent = getCurrentAgent();
  const cmd =
    agent === "claude-desktop"
      ? `Re-download ${DXT_DOWNLOAD_URL}`
      : agent === "claude-code"
        ? `/plugin marketplace update LSDimi/pluginos`
        : `npx pluginos@${VERSION}`;
  $("mismatch-cmd").textContent = cmd;
  $("mismatch-text").textContent =
    `Plugin v${VERSION} expects a compatible server. Server reported v${serverVersion}.`;
  setStatus("mismatch");
  showView("mismatch");
}

async function scanAndConnect(): Promise<void> {
  if (isScanning) return;
  isScanning = true;
  try {
    setStatus("connecting");
    const lastPort = getLastPort();
    const order: number[] = [];
    if (lastPort) order.push(lastPort);
    for (let p = PORT_MIN; p <= PORT_MAX; p++) if (p !== lastPort) order.push(p);

    for (const port of order) {
      const ok = await tryConnect(port);
      if (ok) {
        setLastPort(port);
        return;
      }
    }
    setStatus("disconnected");
    scheduleReconnect();
  } finally {
    isScanning = false;
  }
}

function tryConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`ws://localhost:${port}`);
    } catch {
      return resolve(false);
    }
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          socket?.close();
        } catch {
          /* ignore */
        }
        resolve(false);
      }
    }, 1500);
    socket.addEventListener("open", () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      activeSocket = socket;
      attachSocketHandlers(socket!, port);
      resolve(true);
    });
    socket.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        resolve(false);
      }
    });
  });
}

function attachSocketHandlers(socket: WebSocket, port: number): void {
  socket.addEventListener("message", (e: MessageEvent) => {
    const raw = typeof e.data === "string" ? e.data : "";
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type === "SERVER_HELLO") {
      if (!isCompatible(VERSION, msg.version ?? "")) {
        showMismatch(msg.version ?? "unknown");
        // Stop the relay before tearing down so the close handler sees we
        // intentionally disconnected (no reconnect scheduling).
        activeSocket = null;
        socket.close();
        return;
      }
      $("port-url").textContent = `ws://localhost:${port}`;
      $("file-name").textContent = cachedFileName;
      setStatus("connected");
      showView("connected");
      activityLog.render();
      reconnectIndex = 0;
      // Tell code.ts so it can post the initial status (file name, etc.) back through us.
      parent.postMessage({ pluginMessage: { type: "ws-connected" } }, "*");
      return;
    }
    if (msg?.type === "OP_START") {
      showRunning(true, msg.op, msg.params);
      // OP_START/OP_END are local-only telemetry, never forwarded to code.ts.
      return;
    }
    if (msg?.type === "OP_END") {
      showRunning(false);
      recordHistory({
        op: msg.op,
        status: msg.status === "ok" ? "ok" : "error",
        durationMs: msg.durationMs ?? 0,
        params: msg.params ?? {},
        error: msg.error,
      });
      return;
    }
    // Everything else (run_operation, execute, etc.) is forwarded to code.ts via postMessage.
    parent.postMessage({ pluginMessage: { type: "ws-message", payload: msg } }, "*");
  });

  socket.addEventListener("close", () => {
    if (activeSocket === socket) activeSocket = null;
    parent.postMessage({ pluginMessage: { type: "ws-disconnected" } }, "*");
    setStatus("connecting", "Reconnecting…");
    scheduleReconnect();
  });
}

/**
 * Listen for postMessage from code.ts and forward outbound `ws-send` payloads
 * to the live MCP-server socket. Also picks up THEME_CHANGE and FILE_NAME
 * messages (handled by theme.ts and bootstrap's own listener respectively, but
 * surfaced here for the ws-send relay).
 */
function attachOutboundRelay(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg || msg.type !== "ws-send") return;
    if (activeSocket?.readyState === WebSocket.OPEN) {
      try {
        activeSocket.send(JSON.stringify(msg.payload));
      } catch {
        // ignored — socket may have closed mid-send; reconnect logic will handle it.
      }
    }
  });
}

function scheduleReconnect(): void {
  if (reconnectIndex === 0) reconnectStartedAt = Date.now();
  const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectIndex, RECONNECT_BACKOFF_MS.length - 1)];
  reconnectIndex += 1;
  reconnectTimer = window.setTimeout(() => {
    if (Date.now() - reconnectStartedAt > RECONNECT_GIVEUP_MS) {
      reconnectIndex = 0;
      setStatus("disconnected");
      showView("disconnected");
      return;
    }
    void scanAndConnect();
  }, delay);
}

function cancelReconnect(): void {
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectIndex = 0;
}

function attachPluginMessageListener(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === "FILE_NAME") {
      cachedFileName = msg.name ?? "—";
      const el = document.getElementById("file-name");
      if (el) el.textContent = cachedFileName;
    }
    // THEME_CHANGE is handled by theme.ts's own listener.
  });
}

function bootstrap(): void {
  applyTheme(detectInitialTheme());
  attachThemeListener();
  attachPluginMessageListener();
  attachOutboundRelay();
  initAgentPicker();
  populateStaticStrings();
  wireCopyButtons();
  wireWhyToggle();
  wireRetryButton();
  wireDxtButton();
  activityLog = new ActivityLog($("activity-log"));
  activityLog.render();
  void scanAndConnect();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
