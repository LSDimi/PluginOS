import { describe, it, expect } from "vitest";
import {
  nextReconnectDelay,
  shouldShowConnecting,
  RECONNECT_BACKOFF_MS,
  BACKOFF_WINDOW_MS,
  SLOW_POLL_MS,
} from "../../ui/reconnect-policy";

describe("nextReconnectDelay", () => {
  it("returns the backoff schedule by index within the window", () => {
    expect(nextReconnectDelay(0, 0)).toEqual({ delayMs: 1000, phase: "backoff" });
    expect(nextReconnectDelay(1, 0)).toEqual({ delayMs: 3000, phase: "backoff" });
    expect(nextReconnectDelay(2, 0)).toEqual({ delayMs: 5000, phase: "backoff" });
    expect(nextReconnectDelay(3, 0)).toEqual({ delayMs: 10000, phase: "backoff" });
  });

  it("clamps the index to the last backoff entry", () => {
    expect(nextReconnectDelay(9, 0)).toEqual({ delayMs: 10000, phase: "backoff" });
  });

  it("stays in backoff exactly at the window boundary", () => {
    expect(nextReconnectDelay(0, BACKOFF_WINDOW_MS)).toEqual({ delayMs: 1000, phase: "backoff" });
  });

  it("switches to slow-poll one ms past the window", () => {
    expect(nextReconnectDelay(0, BACKOFF_WINDOW_MS + 1)).toEqual({
      delayMs: SLOW_POLL_MS,
      phase: "slow-poll",
    });
  });

  it("stays in slow-poll regardless of attempt index once past the window", () => {
    expect(nextReconnectDelay(9, BACKOFF_WINDOW_MS + 1)).toEqual({
      delayMs: SLOW_POLL_MS,
      phase: "slow-poll",
    });
  });

  it("never signals give-up — always returns a concrete delay", () => {
    const decision = nextReconnectDelay(100, BACKOFF_WINDOW_MS * 100);
    expect(decision.delayMs).toBe(SLOW_POLL_MS);
    expect(decision.phase).toBe("slow-poll");
  });
});

describe("shouldShowConnecting", () => {
  it("shows connecting for a disconnected view during backoff", () => {
    expect(shouldShowConnecting("disconnected", "backoff")).toBe(true);
  });

  it("shows connecting for a connected view during backoff", () => {
    expect(shouldShowConnecting("connected", "backoff")).toBe(true);
  });

  it("never shows connecting while mismatch is sticky, in backoff", () => {
    expect(shouldShowConnecting("mismatch", "backoff")).toBe(false);
  });

  it("never shows connecting while mismatch is sticky, in slow-poll", () => {
    expect(shouldShowConnecting("mismatch", "slow-poll")).toBe(false);
  });

  it("stays quiet for slow-poll probes on a disconnected view", () => {
    expect(shouldShowConnecting("disconnected", "slow-poll")).toBe(false);
  });
});

describe("RECONNECT_BACKOFF_MS", () => {
  it("matches the documented schedule", () => {
    expect(RECONNECT_BACKOFF_MS).toEqual([1000, 3000, 5000, 10000]);
  });
});
