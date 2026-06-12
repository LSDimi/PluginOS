/**
 * Connection attempt with a mandatory SERVER_HELLO handshake deadline.
 *
 * A socket that OPENS is not proof of a working PluginOS server: legacy
 * (pre-0.5.0) servers accept WebSocket connections but never send
 * SERVER_HELLO, leaving the UI waiting forever ("stuck in Connecting").
 * This module treats a connection as live only once a SERVER_HELLO arrives
 * within `helloTimeoutMs` of the socket opening — otherwise the socket is
 * closed and the attempt reports failure so the port scan can move on.
 */

/** Minimal structural type so tests can inject a fake socket. */
export interface SocketLike {
  addEventListener(type: string, fn: (e: unknown) => void): void;
  close(): void;
}

export interface ConnectOptions {
  openTimeoutMs: number;
  helloTimeoutMs: number;
}

export interface HelloResult {
  socket: SocketLike;
  helloVersion: string;
}

export function connectWithHello(
  url: string,
  opts: ConnectOptions,
  makeSocket: (url: string) => SocketLike = (u) => new WebSocket(u) as unknown as SocketLike
): Promise<HelloResult | null> {
  return new Promise((resolve) => {
    let socket: SocketLike;
    try {
      socket = makeSocket(url);
    } catch {
      return resolve(null);
    }

    let settled = false;
    let helloTimer: number | null = null;

    const fail = (): void => {
      if (settled) return;
      settled = true;
      if (helloTimer != null) window.clearTimeout(helloTimer);
      window.clearTimeout(openTimer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(null);
    };

    const openTimer = window.setTimeout(fail, opts.openTimeoutMs);

    socket.addEventListener("open", () => {
      if (settled) return;
      window.clearTimeout(openTimer);
      helloTimer = window.setTimeout(fail, opts.helloTimeoutMs);
    });

    socket.addEventListener("error", fail);

    socket.addEventListener("message", (e: unknown) => {
      if (settled) return;
      const data = (e as { data?: unknown })?.data;
      const raw = typeof data === "string" ? data : "";
      let msg: { type?: string; version?: string };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg?.type !== "SERVER_HELLO") return;
      settled = true;
      if (helloTimer != null) window.clearTimeout(helloTimer);
      window.clearTimeout(openTimer);
      resolve({ socket, helloVersion: msg.version ?? "" });
    });
  });
}
