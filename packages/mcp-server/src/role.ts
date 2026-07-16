import { join } from "node:path";
import { readStateFile } from "./singleton/index.js";
import type { StateFile } from "./singleton/index.js";
import { AGENT_PROTOCOL_VERSION } from "./agent/protocol.js";

export type RoleDecision = { mode: "attach"; port: number } | { mode: "bind" };

export interface DecideRoleOptions {
  stateDir: string;
  myVersion: string;
  /** Injectable for tests; defaults to probeStateEndpoint. */
  probe?: (port: number) => Promise<StateFile | null>;
}

/** GET /state.json from a candidate daemon; null on any failure. */
export async function probeStateEndpoint(port: number, timeoutMs = 300): Promise<StateFile | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      if (
        typeof body === "object" &&
        body !== null &&
        (body as { version?: unknown }).version === 1
      ) {
        return body as StateFile;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * B1 policy: attach only to a live daemon with the EXACT same package
 * version and agent protocol. Anything else takes the bind path (where the
 * existing takeover reaps incompatible/stale servers). B2 replaces exact
 * equality with strict-semver ordering + DEMOTE handover.
 */
export async function decideRole(opts: DecideRoleOptions): Promise<RoleDecision> {
  const onDisk = await readStateFile(join(opts.stateDir, "state.json"));
  if (!onDisk) return { mode: "bind" };
  const probe = opts.probe ?? probeStateEndpoint;
  const live = await probe(onDisk.port);
  if (!live) return { mode: "bind" };
  if (live.serverVersion === opts.myVersion && live.agentProtocol === AGENT_PROTOCOL_VERSION) {
    return { mode: "attach", port: live.port };
  }
  return { mode: "bind" };
}
