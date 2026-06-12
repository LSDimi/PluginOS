// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { connectWithHello, type SocketLike } from "../../ui/connect.js";

class FakeSocket implements SocketLike {
  listeners = new Map<string, Array<(e: unknown) => void>>();
  closed = false;

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: unknown = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }

  emitMessage(payload: unknown): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }
}

const OPTS = { openTimeoutMs: 50, helloTimeoutMs: 50 };

describe("connectWithHello", () => {
  it("resolves with socket and version when server sends SERVER_HELLO after open", async () => {
    const sock = new FakeSocket();
    const promise = connectWithHello("ws://localhost:9502", OPTS, () => sock);
    sock.emit("open");
    sock.emitMessage({ type: "SERVER_HELLO", version: "0.5.0" });
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.helloVersion).toBe("0.5.0");
    expect(result!.socket).toBe(sock);
    expect(sock.closed).toBe(false);
  });

  it("resolves null and closes the socket when the server opens but never sends hello (legacy 0.4.3 zombie)", async () => {
    const sock = new FakeSocket();
    const promise = connectWithHello("ws://localhost:9500", OPTS, () => sock);
    sock.emit("open");
    const result = await promise;
    expect(result).toBeNull();
    expect(sock.closed).toBe(true);
  });

  it("resolves null when the socket never opens", async () => {
    const sock = new FakeSocket();
    const result = await connectWithHello("ws://localhost:9509", OPTS, () => sock);
    expect(result).toBeNull();
    expect(sock.closed).toBe(true);
  });

  it("resolves null on socket error", async () => {
    const sock = new FakeSocket();
    const promise = connectWithHello("ws://localhost:9509", OPTS, () => sock);
    sock.emit("error");
    const result = await promise;
    expect(result).toBeNull();
  });

  it("resolves null when the factory throws", async () => {
    const result = await connectWithHello("ws://bad", OPTS, () => {
      throw new Error("boom");
    });
    expect(result).toBeNull();
  });

  it("ignores non-hello messages and still resolves when hello arrives", async () => {
    const sock = new FakeSocket();
    const promise = connectWithHello("ws://localhost:9502", OPTS, () => sock);
    sock.emit("open");
    sock.emitMessage({ type: "SOMETHING_ELSE" });
    sock.emitMessage({ type: "SERVER_HELLO", version: "0.5.0" });
    const result = await promise;
    expect(result!.helloVersion).toBe("0.5.0");
  });

  it("ignores unparseable messages without crashing", async () => {
    const sock = new FakeSocket();
    const promise = connectWithHello("ws://localhost:9502", OPTS, () => sock);
    sock.emit("open");
    sock.emit("message", { data: "{ not json" });
    sock.emitMessage({ type: "SERVER_HELLO", version: "0.5.0" });
    const result = await promise;
    expect(result!.helloVersion).toBe("0.5.0");
  });

  it("does not resolve twice when hello arrives after the deadline already fired", async () => {
    vi.useFakeTimers();
    try {
      const sock = new FakeSocket();
      const promise = connectWithHello("ws://localhost:9500", OPTS, () => sock);
      sock.emit("open");
      vi.advanceTimersByTime(60);
      const result = await promise;
      expect(result).toBeNull();
      sock.emitMessage({ type: "SERVER_HELLO", version: "0.5.0" });
      expect(sock.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
