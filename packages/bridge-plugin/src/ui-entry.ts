const PORT_MIN = 9500;
const PORT_MAX = 9510;
const RECONNECT_DELAY = 3000;

let ws: WebSocket | null = null;

function updateStatus(connected: boolean, text: string) {
  const dot = document.getElementById("dot")!;
  const statusText = document.getElementById("status-text")!;
  dot.className = connected ? "dot connected" : "dot";
  statusText.textContent = text;
}

function updateInfo(text: string) {
  document.getElementById("info")!.textContent = text;
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
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    try {
      await tryConnect(port);
      return;
    } catch {
      continue;
    }
  }
  updateStatus(false, "No MCP server found");
  updateInfo(`Scanned ports ${PORT_MIN}-${PORT_MAX}. Run 'npx pluginos' to start.`);
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
      updateStatus(true, `Connected (port ${port})`);
      updateInfo("Ready for operations");

      // Tell code.js we're connected
      parent.postMessage({ pluginMessage: { type: "ws-connected" } }, "*");
      resolve();
    };

    socket.onmessage = (event: MessageEvent) => {
      // Forward WebSocket messages to code.js
      try {
        const data = JSON.parse(event.data as string);
        parent.postMessage({ pluginMessage: { type: "ws-message", payload: data } }, "*");
      } catch {
        /* ignore malformed */
      }
    };

    socket.onclose = () => {
      if (ws === socket) {
        ws = null;
        updateStatus(false, "Disconnected");
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
