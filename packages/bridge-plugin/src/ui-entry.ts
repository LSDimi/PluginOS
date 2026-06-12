import { initAgentPicker, getCurrentAgent } from "./ui/agent-picker";
import { attachThemeListener, detectInitialTheme, applyTheme } from "./ui/theme";
import { getLastPort, setLastPort } from "./ui/storage";
import { ActivityLog, type LogEntry } from "./ui/activity-log";
import { isCompatible } from "./ui/version-check";
import { connectWithHello } from "./ui/connect";
import { discoverCandidatePorts } from "./discovery";
import { renderUI, formatElapsed, type AppState } from "./ui/render-ui";
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
let cachedFileName = "—";
let currentState: AppState = { kind: "disconnected" };
let elapsedTimer: number | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function setState(next: AppState): void {
  currentState = next;
  renderUI(next);
  if (activityLog) {
    activityLog.render();
  }

  if (next.kind === "connected" && next.running) {
    if (elapsedTimer === null) {
      elapsedTimer = window.setInterval(() => {
        if (currentState.kind === "connected" && currentState.running) {
          const elapsed = document.getElementById("run-elapsed");
          if (elapsed) {
            elapsed.textContent = formatElapsed(Date.now() - currentState.running.startedAt);
          }
        }
      }, 100);
    }
  } else if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function computeNextStateFromStatus(prev: AppState, status: StatusState): AppState {
  switch (status) {
    case "disconnected":
      return { kind: "disconnected" };
    case "connecting":
      return {
        kind: "connecting",
        lastKnownPort:
          prev.kind === "connected"
            ? prev.port
            : prev.kind === "connecting"
              ? prev.lastKnownPort
              : null,
      };
    case "connected":
      if (prev.kind === "connected") {
        return { ...prev, running: null };
      }
      return {
        kind: "connected",
        file: { name: "—", key: "—" },
        port: 0,
        running: null,
      };
    case "running":
      // running is set by the op-start code path that has the op info;
      // a bare setStatus("running") preserves prev state.
      return prev;
    case "mismatch":
      return {
        kind: "mismatch",
        reason: "",
        serverVersion: "—",
        pluginVersion: "—",
      };
  }
}

function setStatus(state: StatusState, _text?: string): void {
  // Adapter: maps the old 5-state model onto the new AppState union.
  // Existing call sites still work; future PR can inline at the call sites.
  const next = computeNextStateFromStatus(currentState, state);
  setState(next);
}

function showView(_view: "disconnected" | "connected" | "mismatch"): void {
  // Adapter: view switching is now driven by setState/renderUI.
  // Kept as a no-op so existing call sites compile during the migration.
}

function showRunning(running: boolean, op?: string, params?: Record<string, unknown>): void {
  if (running) {
    if (currentState.kind === "connected") {
      setState({
        ...currentState,
        running: {
          name: op ?? "—",
          paramsPreview: formatParams(params),
          startedAt: Date.now(),
        },
      });
    }
  } else {
    if (currentState.kind === "connected") {
      setState({ ...currentState, running: null });
    }
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

function wireMismatchCopyButtons(): void {
  function copyWithFeedback(btn: HTMLElement, sourceId: string): void {
    const text = document.getElementById(sourceId)?.textContent ?? "";
    const original = btn.textContent;
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "✓ Copied";
      } catch {
        btn.textContent = "⚠ Copy failed";
      }
      window.setTimeout(() => {
        btn.textContent = original ?? "Copy";
      }, 1500);
    })();
  }
  document.getElementById("btn-copy-update")?.addEventListener("click", (e) => {
    copyWithFeedback(e.currentTarget as HTMLElement, "mismatch-cmd");
  });
  document.getElementById("btn-copy-path")?.addEventListener("click", (e) => {
    copyWithFeedback(e.currentTarget as HTMLElement, "mismatch-path");
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
  setState({
    kind: "mismatch",
    reason: "Reinstall both halves of PluginOS to the same version.",
    serverVersion: serverVersion ?? "—",
    pluginVersion: VERSION,
    command: cmd,
  });
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

    // Phase 1: discovery probe — find live servers via /state.json
    const ranked = await discoverCandidatePorts(order);

    // Phase 2: try ranked candidates first (parentAlive=true, newest first)
    for (const candidate of ranked) {
      const ok = await tryConnect(candidate.port);
      if (ok) {
        setLastPort(candidate.port);
        return;
      }
    }

    // Phase 3: fallback — try all ports in original order (preserves existing scan behavior)
    const triedPorts = new Set(ranked.map((c) => c.port));
    for (const port of order) {
      if (triedPorts.has(port)) continue;
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

async function tryConnect(port: number): Promise<boolean> {
  // A socket that opens is not a working server: legacy pre-0.5.0 servers
  // accept connections but never send SERVER_HELLO. Success requires the
  // hello within the deadline, otherwise we close and try the next port.
  const result = await connectWithHello(`ws://localhost:${port}`, {
    openTimeoutMs: 1500,
    helloTimeoutMs: 2000,
  });
  if (!result) return false;
  const socket = result.socket as WebSocket;
  if (activeSocket && activeSocket !== socket) {
    try {
      activeSocket.close();
    } catch {
      /* ignore */
    }
  }
  activeSocket = socket;
  attachSocketHandlers(socket, port);
  handleHello(socket, port, result.helloVersion);
  return true;
}

function handleHello(socket: WebSocket, port: number, serverVersion: string): void {
  if (!isCompatible(VERSION, serverVersion)) {
    showMismatch(serverVersion || "unknown");
    // Stop the relay before tearing down so the close handler sees we
    // intentionally disconnected (no reconnect scheduling).
    activeSocket = null;
    socket.close();
    return;
  }
  setState({
    kind: "connected",
    file: { name: cachedFileName, key: "—" },
    port,
    running: null,
  });
  reconnectIndex = 0;
  // Tell code.ts so it can post the initial status (file name, etc.) back through us.
  parent.postMessage({ pluginMessage: { type: "ws-connected" } }, "*");
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
      // First hello is consumed by connectWithHello during tryConnect; this
      // branch handles any re-hello the server sends on an established socket.
      handleHello(socket, port, msg.version ?? "");
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
      if (currentState.kind === "connected") {
        setState({ ...currentState, file: { ...currentState.file, name: cachedFileName } });
      }
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
  wireMismatchCopyButtons();
  activityLog = new ActivityLog($("activity-log"));
  activityLog.render();
  void scanAndConnect();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
