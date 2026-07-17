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
  private starting = false;

  constructor(private deps: LinkManagerDeps) {}

  async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      const deadline = Date.now() + START_BUDGET_MS;
      while (!this.stopped && Date.now() < deadline) {
        if (await this.tryEstablish()) return;
        await sleep(this.jitter());
      }
      if (!this.stopped) void this.backgroundLoop();
    } finally {
      this.starting = false;
    }
  }

  private jitter(): number {
    return this.deps.jitterMs ? this.deps.jitterMs() : 100 + Math.random() * 250;
  }

  private async tryEstablish(): Promise<boolean> {
    let startedDaemon: DaemonHandle | null = null;
    try {
      const decision = await this.deps.decideRole();
      if (decision.mode === "attach") {
        return await this.attach(decision.port);
      }
      if (this.daemon !== null) {
        // We already host a daemon in this process (the loopback link just
        // dropped and our own-daemon probe timed out). Re-attach to it
        // instead of starting a second in-process daemon: the first one
        // would eventually hit its zero-agent grace and exit(0), killing
        // this live session's stdio.
        return await this.attach(this.daemon.port);
      }
      const started = await this.deps.startDaemon();
      if (this.stopped) {
        // stop()/handleStdioClosed() raced the bind: tear down what we just
        // started before anyone can observe it.
        if (started && !("attachInsteadPort" in started)) {
          await started.close().catch(() => {});
        }
        return false;
      }
      if (started === null) return false;
      if ("attachInsteadPort" in started) {
        return await this.attach(started.attachInsteadPort);
      }
      startedDaemon = started;
      this.daemon = started;
      const linked = await this.attach(started.port); // loopback
      if (!linked) {
        // attach() only returns false when stopped raced us mid-connect —
        // the daemon we just bound must not outlive the refusal.
        await started.close().catch(() => {});
        if (this.daemon === started) this.daemon = null;
      }
      return linked;
    } catch (err) {
      console.error(`[shim] link attempt failed: ${(err as Error).message}`);
      if (startedDaemon) {
        // The loopback connect failed AFTER we bound a daemon: close it so a
        // retry doesn't orphan a live, linkless daemon (port + singleton state).
        await startedDaemon.close().catch(() => {});
        if (this.daemon === startedDaemon) this.daemon = null;
      }
      return false;
    }
  }

  private async attach(port: number): Promise<boolean> {
    const link = await this.deps.connectLink(port);
    if (this.stopped) {
      // stop()/handleStdioClosed() ran while the connect was in flight; the
      // late link must be discarded, not resurrected as this.link.
      await link.close().catch(() => {});
      return false;
    }
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

  isLinked(): boolean {
    return this.link !== null;
  }

  hostedAgentCount(): number {
    return this.daemon ? this.daemon.agentEndpoint.getCount() : 0;
  }

  /** Resolve every pending waitForLink() with null (their timers are cleared
   *  by resolving through the same waiter function). */
  private flushWaiters(): void {
    const waiters = this.linkWaiters;
    this.linkWaiters = [];
    for (const w of waiters) w(null);
  }

  async handleStdioClosed(): Promise<"exit" | "linger"> {
    this.stopped = true;
    this.flushWaiters();
    if (!this.daemon) {
      await this.link?.close().catch(() => {});
      this.link = null;
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
    this.flushWaiters();
    await this.link?.close().catch(() => {});
    this.link = null;
    if (this.daemon) {
      await this.daemon.close();
      this.daemon = null;
    }
  }
}
