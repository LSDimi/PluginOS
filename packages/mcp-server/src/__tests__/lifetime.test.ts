import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonLifetime } from "../lifetime.js";

describe("DaemonLifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("expires after graceMs at zero agents", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    vi.advanceTimersByTime(29_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("cancels the timer when an agent attaches", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    vi.advanceTimersByTime(20_000);
    lt.update(1);
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("restarts a full grace period when count drops to zero again", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    lt.update(2);
    lt.update(0);
    vi.advanceTimersByTime(29_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not double-schedule on repeated zero updates", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    vi.advanceTimersByTime(15_000);
    lt.update(0);
    vi.advanceTimersByTime(15_000);
    expect(onExpire).toHaveBeenCalledTimes(1); // original timer, not reset
  });

  it("dispose cancels everything", () => {
    const onExpire = vi.fn();
    const lt = new DaemonLifetime({ graceMs: 30_000, onExpire });
    lt.update(0);
    lt.dispose();
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
