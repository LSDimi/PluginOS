// packages/bridge-plugin/src/ui/render-ui.ts

export type RunningOp = {
  name: string;
  paramsPreview: string;
  startedAt: number;
};

export type AppState =
  | { kind: "disconnected" }
  | { kind: "connecting"; lastKnownPort: number | null }
  | {
      kind: "connected";
      file: { name: string; key: string };
      port: number;
      running: RunningOp | null;
      /** When true, the setup/install panel is shown over the connected view. */
      setupOpen?: boolean;
      /** Number of registered operations, reported by code.ts after connect. */
      opsCount?: number;
      /** Operation names for the expandable list under the count. */
      opsNames?: string[];
    }
  | {
      kind: "mismatch";
      reason: string;
      serverVersion: string;
      pluginVersion: string;
      command?: string;
    };

export function pillStateFor(state: AppState): string {
  if (state.kind === "connected" && state.running) return "running";
  return state.kind;
}

export function pillTextFor(state: AppState): string {
  switch (state.kind) {
    case "disconnected":
      return "Not connected";
    case "connecting":
      return "Connecting…";
    case "connected":
      return state.running ? `Running ${state.running.name}` : "Connected";
    case "mismatch":
      return "Update needed";
  }
}

export function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  const s = safe / 1000;
  if (s < 60) return `${s.toFixed(1)}s elapsed`;
  const minutes = Math.floor(s / 60);
  const seconds = Math.floor(s % 60);
  return `${minutes}m ${seconds}s elapsed`;
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`renderUI: missing element #${id}`);
  return node;
}

export function renderUI(state: AppState): void {
  // 1. Status pill
  const pill = el("status-pill");
  pill.dataset.state = pillStateFor(state);
  el("status-text").textContent = pillTextFor(state);

  // 2. Top-level views. The disconnected view doubles as the setup/install
  // panel, so a connected user can reopen it via the header toggle.
  const setupOpen = state.kind === "connected" && state.setupOpen === true;
  el("view-disconnected").hidden =
    state.kind !== "disconnected" && state.kind !== "connecting" && !setupOpen;
  el("view-connected").hidden = state.kind !== "connected" || setupOpen;
  el("view-mismatch").hidden = state.kind !== "mismatch";

  // 2b. Manual-retry button: a port scan can take several seconds, and a
  // silent button reads as broken. Reflect the in-flight scan on the button
  // itself. Irrelevant while connected (setup panel open), so hide it there.
  // (Null-guarded: the button only exists in the disconnected view.)
  const checkBtn = document.getElementById("btn-check") as HTMLButtonElement | null;
  if (checkBtn) {
    const scanning = state.kind === "connecting";
    checkBtn.disabled = scanning;
    checkBtn.textContent = scanning ? "Scanning…" : "Check for server";
    checkBtn.hidden = state.kind === "connected";
  }

  // 2c. Header setup toggle: only meaningful while connected.
  const setupBtn = document.getElementById("btn-setup") as HTMLButtonElement | null;
  if (setupBtn) {
    setupBtn.hidden = state.kind !== "connected";
    setupBtn.textContent = setupOpen ? "◀ Done" : "⚙ Setup";
  }

  // 3. Connected sub-blocks
  if (state.kind === "connected") {
    el("file-name").textContent = state.file.name;
    el("port-url").textContent = `localhost:${state.port}`;
    const opsEl = document.getElementById("ops-count");
    if (opsEl) opsEl.textContent = state.opsCount !== undefined ? String(state.opsCount) : "—";
    const opsList = document.getElementById("ops-list");
    if (opsList) {
      opsList.textContent = "";
      for (const name of state.opsNames ?? []) {
        const row = document.createElement("div");
        row.className = "ops-item";
        row.textContent = name;
        opsList.appendChild(row);
      }
    }
    el("running-block").hidden = state.running === null;
    el("idle-block").hidden = state.running !== null;
    if (state.running) {
      el("run-op").textContent = state.running.name;
      el("run-params").textContent = state.running.paramsPreview;
      el("run-elapsed").textContent = formatElapsed(Date.now() - state.running.startedAt);
    }
  } else {
    // Defensive: explicitly hide running-block when not connected
    el("running-block").hidden = true;
  }

  // 4. Mismatch view text + command
  if (state.kind === "mismatch") {
    el("mismatch-text").textContent =
      `Server ${state.serverVersion} doesn't match plugin ${state.pluginVersion}. ${state.reason}`;
    if (state.command !== undefined) {
      const cmdEl = document.getElementById("mismatch-cmd");
      if (cmdEl) cmdEl.textContent = state.command;
    }
  }
}
