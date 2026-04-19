const TIER_1_RULES = `When performing Figma work, use the \`pluginos\` MCP server's tools by default.
- Call \`pluginos.list_operations\` once to see what's available, then \`pluginos.run_operation\` to execute.
- Use \`pluginos.execute_figma\` only for one-off logic not covered by a registered operation.
- Fall back to \`mcp__Figma__*\` tools ONLY when PluginOS returns \`no_operation_available\`, or the user explicitly requests Figma Code Connect / \`get_design_context\`-style code generation.
- If PluginOS returns "No plugin connected", tell the user to open the PluginOS Bridge plugin in Figma — do not silently switch to Figma MCP.
- Respect \`_hint\` and \`_next_hints\` fields in PluginOS responses; they teach operation usage at the moment of need.`;

const MCP_CONFIG_JSON = `{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos@latest"]
    }
  }
}`;

const INSTALL_COMMAND = "/plugin marketplace add github:LSDimi/pluginos";

const PORT_MIN = 9500;
const PORT_MAX = 9510;
const RECONNECT_DELAY = 3000;

let ws: WebSocket | null = null;
let opsRunCount = 0;
let scanAttempts = 0;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function showView(view: "setup" | "connected") {
  const setup = $("view-setup");
  const connected = $("view-connected");

  if (view === "connected") {
    setup.classList.add("hidden");
    connected.classList.remove("hidden");
  } else {
    setup.classList.remove("hidden");
    connected.classList.add("hidden");
  }
  document.body.dataset.view = view;
  updateHeaderToggle();
}

function flashCopied(btn: HTMLButtonElement, label = "✓ Copied") {
  const original = btn.textContent;
  btn.classList.add("copied");
  btn.textContent = label;
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.textContent = original;
  }, 2500);
}

async function copyToClipboard(text: string, btn: HTMLButtonElement, confirmLabel?: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { /* swallow; flashCopied still runs */ }
  flashCopied(btn, confirmLabel || "✓ Copied");
}

// --- Toast ---
function showToast(text: string, durationMs: number) {
  const el = document.getElementById("toast")!;
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), durationMs);
}

let pendingFirstConnectToast = false;

function armToastTrigger() {
  const fire = () => {
    if (!pendingFirstConnectToast) return;
    showToast("Connected. Haven't copied the usage rules yet? Tap ⚙ Setup above.", 6000);
    localStorage.setItem("pluginos-first-connect-seen", "1");
    pendingFirstConnectToast = false;
    cleanup();
  };
  const onVis = () => { if (document.visibilityState === "visible") fire(); };
  const hardFallback = setTimeout(() => { pendingFirstConnectToast = false; cleanup(); }, 5 * 60 * 1000);
  const cleanup = () => {
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("mousemove", fire);
    document.removeEventListener("click", fire);
    document.removeEventListener("keydown", fire);
    clearTimeout(hardFallback);
  };
  document.addEventListener("visibilitychange", onVis);
  document.addEventListener("mousemove", fire, { once: true });
  document.addEventListener("click", fire, { once: true });
  document.addEventListener("keydown", fire, { once: true });
}

// --- Header toggle ---
function updateHeaderToggle() {
  const headerToggle = document.getElementById("header-toggle") as HTMLButtonElement | null;
  if (!headerToggle) return;
  const view = document.body.dataset.view;
  if (view === "connected") { headerToggle.hidden = false; headerToggle.textContent = "⚙ Setup"; }
  else if (view === "setup" && ws !== null) { headerToggle.hidden = false; headerToggle.textContent = "◀ Done"; }
  else { headerToggle.hidden = true; }
}

function updateStatus(connected: boolean, text: string) {
  const dot = $("dot");
  const statusText = $("status-text");
  dot.className = connected ? "dot connected" : "dot";
  statusText.textContent = text;
}

function showError(msg: string) {
  const el = $("error-msg");
  if (el) {
    el.textContent = msg;
    el.classList.remove("hidden");
  }
}

function hideError() {
  const el = $("error-msg");
  if (el) el.classList.add("hidden");
}

function updateActivity(text: string) {
  const el = $("activity-log");
  if (el) el.textContent = text;
}

function updatePort(port: number | null) {
  $("conn-port").textContent = port ? String(port) : "\u2014";
}

function updateFilename(name: string) {
  const el = $("conn-filename");
  if (el) {
    el.textContent = name || "\u2014";
    el.title = name || "";
  }
}

function incrementOps() {
  opsRunCount++;
  const el = $("ops-run-count");
  if (el) el.textContent = opsRunCount + " ops run";
}

function renderOpsPanel(ops: any[]) {
  const countEl = document.getElementById("ops-count")!;
  const bodyEl = document.getElementById("ops-panel-body")!;
  countEl.textContent = String(ops.length);

  const grouped: Record<string, any[]> = {};
  for (const op of ops) {
    grouped[op.category] ||= [];
    grouped[op.category].push(op);
  }
  const categoryOrder = [
    "lint",
    "accessibility",
    "components",
    "tokens",
    "layout",
    "content",
    "export",
    "assets",
    "annotations",
    "colors",
    "typography",
    "cleanup",
    "data",
    "custom",
  ];

  bodyEl.innerHTML = "";
  for (const cat of categoryOrder) {
    const list = grouped[cat];
    if (!list?.length) continue;
    const h = document.createElement("h3");
    h.className = "ops-category";
    h.textContent = `${cat} (${list.length})`;
    bodyEl.appendChild(h);
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const op of list) {
      const row = document.createElement("div");
      row.className = "ops-item";
      row.textContent = op.name;
      bodyEl.appendChild(row);
    }
  }
}

// Wire ops panel toggle
function wireOpsToggle() {
  const toggle = document.getElementById("ops-panel-toggle")!;
  const body = document.getElementById("ops-panel-body")!;
  const chevron = document.getElementById("ops-panel-chevron")!;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    body.classList.toggle("hidden");
    chevron.textContent = expanded ? "▸" : "▾";
  });
  toggle.addEventListener("keydown", (e: any) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle.click();
    }
  });
}

wireOpsToggle();

// --- Wire header toggle ---
const headerToggle = document.getElementById("header-toggle") as HTMLButtonElement;
if (headerToggle) {
  headerToggle.addEventListener("click", () => {
    if (document.body.dataset.view === "connected") showView("setup");
    else if (document.body.dataset.view === "setup" && ws !== null) showView("connected");
  });
}

// --- Wire copy buttons ---
document.getElementById("btn-copy-install")!.addEventListener("click", (e) => copyToClipboard(INSTALL_COMMAND, e.currentTarget as HTMLButtonElement, "✓ Copied — paste in Claude Code"));
document.getElementById("btn-copy-mcp-cursor")!.addEventListener("click", (e) => copyToClipboard(MCP_CONFIG_JSON, e.currentTarget as HTMLButtonElement));
document.getElementById("btn-copy-rules-cursor")!.addEventListener("click", (e) => copyToClipboard(TIER_1_RULES, e.currentTarget as HTMLButtonElement));
document.getElementById("btn-copy-mcp-chat")!.addEventListener("click", (e) => copyToClipboard(MCP_CONFIG_JSON, e.currentTarget as HTMLButtonElement));
document.getElementById("btn-copy-rules-chat")!.addEventListener("click", (e) => copyToClipboard(TIER_1_RULES, e.currentTarget as HTMLButtonElement));

// Forward messages from code.js (plugin sandbox) to WebSocket
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "__ui_list_operations_result") {
    renderOpsPanel(msg.operations);
    return;
  }

  // Update filename from status messages
  if (msg.type === "ws-send" && msg.payload?.type === "status" && msg.payload?.fileName) {
    updateFilename(msg.payload.fileName);
  }

  if (msg.type === "ws-send" && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg.payload));
  }
};

async function findAndConnect(): Promise<void> {
  const dot = $("dot");
  dot.className = "dot searching";
  $("status-text").textContent = "Searching...";
  hideError();

  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    try {
      await tryConnect(port);
      scanAttempts = 0;
      return;
    } catch {
      continue;
    }
  }

  // Failed to find server
  scanAttempts++;
  updateStatus(false, "Disconnected");
  showView("setup");

  showError(
    scanAttempts < 4
      ? "Searching for server\u2026"
      : "Still searching \u2014 make sure your MCP config is set up."
  );

  setTimeout(findAndConnect, RECONNECT_DELAY);
}

function tryConnect(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("timeout"));
    }, 2000);

    socket.onopen = () => {
      clearTimeout(timeout);
      ws = socket;
      updateStatus(true, "Connected");
      updatePort(port);
      showView("connected");
      updateActivity("Ready for operations");

      // Request ops list for the panel
      parent.postMessage({ pluginMessage: { type: "__ui_list_operations" } }, "*");

      parent.postMessage({ pluginMessage: { type: "ws-connected" } }, "*");

      if (!localStorage.getItem("pluginos-first-connect-seen")) {
        pendingFirstConnectToast = true;
        armToastTrigger();
      }

      resolve();
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);

        // Track incoming operations
        if (data.type === "run_operation" || data.type === "execute") {
          const label = data.type === "run_operation" ? data.operation : "execute_figma";
          updateActivity("Running: " + label);
        }

        // Forward to code.js
        parent.postMessage({ pluginMessage: { type: "ws-message", payload: data } }, "*");

        // Track results
        if (data.type === "result") {
          incrementOps();
          updateActivity(data.success ? "Last operation succeeded" : "Last operation failed");
        }
      } catch {
        /* ignore malformed */
      }
    };

    socket.onclose = () => {
      if (ws === socket) {
        ws = null;
        updateStatus(false, "Disconnected");
        updatePort(null);
        showView("setup");
        showError("Connection lost. Reconnecting\u2026");
        parent.postMessage({ pluginMessage: { type: "ws-disconnected" } }, "*");
        setTimeout(findAndConnect, RECONNECT_DELAY);
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error("connection failed"));
    };
  });
}

findAndConnect();
