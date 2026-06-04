# PluginOS Bridge UI Polish (PR-A2) — Design

**Date:** 2026-06-04
**Status:** Approved for implementation planning
**Author:** Brainstorm session with Claude
**Scope:** Single PR. Bridge-plugin-only. Fixes three UI bugs surfaced on 2026-06-03: dark mode never activates, post-reconnect UI shows stale state, recent operations not visible during a session.

## Context

The 2026-06-03 bulk-seed feedback included this verbatim observation:

> *"The Figma UI is crap, and it's also changing. First load is better, if it connects and then disconnects, it's different. We also have the old UI when it's connected, so you cannot see what kind of operations are running or have been ran. Oh, also the color mode of the app is not been picked up, I always view it in Light mode even though my default is dark."*

Three distinct bugs underneath:

1. **Dark mode never activates.** `figma.editorPreferences.theme` returns undefined in current Figma builds. The ternary `theme === "dark" ? "dark" : "light"` silently falls back to light.
2. **Stale UI after a reconnect cycle.** Multiple sub-elements (`#running-block`, `#idle-block`, `#file-name`, etc.) carry independent visibility state. After disconnect→connecting→connected, one of them is reliably out of sync with the actual app state.
3. **Activity log not visible during sessions.** Plumbing is already in place (`activity-log.ts` class, HTML mount at `ui.html:204`, JS init at `ui-entry.ts:366`). User's "can't see operations" most likely reflects an older bundled `ui.html` cached via the bootloader pattern. But the deeper fix is making sure the activity log is *always* rendered fresh on every state transition, so any future scenario where the panel goes stale is impossible by construction.

The connection-layer fixes (singleton, discovery, `wait_for_reconnect`) ship in PR-A1 (#29). This PR is the bridge-side UI cleanup that complements those changes.

The full feedback document is at `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md`.

## Goals

1. **Make dark mode follow Figma's editor theme** without depending on `figma.editorPreferences.theme`.
2. **Eliminate the stale-state-after-reconnect class of bugs** by funneling every UI mutation through a single idempotent `renderUI(state)` function.
3. **Make recent operations visible** by ensuring the activity log renders on every state transition and improving its empty/full-state UX.

## Non-goals (deferred or rejected)

- **Connection foundation** (singleton, discovery, `wait_for_reconnect`) → PR-A1 #29
- **Quality helpers** (prelude, lint, `PluginOS.*`) → PR-B #27
- **Install polish** → PR-C
- UI redesign — typography refresh, icon set, layout overhaul. Not in scope.
- Animations / transitions. State changes are instant in v1.
- Mobile / responsive. Figma plugin pane is fixed at 360×600.
- Activity log persistence across plugin reloads. Entries are in-memory only; adding `figma.clientStorage` persistence is a separate design.
- Click-to-view-full-result on activity rows. Existing `copy(op)` click behavior is preserved as-is.
- Force-light / force-dark user toggle. The `data-theme` system supports it but no UI exposes it in PR-A2.

## Architecture

```
                       Figma editor theme
                              │
                              ▼
            CSS custom properties auto-injected by themeColors: true
                              │
                              ▼
   ┌─────────────────────────────────────────────────┐
   │ ui/tokens.cjs                                   │
   │   --po-bg: var(--figma-color-bg, #fallback)     │  ◄── Three-tier fallback chain:
   │   --po-text: var(--figma-color-text, #fallback) │      Figma var → data-theme value → literal
   └──────────────────────┬──────────────────────────┘
                          │
                          ▼
                   Rendered UI

   ┌────────────────────────────────────────────────┐
   │ ui/theme.ts                  (unchanged)       │  ◄── Fallback for non-Figma contexts
   │   detectInitialTheme via matchMedia            │      (happy-dom tests, edge cases).
   │   attachThemeListener for THEME_CHANGE         │      Sets data-theme attr on <html>.
   │   applyTheme(theme)                            │
   └────────────────────────────────────────────────┘

   ┌────────────────────────────────────────────────┐
   │ ui/render-ui.ts                  (new)         │
   │   type AppState = …                            │  ◄── Single source of truth.
   │   function renderUI(state: AppState): void     │      Idempotent. Pure DOM transformation.
   │   helpers: pillStateFor, pillTextFor,          │      No hidden sub-element state.
   │            formatElapsed                       │
   └────────────────────────────────────────────────┘
                          ▲
                          │ called by setState()
                          │
   ┌────────────────────────────────────────────────┐
   │ ui-entry.ts                                    │
   │   currentState: AppState                       │
   │   setState(next): updates state, renders,      │  ◄── All DOM mutations funnel through here.
   │                   manages elapsed timer        │      No direct mutations elsewhere.
   │   WebSocket handlers call setState({…})        │
   └────────────────────────────────────────────────┘
```

## Component-by-component design

### A. U1 — Three-tier theme system

CSS variables resolve through three layers:

```css
:root {
  --po-bg: var(--figma-color-bg, #ffffff);
  --po-text: var(--figma-color-text, #18181b);
  --po-border: var(--figma-color-border, #e4e4e7);
  /* every token uses Figma var with a hardcoded fallback */
}

[data-theme="dark"] {
  --po-bg-fallback: #1e1e1e;
  --po-text-fallback: #f5f5f5;
  /* fallbacks active when Figma vars are absent */
}
```

When the plugin runs in Figma with `themeColors: true`: Figma injects `--figma-color-*` vars that auto-track the editor theme. The CSS resolves to those.

When the plugin runs outside Figma (happy-dom tests, future contexts): Figma vars are undefined. CSS falls back to the literal (`#ffffff` / `#18181b`), which `data-theme="dark"` can override via the second-tier `--po-bg-fallback` chain.

### B. U1 — What stays unchanged

- `ui/theme.ts` — keeps its public API (`applyTheme`, `attachThemeListener`, `detectInitialTheme`). Becomes the secondary theme source instead of primary.
- `code.ts` `sendTheme()` and `themechange` listener — still useful for environments where Figma's CSS var injection isn't available.
- The `@ts-expect-error` casts in `code.ts` — preserved with their existing comments (older typings).
- The HTML default `<body data-theme="light">` — initial-render baseline.

### C. U2 — `AppState` discriminated union

```typescript
type RunningOp = {
  name: string;
  paramsPreview: string;
  startedAt: number;
};

type AppState =
  | { kind: "disconnected" }
  | { kind: "connecting"; lastKnownPort: number | null }
  | {
      kind: "connected";
      file: { name: string; key: string };
      port: number;
      running: RunningOp | null;
    }
  | { kind: "mismatch"; reason: string; serverVersion: string; pluginVersion: string };
```

Every status the existing 5-state model represented maps 1:1 onto this union:

| Old state | New state |
|---|---|
| `disconnected` | `{ kind: "disconnected" }` |
| `connecting` | `{ kind: "connecting", lastKnownPort: … }` |
| `connected` | `{ kind: "connected", file: …, port: …, running: null }` |
| `running` | `{ kind: "connected", file: …, port: …, running: { name, paramsPreview, startedAt } }` |
| `mismatch` | `{ kind: "mismatch", reason, serverVersion, pluginVersion }` |

The `running` state collapses into `connected` because they share the same view container. The presence of a `RunningOp` inside the `connected` variant drives the running-block / idle-block toggle. This eliminates the bug where `running` and `connected` got out of sync after a reconnect.

### D. U2 — `renderUI(state)` function

Lives in `packages/bridge-plugin/src/ui/render-ui.ts` (new file). Pure DOM transformation. Idempotent: calling it twice with the same state is a no-op.

```typescript
export function renderUI(state: AppState): void {
  // 1. Status pill
  const pill = document.getElementById("status-pill")!;
  const statusText = document.getElementById("status-text")!;
  pill.dataset.state = pillStateFor(state);
  statusText.textContent = pillTextFor(state);

  // 2. Top-level views
  document.getElementById("view-disconnected")!.hidden =
    state.kind !== "disconnected" && state.kind !== "connecting";
  document.getElementById("view-connected")!.hidden = state.kind !== "connected";
  document.getElementById("view-mismatch")!.hidden = state.kind !== "mismatch";

  // 3. Connected sub-blocks
  if (state.kind === "connected") {
    document.getElementById("file-name")!.textContent = state.file.name;
    document.getElementById("port-url")!.textContent = `localhost:${state.port}`;
    document.getElementById("running-block")!.hidden = state.running === null;
    document.getElementById("idle-block")!.hidden = state.running !== null;
    if (state.running) {
      document.getElementById("run-op")!.textContent = state.running.name;
      document.getElementById("run-params")!.textContent = state.running.paramsPreview;
      document.getElementById("run-elapsed")!.textContent =
        formatElapsed(Date.now() - state.running.startedAt);
    }
  } else {
    // Defensive: explicitly hide running-block when not connected
    document.getElementById("running-block")!.hidden = true;
  }

  // 4. Mismatch view text
  if (state.kind === "mismatch") {
    document.getElementById("mismatch-text")!.textContent =
      `Server ${state.serverVersion} doesn't match plugin ${state.pluginVersion}. ${state.reason}`;
  }
}

export function pillStateFor(state: AppState): string {
  if (state.kind === "connected" && state.running) return "running";
  return state.kind;
}

export function pillTextFor(state: AppState): string {
  switch (state.kind) {
    case "disconnected": return "Not connected";
    case "connecting": return "Connecting…";
    case "connected": return state.running ? `Running ${state.running.name}` : "Connected";
    case "mismatch": return "Update needed";
  }
}

export function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s elapsed`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s elapsed`;
}
```

`activityLog.render()` is called by `ui-entry.ts`'s `setState` after `renderUI`, not from inside `renderUI` itself — keeps the pure DOM transformation separate from the component's own internal state.

### E. U2 — `setState` in `ui-entry.ts`

```typescript
let currentState: AppState = { kind: "disconnected" };
let elapsedTimer: number | null = null;

function setState(next: AppState): void {
  currentState = next;
  renderUI(next);
  activityLog.render();

  // Manage the elapsed-timer lifecycle from a single place
  if (next.kind === "connected" && next.running) {
    if (elapsedTimer === null) {
      elapsedTimer = window.setInterval(() => {
        if (currentState.kind === "connected" && currentState.running) {
          document.getElementById("run-elapsed")!.textContent =
            formatElapsed(Date.now() - currentState.running.startedAt);
        }
      }, 100);
    }
  } else if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}
```

**Invariant:** every DOM mutation in `ui-entry.ts` outside of `activityLog.push()` goes through `setState({...})`. WebSocket message handlers update by computing the next `AppState` from the current one and calling `setState`.

### F. U2 — Adapter functions for migration safety

The existing `setStatus(state, text?)` and `showView(view)` functions are rewritten as thin adapters that funnel into `setState`. They keep the surrounding handler code's shape unchanged. Future refactor can inline the `setState` calls and delete the adapters.

```typescript
function setStatus(state: StatusState, _text?: string): void {
  // Compute next AppState from current + new status
  // This is a migration shim; future PRs can inline at the call sites
  const next: AppState = computeNextStateFromStatus(currentState, state);
  setState(next);
}
```

### G. U3 — Activity log polish

Three small changes in `ui/activity-log.ts`:

1. `MAX_VISIBLE = 5` → `MAX_VISIBLE = 10`
2. Empty-state copy: `"No recent activity"` → `"No operations yet — your agent will populate this as it runs."`
3. No API changes. The class still owns its entries.

One new test (`__tests__/activity-log-integration.test.ts`) mounts the connected view and asserts entries render correctly with the new constants.

## Backwards compatibility

- `theme.ts` public API unchanged
- `code.ts` `sendTheme()` and `themechange` listener unchanged
- HTML `<body data-theme="light">` initial-render default preserved
- WebSocket message protocol unchanged
- `ActivityLog` class API unchanged (only `MAX_VISIBLE` constant and empty-state copy change)
- A bridge-plugin built from this PR works identically against an older mcp-server

## Testing strategy

**Unit tests:**

| File | What it tests |
|---|---|
| `__tests__/render-ui.test.ts` | `renderUI(state)` for every variant; the disconnect→reconnect cycle regression test |
| `__tests__/activity-log-integration.test.ts` | Activity log rendered inside the connected view; entry-count cap; empty-state copy |
| `__tests__/theme-fallback.test.ts` | CSS variable fallback chain works without Figma vars; `data-theme="dark"` overrides correctly |
| `ui/__tests__/activity-log.test.ts` (existing) | Unchanged behavior; add cases for the new copy + `MAX_VISIBLE` |

**No new integration tests.** The state machine + render layer is fully exercised by `render-ui.test.ts` under happy-dom. The activity log is exercised by its dedicated test. We don't need cross-file integration tests for this scope.

**Manual smoke test** (PR description, run before merge):

1. Open the bridge plugin in Figma. Toggle Figma to dark mode. Plugin UI should switch instantly.
2. Toggle Figma back to light. Plugin UI switches back.
3. Run an `execute_figma` op from Claude. Watch the running-block appear with op name + elapsed time.
4. Force-close + reopen the plugin pane mid-op. After reconnect, running-block should be hidden (no op is running anymore). Activity log shows the prior op.
5. Run two more ops. Activity log surfaces the 3 most recent at the top.
6. Disconnect the MCP server (`kill $(pgrep -f pluginos)`). Plugin UI shows "Connecting…" then "Not connected." Reconnect (PR-A1's takeover or manual `npx pluginos`). UI returns to connected with activity log intact.

## Sequencing within the PR

Six loose phases:

1. **Theme fallback CSS (U1)** — rewrite `tokens.cjs`; add `theme-fallback.test.ts`
2. **`AppState` type + `renderUI` extraction (U2)** — create `ui/render-ui.ts` with the type union, `renderUI`, and pure helpers; add `render-ui.test.ts`
3. **`setState` + adapter migration (U2)** — introduce `setState()` in `ui-entry.ts`; rewrite `setStatus` / `showView` as adapters; update WebSocket handlers to call `setState({...})`
4. **Running timer ownership (U2)** — move `setInterval` for `#run-elapsed` into `setState`
5. **Activity log polish (U3)** — `MAX_VISIBLE` 5→10, empty-state copy, `activity-log-integration.test.ts`
6. **Full check + manual smoke prep**

After phase 3, the stale-state-after-reconnect bug is fixed. After phase 5, all three of U1/U2/U3 ship.

## Files touched

```
MODIFY  packages/bridge-plugin/src/ui/tokens.cjs                       (Figma var fallback chain)
MODIFY  packages/bridge-plugin/src/ui-entry.ts                         (setState + adapters)
MODIFY  packages/bridge-plugin/src/ui/activity-log.ts                  (MAX_VISIBLE 5→10, empty copy)
CREATE  packages/bridge-plugin/src/ui/render-ui.ts                     (AppState + renderUI + helpers)
CREATE  packages/bridge-plugin/src/__tests__/render-ui.test.ts
CREATE  packages/bridge-plugin/src/__tests__/activity-log-integration.test.ts
CREATE  packages/bridge-plugin/src/__tests__/theme-fallback.test.ts

UNCHANGED (preserved):
  packages/bridge-plugin/src/ui/theme.ts                              (fallback layer)
  packages/bridge-plugin/src/ui.html                                  (body data-theme default)
  packages/bridge-plugin/src/code.ts                                  (sendTheme + themechange)
```

## Open questions deferred to implementation

1. **Exact Figma color variable mapping** — Figma exposes `--figma-color-bg`, `--figma-color-bg-secondary`, `--figma-color-text`, `--figma-color-text-secondary`, `--figma-color-border`, etc. The mapping from our `--po-*` tokens to these is mechanical; decided during phase 1 by inspecting Figma's documented variable list.
2. **`formatElapsed()` exact thresholds** — current implementation is sub-minute display in seconds; over-minute in `Nm Ms`. May tune during implementation if a manual smoke test shows awkward boundary behavior.
3. **Whether `setStatus`/`showView` adapters can be deleted in this PR or stay for a future cleanup** — depends on how mechanical the call-site migration turns out to be.

## References

- Feedback source: `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md`
- Existing theme module: `packages/bridge-plugin/src/ui/theme.ts`
- Existing tokens: `packages/bridge-plugin/src/ui/tokens.cjs`
- Existing UI markup: `packages/bridge-plugin/src/ui.html`
- Existing UI entry: `packages/bridge-plugin/src/ui-entry.ts`
- Existing activity log: `packages/bridge-plugin/src/ui/activity-log.ts`
- Companion PR-A1 (connection foundation): #29
- Companion PR-B (quality helpers): #27
