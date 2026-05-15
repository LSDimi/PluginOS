export interface LogEntry {
  op: string;
  status: "ok" | "error";
  durationMs: number;
  params: Record<string, unknown>;
  error?: string;
  at?: number;
}

const MAX_HISTORY = 50;
const MAX_VISIBLE = 5;

export class ActivityLog {
  private entries: LogEntry[] = [];

  constructor(private host: HTMLElement) {}

  push(entry: LogEntry): void {
    this.entries.unshift({ ...entry, at: entry.at ?? Date.now() });
    if (this.entries.length > MAX_HISTORY) {
      this.entries.length = MAX_HISTORY;
    }
  }

  size(): number {
    return this.entries.length;
  }

  render(): void {
    if (this.entries.length === 0) {
      this.host.innerHTML = `<div class="activity-empty">No recent activity</div>`;
      return;
    }
    const rows = this.entries.slice(0, MAX_VISIBLE).map(this.row).join("");
    this.host.innerHTML = rows;
    this.host.querySelectorAll<HTMLElement>(".activity-row").forEach((row) => {
      const op = row.dataset.op ?? "";
      row.addEventListener("click", () => this.copy(op));
    });
  }

  private row = (entry: LogEntry): string => {
    const cls = entry.status === "error" ? "activity-op err" : "activity-op";
    const marker =
      entry.status === "error" ? `<span class="x">✗</span>` : `<span class="check">✓</span>`;
    const ago = formatAgo(Date.now() - (entry.at ?? Date.now()));
    const title = entry.error ? ` title="${escapeAttr(entry.error)}"` : "";
    return `
      <div class="activity-row" data-op="${escapeAttr(entry.op)}"${title}>
        <div class="${cls}">${marker}${escapeText(entry.op)}</div>
        <div class="activity-time">${ago}</div>
      </div>`;
  };

  private async copy(op: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(op);
    } catch {
      // ignored
    }
  }
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
