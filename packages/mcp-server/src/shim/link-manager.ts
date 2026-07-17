import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { RoleDecision } from "../role.js";
import type { DaemonHandle } from "../daemon.js";
import type { DaemonLink } from "./daemon-link.js";

export interface LinkManagerDeps {
  decideRole: () => Promise<RoleDecision>;
  connectLink: (port: number) => Promise<DaemonLink>;
  startDaemon: () => Promise<DaemonHandle | { attachInsteadPort: number } | null>;
  onRelink?: () => void;
  retryDelayMs?: number;
  jitterMs?: () => number;
}

const START_BUDGET_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Owns the shim's connection to "the current daemon" — which may be a
 * remote process or a daemon hosted in THIS process (loopback). On link
 * loss it re-runs the same decide→attach|bind loop used at startup, which
 * is what makes crash promotion the same code path as first-boot binding.
 */
export class LinkManager {
  private link: DaemonLink | null = null;
  private daemon: DaemonHandle | null = null;
  private linkWaiters: Array<(c: Client | null) => void> = [];
  private everLinked = false;
  private stopped = false;
  private looping = false;

  constructor(private deps: LinkManagerDeps) {}

  async start(): Promise<void> {
    const deadline = Date.now() + START_BUDGET_MS;
    while (!this.stopped && Date.now() < deadline) {
      if (await this.tryEstablish()) return;
      await sleep(this.jitter());
    }
    if (!this.stopped) void this.backgroundLoop();
  }

  private jitter(): number {
    return this.deps.jitterMs ? this.deps.jitterMs() : 100 + Math.random() * 250;
  }

  private async tryEstablish(): Promise<boolean> {
    try {
      const decision = await this.deps.decideRole();
      if (decision.mode === "attach") {
        return await this.attach(decision.port);
      }
      const started = await this.deps.startDaemon();
      if (started === null) return false;
      if ("attachInsteadPort" in started) {
        return await this.attach(started.attachInsteadPort);
      }
      this.daemon = started;
      return await this.attach(started.port); // loopback
    } catch (err) {
      console.error(`[shim] link attempt failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async attach(port: number): Promise<boolean> {
    const link = await this.deps.connectLink(port);
    this.link = link;
    link.onClose(() => {
      if (this.link === link) {
        this.link = null;
        if (!this.stopped) void this.backgroundLoop();
      }
    });
    if (this.everLinked) this.deps.onRelink?.();
    this.everLinked = true;
    const waiters = this.linkWaiters;
    this.linkWaiters = [];
    for (const w of waiters) w(link.client);
    return true;
  }

  private async backgroundLoop(): Promise<void> {
    if (this.looping) return;
    this.looping = true;
    try {
      while (!this.stopped && !this.link) {
        await sleep(this.jitter());
        if (await this.tryEstablish()) return;
        await sleep(this.deps.retryDelayMs ?? 5000);
      }
    } finally {
      this.looping = false;
    }
  }

  waitForLink(timeoutMs: number): Promise<Client | null> {
    if (this.link) return Promise.resolve(this.link.client);
    return new Promise((resolve) => {
      const waiter = (c: Client | null): void => {
        clearTimeout(timer);
        resolve(c);
      };
      const timer = setTimeout(() => {
        this.linkWaiters = this.linkWaiters.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
      this.linkWaiters.push(waiter);
    });
  }

  isHosting(): boolean {
    return this.daemon !== null;
  }

  hostedAgentCount(): number {
    return this.daemon ? this.daemon.agentEndpoint.getCount() : 0;
  }

  async handleStdioClosed(): Promise<"exit" | "linger"> {
    this.stopped = true;
    if (!this.daemon) {
      await this.link?.close().catch(() => {});
      return "exit";
    }
    // Hosting: release only the loopback link; DaemonLifetime's zero-agent
    // grace decides when the process actually exits.
    await this.link?.close().catch(() => {});
    this.link = null;
    return "linger";
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.link?.close().catch(() => {});
    this.link = null;
    if (this.daemon) {
      await this.daemon.close();
      this.daemon = null;
    }
  }
}
