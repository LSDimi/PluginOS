# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install all workspaces
npm install

# Full pipeline (lint → format → build:shared → typecheck → build → test)
npm run check

# Build all packages
npm run build

# Build individual packages (shared must be built first — mcp-server depends on it)
npm run build:shared                          # shared → dist/ (run this first)
npm run build -w packages/mcp-server          # tsup → dist/
npm run build -w packages/bridge-plugin       # webpack → dist/ (code.js, ui.html, bootloader.html)
npm run build -w packages/shared              # tsc → dist/

# Quality gates (all enforced in CI)
npm run lint           # ESLint (TypeScript rules)
npm run format:check   # Prettier check
npm run format         # Prettier auto-fix
npm run typecheck      # tsc --noEmit (shared + mcp-server)
npm audit --audit-level=high  # Security — fails CI on high/critical CVEs

# Development (hot reload)
npm run dev:server    # MCP server with tsx watch
npm run dev:plugin    # Bridge plugin webpack watch

# Tests (Vitest)
npm test                             # All workspaces
npm test -w packages/mcp-server      # MCP server tests only
npm test -w packages/shared          # Shared package tests only

# Publishing (mcp-server only, published as "pluginos" on npm)
npm run release:patch
npm run release:minor
```

## Architecture

PluginOS is a **token-efficient MCP bridge** between LLM agents and Figma. It exposes only 5 MCP tools instead of 80+, with operations discovered dynamically at ~230 tokens/call.

### Data Flow

```
Agent ──[MCP stdio]──→ MCP Server ──[WebSocket localhost:9500-9510]──→ Figma Bridge Plugin ──[figma.* API]──→ Figma Document
                           │
                     [HTTP server]
                           │
                    Bootloader UI fetch
```

### Monorepo Packages (`packages/`)

- **mcp-server** — Node.js MCP server (`npx pluginos`). Entry: `bin/pluginos.js` → `src/index.ts`. Starts HTTP server, WebSocket server, and MCP stdio transport. Defines 5 tools: `list_operations`, `run_operation`, `execute_figma`, `get_status`, `list_files`.
- **bridge-plugin** — Figma plugin that runs inside Figma's sandbox. `code.ts` handles figma.* API calls, `ui-entry.ts` bridges WebSocket ↔ plugin postMessage. No tests (runs in Figma runtime).
- **shared** — Shared TypeScript types and protocol definitions (`OperationManifest`, message factories). Pure types, no runtime deps.

### Key Patterns

**Operation Registry** (`bridge-plugin/src/operations/registry.ts`): Operations self-register via `registerOperation()` and are imported in `operations/index.ts`. Each operation has a manifest (name, category, params, returns) and an async `execute` function with full `figma.*` access.

**Two Execution Paths**: `run_operation` dispatches to pre-built operations (28 available, fast). `execute_figma` runs arbitrary JS in the plugin sandbox (fallback for custom logic, 5s default / 30s max timeout).

**Request Correlation**: Each WebSocket message gets a unique ID (`req_${++counter}_${Date.now()}`). Responses are matched back via a `Map<id, resolve/reject>` with timeout handling.

**Port Auto-Discovery**: Server finds first available port in 9500-9510. Plugin scans the same range to connect. Reconnects with 3s delay on disconnect.

**Multi-File Support**: WebSocket server tracks connected files by `fileKey`. Operations can target a specific file. Falls back to most recently active file.

**Bootloader Pattern**: Plugin UI loads a minimal `bootloader.html` that fetches fresh `ui.html` from the HTTP server, allowing UI updates without plugin rebuild.

**Serialization** (`bridge-plugin/src/utils/serializer.ts`): Handles circular refs, caps arrays at 200 items, limits object depth to 5 levels. Operations return structured summaries, not raw node dumps.

### Adding a New Operation

1. Create file in `packages/bridge-plugin/src/operations/`
2. Call `registerOperation({ manifest: {...}, execute: async (ctx: OperationContext) => {...} })`
   - `ctx.nodes` — pre-resolved SceneNodes (respects `scope` param: `"selection"` or `"page"`)
   - `ctx.figma` — Figma API reference
   - `ctx.params` — raw operation params
   - `ctx.MAX_RESULTS` — standard result cap (200)
3. Import the file in `operations/index.ts`
4. Rebuild bridge-plugin — agent discovers it via `list_operations`

### TypeScript Configuration

Base config (`tsconfig.base.json`): ES2022 target, ESNext modules, bundler resolution, strict mode. Bridge-plugin overrides to ES2015 target with DOM lib and Figma typings.
