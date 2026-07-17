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

  it("discards a link that resolves after stop (stop race)", async () => {
    const late = fakeLink();
    let resolveConnect: (l: DaemonLink) => void = () => {};
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "attach" as const, port: 9500 })),
      connectLink: vi.fn(
        () =>
          new Promise<DaemonLink>((resolve) => {
            resolveConnect = resolve;
          })
      ),
    });
    const mgr = new LinkManager(d);
    const startP = mgr.start();
    await vi.waitFor(() => expect(d.connectLink).toHaveBeenCalled());

    expect(await mgr.handleStdioClosed()).toBe("exit");
    resolveConnect(late); // in-flight connect resolves AFTER teardown
    await startP;

    expect(late.close).toHaveBeenCalled();
    expect(await mgr.waitForLink(50)).toBeNull();
  });

  it("closes the started daemon when the loopback connect fails, then recovers", async () => {
    const firstHandle = fakeHandle(9505);
    const secondHandle = fakeHandle(9506);
    const link = fakeLink();
    const startDaemon = vi.fn().mockResolvedValueOnce(firstHandle).mockResolvedValue(secondHandle);
    const connectLink = vi
      .fn()
      .mockRejectedValueOnce(new Error("loopback refused"))
      .mockResolvedValue(link);
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon,
      connectLink,
    });
    const mgr = new LinkManager(d);
    await mgr.start();

    expect(firstHandle.close).toHaveBeenCalled(); // failed-loopback daemon torn down
    expect(mgr.isHosting()).toBe(true); // recovered on the retry
    expect(await mgr.waitForLink(100)).toBe(link.client);
    await mgr.stop();
    expect(secondHandle.close).toHaveBeenCalled();
  });

  it("re-attaches to the already-hosted daemon instead of starting a second one when bind races the loopback drop", async () => {
    const link1 = fakeLink();
    const link2 = fakeLink();
    const handle = fakeHandle(9501);
    const connectLink = vi.fn().mockResolvedValueOnce(link1).mockResolvedValueOnce(link2);
    const d = deps({
      decideRole: vi.fn(async () => ({ mode: "bind" as const })),
      startDaemon: vi.fn(async () => handle),
      connectLink,
    });
    const mgr = new LinkManager(d);
    await mgr.start();
    expect(mgr.isHosting()).toBe(true);
    expect(d.startDaemon).toHaveBeenCalledTimes(1);

    // Loopback link drops; decideRole is still "bind" (own-daemon probe
    // timed out), but this.daemon is already set — must re-attach, not
    // start a second in-process daemon.
    link1.emitClose();
    await vi.waitFor(async () => {
      expect(await mgr.waitForLink(50)).toBe(link2.client);
    });

    expect(d.startDaemon).toHaveBeenCalledTimes(1); // never called a second time
    expect(connectLink).toHaveBeenCalledTimes(2);
    expect(connectLink).toHaveBeenNthCalledWith(2, 9501); // re-attached to the existing daemon
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
