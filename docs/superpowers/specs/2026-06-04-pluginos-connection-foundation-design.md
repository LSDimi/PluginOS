# PluginOS Connection Foundation (PR-A1) — Design

**Date:** 2026-06-04
**Status:** Approved for implementation planning
**Author:** Brainstorm session with Claude
**Scope:** Single PR. Server-side singleton enforcement + bridge-side discovery + a new `wait_for_reconnect` MCP tool. Bridge UI cleanup (dark mode, state machine, activity panel) deferred to PR-A2.

## Context

The PluginOS bulk-seed run on 2026-06-03 surfaced a class of bugs around port collisions and stale server processes:

- A previous Claude Desktop conversation session spawned `npx pluginos`, then ended without killing it. The orphan held port 9500.
- A new Claude Desktop conversation spawned its own `pluginos` server, which fell back to port 9501.
- The bridge plugin remained connected to the orphan PID 5762 (still bound to 9500), so the active session's MCP calls reached a dead server.
- The user discovered this only by running `lsof -iTCP:9500` and tracing the parent process chain.

This happened twice on the same day. The pain is **acute** (silent failure mode, no error to diagnose) and **repeated** (orphan persistence across sessions is the default outcome).

The full feedback document is at `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md` (items #9, #10, #11 in particular).

## Goals

1. **Make orphan servers impossible to leave behind.** Any new `npx pluginos` invocation gracefully reaps the prior server before binding.
2. **Make the bridge plugin connect to the right server even if multiple are listening.** A discovery file + `parentAlive` heuristic let the bridge pick the live one.
3. **Make mid-script disconnects recoverable without a chat-bounce.** A `wait_for_reconnect` MCP tool lets the agent block until the bridge reconnects.

## Non-goals (deferred to PR-A2 or later)

- Bridge plugin dark mode fix → **PR-A2**
- UI state machine cleanup (connect/disconnect view consistency) → **PR-A2**
- Activity panel in connected view → **PR-A2**
- Install and distribution polish → **PR-C**
- Cross-machine discovery — single user, single host only
- Unix domain socket transport (`state.json` reserves `socketPath` field for future use, but it stays `null` in v1)
- Daemonization — the server still lives and dies with the invoking process
- MCP-level proxying (second `npx pluginos` does not become a client of the first; it reaps and takes over)
- Windows-specific CI testing — `fs.open('wx')` and `process.kill(pid, 0)` both work on Windows, but our matrix only covers Linux today

## Architecture

```
                                                         ~/.pluginos/
                                                         ├── server.pid       (PID of current server)
                                                         ├── server.pid.lock  (mutex during startup)
                                                         └── state.json       (discovery + parentAlive)
                                                                  ▲
                                                                  │ writes
┌───────────────┐                              ┌──────────────────┴─────────┐
│ agent         │  ── execute / list_ops ──►   │ mcp-server                 │
│ (Claude)      │                              │  ├── singleton/             │
│               │  ── wait_for_reconnect ──►   │  │   ├── lockfile.ts        │
└───────────────┘                              │  │   ├── pid-file.ts        │
                                               │  │   ├── takeover.ts        │
                                               │  │   └── state-file.ts      │
                                               │  └── http-server.ts         │
                                               │     ├── (existing routes)   │
                                               │     └── GET /state.json     │
                                               └──────────┬──────────────────┘
                                                          │ WebSocket
                                                          ▼
                                               ┌─────────────────────────────┐
                                               │ bridge-plugin               │
                                               │  └── ui-entry.ts            │
                                               │     ├── fetchStateJson()    │ ◄── HTTP probe
                                               │     └── connect() (ranked)  │
                                               └─────────────────────────────┘
```

## Component-by-component design

### A. Singleton mechanism

**State directory:** `~/.pluginos/` created with mode `0700` if missing. All files inside owned by current user.

**Lock primitive:** `fs.open(lockPath, 'wx')` — creates the lockfile atomically or fails with `EEXIST`. Works identically on Linux, macOS, and Windows. Simpler than `flock(2)` and cross-platform native.

**Startup sequence:**

```
1. mkdir -p ~/.pluginos (mode 0700)
2. acquireLock(server.pid.lock):
     loop (max 5 retries, 200ms backoff):
       try fs.open('wx')   → got lock, break
       catch EEXIST        → check who holds it (read PID), retry if stale
3. read server.pid (if exists)
4. if oldPid exists and alive (process.kill(oldPid, 0) succeeds):
     a. send SIGTERM(oldPid)
     b. poll process.kill(oldPid, 0) every 100ms for 1s
     c. if still alive: send SIGKILL(oldPid)
     d. wait 200ms for kernel to release the port
5. start WebSocket server (existing 9500-9510 scan logic — unchanged)
6. write server.pid atomically: write to server.pid.tmp, rename to server.pid
7. write state.json atomically (Section C)
8. release lock: unlink server.pid.lock
```

**Shutdown sequence** (handlers on `SIGTERM`, `SIGINT`, and `process.on('exit')`):

```
1. unlink state.json (best-effort, swallow ENOENT)
2. unlink server.pid (best-effort)
3. close WebSocket
```

If the process is SIGKILL'd or crashes hard, files are left orphaned — the next startup detects this via the PID-liveness check at step 4 and takes over without ceremony.

**Edge cases handled inline:**

| Case | Behavior |
|---|---|
| `~/.pluginos/` not writable | Log warning to stderr, skip the entire singleton dance, run as before (degraded) |
| PID file corrupted / unreadable | Treat as no lock — take over by unlinking and rewriting |
| Lock held >1s by another startup | After 5 retries, log warning and proceed anyway (race window we accept rather than deadlock) |
| Old server's port is reused by a non-pluginos process | The 9500-9510 scan moves to the next port — old behavior preserved |
| Multiple users on same machine | Each has own `~/.pluginos/` — no conflict |

### B. Code organization for the singleton module

```
packages/mcp-server/src/singleton/
  ├── lockfile.ts       — acquireLock / releaseLock with retry + stale-detection
  ├── takeover.ts       — SIGTERM → poll → SIGKILL sequence
  ├── pid-file.ts       — read/write server.pid atomically
  ├── state-file.ts     — write/clean state.json atomically + parent-liveness heartbeat
  └── index.ts          — orchestrator: acquireSingletonLock(): Promise<{ takeoverFromPid?: number }>
```

Integration in `packages/mcp-server/src/index.ts` `main()`: call `acquireSingletonLock()` before `wsServer.start()`, register shutdown handlers immediately after acquisition.

### C. Discovery file (`state.json`)

**Path:** `~/.pluginos/state.json`

**Shape (v1):**

```json
{
  "version": 1,
  "pid": 12345,
  "port": 9500,
  "serverVersion": "0.4.3",
  "startedAt": 1735036820123,
  "parentPid": 1234,
  "parentAlive": true,
  "socketPath": null
}
```

- `version` — schema version; bridge gracefully ignores files with newer-than-expected versions
- `pid` — server PID, for liveness checks
- `port` — bound WebSocket port (could be 9500-9510)
- `serverVersion` — semver of the running `pluginos`; bridge uses this for the existing mismatch UI without waiting for a WebSocket `SERVER_HELLO`
- `startedAt` — epoch millis; tiebreaker between multiple live candidates
- `parentPid` — PID of the process that spawned `pluginos`; useful for diagnostics
- `parentAlive` — `true` if the server's parent is still alive; toggled by the server itself on a 10s interval (see below)
- `socketPath` — reserved for future Unix-socket transport; null in v1

**Write protocol** (server side):

```
1. After WebSocket bind succeeds, build the state object
2. Write to ~/.pluginos/state.json.tmp
3. fs.rename(tmp, state.json) — atomic on POSIX, near-atomic on Windows
4. On graceful shutdown: fs.unlink(state.json) — best effort
```

The write happens *after* the WebSocket is listening so a bridge that reads the file is guaranteed to find a live server (modulo race conditions during the millisecond between bind and write, which the bridge handles via retry).

**Parent-liveness heartbeat** (server side, every 10 seconds):

```typescript
setInterval(() => {
  const alive = isProcessAlive(process.ppid);
  if (alive !== currentParentAlive) {
    writeStateFile({ ...state, parentAlive: alive });
    currentParentAlive = alive;
  }
  if (!alive) {
    // Self-terminate after a 30s grace period if our parent is dead.
    // This is the orphan-prevention mechanism that cures the user's bug at the source.
    setTimeout(() => process.exit(0), 30_000);
  }
}, 10_000);
```

The 30s grace lets the agent finish an in-flight call before the orphan reaps itself. Combined with the bridge's `parentAlive` filter (Section D), orphans become double-blind: even if one persists past the heartbeat, the bridge ignores it.

### D. Bridge plugin integration

The bridge plugin sandbox cannot read files from disk. Instead, it discovers servers by HTTP-probing each port in the existing 9500-9510 range, reading `state.json` from the server's HTTP endpoint, and ranking candidates.

**New flow** (replaces the existing `connect()` in `packages/bridge-plugin/src/ui-entry.ts` ~lines 165-185):

```
async connect():
  order = [lastPort, ...PORT_MIN..PORT_MAX].filter(uniq)
  candidates = []

  // Phase 1: HTTP probe each port for state.json
  for port in order:
    state = await fetchStateJson(port)   // 300ms timeout per port
    if state:
      candidates.push({ port, state })

  // Phase 2: rank candidates
  ranked = candidates
    .filter(c => c.state.parentAlive !== false)   // exclude orphans
    .sort((a, b) => b.state.startedAt - a.state.startedAt)  // newest first

  // Phase 3: connect to best
  for { port } in ranked:
    try wsConnect(port)
    if SERVER_HELLO and version compatible:
      lastPort = port
      return

  // Phase 4: fallback — try anything
  for port in order:
    try wsConnect(port)
    if success: return

  // Phase 5: give up
  setStatus("disconnected")
  scheduleReconnect()
```

The Phase 4 fallback preserves backward compatibility: if `state.json` is missing, malformed, or all servers report `parentAlive: false`, the bridge still tries direct connection.

**`fetchStateJson(port)` helper:**

```typescript
async function fetchStateJson(port: number): Promise<StateFile | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 300);
    const res = await fetch(`http://127.0.0.1:${port}/state.json`, {
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = await res.json();
    if (typeof body?.version !== "number" || body.version > SUPPORTED_VERSION) {
      return null;
    }
    return body as StateFile;
  } catch {
    return null;
  }
}
```

Worst-case Phase 1 budget: ~3 seconds (10 ports × 300ms). On reconnects, `lastPort` is first in the order, so the typical path is one ~5ms localhost HTTP roundtrip.

**HTTP `/state.json` endpoint** — added to `packages/mcp-server/src/http-server.ts`:

```typescript
if (req.url === "/state.json" && req.method === "GET") {
  const stateBody = getStateFileContent();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(stateBody));
  return;
}
```

**Reconnection behavior** (mid-session disconnects):

The existing exponential backoff `[1s, 3s, 5s, 10s]` with a 30s giveup stays. We only change what `scheduleReconnect()` calls into — the new `connect()` with discovery. So if the user opens a fresh agent session mid-Figma-session (which kills the old server via takeover from Section A), the bridge's first reconnect tries `lastPort` (now dead), gets a connection failure, falls back to scan, finds the new server's port via `state.json`, and reconnects. User sees ~3 seconds of "Reconnecting…" then green.

### E. `wait_for_reconnect` MCP tool

**Tool signature** (in `packages/mcp-server/src/server.ts`):

```typescript
server.tool(
  "wait_for_reconnect",
  "Wait for the PluginOS Bridge plugin to reconnect after a disconnect. " +
    "Returns when the bridge reports connected, or when timeoutSec elapses. " +
    "Use this when a prior tool call returned 'No plugin connected' to gracefully " +
    "wait for the user to relaunch the plugin instead of immediately failing back to chat.",
  {
    timeoutSec: z.number().int().min(1).max(300).default(60)
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

**Design choices baked in:**

- **Polling, not event subscription.** `IPluginBridge.isConnected()` already exists. Polling at 500ms is cheap; the worst-case extra latency (500ms after the bridge connects) is invisible next to the wait time itself.
- **Default 60s, max 300s.** Long enough for a real user to notice the wait, open Figma, relaunch the plugin. Cap prevents pathological cases.
- **`isError: true` on timeout.** Treats timeout as a failure mode so the agent's error-handling path triggers. Connect = success.
- **Response body always includes `waitedMs`** so the agent can decide whether to retry the original op immediately or with backoff.
- **No `file_key` arg.** The tool answers "is any bridge connected" — the subsequent op handles file routing.

**Skill update** — add to `packages/claude-plugin/skills/pluginos-figma/SKILL.md` Connection Troubleshooting section:

> If a `pluginos.*` call returns "No plugin connected" mid-task, ask the user once to relaunch the plugin, then call `pluginos.wait_for_reconnect({ timeoutSec: 60 })` to block gracefully. When it returns `connected: true`, retry the failed op.

## Backwards compatibility

- A bridge plugin from an older release (no discovery file awareness) keeps working via the unchanged 9500-9510 port scan; it ignores `state.json` entirely.
- A server from an older release (no PID file, no `state.json`) gets reaped without ceremony by a newer-version starter — the older server doesn't know to write a PID file, so the newer starter treats its port as "competitor, kill it." Acceptable because we control both halves of the protocol.
- The 9500-9510 port range stays as the scan fallback. New connection logic *augments* discovery on top; it does not remove the scan.
- `IPluginBridge.isConnected()` already exists, so `wait_for_reconnect` adds zero coupling to bridge code.

## Testing strategy

**Unit (most coverage):**

| File | Coverage |
|---|---|
| `singleton/__tests__/lockfile.test.ts` | acquire / release / EEXIST handling / stale-PID detection |
| `singleton/__tests__/takeover.test.ts` | SIGTERM → poll → SIGKILL sequence with mocked `process.kill` |
| `singleton/__tests__/pid-file.test.ts` | atomic write (tmp + rename), corrupt-file recovery, missing-file handling |
| `singleton/__tests__/state-file.test.ts` | write + read roundtrip, schema version check, parent-alive flag mutation |
| `__tests__/wait-for-reconnect.test.ts` | already-connected, mid-wait connection, timeout |
| `__tests__/http-state-endpoint.test.ts` | `GET /state.json` returns current state |
| `bridge-plugin/__tests__/connect-with-discovery.test.ts` | fetch ranking + fallback to scan |

**Integration:**

`singleton/__tests__/integration.test.ts` — spawn two real `pluginos` processes via `child_process.fork()` against a temp `~/.pluginos/` (`PLUGINOS_STATE_DIR` env override for test isolation). Assert:
- First binds, writes PID + `state.json`
- Second starts, reaps first, takes over its port
- Second's stderr contains `Reaped PID X` log line
- `~/.pluginos/state.json` after both shows second's PID

**Manual smoke test** (documented in PR description):

- Open two Claude Code sessions concurrently. Second's `pluginos.get_status` should return live status; first's reconnects silently to the new server.
- Kill `pluginos` with `kill -9 $(pgrep -f pluginos)`. Start new session. Verify it takes over cleanly (no manual cleanup of state files).
- Open Figma plugin, force-close it mid-`execute_figma`, observe agent calling `wait_for_reconnect`, relaunch plugin, observe successful resumption.

## Sequencing within the PR (commit-by-commit grain)

Ten loose phases, each landing as 2–6 commits depending on TDD cycles:

1. **State dir + lockfile primitive** (`lockfile.ts` + tests)
2. **PID file read/write** (`pid-file.ts` + tests)
3. **Takeover sequence** (`takeover.ts` + tests)
4. **`state.json` shape + writer** (`state-file.ts` + tests)
5. **Singleton orchestrator** (`singleton/index.ts` + integration test that spawns two processes)
6. **Server integration** (wire `acquireSingletonLock()` into `main()`, register shutdown handlers, add 10s parent-liveness interval)
7. **HTTP `/state.json` endpoint** (`http-server.ts` + test)
8. **Bridge discovery** (`fetchStateJson` + ranked connect in `ui-entry.ts` + happy-dom test)
9. **`wait_for_reconnect` MCP tool** (`server.ts` + test + skill note)
10. **Manual smoke + PR-A1 polish** (CHANGELOG entry, version bump, manual smoke checklist)

After step 5 the singleton works end-to-end (you can manually verify by spawning two processes). After step 8 the bridge-side discovery works. After step 9 the whole user-facing UX is complete. Each phase is independently testable.

## Open questions deferred to implementation

1. **Log format for takeover events** — `[singleton] Reaped PID 12345 (orphaned by parent 4321, started 2026-06-04T12:34:56Z)` or shorter? Decide during implementation when we see what `console.error` looks like in the existing codebase.
2. **State file schema migration policy** — v1 only ships now. The bridge already gracefully ignores unknown versions, so when v2 ships the bridge falls back to scan. We add explicit migration paths only when we have a second version to migrate from.
3. **`PLUGINOS_DISABLE_SINGLETON=1` env override** — useful for testing or weird deployment setups. Add it iff a test or smoke run actually needs it.

## References

- Feedback document: `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md` (items #6, #9, #10, #11)
- Existing port scan: `packages/mcp-server/src/WebSocketPluginBridge.ts:52-66`
- Existing bridge connect: `packages/bridge-plugin/src/ui-entry.ts:165-185`
- Existing HTTP server: `packages/mcp-server/src/http-server.ts`
- Existing skill (where the troubleshooting note will go): `packages/claude-plugin/skills/pluginos-figma/SKILL.md`
