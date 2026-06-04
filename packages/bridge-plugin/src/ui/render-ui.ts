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
