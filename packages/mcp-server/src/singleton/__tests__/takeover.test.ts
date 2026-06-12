import { describe, it, expect, vi } from "vitest";
import { reapProcess } from "../takeover.js";

describe("reapProcess", () => {
  it("sends SIGTERM and returns true when process exits within grace", async () => {
    const calls: Array<[number, NodeJS.Signals | 0]> = [];
    let alive = true;
    const kill = vi.fn((pid: number, sig: NodeJS.Signals | 0) => {
      calls.push([pid, sig]);
      if (sig === "SIGTERM") {
        setTimeout(() => {
          alive = false;
        }, 50);
      }
      if (sig === 0 && !alive) {
        const e = new Error("ESRCH") as NodeJS.ErrnoException;
        e.code = "ESRCH";
        throw e;
      }
      return true;
    });
    const result = await reapProcess(12345, { kill, graceMs: 500, pollMs: 25 });
    expect(result.reaped).toBe(true);
    expect(result.usedSignal).toBe("SIGTERM");
    expect(calls.some(([, s]) => s === "SIGTERM")).toBe(true);
    expect(calls.some(([, s]) => s === "SIGKILL")).toBe(false);
  });

  it("escalates to SIGKILL when SIGTERM doesn't take", async () => {
    const calls: Array<[number, NodeJS.Signals | 0]> = [];
    let alive = true;
    const kill = vi.fn((pid: number, sig: NodeJS.Signals | 0) => {
      calls.push([pid, sig]);
      if (sig === "SIGKILL") {
        // Process dies immediately on SIGKILL
        alive = false;
      }
      if (sig === 0 && !alive) {
        const e = new Error("ESRCH") as NodeJS.ErrnoException;
        e.code = "ESRCH";
        throw e;
      }
      return true;
    });
    const result = await reapProcess(12345, { kill, graceMs: 100, pollMs: 25 });
    expect(result.reaped).toBe(true);
    expect(result.usedSignal).toBe("SIGKILL");
    expect(calls.some(([, s]) => s === "SIGTERM")).toBe(true);
    expect(calls.some(([, s]) => s === "SIGKILL")).toBe(true);
  });

  it("returns reaped=false if the process never dies even after SIGKILL", async () => {
    const kill = vi.fn(() => true);
    const result = await reapProcess(12345, { kill, graceMs: 50, pollMs: 25, postKillWaitMs: 50 });
    expect(result.reaped).toBe(false);
  });
});
