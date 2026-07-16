export interface LifetimeOptions {
  graceMs?: number;
  onExpire: () => void;
}

/**
 * Daemon self-termination policy: exit ORPHAN_GRACE_MS after the last
 * client detaches. Replaces the parent-PID heartbeat — a daemon whose own
 * session ended keeps serving other attached sessions.
 */
export class DaemonLifetime {
  private timer: NodeJS.Timeout | null = null;
  private readonly graceMs: number;

  constructor(private opts: LifetimeOptions) {
    this.graceMs = opts.graceMs ?? 30_000;
  }

  update(agentCount: number): void {
    if (agentCount > 0) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.opts.onExpire(), this.graceMs);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
