const PORT_MIN = 9500;
const PORT_MAX = 9510;
const RECONNECT_DELAY = 3000;

let ws: WebSocket | null = null;
let opsCount = 0;
let scanAttempts = 0;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function showView(view: "setup" | "connected") {
  const setup = $("view-setup");
  const connected = $("view-connected");
  const activity = $("activity");

  if (view === "connected") {
    setup.classList.add("hidden");
    connected.classList.remove("hidden");
    activity.classList.remove("hidden");
  } else {
    setup.classList.remove("hidden");
    connected.classList.add("hidden");
    activity.classList.add("hidden");
  }
}

function updateStatus(connected: boolean, text: string) {
  const dot = $("dot");
  const statusText = $("status-text");
  dot.className = connected ? "dot connected" : "dot";
  statusText.textContent = text;
}

function showError(msg: string) {
  const el = $("error-msg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError() {
  $("error-msg").classList.add("hidden");
}

function updateActivity(text: string) {
  $("activity").textContent = text;
}

function updatePort(port: number | null) {
  $("port-display").textContent = port ? String(port) : "\u2014";
}

function incrementOps() {
  opsCount++;
  $("ops-count").textContent = String(opsCount);
}

// Forward messages from code.js (plugin sandbox) to WebSocket
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

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

  if (scanAttempts === 1) {
    showError("No server found. Start it with: npx pluginos");
  } else if (scanAttempts < 5) {
    showError(`No server found (attempt ${scanAttempts}). Is npx pluginos running?`);
  } else {
    showError("Still no server. Check your terminal for errors after running npx pluginos.");
  }

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

      parent.postMessage({ pluginMessage: { type: "ws-connected" } }, "*");
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
        parent.postMessage(
          { pluginMessage: { type: "ws-message", payload: data } },
          "*"
        );

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
        showError("Connection lost. Reconnecting...");
        parent.postMessage(
          { pluginMessage: { type: "ws-disconnected" } },
          "*"
        );
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
