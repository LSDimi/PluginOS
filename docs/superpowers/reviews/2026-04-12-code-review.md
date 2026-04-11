# PluginOS Code Review — 2026-04-12

**Reviewer:** Claude (automated)
**Scope:** Full codebase — `packages/mcp-server`, `packages/bridge-plugin`, `packages/shared`
**Tests at time of review:** 22 passing (14 mcp-server, 8 shared), 0 failing

---

## Summary

The codebase is in good shape post-v2. Architecture is clean, the registry pattern scales well, and the MCP ↔ WebSocket ↔ Figma data flow is solid. The main issues are code quality regressions in `write.ts` (introduced during the v2 sprint), pervasive duplication of small utility patterns across operation files, and loose typing in the bridge plugin. None are blockers — but the `var`/string-concat pattern in `write.ts` is embarrassing for a TypeScript-strict project and should be fixed before the next release.

**Priority legend:** 🔴 Fix now · 🟡 Fix soon · 🟢 Nice to have

---

## Issues by File

---

### `packages/bridge-plugin/src/operations/write.ts`

#### 🔴 `var` declarations throughout — violates strict TypeScript conventions

Every `execute()` function in `write.ts` uses `var` instead of `const`/`let`. This is the only file in the entire codebase with this problem. It was likely introduced when the AI generated the v2 operations using an ES5 code style. The project targets ES2022 and strict mode — `var` is a footgun (function-scoped hoisting) and should not appear.

**Files affected:** `write.ts` exclusively (312 lines, 7 operations)

**Count:** 36 occurrences of `var` in write.ts

**Examples:**
```typescript
// ❌ Current — write.ts:36
var frame = figma.createFrame();
var layout = params.auto_layout || "NONE";
var p = params.padding;
var hex = params.fills.replace("#", "");
var r = parseInt(hex.substring(0, 2), 16) / 255;
for (var i = 0; i < params.node_ids.length; i++) {
  var id = params.node_ids[i];
  var node = figma.getNodeById(id);

// ✅ Should be — const/let + for-of
const frame = figma.createFrame();
const layout = params.auto_layout ?? "NONE";
const p = params.padding;
const hex = params.fills.replace("#", "");
const r = parseInt(hex.substring(0, 2), 16) / 255;
for (const id of params.node_ids) {
  const node = figma.getNodeById(id);
```

---

#### 🔴 Hex-to-RGB parsing duplicated — `write.ts` has it twice, `colors.ts` has it again

The same 4-line hex→RGB conversion block appears at `write.ts:62-65` (in `create_frame`) and again at `write.ts:104-108` (in `set_fills`). A third copy exists in `colors.ts:83`. This is a utility that belongs in `utils/`.

**Files affected:** `write.ts`, `colors.ts`

```typescript
// ❌ Current — duplicated 3 times across two files
var hex = params.fills.replace("#", "");
var r = parseInt(hex.substring(0, 2), 16) / 255;
var g = parseInt(hex.substring(2, 4), 16) / 255;
var b = parseInt(hex.substring(4, 6), 16) / 255;

// ✅ Extract to utils/color.ts
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}
```

---

#### 🟡 String concatenation in return summaries — use template literals

Every `execute()` in `write.ts` uses `"string " + variable + " more"` concatenation for summary strings. All other operation files use template literals. Inconsistent style, harder to read.

**Examples:**
```typescript
// ❌ write.ts:72
summary: "Created frame \"" + frame.name + "\" (" + frame.width + "x" + frame.height + ") at (" + frame.x + ", " + frame.y + ").",

// ✅
summary: `Created frame "${frame.name}" (${frame.width}x${frame.height}) at (${frame.x}, ${frame.y}).`,
```

---

### `packages/bridge-plugin/src/operations/` (all operation files)

#### 🟡 Scope resolution duplicated 16 times across 9 files

Every operation that accepts a `scope` param has this identical inline ternary:

```typescript
// Duplicated in: lint.ts (3x), accessibility.ts (2x), components.ts, colors.ts (2x),
//               content.ts, cleanup.ts (3x), export.ts, layout.ts, typography.ts (2x)
const nodes: readonly SceneNode[] =
  scope === "selection"
    ? figma.currentPage.selection
    : figma.currentPage.findAll();
```

That's 16 copy-pastes of the same 3-line pattern. Extract to `utils/scope.ts`:

```typescript
// utils/scope.ts
export function getNodesForScope(scope: string | undefined): readonly SceneNode[] {
  return scope === "selection"
    ? figma.currentPage.selection
    : figma.currentPage.findAll();
}
```

Callers become one line: `const nodes = getNodesForScope(params.scope);`

---

#### 🟡 `.slice(0, 200)` magic number scattered across 12 files

The result cap of 200 items appears as a hardcoded literal in 12 places across operation files, plus once in `serializer.ts` (which handles it properly). Operations don't need to cap manually — `safeSerialize` already caps arrays at 200. Double-capping is harmless but indicates the operations don't trust the serializer. Either:
- Remove the manual `.slice(0, 200)` calls and let the serializer handle it, or
- Export a `MAX_RESULTS = 200` constant from `utils/` and use it everywhere.

**Files with manual `.slice(0, 200)`:** `colors.ts` (2x), `lint.ts` (3x), `accessibility.ts` (2x), `components.ts` (2x), `cleanup.ts` (2x), `layout.ts` (1x)

---

### `packages/bridge-plugin/src/operations/registry.ts`

#### 🟡 `execute` typed as `(params: Record<string, any>) => Promise<any>` — too loose

The `OperationHandler` interface in `registry.ts:9` uses `any` for both the params and the return type. This is intentional for the plugin runtime (Figma params are dynamic), but it silences all type errors inside `execute()` functions. The `any` in `code.ts` at `msg: any` is also a consequence of this.

```typescript
// ❌ Current — registry.ts:9
execute: (params: Record<string, any>) => Promise<any>;

// 🟢 Better (if strict types are desired in future)
execute: (params: Record<string, unknown>) => Promise<unknown>;
```

`unknown` forces callers to narrow before use, catching bugs. This is a bigger change (ripples through all 28 operations) and is categorized as nice-to-have.

---

### `packages/bridge-plugin/src/code.ts`

#### 🟡 `msg: any` in `figma.ui.onmessage` and `handleServerMessage` — use typed union

`code.ts:25` and `code.ts:41` type incoming messages as `any`. The shared package already exports `PluginToServerMessage` / `ServerToPluginMessage` types and `parseMessage()`. The UI→plugin postMessage messages are informal, but `handleServerMessage` specifically receives `ServerToPluginMessage` — that can be typed:

```typescript
// ❌ Current
async function handleServerMessage(msg: any): Promise<void> {
  const { id, type } = msg;

// ✅
import type { ServerToPluginMessage } from "@pluginos/shared";
async function handleServerMessage(msg: ServerToPluginMessage): Promise<void> {
  const { id, type } = msg;
```

The `figma.ui.onmessage = async (msg: any)` is harder to fix because it's a UI bridge event — leaving as `any` there is acceptable. The `handleServerMessage` function is where the type is knowable.

---

### `packages/mcp-server/src/server.ts`

#### 🟢 Tool handler error handling is repetitive — extract a helper

Each of the 3 async tool handlers (`list_operations`, `run_operation`, `execute_figma`) has an identical try/catch structure:

```typescript
// Same pattern 3 times
try {
  const result = await wsServer.sendAndWait(msg, timeout);
  if (result.success) {
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${result.error}` }], isError: true };
} catch (err) {
  return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
}
```

Extract a `handleToolCall(promise: Promise<ResultMessage>)` helper. Reduces `server.ts` by ~30 lines and makes it easier to change error formatting globally.

---

### `packages/mcp-server/src/websocket.ts`

#### 🟢 `close()` rejects all pending requests globally on per-client disconnect

In `setupServer()` → `ws.on("close")` (line ~121), when a single client disconnects, the code iterates all `this.pending` and rejects everything:

```typescript
ws.on("close", () => {
  // ...
  for (const [id, p] of this.pending) {   // ← rejects ALL pending, not just this client's
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.reject(new Error("Plugin disconnected"));
  }
});
```

With multi-file support, if Figma file A disconnects, pending requests for file B are also rejected. The `pending` map doesn't track which file owns a request. This is a correctness bug in multi-file scenarios.

**Fix:** Store `fileKey` alongside each pending request:
```typescript
interface PendingRequest {
  resolve: (value: ResultMessage) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  fileKey: string;  // ← add this
}
```

Then on close, only reject requests whose `fileKey` matches the disconnected file.

---

### `packages/shared/src/protocol.ts`

#### 🟢 Module-level counter `let counter = 0` for request IDs

The request ID counter is module-global state in `protocol.ts`. This works fine for the single-server use case, but it means:
1. IDs reset to 0 if the module is reloaded (e.g., in tests with `vi.resetModules()`)
2. Tests that import `createRunOperationMessage` multiple times get sequential IDs starting at 1 per test run — tests currently assert `id.startsWith("req_")` which is fine, but it's fragile

Not a bug in production. Minor note for test hygiene.

---

## Test Coverage Gaps

**Covered well:**
- `PluginOSWebSocketServer` — port binding, multi-file tracking, send/wait, timeouts, disconnect rejection
- `protocol.ts` — all factory functions, parsing
- Integration — full MCP tool call round-trip through mock plugin

**Not covered:**
| Gap | Risk |
|-----|------|
| Multi-file disconnect only rejects correct file's pending (see websocket bug above) | Medium — correctness bug in prod |
| `http-server.ts` — `/ui`, `/health`, CORS headers, 404 | Low — simple but untested |
| `server.ts` — `get_status` and `list_files` tool handlers | Low |
| `server.ts` — error path when `wsServer.sendAndWait` throws | Medium — reachable in prod |
| `serializer.ts` — circular refs, symbol handling, max depth, array cap | Low — pure function, easy to test |
| `ui-entry.ts` — WebSocket reconnect logic, port scan | Low — browser env, harder to test |

---

## Quick Wins (ranked by impact/effort)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 1 | Replace all `var` with `const`/`let` in `write.ts` | `write.ts` | 15 min |
| 2 | Extract `hexToRgb()` to `utils/color.ts`, remove 3 duplicates | `write.ts`, `colors.ts`, new `utils/color.ts` | 20 min |
| 3 | Replace string concat with template literals in `write.ts` | `write.ts` | 10 min |
| 4 | Extract `getNodesForScope()` to `utils/scope.ts`, remove 16 duplicates | 9 operation files + new `utils/scope.ts` | 30 min |
| 5 | Fix multi-file pending rejection bug in `websocket.ts` | `websocket.ts` | 20 min + test |
| 6 | Export `MAX_RESULTS = 200` constant and use it | `utils/` + 6 operation files | 10 min |
| 7 | Add test for wrong-file disconnect | `websocket.test.ts` | 15 min |
| 8 | Type `handleServerMessage` parameter in `code.ts` | `code.ts` | 5 min |

---

## What's Good

- **Architecture is solid.** Registry pattern with self-registering operations is clean and scales to 28+ operations without coordination overhead.
- **Protocol types are tight.** `@pluginos/shared` provides a proper discriminated union for all message types with factory functions. The server never constructs raw message objects.
- **WebSocket server is well-encapsulated.** `PluginOSWebSocketServer` exposes a clean interface and hides all port/connection management internals.
- **Test coverage is meaningful.** Integration tests use a real WebSocket mock plugin — not mocked WebSocket calls. The timeout test (607ms) proves actual timer behavior is covered.
- **Bootloader pattern is clever.** Serving `ui.html` dynamically from the HTTP server allows UI updates without plugin reimport. Zero extra build complexity.
- **Multi-file support is complete.** `fileKey` tracking, `listFiles()`, `setActiveFile()`, and fallback-to-most-recent are all implemented and tested.
- **Serializer handles the hard cases.** Circular references, `figma.mixed` symbols, deep objects, and large arrays are all handled before anything hits the MCP wire.

---

*Generated from codebase scan on 2026-04-12. Tests: 22 passed, 0 failed.*
