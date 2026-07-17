import { describe, it, expect, vi } from "vitest";
import { LinkManager, type LinkManagerDeps } from "../link-manager.js";
import type { DaemonLink } from "../daemon-link.js";
import type { DaemonHandle } from "../../daemon.js";

function fakeLink(): DaemonLink & { emitClose: () => void } {
  let closeCb: (() => void) | null = null;
  return {
    client: { fake: true } as never,
    serverVersion: "0.7.0",
    onClose(cb) {
      closeCb = cb;
    },
    close: vi.fn(async () => {}),
    emitClose() {
      closeCb?.();
    },
  };
}

function fakeHandle(port: number, count = 1): DaemonHandle {
  return {
    port,
    bridge: {} as never,
    agentEndpoint: { getCount: () => count } as never,
    close: vi.fn(async () => {}),
  } as unknown as DaemonHandle;
}

function deps(overrides: Partial<LinkManagerDeps>): LinkManagerDeps {
  return {
    decideRole: vi.fn(async () => ({ mode: "bind" as const })),
    connectLink: vi.fn(async () => fakeLink()),
    startDaemon: vi.fn(async () => fakeHandle(9500)),
    retryDelayMs: 10,
    jitterMs: () => 1,
    ...overrides,
  };
}

describe("LinkManager", () => {
  it("attaches when decideRole says attach", async () => {
    const link = fakeLink();
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(async () => link),
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(await mgr.waitForLink(100)).toBe(link.client);
    expect(mgr.isHosting()).toBe(false);
    expect(d.startDaemon).not.toHaveBeenCalled();
    await mgr.stop();
  });

  it("promotes (bind + loopback) when no daemon exists", async () => {
    const link = fakeLink();
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => fakeHandle(9501)),
      connectLink: vi.fn(async (port: number) => {
        expect(port).toBe(9501); // loopback to own daemon
        return link;
      }),
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(mgr.isHosting()).toBe(true);
    expect(await mgr.waitForLink(100)).toBe(link.client);
    await mgr.stop();
  });

  it("attaches to the race winner when startDaemon reports attachInsteadPort", async () => {
    const link = fakeLink();
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => ({ attachInsteadPort: 9502 })),
      connectLink: vi.fn(async (port: number) => {
        expect(port).toBe(9502);
        return link;
      }),
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(mgr.isHosting()).toBe(false);
    expect(await mgr.waitForLink(100)).toBe(link.client);
    await mgr.stop();
  });

  it("re-links after the daemon socket closes and fires onRelink", async () => {
    const first = fakeLink();
    const second = fakeLink();
    const onRelink = vi.fn();
    const connectLink = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink,
      onRelink,
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(onRelink).not.toHaveBeenCalled();

    first.emitClose();
    await vi.waitFor(async () => {
      expect(await mgr.waitForLink(50)).toBe(second.client);
    });
    expect(onRelink).toHaveBeenCalledTimes(1);
    await mgr.stop();
  });

  it("waitForLink returns null after the timeout with no link", async () => {
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(async () => {
        throw new Error("nobody home");
      }),
    });
    const mgr = new LinkManager(d);
    void mgr.start();
    expect(await mgr.waitForLink(50)).toBeNull();
    await mgr.stop();
  });

  it("handleStdioClosed: exit when not hosting, linger when hosting with other agents", async () => {
    const link = fakeLink();
    const attached = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(async () => link),
    });
    const attachedMgr = new LinkManager(attached);
    await attachedMgr.start();
    expect(await attachedMgr.handleStdioClosed()).toBe("exit");

    const hostLink = fakeLink();
    const hosting = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => fakeHandle(9503, 2)), // self + one other
      connectLink: vi.fn(async () => hostLink),
    });
    const hostingMgr = new LinkManager(hosting);
    await hostingMgr.start();
    expect(await hostingMgr.handleStdioClosed()).toBe("linger");
    expect(hostLink.close).toHaveBeenCalled(); // own loopback released
  });
});
