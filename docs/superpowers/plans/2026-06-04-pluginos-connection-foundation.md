# PluginOS Connection Foundation (PR-A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate orphan `pluginos` server processes via cross-platform singleton enforcement + state-file discovery, and add a `wait_for_reconnect` MCP tool for graceful mid-script reconnects.

**Architecture:** A new `singleton/` module in `mcp-server` acquires a lockfile at startup, reaps the prior server (SIGTERM → 1s grace → SIGKILL), and writes `~/.pluginos/state.json` for bridge discovery. The bridge plugin probes each port via HTTP `/state.json` and ranks candidates by `parentAlive` + `startedAt`. The `wait_for_reconnect` tool polls `IPluginBridge.isConnected()` until success or timeout.

**Tech Stack:** Node.js `fs` for atomic file writes, `process.kill(pid, signal)` for liveness checks and signaling, `fetch` (native in Node 18+ / Figma sandbox) for bridge-side HTTP probes, Vitest for unit + integration tests, `child_process.fork()` for the two-process integration test.

**Spec:** [docs/superpowers/specs/2026-06-04-pluginos-connection-foundation-design.md](../specs/2026-06-04-pluginos-connection-foundation-design.md)

---

## File Map

**Create (server side):**
- `packages/mcp-server/src/singleton/lockfile.ts` — acquireLock / releaseLock primitives
- `packages/mcp-server/src/singleton/pid-file.ts` — atomic PID file r/w
- `packages/mcp-server/src/singleton/takeover.ts` — SIGTERM → poll → SIGKILL sequence
- `packages/mcp-server/src/singleton/state-file.ts` — state.json write/read + parent-alive heartbeat
- `packages/mcp-server/src/singleton/index.ts` — orchestrator
- `packages/mcp-server/src/singleton/types.ts` — shared types (`StateFile`, `SingletonInfo`)
- `packages/mcp-server/src/singleton/__tests__/lockfile.test.ts`
- `packages/mcp-server/src/singleton/__tests__/pid-file.test.ts`
- `packages/mcp-server/src/singleton/__tests__/takeover.test.ts`
- `packages/mcp-server/src/singleton/__tests__/state-file.test.ts`
- `packages/mcp-server/src/singleton/__tests__/integration.test.ts` — two-process test via `child_process.fork`
- `packages/mcp-server/src/__tests__/http-state-endpoint.test.ts`
- `packages/mcp-server/src/__tests__/wait-for-reconnect.test.ts`

**Create (bridge side):**
- `packages/bridge-plugin/src/discovery.ts` — `fetchStateJson` + `StateFile` type + ranking
- `packages/bridge-plugin/src/__tests__/discovery.test.ts`

**Modify:**
- `packages/mcp-server/src/index.ts` — call `acquireSingletonLock()` before `wsServer.start()`, register shutdown handlers, start parent-liveness interval
- `packages/mcp-server/src/http-server.ts` — add `GET /state.json` route
- `packages/mcp-server/src/server.ts` — register `wait_for_reconnect` tool
- `packages/bridge-plugin/src/ui-entry.ts` — modify `connect()` to use ranked discovery before scan
- `packages/claude-plugin/skills/pluginos-figma/SKILL.md` — append `wait_for_reconnect` troubleshooting note via `sync-recipes` (or direct edit if it's outside the autogen block)

---

## Conventions

- All commits use `Skill(commit-commands:commit)` — never write commit messages manually
- After every passing test, run the workspace-scoped test command and read the FULL output before claiming pass
- Tests use Vitest; existing patterns in `packages/mcp-server/src/__tests__/` are the reference
- Tests for filesystem code use temp dirs via `os.tmpdir()` + `crypto.randomUUID()` per test to avoid cross-test interference
- Tests for parent-liveness inject the PID-check function rather than calling `process.kill` directly, so the test doesn't depend on real PIDs
- Build order if needed: `npm run build:shared` before mcp-server work (rare for this PR — no shared changes)
- Push only after the full PR is ready; all work lands on branch `feat/pr-a1-connection-foundation` (created in Task 0)

---

## Task 0: Set up the feature branch

**Files:** None — git only

- [ ] **Step 1: Confirm clean starting state**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git status && git branch --show-current`
Expected: clean tree, on `main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git checkout -b feat/pr-a1-connection-foundation`
Expected: `Switched to a new branch 'feat/pr-a1-connection-foundation'`.

---

## Task 1: Singleton types module

**Files:**
- Create: `packages/mcp-server/src/singleton/types.ts`

- [ ] **Step 1: Write types module**

```typescript
// packages/mcp-server/src/singleton/types.ts

export interface StateFile {
  version: 1;
  pid: number;
  port: number;
  serverVersion: string;
  startedAt: number;
  parentPid: number;
  parentAlive: boolean;
  socketPath: string | null;
}

export interface SingletonInfo {
  takeoverFromPid?: number;
  stateDir: string;
  pidFilePath: string;
  stateFilePath: string;
  lockFilePath: string;
}

export interface LockAcquisition {
  acquired: boolean;
  oldPid: number | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add singleton types module`.

---

## Task 2: Lockfile primitive (TDD)

**Files:**
- Create: `packages/mcp-server/src/singleton/lockfile.ts`
- Create: `packages/mcp-server/src/singleton/__tests__/lockfile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/singleton/__tests__/lockfile.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../lockfile.js";

describe("lockfile primitive", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-lock-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("acquires a lock on a fresh path", async () => {
    const lockPath = join(dir, "server.pid.lock");
    const result = await acquireLock(lockPath);
    expect(result.acquired).toBe(true);
    expect(result.oldPid).toBeNull();
  });

  it("fails to acquire when held by a live PID", async () => {
    const lockPath = join(dir, "server.pid.lock");
    await acquireLock(lockPath);
    const result = await acquireLock(lockPath, { maxRetries: 1, retryDelayMs: 10 });
    expect(result.acquired).toBe(false);
    expect(result.oldPid).toBe(process.pid);
  });

  it("releases the lock", async () => {
    const lockPath = join(dir, "server.pid.lock");
    await acquireLock(lockPath);
    await releaseLock(lockPath);
    const result = await acquireLock(lockPath);
    expect(result.acquired).toBe(true);
  });

  it("treats a lockfile with a dead PID as stale and takes over", async () => {
    const lockPath = join(dir, "server.pid.lock");
    // Manually write a fake dead PID — use a very high PID unlikely to exist
    const { writeFileSync } = await import("node:fs");
    writeFileSync(lockPath, "999999999");
    const result = await acquireLock(lockPath, { maxRetries: 1, retryDelayMs: 10 });
    expect(result.acquired).toBe(true);
    expect(result.oldPid).toBe(999999999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/lockfile`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the lockfile primitive**

```typescript
// packages/mcp-server/src/singleton/lockfile.ts
import { open, readFile, unlink } from "node:fs/promises";
import type { LockAcquisition } from "./types.js";

export interface AcquireOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readPidFromLockfile(path: string): Promise<number | null> {
  try {
    const content = (await readFile(path, "utf8")).trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function acquireLock(
  path: string,
  opts: AcquireOptions = {}
): Promise<LockAcquisition> {
  const maxRetries = opts.maxRetries ?? 5;
  const retryDelayMs = opts.retryDelayMs ?? 200;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const fh = await open(path, "wx");
      await fh.write(String(process.pid));
      await fh.close();
      return { acquired: true, oldPid: null };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const oldPid = await readPidFromLockfile(path);
      if (oldPid !== null && !isProcessAlive(oldPid)) {
        // Stale lock — remove and retry
        try {
          await unlink(path);
        } catch {
          // race with another process — proceed
        }
        continue;
      }

      if (attempt === maxRetries) {
        return { acquired: false, oldPid };
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  return { acquired: false, oldPid: null };
}

export async function releaseLock(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/lockfile`
Expected: 4 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add lockfile primitive with stale-PID detection`.

---

## Task 3: PID file r/w (TDD)

**Files:**
- Create: `packages/mcp-server/src/singleton/pid-file.ts`
- Create: `packages/mcp-server/src/singleton/__tests__/pid-file.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/singleton/__tests__/pid-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePidFile, readPidFile, removePidFile } from "../pid-file.js";

describe("pid-file r/w", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-pid-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a pid atomically (tmp + rename)", async () => {
    const path = join(dir, "server.pid");
    await writePidFile(path, 12345);
    const read = await readPidFile(path);
    expect(read).toBe(12345);
  });

  it("returns null for a missing file", async () => {
    const path = join(dir, "missing.pid");
    expect(await readPidFile(path)).toBeNull();
  });

  it("returns null for a corrupt file", async () => {
    const path = join(dir, "corrupt.pid");
    await writeFile(path, "not-a-number");
    expect(await readPidFile(path)).toBeNull();
  });

  it("removes the pid file", async () => {
    const path = join(dir, "server.pid");
    await writePidFile(path, 42);
    await removePidFile(path);
    expect(await readPidFile(path)).toBeNull();
  });

  it("remove is a no-op when file is missing", async () => {
    const path = join(dir, "missing.pid");
    await expect(removePidFile(path)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/pid-file`
Expected: FAIL.

- [ ] **Step 3: Implement the pid-file module**

```typescript
// packages/mcp-server/src/singleton/pid-file.ts
import { writeFile, readFile, rename, unlink } from "node:fs/promises";

export async function writePidFile(path: string, pid: number): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, String(pid));
  await rename(tmp, path);
}

export async function readPidFile(path: string): Promise<number | null> {
  try {
    const content = (await readFile(path, "utf8")).trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function removePidFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/pid-file`
Expected: 5 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add pid-file r/w with atomic write`.

---

## Task 4: Takeover sequence (TDD)

**Files:**
- Create: `packages/mcp-server/src/singleton/takeover.ts`
- Create: `packages/mcp-server/src/singleton/__tests__/takeover.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/singleton/__tests__/takeover.test.ts
import { describe, it, expect, vi } from "vitest";
import { reapProcess } from "../takeover.js";

describe("reapProcess", () => {
  it("sends SIGTERM and returns true when process exits within grace", async () => {
    const calls: Array<[number, NodeJS.Signals | 0]> = [];
    let alive = true;
    const kill = vi.fn((pid: number, sig: NodeJS.Signals | 0) => {
      calls.push([pid, sig]);
      if (sig === "SIGTERM") {
        // Simulate the process dying 50ms after SIGTERM
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
    const kill = vi.fn((pid: number, sig: NodeJS.Signals | 0) => {
      calls.push([pid, sig]);
      // Process never dies on SIGTERM. SIGKILL kills it.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/takeover`
Expected: FAIL.

- [ ] **Step 3: Implement the takeover sequence**

```typescript
// packages/mcp-server/src/singleton/takeover.ts

export interface ReapOptions {
  kill?: (pid: number, signal: NodeJS.Signals | 0) => boolean;
  graceMs?: number;
  pollMs?: number;
  postKillWaitMs?: number;
}

export interface ReapResult {
  reaped: boolean;
  usedSignal: NodeJS.Signals | null;
}

function defaultKill(pid: number, signal: NodeJS.Signals | 0): boolean {
  return process.kill(pid, signal as NodeJS.Signals);
}

function isAlive(pid: number, kill: (pid: number, signal: 0) => boolean): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    return false;
  }
}

async function pollUntilDead(
  pid: number,
  kill: (pid: number, signal: 0) => boolean,
  timeoutMs: number,
  pollMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid, kill)) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return !isAlive(pid, kill);
}

export async function reapProcess(pid: number, opts: ReapOptions = {}): Promise<ReapResult> {
  const kill = opts.kill ?? defaultKill;
  const graceMs = opts.graceMs ?? 1000;
  const pollMs = opts.pollMs ?? 100;
  const postKillWaitMs = opts.postKillWaitMs ?? 200;

  try {
    kill(pid, "SIGTERM");
  } catch {
    // process may already be dead — that's fine
  }

  const diedFromSigterm = await pollUntilDead(
    pid,
    (p, s) => kill(p, s as NodeJS.Signals | 0),
    graceMs,
    pollMs
  );
  if (diedFromSigterm) {
    return { reaped: true, usedSignal: "SIGTERM" };
  }

  try {
    kill(pid, "SIGKILL");
  } catch {
    // proceed
  }
  const diedFromSigkill = await pollUntilDead(
    pid,
    (p, s) => kill(p, s as NodeJS.Signals | 0),
    postKillWaitMs,
    pollMs
  );
  return { reaped: diedFromSigkill, usedSignal: diedFromSigkill ? "SIGKILL" : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/takeover`
Expected: 3 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add process takeover (SIGTERM → grace → SIGKILL)`.

---

## Task 5: state.json writer (TDD)

**Files:**
- Create: `packages/mcp-server/src/singleton/state-file.ts`
- Create: `packages/mcp-server/src/singleton/__tests__/state-file.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/singleton/__tests__/state-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildStateFile,
  writeStateFile,
  readStateFile,
  removeStateFile,
} from "../state-file.js";
import type { StateFile } from "../types.js";

describe("state-file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-state-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("builds a state object with required fields", () => {
    const state = buildStateFile({
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      parentPid: 99,
      parentAlive: true,
    });
    expect(state.version).toBe(1);
    expect(state.pid).toBe(1234);
    expect(state.port).toBe(9500);
    expect(state.serverVersion).toBe("0.4.3");
    expect(state.parentPid).toBe(99);
    expect(state.parentAlive).toBe(true);
    expect(state.socketPath).toBeNull();
    expect(typeof state.startedAt).toBe("number");
  });

  it("writes atomically (tmp + rename) and reads back", async () => {
    const path = join(dir, "state.json");
    const state: StateFile = buildStateFile({
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      parentPid: 99,
      parentAlive: true,
    });
    await writeStateFile(path, state);
    const read = await readStateFile(path);
    expect(read).toEqual(state);
  });

  it("reads return null for missing files", async () => {
    expect(await readStateFile(join(dir, "missing.json"))).toBeNull();
  });

  it("reads return null for malformed files", async () => {
    const path = join(dir, "malformed.json");
    await writeFile(path, "not-json");
    expect(await readStateFile(path)).toBeNull();
  });

  it("reads return null for state with wrong version", async () => {
    const path = join(dir, "future.json");
    await writeFile(path, JSON.stringify({ version: 999, pid: 1, port: 9500 }));
    expect(await readStateFile(path)).toBeNull();
  });

  it("removes the file", async () => {
    const path = join(dir, "state.json");
    const state = buildStateFile({
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      parentPid: 99,
      parentAlive: true,
    });
    await writeStateFile(path, state);
    await removeStateFile(path);
    expect(await readStateFile(path)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/state-file`
Expected: FAIL.

- [ ] **Step 3: Implement state-file**

```typescript
// packages/mcp-server/src/singleton/state-file.ts
import { writeFile, readFile, rename, unlink } from "node:fs/promises";
import type { StateFile } from "./types.js";

export interface BuildStateInput {
  pid: number;
  port: number;
  serverVersion: string;
  parentPid: number;
  parentAlive: boolean;
}

export function buildStateFile(input: BuildStateInput): StateFile {
  return {
    version: 1,
    pid: input.pid,
    port: input.port,
    serverVersion: input.serverVersion,
    startedAt: Date.now(),
    parentPid: input.parentPid,
    parentAlive: input.parentAlive,
    socketPath: null,
  };
}

export async function writeStateFile(path: string, state: StateFile): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, path);
}

export async function readStateFile(path: string): Promise<StateFile | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: unknown }).version === 1
    ) {
      return parsed as StateFile;
    }
    return null;
  } catch {
    return null;
  }
}

export async function removeStateFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/state-file`
Expected: 6 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add state.json read/write helpers`.

---

## Task 6: Singleton orchestrator (TDD)

**Files:**
- Create: `packages/mcp-server/src/singleton/index.ts`
- Modify: `packages/mcp-server/src/singleton/__tests__/lockfile.test.ts` (no — separate test file)
- Create: `packages/mcp-server/src/singleton/__tests__/orchestrator.test.ts`

The orchestrator ties the four primitives together. Tests use mocked primitives via dependency injection.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/singleton/__tests__/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireSingletonLock } from "../index.js";

describe("acquireSingletonLock", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "pluginos-orch-test-"));
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  it("acquires on a fresh dir with no prior server", async () => {
    const info = await acquireSingletonLock({ stateDir });
    expect(info.takeoverFromPid).toBeUndefined();
    expect(info.stateDir).toBe(stateDir);
    expect(info.pidFilePath).toBe(join(stateDir, "server.pid"));
    expect(info.stateFilePath).toBe(join(stateDir, "state.json"));
    expect(info.lockFilePath).toBe(join(stateDir, "server.pid.lock"));
  });

  it("reaps a stale PID and reports takeoverFromPid", async () => {
    // Pre-write a server.pid for a dead PID (very high, unlikely to exist)
    await writeFile(join(stateDir, "server.pid"), "999999998");
    const info = await acquireSingletonLock({ stateDir });
    expect(info.takeoverFromPid).toBe(999999998);
  });

  it("creates the state dir if missing", async () => {
    const missingDir = join(stateDir, "nested", "pluginos");
    const info = await acquireSingletonLock({ stateDir: missingDir });
    expect(info.stateDir).toBe(missingDir);
  });

  it("returns a degraded info object when the state dir is not writable", async () => {
    // Hard to test cross-platform; use an obviously unwritable path
    const badDir = "/dev/null/not-a-dir";
    const info = await acquireSingletonLock({ stateDir: badDir });
    // We expect it to NOT throw — the orchestrator should swallow and continue
    expect(info.stateDir).toBe(badDir);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/orchestrator`
Expected: FAIL.

- [ ] **Step 3: Implement the orchestrator**

```typescript
// packages/mcp-server/src/singleton/index.ts
import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { acquireLock, releaseLock } from "./lockfile.js";
import { readPidFile, writePidFile, removePidFile } from "./pid-file.js";
import { reapProcess } from "./takeover.js";
import { writeStateFile, removeStateFile, buildStateFile } from "./state-file.js";
import type { SingletonInfo, StateFile } from "./types.js";

export { buildStateFile, writeStateFile, readStateFile, removeStateFile } from "./state-file.js";
export { reapProcess } from "./takeover.js";
export type { StateFile, SingletonInfo } from "./types.js";

export interface AcquireOptions {
  stateDir?: string;
}

function defaultStateDir(): string {
  return process.env.PLUGINOS_STATE_DIR ?? join(homedir(), ".pluginos");
}

export async function acquireSingletonLock(opts: AcquireOptions = {}): Promise<SingletonInfo> {
  const stateDir = opts.stateDir ?? defaultStateDir();
  const pidFilePath = join(stateDir, "server.pid");
  const stateFilePath = join(stateDir, "state.json");
  const lockFilePath = join(stateDir, "server.pid.lock");

  try {
    await mkdir(stateDir, { recursive: true });
    await chmod(stateDir, 0o700).catch(() => {
      // chmod can fail on Windows or special FS — ignore
    });
  } catch (err) {
    console.error(
      `[singleton] Failed to create state dir ${stateDir}: ${(err as Error).message}. Continuing in degraded mode.`
    );
    return { stateDir, pidFilePath, stateFilePath, lockFilePath };
  }

  const lock = await acquireLock(lockFilePath);
  if (!lock.acquired) {
    console.error(
      `[singleton] Could not acquire lock at ${lockFilePath} after retries — proceeding without singleton enforcement.`
    );
    return { stateDir, pidFilePath, stateFilePath, lockFilePath };
  }

  let takeoverFromPid: number | undefined;
  const oldPid = await readPidFile(pidFilePath);
  if (oldPid !== null && isProcessAlive(oldPid)) {
    const result = await reapProcess(oldPid);
    if (result.reaped) {
      takeoverFromPid = oldPid;
      console.error(
        `[singleton] Reaped PID ${oldPid} (signal: ${result.usedSignal}). Took over.`
      );
    } else {
      console.error(
        `[singleton] Could not reap PID ${oldPid} — proceeding anyway. Port collision may occur.`
      );
    }
  } else if (oldPid !== null) {
    takeoverFromPid = oldPid;
    console.error(`[singleton] Found stale PID file (${oldPid} not alive). Took over.`);
  }

  await releaseLock(lockFilePath);
  return { takeoverFromPid, stateDir, pidFilePath, stateFilePath, lockFilePath };
}

export async function writeSingletonState(info: SingletonInfo, state: StateFile): Promise<void> {
  try {
    await writePidFile(info.pidFilePath, state.pid);
    await writeStateFile(info.stateFilePath, state);
  } catch (err) {
    console.error(`[singleton] Failed to write state files: ${(err as Error).message}`);
  }
}

export async function clearSingletonState(info: SingletonInfo): Promise<void> {
  await Promise.allSettled([removeStateFile(info.stateFilePath), removePidFile(info.pidFilePath)]);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/orchestrator`
Expected: 4 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add singleton orchestrator (acquire + writeState + clearState)`.

---

## Task 7: Two-process integration test

**Files:**
- Create: `packages/mcp-server/src/singleton/__tests__/integration.test.ts`
- Create: `packages/mcp-server/src/singleton/__tests__/fixtures/mock-server.mjs`

This is the test that validates the whole singleton lifecycle end-to-end. We spawn two real Node processes that each call `acquireSingletonLock`, and assert the second reaps the first.

- [ ] **Step 1: Write the mock-server fixture**

```javascript
// packages/mcp-server/src/singleton/__tests__/fixtures/mock-server.mjs
import { acquireSingletonLock, writeSingletonState, buildStateFile, clearSingletonState } from "../../index.js";

const stateDir = process.env.PLUGINOS_STATE_DIR;

async function main() {
  const info = await acquireSingletonLock({ stateDir });
  const state = buildStateFile({
    pid: process.pid,
    port: 9500,
    serverVersion: "test",
    parentPid: process.ppid,
    parentAlive: true,
  });
  await writeSingletonState(info, state);

  // Notify parent we're ready
  if (process.send) process.send({ ready: true, takeoverFromPid: info.takeoverFromPid });

  // Handle takeover by exiting cleanly on SIGTERM
  process.on("SIGTERM", async () => {
    await clearSingletonState(info);
    process.exit(0);
  });

  // Stay alive indefinitely
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("mock-server fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Write the integration test**

```typescript
// packages/mcp-server/src/singleton/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fork, ChildProcess } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "mock-server.mjs");

interface ReadyMessage {
  ready: boolean;
  takeoverFromPid?: number;
}

function spawnMockServer(stateDir: string): Promise<{
  proc: ChildProcess;
  ready: ReadyMessage;
}> {
  return new Promise((resolve, reject) => {
    const proc = fork(fixturePath, {
      env: { ...process.env, PLUGINOS_STATE_DIR: stateDir },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    proc.once("error", reject);
    proc.once("message", (msg) => resolve({ proc, ready: msg as ReadyMessage }));
  });
}

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    let resolved = false;
    proc.once("exit", (code) => {
      if (!resolved) {
        resolved = true;
        resolve(code);
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);
  });
}

describe("singleton integration: two-process takeover", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-integ-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("second invocation reaps the first and reports takeoverFromPid", async () => {
    const first = await spawnMockServer(dir);
    expect(first.ready.ready).toBe(true);
    expect(first.ready.takeoverFromPid).toBeUndefined();

    const firstPid = first.proc.pid!;

    const second = await spawnMockServer(dir);
    expect(second.ready.ready).toBe(true);
    expect(second.ready.takeoverFromPid).toBe(firstPid);

    // First should have exited
    const firstExitCode = await waitForExit(first.proc, 3000);
    expect(firstExitCode).not.toBeNull();

    // The pid file should now contain second's PID
    const pidContent = (await readFile(join(dir, "server.pid"), "utf8")).trim();
    expect(Number.parseInt(pidContent, 10)).toBe(second.proc.pid);

    second.proc.kill("SIGTERM");
    await waitForExit(second.proc, 3000);
  }, 15000);

  it("a fresh start with no prior state has no takeoverFromPid", async () => {
    const one = await spawnMockServer(dir);
    expect(one.ready.takeoverFromPid).toBeUndefined();
    one.proc.kill("SIGTERM");
    await waitForExit(one.proc, 3000);
  }, 10000);
});
```

- [ ] **Step 3: Build singleton (ensure JS exists for fork to import)**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run build -w packages/mcp-server`

If the fixture uses `.js` imports but only `.ts` exists, we need to either build first OR mark the fixture as `.ts` and run via tsx. Since this is a Vitest test, the test runner can transpile the fixture if we point it at a `.ts` file.

Adjust: change `fixtures/mock-server.mjs` → `fixtures/mock-server.ts` AND change `fork(fixturePath)` to `fork(fixturePath, { execArgv: ["--import", "tsx"] })`. (Note: requires `tsx` in devDependencies, which is already present.)

Apply this change before running the test if the .mjs version doesn't find the module.

- [ ] **Step 4: Run the integration test**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/integration`
Expected: 2 passed (the test is slow; allow up to 15s timeout per case).

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `test(mcp-server): add two-process singleton integration test`.

---

## Task 8: Wire singleton into mcp-server main()

**Files:**
- Modify: `packages/mcp-server/src/index.ts`

- [ ] **Step 1: Read existing main() to understand current shape**

Read `packages/mcp-server/src/index.ts` from line 40 onwards.

- [ ] **Step 2: Modify main() to acquire singleton lock + register shutdown + write state file**

Replace the `main()` body and add a parent-liveness heartbeat. Below is the full new main() (preserve everything ABOVE the existing `async function main()` declaration; only this function changes):

```typescript
import {
  acquireSingletonLock,
  writeSingletonState,
  clearSingletonState,
  buildStateFile,
  writeStateFile,
} from "./singleton/index.js";

let singletonInfo: Awaited<ReturnType<typeof acquireSingletonLock>> | null = null;
let currentParentAlive = true;
let parentLivenessInterval: NodeJS.Timeout | null = null;
let selfTerminateTimeout: NodeJS.Timeout | null = null;

const PARENT_LIVENESS_INTERVAL_MS = 10_000;
const ORPHAN_GRACE_MS = 30_000;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function registerShutdownHandlers(): void {
  const cleanup = async () => {
    if (singletonInfo) {
      await clearSingletonState(singletonInfo);
    }
    if (parentLivenessInterval) {
      clearInterval(parentLivenessInterval);
      parentLivenessInterval = null;
    }
    if (selfTerminateTimeout) {
      clearTimeout(selfTerminateTimeout);
      selfTerminateTimeout = null;
    }
  };
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("exit", () => {
    // Synchronous best-effort: try to unlink files. Promises won't run in 'exit'.
    if (singletonInfo) {
      try {
        require("node:fs").unlinkSync(singletonInfo.stateFilePath);
      } catch {
        // ignored
      }
      try {
        require("node:fs").unlinkSync(singletonInfo.pidFilePath);
      } catch {
        // ignored
      }
    }
  });
}

async function startParentLivenessHeartbeat(state: ReturnType<typeof buildStateFile>): Promise<void> {
  parentLivenessInterval = setInterval(async () => {
    if (!singletonInfo) return;
    const alive = isProcessAlive(process.ppid);
    if (alive !== currentParentAlive) {
      currentParentAlive = alive;
      const updated = { ...state, parentAlive: alive };
      await writeStateFile(singletonInfo.stateFilePath, updated);
    }
    if (!alive && selfTerminateTimeout === null) {
      console.error(
        `[singleton] Parent PID ${state.parentPid} is dead. Self-terminating in ${ORPHAN_GRACE_MS / 1000}s.`
      );
      selfTerminateTimeout = setTimeout(() => {
        console.error("[singleton] Grace period elapsed. Exiting.");
        process.exit(0);
      }, ORPHAN_GRACE_MS);
    }
  }, PARENT_LIVENESS_INTERVAL_MS);
}

async function main() {
  singletonInfo = await acquireSingletonLock();
  if (singletonInfo.takeoverFromPid !== undefined) {
    console.error(`PluginOS server: took over from PID ${singletonInfo.takeoverFromPid}`);
  }
  registerShutdownHandlers();

  // Re-read on every request so rebuilds land without restarting the server.
  const httpServer = createHttpServer(() => loadUiContent());

  const wsServer = new WebSocketPluginBridge({ httpServer });
  const port = await wsServer.start();
  console.error(`PluginOS WebSocket + HTTP server on port ${port}`);

  // Read package version for state.json
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

  const state = buildStateFile({
    pid: process.pid,
    port,
    serverVersion: pkg.version,
    parentPid: process.ppid,
    parentAlive: true,
  });
  await writeSingletonState(singletonInfo, state);
  await startParentLivenessHeartbeat(state);

  const mcpServer = createPluginOSServer(wsServer);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("PluginOS MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Run typecheck and existing mcp-server tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run typecheck && npm test -w packages/mcp-server`
Expected: no typecheck errors; all existing tests pass.

If typecheck fails on the `require()` calls in the `exit` handler, replace them with `import { unlinkSync } from "node:fs"` at the top and use `unlinkSync(...)` directly.

- [ ] **Step 4: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): wire singleton lock + state-file into startup`.

---

## Task 9: HTTP /state.json endpoint (TDD)

**Files:**
- Create: `packages/mcp-server/src/__tests__/http-state-endpoint.test.ts`
- Modify: `packages/mcp-server/src/http-server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/__tests__/http-state-endpoint.test.ts
import { describe, it, expect } from "vitest";
import { createHttpServer } from "../http-server.js";
import type { StateFile } from "../singleton/types.js";

describe("HTTP /state.json endpoint", () => {
  it("returns the current state object when set", async () => {
    const state: StateFile = {
      version: 1,
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 1700000000000,
      parentPid: 99,
      parentAlive: true,
      socketPath: null,
    };
    const server = createHttpServer(
      () => "<html></html>",
      () => state
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(state);
    } finally {
      server.close();
    }
  });

  it("returns 503 when no state is set", async () => {
    const server = createHttpServer(
      () => "<html></html>",
      () => null
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`);
      expect(res.status).toBe(503);
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- __tests__/http-state-endpoint`
Expected: FAIL (createHttpServer doesn't accept a state getter).

- [ ] **Step 3: Read current http-server.ts and modify the signature**

Read `packages/mcp-server/src/http-server.ts` fully. Then change `createHttpServer(getUiContent: () => string)` to accept an optional state getter:

```typescript
import { createServer, IncomingMessage, ServerResponse, Server } from "http";
import type { StateFile } from "./singleton/types.js";

export function createHttpServer(
  getUiContent: () => string,
  getStateFile?: () => StateFile | null
): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    // Existing routes — keep as-is.
    // (Insert your existing routing here.)

    if (req.url === "/state.json" && req.method === "GET") {
      if (!getStateFile) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("No state available");
        return;
      }
      const state = getStateFile();
      if (state === null) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("No state available");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state));
      return;
    }

    // ... rest of existing routing
  });
}
```

Preserve all existing routing logic that was there before. Only add the `/state.json` handler.

- [ ] **Step 4: Wire the state getter in main()**

In `packages/mcp-server/src/index.ts`, modify the `createHttpServer` call to pass a state getter. The state is captured at startup, so:

```typescript
let currentState: StateFile | null = null;

// ... inside main(), after building `state`:
currentState = state;

// And inside the parent-liveness interval, update currentState when state changes:
const updated = { ...state, parentAlive: alive };
currentState = updated;
await writeStateFile(singletonInfo.stateFilePath, updated);
```

The `createHttpServer` call becomes:

```typescript
const httpServer = createHttpServer(
  () => loadUiContent(),
  () => currentState
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- __tests__/http-state-endpoint`
Expected: 2 passed.

- [ ] **Step 6: Run full mcp-server suite**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server`
Expected: all green.

- [ ] **Step 7: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add HTTP /state.json endpoint`.

---

## Task 10: Bridge discovery module (TDD)

**Files:**
- Create: `packages/bridge-plugin/src/discovery.ts`
- Create: `packages/bridge-plugin/src/__tests__/discovery.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/bridge-plugin/src/__tests__/discovery.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchStateJson, rankCandidates, type StateFile, SUPPORTED_VERSION } from "../discovery.js";

describe("fetchStateJson", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed state on 200 with a supported version", async () => {
    const state: StateFile = {
      version: 1,
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 100,
      parentPid: 99,
      parentAlive: true,
      socketPath: null,
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => state,
    });
    const result = await fetchStateJson(9500);
    expect(result).toEqual(state);
  });

  it("returns null on a non-200 response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    expect(await fetchStateJson(9500)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    expect(await fetchStateJson(9500)).toBeNull();
  });

  it("returns null for a future version", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: SUPPORTED_VERSION + 1, pid: 1, port: 9500 }),
    });
    expect(await fetchStateJson(9500)).toBeNull();
  });
});

describe("rankCandidates", () => {
  function makeState(overrides: Partial<StateFile>): StateFile {
    return {
      version: 1,
      pid: 1,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 0,
      parentPid: 99,
      parentAlive: true,
      socketPath: null,
      ...overrides,
    };
  }

  it("filters out candidates with parentAlive=false", () => {
    const ranked = rankCandidates([
      { port: 9500, state: makeState({ parentAlive: false, startedAt: 100 }) },
      { port: 9501, state: makeState({ parentAlive: true, startedAt: 50 }) },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].port).toBe(9501);
  });

  it("sorts by startedAt descending (newest first)", () => {
    const ranked = rankCandidates([
      { port: 9500, state: makeState({ startedAt: 100 }) },
      { port: 9501, state: makeState({ startedAt: 200 }) },
      { port: 9502, state: makeState({ startedAt: 150 }) },
    ]);
    expect(ranked.map((c) => c.port)).toEqual([9501, 9502, 9500]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- discovery`
Expected: FAIL.

- [ ] **Step 3: Implement discovery**

```typescript
// packages/bridge-plugin/src/discovery.ts

export interface StateFile {
  version: 1;
  pid: number;
  port: number;
  serverVersion: string;
  startedAt: number;
  parentPid: number;
  parentAlive: boolean;
  socketPath: string | null;
}

export const SUPPORTED_VERSION = 1;
export const FETCH_TIMEOUT_MS = 300;

export interface DiscoveryCandidate {
  port: number;
  state: StateFile;
}

export async function fetchStateJson(port: number): Promise<StateFile | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`http://127.0.0.1:${port}/state.json`, {
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { version?: unknown }).version === "number" &&
      (body as { version: number }).version <= SUPPORTED_VERSION
    ) {
      return body as StateFile;
    }
    return null;
  } catch {
    return null;
  }
}

export function rankCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return candidates
    .filter((c) => c.state.parentAlive !== false)
    .sort((a, b) => b.state.startedAt - a.state.startedAt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- discovery`
Expected: 6 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): add discovery module (fetchStateJson + rankCandidates)`.

---

## Task 11: Wire discovery into the bridge connect() flow

**Files:**
- Modify: `packages/bridge-plugin/src/ui-entry.ts`
- Create: `packages/bridge-plugin/src/__tests__/connect-with-discovery.test.ts`

The existing connect logic in `ui-entry.ts` scans ports directly. We modify it to (1) probe each port for state.json first, (2) rank candidates, (3) connect to the best.

- [ ] **Step 1: Write the failing test (happy-dom integration test)**

```typescript
// packages/bridge-plugin/src/__tests__/connect-with-discovery.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  discoverCandidatePorts,
  type StateFile,
} from "../discovery.js";

describe("discoverCandidatePorts (probe-and-rank end-to-end)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ranked candidates, excluding orphans", async () => {
    const orphan: StateFile = {
      version: 1,
      pid: 1,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 100,
      parentPid: 99,
      parentAlive: false,
      socketPath: null,
    };
    const live: StateFile = {
      version: 1,
      pid: 2,
      port: 9501,
      serverVersion: "0.4.3",
      startedAt: 200,
      parentPid: 100,
      parentAlive: true,
      socketPath: null,
    };
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(":9500")) return { ok: true, json: async () => orphan };
      if (url.includes(":9501")) return { ok: true, json: async () => live };
      throw new Error("ECONNREFUSED");
    });
    const ranked = await discoverCandidatePorts([9500, 9501, 9502]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].port).toBe(9501);
  });

  it("returns empty when no servers respond", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const ranked = await discoverCandidatePorts([9500, 9501]);
    expect(ranked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- connect-with-discovery`
Expected: FAIL — `discoverCandidatePorts` not exported.

- [ ] **Step 3: Add `discoverCandidatePorts` to discovery.ts**

Append to `packages/bridge-plugin/src/discovery.ts`:

```typescript
export async function discoverCandidatePorts(ports: number[]): Promise<DiscoveryCandidate[]> {
  const probed = await Promise.all(
    ports.map(async (port) => {
      const state = await fetchStateJson(port);
      return state ? { port, state } : null;
    })
  );
  const candidates = probed.filter((c): c is DiscoveryCandidate => c !== null);
  return rankCandidates(candidates);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- connect-with-discovery`
Expected: 2 passed.

- [ ] **Step 5: Modify ui-entry.ts to use discovery before scan**

Read the current `connect()` implementation in `packages/bridge-plugin/src/ui-entry.ts` (around lines 165-185 or wherever the port loop lives). Replace the port-iteration logic with:

```typescript
import { discoverCandidatePorts } from "./discovery.js";

const PORT_MIN = 9500;
const PORT_MAX = 9510;
const PORTS: number[] = [];
for (let p = PORT_MIN; p <= PORT_MAX; p++) PORTS.push(p);

async function connect(): Promise<void> {
  setStatus("connecting");

  // Phase 1: discovery probe
  const ordered = [lastPort, ...PORTS.filter((p) => p !== lastPort)].filter(
    (p): p is number => typeof p === "number"
  );
  const ranked = await discoverCandidatePorts(ordered);

  // Phase 2: connect to ranked candidates first
  for (const { port } of ranked) {
    if (await tryWsConnect(port)) {
      lastPort = port;
      return;
    }
  }

  // Phase 3: fallback — any port that opens a socket
  for (const port of ordered) {
    if (await tryWsConnect(port)) {
      lastPort = port;
      return;
    }
  }

  setStatus("disconnected");
  scheduleReconnect();
}

async function tryWsConnect(port: number): Promise<boolean> {
  // Existing WebSocket connect logic, but returning boolean success
  // ...
}
```

Adapt the surrounding existing code (state tracking, reconnect scheduler) — don't rewrite anything outside connect itself.

- [ ] **Step 6: Run all bridge-plugin tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin`
Expected: all green (78 existing + new discovery tests).

- [ ] **Step 7: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): use ranked discovery before port scan in connect()`.

---

## Task 12: wait_for_reconnect MCP tool (TDD)

**Files:**
- Create: `packages/mcp-server/src/__tests__/wait-for-reconnect.test.ts`
- Modify: `packages/mcp-server/src/server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/__tests__/wait-for-reconnect.test.ts
import { describe, it, expect, vi } from "vitest";
import type { IPluginBridge } from "@pluginos/shared";
import { createPluginOSServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

function makeBridge(isConnected: () => boolean): IPluginBridge {
  return {
    sendAndWait: vi.fn(),
    getStatus: vi.fn().mockReturnValue({
      connected: isConnected(),
      fileKey: "mock-file",
      fileName: "Mock File",
      currentPage: "Page 1",
      port: 9500,
      connectedFiles: 1,
    }),
    listFiles: vi.fn().mockReturnValue([]),
    isConnected: vi.fn(isConnected),
  } as unknown as IPluginBridge;
}

async function setupClient(bridge: IPluginBridge) {
  const server = createPluginOSServer(bridge);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  return client;
}

describe("wait_for_reconnect tool", () => {
  it("returns connected immediately when bridge is already connected", async () => {
    const bridge = makeBridge(() => true);
    const client = await setupClient(bridge);
    const res = (await client.callTool({
      name: "wait_for_reconnect",
      arguments: { timeoutSec: 5 },
    })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.connected).toBe(true);
    expect(payload.waitedMs).toBeLessThan(700); // first poll + tiny overhead
  });

  it("returns timeout response when bridge never connects", async () => {
    const bridge = makeBridge(() => false);
    const client = await setupClient(bridge);
    const res = (await client.callTool({
      name: "wait_for_reconnect",
      arguments: { timeoutSec: 2 },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    const payload = JSON.parse(res.content[0].text);
    expect(payload.connected).toBe(false);
    expect(payload.waitedMs).toBeGreaterThanOrEqual(2000);
  }, 5000);

  it("returns connected when bridge connects mid-wait", async () => {
    let connected = false;
    const bridge = makeBridge(() => connected);
    const client = await setupClient(bridge);
    setTimeout(() => {
      connected = true;
    }, 500);
    const res = (await client.callTool({
      name: "wait_for_reconnect",
      arguments: { timeoutSec: 5 },
    })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.connected).toBe(true);
    expect(payload.waitedMs).toBeGreaterThanOrEqual(500);
    expect(payload.waitedMs).toBeLessThan(1500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- __tests__/wait-for-reconnect`
Expected: FAIL — tool doesn't exist.

- [ ] **Step 3: Register the tool in server.ts**

Add to `packages/mcp-server/src/server.ts` (after existing tool registrations):

```typescript
server.tool(
  "wait_for_reconnect",
  "Wait for the PluginOS Bridge plugin to reconnect after a disconnect. " +
    "Returns when the bridge reports connected, or when timeoutSec elapses. " +
    "Use this when a prior tool call returned 'No plugin connected' to gracefully " +
    "wait for the user to relaunch the plugin instead of immediately failing back to chat.",
  {
    timeoutSec: z
      .number()
      .int()
      .min(1)
      .max(300)
      .default(60)
      .describe("Maximum seconds to wait. Default 60, max 300."),
  },
  async ({ timeoutSec }) => {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutSec * 1000;

    while (Date.now() < deadline) {
      if (bridge.isConnected()) {
        const status = bridge.getStatus();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  connected: true,
                  waitedMs: Date.now() - startedAt,
                  fileName: status.fileName,
                  fileKey: status.fileKey,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              connected: false,
              waitedMs: Date.now() - startedAt,
              timeoutSec,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- __tests__/wait-for-reconnect`
Expected: 3 passed.

- [ ] **Step 5: Run the full mcp-server suite**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server`
Expected: all green.

- [ ] **Step 6: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add wait_for_reconnect MCP tool`.

---

## Task 13: Skill note for wait_for_reconnect

**Files:**
- Modify: `packages/claude-plugin/skills/pluginos-figma/SKILL.md`

The recipes block is autogen. The connection troubleshooting section is hand-written. We add a brief mention there.

- [ ] **Step 1: Locate the Connection troubleshooting section**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && grep -n "Connection troubleshooting" packages/claude-plugin/skills/pluginos-figma/SKILL.md`

- [ ] **Step 2: Append a one-sentence note to that section**

Find the existing list step `3. Wait for confirmation before retrying.` (or equivalent). Add a new step after it:

```markdown
4. If the user relaunches the plugin, call `pluginos.wait_for_reconnect({ timeoutSec: 60 })` to gracefully block until reconnect — then retry the failed op. This avoids bouncing back to chat for every short disconnect.
```

If the section's wording doesn't match exactly, adapt to the existing tone. Keep under 50 tokens.

- [ ] **Step 3: Verify the skill budget**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node scripts/check-skill-budget.cjs`
Expected: PASS, count under 1150.

- [ ] **Step 4: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `docs(claude-plugin): document wait_for_reconnect in skill troubleshooting`.

---

## Task 14: Full check + smoke test prep

**Files:** None (verification only)

- [ ] **Step 1: Run the full pipeline**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run check`
Expected: lint, format, typecheck, build, test all pass.

- [ ] **Step 2: Run the integration test specifically (slow)**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- singleton/__tests__/integration`
Expected: 2 passed.

- [ ] **Step 3: Confirm no untracked files**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git status`
Expected: clean working tree.

- [ ] **Step 4: Write the manual smoke test checklist for the PR body**

The smoke test happens on the user's machine. Write the checklist that goes into the PR description (don't commit this — it goes into the PR body):

```markdown
## Manual smoke test

Before merging, against a real Figma file:

1. **Orphan reaping (cross-session):**
   - Start one Claude Code session. Verify `pluginos.get_status` works.
   - Without exiting that session, open a second Claude Code session.
   - In the second session, run `pluginos.get_status`. Expected: returns live status. First session's pluginos was reaped silently.
   - Verify `~/.pluginos/server.pid` contains the second session's `pluginos` PID.

2. **Stale state file cleanup:**
   - Force-kill `pluginos` with `kill -9 $(pgrep -f pluginos)`.
   - Verify `~/.pluginos/state.json` still exists (orphaned).
   - Start a new Claude session. Verify `pluginos.get_status` works.
   - Verify `~/.pluginos/state.json` now reflects the new server's PID.

3. **wait_for_reconnect end-to-end:**
   - Start a Claude session with the bridge plugin open. Run `pluginos.execute_figma { code: "return 'hi'" }`. Confirm response.
   - Close the bridge plugin (Figma side).
   - Ask Claude to run another execute_figma. Expected: `No plugin connected` error.
   - Ask Claude to call `pluginos.wait_for_reconnect({ timeoutSec: 60 })`.
   - Reopen the bridge plugin within 60s.
   - Confirm `wait_for_reconnect` returns `connected: true` within ~5s of reopening.
   - Retry the failed `execute_figma`. Confirm success.

4. **Parent-alive self-termination:**
   - Note `pluginos` PID via `pgrep -f pluginos`.
   - Kill the Claude session that spawned it (or `kill -9` its parent shell).
   - Wait 45 seconds (30s grace + 10s heartbeat overhead).
   - Verify `pluginos` PID is gone via `pgrep -f pluginos`.
```

---

## Task 15: Open the implementation PR

**Files:** None — git/gh only

- [ ] **Step 1: Push the branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git push -u origin feat/pr-a1-connection-foundation`
Expected: pre-push hooks pass, branch pushed.

- [ ] **Step 2: Open the PR**

Run `gh pr create --base main --head feat/pr-a1-connection-foundation --title "feat: PR-A1 connection foundation — singleton + discovery + wait_for_reconnect"` with a body that includes:
- One-paragraph summary
- Bulleted list of what's shipped (singleton, state.json, /state.json endpoint, ranked discovery in bridge, wait_for_reconnect)
- Reference to the design doc path
- The manual smoke test checklist from Task 14 Step 4
- Test plan: "All unit + integration tests pass via `npm run check`. Manual smoke test pending against a real Figma file."

- [ ] **Step 3: Report the PR URL to the user**

The terminal phase is complete.

---

## Self-Review Notes

Performed:

1. **Spec coverage:**
   - §A (singleton) → Tasks 2, 3, 4, 5, 6, 7, 8 ✓
   - §B (code organization) → File map at top ✓
   - §C (state.json) → Tasks 5, 8 (heartbeat in main()) ✓
   - §D (bridge discovery) → Tasks 9 (server endpoint), 10 (discovery module), 11 (wiring) ✓
   - §E (wait_for_reconnect) → Tasks 12, 13 ✓
   - Backwards compatibility — explicitly preserved in Task 11 (Phase 4 fallback) ✓
   - Testing strategy — Tasks 2-13 each include tests; integration in Task 7 ✓
   - Non-goals — explicitly not in any task ✓

2. **Placeholder scan:** No TBDs. Two adapt-to-existing-code areas (Task 8's existing http-server.ts routing, Task 11's existing connect() body): the engineer reads the current file first, then applies the modifications shown. These are unavoidable because the existing code has implementation details we don't want to copy-paste into the plan verbatim.

3. **Type consistency:** `StateFile` shape consistent across `types.ts` (Task 1), `state-file.ts` (Task 5), `discovery.ts` (Task 10), and the test fixtures. `SingletonInfo` shape consistent across `types.ts` and orchestrator (Task 6). `acquireSingletonLock` return type used in Task 8 matches its definition in Task 6.

4. **Known unknown:** Task 7 may need to switch the fixture from `.mjs` to `.ts` if Node ESM resolution doesn't find the built `singleton/index.js`. Explicit instruction provided in the task to make that switch if needed, with the tsx command pattern.
