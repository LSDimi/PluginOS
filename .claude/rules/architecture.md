---
paths:
  - "packages/**"
---

# Architecture

PluginOS is a **token-efficient MCP bridge** between LLM agents and Figma. It exposes only 5 MCP tools instead of 80+, with operations discovered dynamically at ~230 tokens/call.

## Data Flow

```
Agent A ──[MCP stdio]──→ pluginos (session layer, hosts daemon role)
Agent B ──[MCP stdio]──→ pluginos (session layer) ──[WS /agent]──┐
                                                                 ▼
                                     daemon role: WS + HTTP (one port, 9500-9510)
                                        │                    │
                                        │ WebSocket (path /) │ HTTP: /ui.html, /state.json
                                        ▼                    ▼
                              Figma Bridge Plugin      Bootloader UI fetch
```

## Monorepo Packages (`packages/`)

- **mcp-server** — Node.js MCP server (`npx pluginos`). Entry: `bin/pluginos.js` -> `src/index.ts`. Starts HTTP server, WebSocket server, and MCP stdio transport. Defines 5 tools: `list_operations`, `run_operation`, `execute_figma`, `get_status`, `list_files`.
- **bridge-plugin** — Figma plugin that runs inside Figma's sandbox. `code.ts` handles figma.* API calls, `ui-entry.ts` bridges WebSocket <-> plugin postMessage. UI tests run under happy-dom via Vitest.
- **shared** — Shared TypeScript types and protocol definitions (`OperationManifest`, message factories). Pure types, no runtime deps.
- **claude-plugin** — Claude Code plugin (`/pluginos-figma` skill + ops reference). Contains `sync-ops.ts` script to regenerate the operations reference from the bridge-plugin registry. Skill budget enforced at 1150 tokens in CI.

## Key Patterns

**Operation Registry** (`bridge-plugin/src/operations/registry.ts`): Operations self-register via `registerOperation()` and are imported in `operations/index.ts`. Each operation has a manifest (name, category, params, returns) and an async `execute` function with full `figma.*` access.

**Two Execution Paths**: `run_operation` dispatches to pre-built operations (29 registered). `execute_figma` runs arbitrary JS in the plugin sandbox (fallback for custom logic, 5s default / 30s max timeout).

**Request Correlation**: Each WebSocket message gets a unique ID (`req_${++counter}_${Date.now()}`). Responses are matched back via a `Map<id, resolve/reject>` with timeout handling.

**Port Auto-Discovery**: Server finds first available port in 9500-9510. Plugin scans the same range to connect. Reconnects with backoff `[1s, 3s, 5s, 10s]` for ~30s, then falls back to a quiet 15s slow poll that never gives up; the version-mismatch view stays sticky while polling continues.

**Multi-File Support**: WebSocket server tracks connected files by `fileKey`. Operations can target a specific file. Falls back to most recently active file.

**Bootloader Pattern**: Plugin UI loads a minimal `bootloader.html` that fetches fresh `ui.html` from the HTTP server, allowing UI updates without plugin rebuild.

**Serialization** (`bridge-plugin/src/utils/serializer.ts`): Handles circular refs, caps arrays at 200 items, limits object depth to 5 levels. Operations return structured summaries, not raw node dumps.

**Version Handshake**: MCP server sends `SERVER_HELLO { version }` on WebSocket connect. Plugin compares major versions (minor for 0.x) and shows a mismatch UI if incompatible.

**Multi-Session Daemon** (`mcp-server/src/daemon.ts`, `src/shim/`): every `pluginos` process is a stdio session layer; at most one hosts the daemon role (bridge + HTTP + `/agent`). Equal-version processes attach instead of reaping; the daemon exits 30s after its last agent detaches (`state.json.parentAlive` now means "has clients"). Crash of the host promotes a surviving session via the singleton lock.
