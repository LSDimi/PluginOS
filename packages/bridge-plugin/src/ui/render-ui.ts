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
    }
  | { kind: "mismatch"; reason: string; serverVersion: string; pluginVersion: string };

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
  const s = ms / 1000;
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

  // 2. Top-level views
  el("view-disconnected").hidden = state.kind !== "disconnected" && state.kind !== "connecting";
  el("view-connected").hidden = state.kind !== "connected";
  el("view-mismatch").hidden = state.kind !== "mismatch";

  // 3. Connected sub-blocks
  if (state.kind === "connected") {
    el("file-name").textContent = state.file.name;
    el("port-url").textContent = `localhost:${state.port}`;
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

  // 4. Mismatch view text
  if (state.kind === "mismatch") {
    el("mismatch-text").textContent =
      `Server ${state.serverVersion} doesn't match plugin ${state.pluginVersion}. ${state.reason}`;
  }
}
