# PluginOS Multi-Session Daemon — Design

**Date:** 2026-07-16
**Status:** Draft — awaiting user review
**Author:** Brainstorm session with Claude
**Supersedes:** the "newest-wins takeover" behavior from `2026-06-04-pluginos-connection-foundation-design.md` (PR-A1). Promotes two of that spec's explicit non-goals — MCP-level proxying and (a constrained form of) daemonization — now that concurrent sessions are a demonstrated pain point.

## Context

PR-A1 solved the *orphan server* problem with a singleton: every new `npx pluginos` reaps the previous server PID and takes over port 9500 (`packages/mcp-server/src/singleton/index.ts`). That was correct for the sequential-sessions world it was designed in.

Concurrent sessions break it:

- Every Claude Code session that loads the claude-plugin spawns its own `pluginos` via `.mcp.json`. The newest spawn reaps the previous session's server.
- The reaped process was the losing session's **stdio MCP server**. Its death is detected by the MCP client, which shows "MCP PluginOS: Server disconnected" — and that session's PluginOS tools are dead until the user manually reconnects.
- Two live sessions can ping-pong reap each other indefinitely (takeover is ordered by start time, which never converges).
- Only one session can use PluginOS at a time by construction.

### Facts that constrain the design

1. **The disconnect alert is client-generated.** Claude Code raises it when the stdio child process exits. There is no server-side mechanism to "gracefully reconnect" a dead stdio transport, and stdio MCP clients do not auto-respawn. Any fix must keep the session-facing process alive.
2. **Version skew between concurrent sessions is guaranteed.** The DXT manifest pins `pluginos@0.6.0`; the claude-plugin's `.mcp.json` runs unpinned `npx -y pluginos`. Claude Desktop and Claude Code will routinely spawn different versions on the same machine at the same time.
3. **The Figma plugin UI holds exactly one WebSocket** (`activeSocket` in `ui-entry.ts`) and applies one strict `isCompatible` version gate per connection. Its reconnect loop (backoff 1/3/5/10s, 30s giveup, then manual "Check for server") plus `/state.json` discovery ranking already recovers from a server moving ports.
4. **PR-A1 left groundwork:** `state.json` discovery with `startedAt`/`parentAlive` ranking, the `/state.json` HTTP endpoint, `socketPath: null` reserved, and the lockfile/takeover/pid-file primitives.
5. **The MCP server is session-stateless.** All five tools (`list_operations`, `run_operation`, `execute_figma`, `get_status`, `list_files`) plus `wait_for_reconnect` proxy to the shared bridge; there is no per-session server state. Multiplexing N sessions onto one bridge is semantically safe (with one caveat: the shared `activeFileKey`, addressed below).

## Goals

1. **N concurrent agent sessions can use PluginOS simultaneously.** No session ever sees "Server disconnected" because another session started or ended.
2. **Version skew is survivable.** Mixed-version sessions coexist; the highest version wins the daemon role; upgrades roll forward without killing older sessions' MCP transports.
3. **The Figma plugin and bootloader are untouched (or nearly so).** One server binds one port; discovery, `SERVER_HELLO`, mismatch UI, and the bootloader `ui.html` fetch keep working as today.
4. **No permanently detached processes.** The PR-A1 "no orphans" guarantee survives: everything still dies within a grace period once the last interested session is gone.

## Non-goals

- Cross-machine or multi-user coordination (unchanged from PR-A1).
- Unix-domain-socket transport (`socketPath` stays reserved).
- Concurrency *semantics* between agents inside one Figma file (two agents editing the same frame is the user's coordination problem; the plugin main thread serializes op execution as it does today for parallel calls from a single session).
- Changing the plugin↔server protocol (`SERVER_HELLO`, `status`, `result` messages are untouched).
- Cancellation of an op already executing inside Figma when its requesting session dies (the result is discarded instead).

## Options considered

### (b) Newest-wins + graceful MCP-level reconnect — rejected

The alert is raised by the MCP client when the stdio child dies (fact 1). The server cannot suppress it, and the client will not respawn. "Graceful reconnect" is only possible if the session's stdio process survives the takeover — i.e., the session-facing process and the port-owning process must be decoupled. That *is* option (a); (b) is not independently implementable.

### (c) Per-session servers on 9500–9510 + plugin multiplexing — rejected

Technically possible (the port scan already spans 9500–9510 on both sides) but the cost lands in the worst place:

- The plugin UI must hold up to 11 concurrent WebSockets, each against a potentially different server version, with one plugin build. The `isCompatible` gate and mismatch UI become per-socket; a 0.6 plugin facing a 0.6 and a 0.7 server simultaneously has no coherent UI state.
- The bootloader fetches one `ui.html` — from which of N servers? Whichever it picks mismatches the others.
- Every server believes it owns `OP_START`/`OP_END` telemetry, the activity log, and the "connected" pill; the UI would need a full multi-agent redesign.
- All of this complexity lives in the Figma sandbox — the hardest environment to test (happy-dom approximations) and debug.
- Hard cap of ~11 sessions; pending-request ownership is solved but everything else regresses.

### (a) Thin stdio shim per session + one shared daemon — chosen

Every session keeps a long-lived local stdio process (no alerts, fact 1); exactly one process owns the port, the bridge, and the plugin connection (goal 3); sessions multiplex at the MCP layer where the server is already stateless (fact 5).

Two sub-variants for *who hosts the daemon*:

- **(a1) Detached daemon process** — a shim spawns `pluginos daemon` detached when none is running. Rejected: detached-process management is its own project (cross-platform `setsid`/Windows detach quirks from an npx-spawned child, log capture to files, lifecycle supervision), and it violates the PR-A1 ethos that everything dies with its invoking sessions.
- **(a2) Daemon as a transferable role — chosen.** Every `pluginos` process is the same binary running a permanent *session layer* (stdio shim) and at most one of them additionally hosts the *daemon role* (bridge + WS + HTTP + `state.json`). The role moves between processes via election and handover; **no process's stdio ever dies because of another session.**

## Architecture

```
Claude session A          Claude session B          Claude session C (newer ver.)
      │ stdio                    │ stdio                    │ stdio
┌─────┴──────────┐        ┌─────┴──────────┐        ┌──────┴─────────┐
│ pluginos (pid1)│        │ pluginos (pid2)│        │ pluginos (pid3)│
│ session layer  │        │ session layer  │        │ session layer  │
│ + DAEMON ROLE  │◄──WS───│ (attached)     │        │ (attached)     │
│ bridge/WS/HTTP │◄──WS─────────────────────────────│                │
└─────┬──────────┘        └────────────────┘        └────────────────┘
      │ :9500  ──── writes ~/.pluginos/state.json
      │
      ├── ws (default path)  ◄── Figma bridge plugin   (unchanged)
      ├── GET /state.json    ◄── plugin discovery      (unchanged)
      ├── GET /ui.html       ◄── bootloader fetch      (unchanged)
      └── ws /agent          ◄── shim attach protocol  (new)
```

### Component 1 — Session layer (in every process, permanent)

A stdio-facing MCP endpoint that lives exactly as long as its MCP client keeps stdin open. It is **not** a raw byte proxy: it terminates the MCP session locally (its own `initialize` handshake with the client) and forwards *tool traffic* to the current daemon. This is required for failover — after a daemon change the shim silently re-attaches, which a byte-level proxy could not do because the client will never resend `initialize`.

- `tools/list` → forwarded to the daemon; the daemon's tool definitions are returned verbatim. The tool surface is therefore always the **daemon's** version, regardless of shim version.
- `tools/call` → forwarded; the result (including `isError` results) passes through unchanged.
- On daemon reattach or daemon version change → emit `notifications/tools/list_changed` so clients refresh definitions.
- No shim-side timeout on forwarded calls (the daemon already enforces op timeouts, including `wait_for_reconnect`'s 300s max); a WS liveness ping (15s interval) detects a hung daemon instead.
- While between daemons (during failover/handover, bounded by the attach loop below), incoming `tools/call` waits up to 10s for reattach, then returns an `isError` MCP *result* (never a transport error): `"PluginOS daemon restarting — retry, or call wait_for_reconnect."`

When the process also hosts the daemon role, its session layer talks to the in-process daemon through the same interface (loopback WS or direct function call — implementation's choice; direct call preferred, behind the same interface used for remote).

### Component 2 — Daemon role (in at most one process)

Exactly what `main()` does today — `WebSocketPluginBridge`, HTTP server, `state.json` — plus:

- **`/agent` WebSocket path** on the same HTTP server. The existing plugin WS stays on the default path; `verifyClient` origin rules apply per path (node shims send no Origin header, which is already allowed).
- **Attach handshake:** shim sends `AGENT_HELLO { agentProtocol: 1, shimVersion, sessionLabel? }`; daemon replies `DAEMON_HELLO { agentProtocol: 1, serverVersion }`. After the handshake, frames are `{ type: "mcp", payload: <JSON-RPC> }` in both directions, plus control frames (below). `agentProtocol` is bumped only when this framing changes — it is deliberately decoupled from the package semver, so cross-version attach works as long as the framing is stable.
- **Per-agent MCP server instances:** each attached `/agent` socket gets its own `McpServer` (via `createPluginOSServer(bridge)`) over a small WebSocket server transport. All instances share the one bridge. This gives correct per-session `initialize` state with zero changes to tool code.
- **Pending-request ownership:** bridge request IDs are generated daemon-side (single process ⇒ no ID collisions). When an agent socket closes, its `McpServer`/transport is torn down; any in-flight `sendAndWait` promise it owned resolves later into a dropped handler. No cross-session leakage; other sessions' pending ops are untouched (same isolation the per-`fileKey` rejection logic gives the plugin today).
- **`get_status`** gains `attachedAgents: number` so any session can see multi-session state.
- **Shared `activeFileKey` caveat:** `sendAndWait` retargets the active file on every call, so two sessions on *different* Figma files will ping-pong the default target. Mitigation in this spec: when `attachedAgents > 1` and `connectedFiles > 1`, `run_operation`/`execute_figma` responses include `_hint: "Multiple agents and files connected — pass file_key explicitly."` Full per-session default-file state is deferred (open question 3).

### Component 3 — Election, attach, and the version policy

On startup (and on daemon-loss thereafter), every process runs the same loop:

```
1. Read local state.json; verify liveness via GET /state.json on the advertised
   port (300ms timeout, as the plugin does).
2. If a live daemon exists:
     a. If my version <= daemon version           → ATTACH.
     b. If my version >  daemon version (strict)  → HANDOVER (below), then bind.
3. If no live daemon: acquire the existing lockfile.
     - Got it   → bind port (existing 9500-9510 scan), write state.json
                  (role: daemon), release lock. I am the daemon.
     - Lost it  → someone else is becoming daemon; sleep 100-300ms (jittered),
                  go to 1.
```

**Version policy — strict semver ordering, not start time.** Takeover happens *only* when the newcomer's package version is strictly greater. This converges (no ping-pong: the displaced older process re-enters the loop, finds a strictly newer daemon, and attaches — 2b can never fire for it again). Patch, minor, and major skew all follow the same rule; the plugin-facing `isCompatible` gate is a separate concern handled where it always was (plugin side, against the *daemon's* `SERVER_HELLO`). An older shim attaching to a newer daemon is always allowed — the agent protocol, not the package version, gates attach (fact: the tool surface served is the daemon's, and MCP JSON-RPC is stable).

**HANDOVER (upgrade without murder):** the newcomer connects to `/agent` and sends `DEMOTE_REQUEST { version }`. The old daemon verifies the version is strictly greater, then: stops accepting plugin/agent connections, broadcasts `DAEMON_HANDOVER { reason: "upgrade" }` to attached shims (so they pause new calls and prepare to reattach), closes the plugin socket and HTTP server (releasing the port), clears its `state.json` ownership, replies `DEMOTE_ACK`, and **demotes itself to a plain attached shim** — its stdio, and therefore its session, lives on. The newcomer then binds and writes `state.json`; everyone (old daemon included) attaches via the loop. If `DEMOTE_ACK` doesn't arrive within 3s, or the old daemon predates this protocol (no `/agent` route — probe fails), fall back to the existing `reapProcess` SIGTERM→SIGKILL path. Legacy processes die exactly once during the transition to this design; that is today's behavior, so nothing regresses.

**Crash failover:** attached shims detect the `/agent` socket close, wait a randomized 50–300ms jitter, and re-enter the loop. Exactly one wins the lockfile and promotes; the rest attach to it. In-flight ops at the moment of daemon death fail as `isError` results with the retry hint. The Figma plugin sees its socket close and recovers through its existing backoff scan + `/state.json` discovery (~1–3s to green, within its 30s giveup).

### Component 4 — Lifetime and orphan prevention

- A **shim** exits when its stdio closes (MCP client disconnect / session end) — same as any stdio MCP server. It detaches cleanly from the daemon on the way out.
- The **daemon role holder** stays alive while `(own stdio open) OR (attachedAgents > 0)`. When both are false, it exits after the existing `ORPHAN_GRACE_MS` (30s). This means a daemon whose own session ended keeps serving other sessions — it is "orphaned" from its parent but *not* from its clients.
- `state.json.parentAlive` semantics broaden to **hasClients**: `true` while the daemon has a live own-session or ≥1 attached agent. The plugin's `rankCandidates` filter (`parentAlive !== false`) keeps working with zero plugin changes; the parent-PID heartbeat is replaced by this client-count check (same 10s interval).

### state.json (additive, stays `version: 1`)

Existing fields keep their positions and types; `discovery.ts` ignores unknown fields, so additive is safe:

```json
{
  "version": 1,
  "pid": 12345,
  "port": 9500,
  "serverVersion": "0.7.0",
  "startedAt": 1784240000000,
  "parentPid": 1234,
  "parentAlive": true,          // semantics: hasClients (see above)
  "socketPath": null,
  "agentProtocol": 1,           // new: /agent framing version
  "attachedAgents": 2           // new: diagnostics only
}
```

## What each concern from the problem statement resolves to

| Concern | Resolution |
|---|---|
| Version skew between sessions | Strict-semver election converges to the highest version as daemon; older shims attach (agent protocol gates attach, not semver); tool surface is always the daemon's; `SERVER_HELLO`/`isCompatible` unchanged and evaluated against the single daemon |
| `SERVER_HELLO` handshake | Untouched — one daemon, one plugin socket, exactly as today; a daemon upgrade that crosses a 0.x minor correctly triggers the plugin's mismatch UI prompting a plugin update |
| Bootloader UI fetch | Untouched — one HTTP server owns `/ui.html` and `/state.json`; during handover/failover the bootloader's existing retry covers the ~1–3s gap |
| Pending-request ownership | Bridge IDs minted in one process; per-agent `McpServer` instances tear down with their socket; other sessions' in-flight ops unaffected |
| Daemon upgrade | `DEMOTE_REQUEST`/`DEMOTE_ACK` handover — the old daemon demotes to a shim instead of dying, so no session's stdio transport is ever killed; reap remains only as the legacy/hung fallback |

## Error handling summary

| Failure | Behavior |
|---|---|
| Daemon process killed (SIGKILL, terminal closed) | Shims: jittered election, one promotes, rest attach; in-flight calls return `isError` + retry hint; plugin auto-reconnects via existing scan |
| Two processes start simultaneously, no daemon | Lockfile serializes; loser re-reads state and attaches |
| Old daemon hung during handover | 3s `DEMOTE_ACK` timeout → `reapProcess` fallback |
| Legacy (≤0.6) server running | No `/agent` route → treated as incompatible-older → reaped (one-time alert for that legacy session; unavoidable, matches today) |
| Shim's MCP client dies mid-op | Shim exits; daemon drops that agent's transport; op result discarded; other sessions unaffected |
| State dir unwritable (degraded mode) | As today: no coordination, each process binds the next free port 9500–9510; plugin discovery ranks newest; multi-session works accidentally but without handover guarantees |
| `agentProtocol` mismatch (future) | Shim reports a clear `isError` on every tool call: "PluginOS daemon speaks agent protocol N, this shim speaks M — update pluginos" |

## Testing strategy

**Unit** (Vitest, `packages/mcp-server`):
- Election policy: state matrix of (no daemon / older / equal / newer daemon) × (lock won / lost) → (bind / attach / handover).
- Version comparison: strict semver ordering incl. prerelease/malformed fallback (malformed → treat as `0.0.0`, always attaches, never takes over).
- Shim proxy: fake daemon over in-memory transport — `tools/list` passthrough, `tools/call` passthrough incl. `isError`, `list_changed` on reattach, between-daemons queuing (10s) then error result.
- Handover: `DEMOTE_REQUEST` happy path, ACK timeout → reap fallback, demoted daemon re-attaches as shim.
- Daemon: per-agent transport teardown drops only that agent's pending handlers; `attachedAgents` in `get_status`; `hasClients` heartbeat transitions.

**Integration** (extends the existing two-process `child_process.fork` test, `PLUGINOS_STATE_DIR` isolation; add a `PLUGINOS_VERSION_OVERRIDE` env test hook so one binary can impersonate versions):
- Two equal-version processes: first binds, second attaches; both serve `tools/list`; killing the second leaves the first serving; killing the first (daemon) promotes the second within ~2s and its tools keep working.
- Upgrade: 0.6-impersonating daemon + attached shim; 0.7-impersonating process starts → handover → old daemon demotes, both old sessions' stdio still answer `tools/list` against the new daemon.
- Legacy fallback: process without `/agent` (simulated) gets reaped.

**Manual smoke** (PR description checklist):
- Two real Claude Code sessions + Figma plugin open: both sessions run ops interleaved; neither ever shows a disconnect alert; plugin pill stays green except a brief blip on daemon change.
- Close the daemon-owning session's terminal: surviving session keeps working after ~2s; plugin reconnects.
- Claude Desktop (DXT, pinned 0.6.0) + Claude Code (0.7.0) concurrently: Code session's newer daemon wins; Desktop session attaches and works.

## Suggested implementation sequencing

Single spec, two PRs to keep review tractable:

1. **PR-B1 — daemon multiplexing:** `/agent` path + attach handshake + per-agent `McpServer` instances + `attachedAgents`/`hasClients` state + shim session layer + election loop (attach/bind only; upgrades still reap). Ships multi-session for equal versions — the dominant case (two Claude Code sessions from the same npx cache).
2. **PR-B2 — handover & skew:** strict-semver policy, `DEMOTE_REQUEST`/`DEMOTE_ACK`, crash-failover election jitter + promotion, `tools/list_changed` on daemon change, version-override test hook, multi-file `_hint`.

Version bump: 0.8.0 — 0.7.0 was taken by the comments-via-PAT release (PR #39) that shipped mid-design (0.x minor = breaking per house convention; the plugin mismatch UI will correctly prompt a plugin update).

## Open questions (deliberately deferred)

1. **Loopback vs direct in-process dispatch for the daemon holder's own session layer** — decide in implementation; the interface is identical either way.
2. **Should `sessionLabel` (e.g. cwd or session id) surface in the plugin activity log** so the user can see *which* session ran an op? Nice-to-have; needs a small UI string only, no protocol change beyond the optional field already in `AGENT_HELLO`.
3. **Per-session default file** (replacing the shared `activeFileKey` ping-pong) — deferred until the `_hint` proves insufficient in practice; would move the default-file pointer into the per-agent server instance.

## References

- Prior spec: `docs/superpowers/specs/2026-06-04-pluginos-connection-foundation-design.md`
- Singleton: `packages/mcp-server/src/singleton/index.ts`, `takeover.ts`, `state-file.ts`
- Bridge: `packages/mcp-server/src/WebSocketPluginBridge.ts` (pending map, `activeFileKey`, `verifyClient`)
- HTTP routes: `packages/mcp-server/src/http-server.ts`
- Plugin connect/discovery: `packages/bridge-plugin/src/ui-entry.ts`, `src/discovery.ts`, `src/ui/connect.ts`, `src/ui/version-check.ts`
- Bootloader probe/fetch: `packages/bridge-plugin/src/bootloader.html`
- Spawn configs: `packages/claude-plugin/.mcp.json` (unpinned), DXT `manifest.json` (pinned)
