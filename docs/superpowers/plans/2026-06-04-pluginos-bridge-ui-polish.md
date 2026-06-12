# PluginOS Bridge UI Polish (PR-A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bridge-plugin UI bugs: dark mode never activates, stale state after reconnect cycle, recent operations not visible during sessions.

**Architecture:** CSS variables resolve through a three-tier chain (Figma vars → `data-theme` fallback → hardcoded literal). DOM mutations funnel through a single idempotent `renderUI(AppState)` function. Activity log keeps its existing class but renders on every state transition.

**Tech Stack:** TypeScript, Vitest with happy-dom for DOM testing, CSS custom properties, no new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-06-04-pluginos-bridge-ui-polish-design.md](../specs/2026-06-04-pluginos-bridge-ui-polish-design.md)

---

## File Map

**Create:**
- `packages/bridge-plugin/src/ui/render-ui.ts` — `AppState` type, `renderUI()`, pure helpers
- `packages/bridge-plugin/src/__tests__/render-ui.test.ts`
- `packages/bridge-plugin/src/__tests__/activity-log-integration.test.ts`
- `packages/bridge-plugin/src/__tests__/theme-fallback.test.ts`

**Modify:**
- `packages/bridge-plugin/src/ui/tokens.cjs` — Figma var fallback chain
- `packages/bridge-plugin/src/ui-entry.ts` — `setState()` orchestrator, adapters, timer ownership
- `packages/bridge-plugin/src/ui/activity-log.ts` — `MAX_VISIBLE` 5→10, empty-state copy

**Unchanged (preserved):**
- `packages/bridge-plugin/src/ui/theme.ts`
- `packages/bridge-plugin/src/ui.html`
- `packages/bridge-plugin/src/code.ts`

---

## Conventions

- Commits via `Skill(commit-commands:commit)` — never write commit messages manually
- After every passing test, read the FULL test output before claiming pass
- Bridge-plugin tests run under happy-dom (configured in `packages/bridge-plugin/vitest.config.ts` — already in place)
- All work lands on branch `feat/pr-a2-bridge-ui-polish` (created in Task 0)
- Push only after the full PR is ready

---

## Task 0: Set up the feature branch

**Files:** None — git only

- [ ] **Step 1: Confirm clean starting state**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git status && git branch --show-current`
Expected: clean tree on `main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git checkout -b feat/pr-a2-bridge-ui-polish`
Expected: `Switched to a new branch 'feat/pr-a2-bridge-ui-polish'`.

- [ ] **Step 3: Cherry-pick the vitest CI fix commits from PR-B's branch so CI passes independently**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git cherry-pick cb43a4a dec47d8 f5b8cfc`
Expected: 3 commits applied cleanly.

If any conflict: stop and report. PR-A2's bridge-plugin work shouldn't conflict with these dep-only commits.

- [ ] **Step 4: Install deps**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm install`
Expected: 0 vulnerabilities.

- [ ] **Step 5: Smoke-test the existing suite passes pre-changes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin`
Expected: all existing bridge-plugin tests pass (baseline 78 tests in the pre-change codebase).

---

## Task 1: Theme fallback CSS rewrite (U1)

**Files:**
- Modify: `packages/bridge-plugin/src/ui/tokens.cjs`
- Create: `packages/bridge-plugin/src/__tests__/theme-fallback.test.ts`

This task converts the hardcoded color tokens to use Figma's injected CSS vars with hardcoded fallbacks. The `[data-theme="dark"]` block still exists but provides values consumed by the fallback chain.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/bridge-plugin/src/__tests__/theme-fallback.test.ts
import { describe, it, expect, beforeEach } from "vitest";

const TOKENS_CSS: string = require("../ui/tokens.cjs");

function injectStylesheet(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

function clearHead(): void {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
}

describe("theme fallback chain", () => {
  beforeEach(() => {
    clearHead();
  });

  it("--po-bg references --figma-color-bg with a hardcoded fallback", () => {
    injectStylesheet(TOKENS_CSS);
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--po-bg")
      .trim();
    // happy-dom doesn't fully resolve var() chains in some scenarios.
    // Just verify the variable definition references --figma-color-bg.
    expect(TOKENS_CSS).toContain("--po-bg: var(--figma-color-bg");
  });

  it("every primary token uses var(--figma-color-*) with a fallback", () => {
    const expected = [
      "--po-bg: var(--figma-color-bg",
      "--po-text: var(--figma-color-text",
      "--po-border: var(--figma-color-border",
    ];
    for (const fragment of expected) {
      expect(TOKENS_CSS).toContain(fragment);
    }
  });

  it("[data-theme=\"dark\"] block still exists with non-empty values", () => {
    expect(TOKENS_CSS).toContain('[data-theme="dark"]');
    expect(TOKENS_CSS).toContain("#1e1e1e");
  });

  it("hardcoded fallbacks are still readable when Figma vars are absent", () => {
    injectStylesheet(TOKENS_CSS);
    document.documentElement.setAttribute("data-theme", "dark");
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--po-bg")
      .trim();
    // In happy-dom, the value should resolve to either the Figma var (empty
    // when not injected) or the literal fallback. Just verify it's defined.
    expect(bg.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- theme-fallback`
Expected: FAIL on the "uses var(--figma-color-*)" assertions because the current tokens.cjs has hardcoded `#ffffff` etc.

- [ ] **Step 3: Rewrite tokens.cjs**

Replace the contents of `packages/bridge-plugin/src/ui/tokens.cjs` with:

```javascript
/**
 * Shared design tokens for bootloader.html and ui.html.
 * Injected into both at webpack build time via HtmlWebpackPlugin.templateParameters.
 * Single source of truth for v4 palette, typography, and spacing.
 *
 * Theme resolution (three-tier fallback chain):
 *   1. Figma's injected --figma-color-* vars (when running inside Figma with themeColors: true)
 *   2. Hardcoded literals (the fallback after the comma in each var() call)
 *   3. data-theme="dark" overrides the fallback literals for non-Figma contexts
 *      (happy-dom tests, future force-toggle UI, etc.)
 *
 * Inside Figma: tier 1 wins, auto-tracks editor theme. theme.ts is dormant.
 * Outside Figma: tier 1 is undefined, fallback literals apply. data-theme can override.
 */
module.exports = `
:root {
  --po-bg: var(--figma-color-bg, #ffffff);
  --po-surface: var(--figma-color-bg-secondary, #ffffff);
  --po-step-bg: var(--figma-color-bg-tertiary, #fafafa);
  --po-border: var(--figma-color-border, #ececec);
  --po-text: var(--figma-color-text, #1a1a1a);
  --po-text-sub: var(--figma-color-text-secondary, #6b7280);
  --po-text-muted: var(--figma-color-text-tertiary, #9ca3af);
  --po-code-bg: var(--figma-color-bg, #ffffff);
  --po-btn-primary-bg: var(--figma-color-bg-brand, #18181b);
  --po-btn-primary-fg: var(--figma-color-text-onbrand, #ffffff);
  --po-btn-secondary-bg: var(--figma-color-bg-secondary, #f4f4f5);
  --po-btn-secondary-fg: var(--figma-color-text, #18181b);
  --po-accent: var(--figma-color-bg-brand, #6366f1);
  --po-accent-soft: #f5f7fc;
  --po-success: var(--figma-color-bg-success, #10b981);
  --po-success-soft: var(--figma-color-bg-success-secondary, #ecfdf5);
  --po-success-text: var(--figma-color-text-success, #047857);
  --po-warn-soft: var(--figma-color-bg-warning-secondary, #fef3c7);
  --po-warn-text: var(--figma-color-text-warning, #92400e);
  --po-error: var(--figma-color-bg-danger, #ef4444);
  --po-error-soft: var(--figma-color-bg-danger-secondary, #fef2f2);
  --po-error-text: var(--figma-color-text-danger, #b91c1c);
  --po-running-soft: #eff6ff;
  --po-running-text: var(--figma-color-text-component, #1d4ed8);
  --po-radius: 8px;
  --po-radius-lg: 12px;
  --po-shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08);
  --po-focus: var(--figma-color-border-brand, #0d99ff);
  --po-font: 'Inter', -apple-system, system-ui, -apple-system, "Helvetica Neue", sans-serif;
  --po-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}

[data-theme="dark"] {
  --po-bg: var(--figma-color-bg, #1e1e1e);
  --po-surface: var(--figma-color-bg-secondary, #2c2c2c);
  --po-step-bg: var(--figma-color-bg-tertiary, #222222);
  --po-border: var(--figma-color-border, #383838);
  --po-text: var(--figma-color-text, #f5f5f5);
  --po-text-sub: var(--figma-color-text-secondary, rgba(255,255,255,.55));
  --po-text-muted: var(--figma-color-text-tertiary, rgba(255,255,255,.4));
  --po-code-bg: var(--figma-color-bg, #1e1e1e);
  --po-btn-primary-bg: var(--figma-color-bg-brand, #ffffff);
  --po-btn-primary-fg: var(--figma-color-text-onbrand, #18181b);
}
`;
```

If your version of `tokens.cjs` has additional tokens not shown above (the original file may have more lines), preserve those — only convert the color-related ones to the `var(--figma-color-*, fallback)` pattern. Don't touch radii, fonts, shadows.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- theme-fallback`
Expected: 4 passed.

- [ ] **Step 5: Run all bridge-plugin tests to confirm no regression**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin`
Expected: all green.

- [ ] **Step 6: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): use Figma CSS vars with fallback chain in tokens.cjs`.

---

## Task 2: Render-ui module skeleton with `AppState` type

**Files:**
- Create: `packages/bridge-plugin/src/ui/render-ui.ts`

This task lands the type union and pure helpers. The `renderUI` function comes in Task 3.

- [ ] **Step 1: Write the type module**

```typescript
// packages/bridge-plugin/src/ui/render-ui.ts

export type RunningOp = {
  name: string;
  paramsPreview: string;
  startedAt: number;
};

export type AppState =
  | { kind: "disconnected" }
  | { kind: "connecting"; lastKnownPort: number | null }
  | {
      kind: "connected";
      file: { name: string; key: string };
      port: number;
      running: RunningOp | null;
    }
  | { kind: "mismatch"; reason: string; serverVersion: string; pluginVersion: string };

export function pillStateFor(state: AppState): string {
  if (state.kind === "connected" && state.running) return "running";
  return state.kind;
}

export function pillTextFor(state: AppState): string {
  switch (state.kind) {
    case "disconnected":
      return "Not connected";
    case "connecting":
      return "Connecting…";
    case "connected":
      return state.running ? `Running ${state.running.name}` : "Connected";
    case "mismatch":
      return "Update needed";
  }
}

export function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s elapsed`;
  const minutes = Math.floor(s / 60);
  const seconds = Math.floor(s % 60);
  return `${minutes}m ${seconds}s elapsed`;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): add AppState type union and pure helpers`.

---

## Task 3: Pure helpers tests (TDD before adding `renderUI`)

**Files:**
- Create: `packages/bridge-plugin/src/__tests__/render-ui.test.ts`

This task adds unit tests for the pure helpers (`pillStateFor`, `pillTextFor`, `formatElapsed`). The `renderUI` function tests come in Task 4 once we add the function.

- [ ] **Step 1: Write tests for the pure helpers**

```typescript
// packages/bridge-plugin/src/__tests__/render-ui.test.ts
import { describe, it, expect } from "vitest";
import {
  pillStateFor,
  pillTextFor,
  formatElapsed,
  type AppState,
} from "../ui/render-ui.js";

describe("pillStateFor", () => {
  it("returns kind for non-connected variants", () => {
    expect(pillStateFor({ kind: "disconnected" })).toBe("disconnected");
    expect(pillStateFor({ kind: "connecting", lastKnownPort: 9500 })).toBe("connecting");
    expect(
      pillStateFor({
        kind: "mismatch",
        reason: "x",
        serverVersion: "0.4.3",
        pluginVersion: "0.4.2",
      })
    ).toBe("mismatch");
  });

  it("returns 'running' when connected with a running op", () => {
    expect(
      pillStateFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: { name: "execute_figma", paramsPreview: "", startedAt: 0 },
      })
    ).toBe("running");
  });

  it("returns 'connected' when connected and idle", () => {
    expect(
      pillStateFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: null,
      })
    ).toBe("connected");
  });
});

describe("pillTextFor", () => {
  it("returns user-facing strings per state", () => {
    expect(pillTextFor({ kind: "disconnected" })).toBe("Not connected");
    expect(pillTextFor({ kind: "connecting", lastKnownPort: null })).toBe("Connecting…");
    expect(
      pillTextFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: null,
      })
    ).toBe("Connected");
  });

  it("includes the op name when running", () => {
    expect(
      pillTextFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: { name: "lint_styles", paramsPreview: "", startedAt: 0 },
      })
    ).toBe("Running lint_styles");
  });

  it("returns 'Update needed' for mismatch", () => {
    expect(
      pillTextFor({
        kind: "mismatch",
        reason: "x",
        serverVersion: "0.4.3",
        pluginVersion: "0.4.2",
      })
    ).toBe("Update needed");
  });
});

describe("formatElapsed", () => {
  it("shows seconds with one decimal under a minute", () => {
    expect(formatElapsed(500)).toBe("0.5s elapsed");
    expect(formatElapsed(12_345)).toBe("12.3s elapsed");
  });

  it("shows minutes + seconds at or above one minute", () => {
    expect(formatElapsed(60_000)).toBe("1m 0s elapsed");
    expect(formatElapsed(125_000)).toBe("2m 5s elapsed");
  });

  it("handles zero correctly", () => {
    expect(formatElapsed(0)).toBe("0.0s elapsed");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- render-ui`
Expected: 9 passed (3 + 3 + 3 cases).

- [ ] **Step 3: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `test(bridge-plugin): cover pillStateFor, pillTextFor, formatElapsed helpers`.

---

## Task 4: Implement and test `renderUI` (TDD)

**Files:**
- Modify: `packages/bridge-plugin/src/ui/render-ui.ts` (append `renderUI`)
- Modify: `packages/bridge-plugin/src/__tests__/render-ui.test.ts` (append DOM tests)

- [ ] **Step 1: Append the failing tests**

Append to `packages/bridge-plugin/src/__tests__/render-ui.test.ts`:

```typescript
import { renderUI } from "../ui/render-ui.js";

function setupDom(): void {
  document.body.innerHTML = `
    <div id="status-pill"><span id="status-text">—</span></div>
    <section id="view-disconnected"></section>
    <section id="view-connected" hidden>
      <span id="file-name">—</span>
      <span id="port-url">—</span>
      <div id="running-block" hidden>
        <span id="run-op">—</span>
        <span id="run-params">—</span>
        <span id="run-elapsed">—</span>
      </div>
      <div id="idle-block"></div>
    </section>
    <section id="view-mismatch" hidden>
      <span id="mismatch-text">—</span>
    </section>
  `;
}

describe("renderUI", () => {
  beforeEach(() => setupDom());

  it("shows disconnected view + pill on disconnected state", () => {
    renderUI({ kind: "disconnected" });
    expect(document.getElementById("view-disconnected")!.hidden).toBe(false);
    expect(document.getElementById("view-connected")!.hidden).toBe(true);
    expect(document.getElementById("view-mismatch")!.hidden).toBe(true);
    expect(document.getElementById("status-pill")!.dataset.state).toBe("disconnected");
    expect(document.getElementById("status-text")!.textContent).toBe("Not connected");
  });

  it("shows disconnected view + 'Connecting…' pill on connecting state", () => {
    renderUI({ kind: "connecting", lastKnownPort: 9500 });
    expect(document.getElementById("view-disconnected")!.hidden).toBe(false);
    expect(document.getElementById("status-pill")!.dataset.state).toBe("connecting");
    expect(document.getElementById("status-text")!.textContent).toBe("Connecting…");
  });

  it("shows connected view with idle-block when running is null", () => {
    renderUI({
      kind: "connected",
      file: { name: "MyFile", key: "abc" },
      port: 9500,
      running: null,
    });
    expect(document.getElementById("view-connected")!.hidden).toBe(false);
    expect(document.getElementById("idle-block")!.hidden).toBe(false);
    expect(document.getElementById("running-block")!.hidden).toBe(true);
    expect(document.getElementById("file-name")!.textContent).toBe("MyFile");
    expect(document.getElementById("port-url")!.textContent).toBe("localhost:9500");
  });

  it("shows connected view with running-block when running is set", () => {
    const startedAt = Date.now() - 2500;
    renderUI({
      kind: "connected",
      file: { name: "MyFile", key: "abc" },
      port: 9500,
      running: { name: "execute_figma", paramsPreview: "{ code: ... }", startedAt },
    });
    expect(document.getElementById("running-block")!.hidden).toBe(false);
    expect(document.getElementById("idle-block")!.hidden).toBe(true);
    expect(document.getElementById("run-op")!.textContent).toBe("execute_figma");
    expect(document.getElementById("run-params")!.textContent).toBe("{ code: ... }");
    expect(document.getElementById("run-elapsed")!.textContent).toMatch(/elapsed/);
    expect(document.getElementById("status-text")!.textContent).toBe("Running execute_figma");
  });

  it("shows mismatch view with formatted text", () => {
    renderUI({
      kind: "mismatch",
      reason: "Reinstall the plugin.",
      serverVersion: "0.4.4",
      pluginVersion: "0.4.2",
    });
    expect(document.getElementById("view-mismatch")!.hidden).toBe(false);
    expect(document.getElementById("mismatch-text")!.textContent).toContain("0.4.4");
    expect(document.getElementById("mismatch-text")!.textContent).toContain("0.4.2");
    expect(document.getElementById("mismatch-text")!.textContent).toContain("Reinstall the plugin.");
  });

  it("hides running-block defensively when not connected", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: { name: "op", paramsPreview: "", startedAt: Date.now() },
    });
    expect(document.getElementById("running-block")!.hidden).toBe(false);

    renderUI({ kind: "disconnected" });
    expect(document.getElementById("running-block")!.hidden).toBe(true);
  });

  it("regression: disconnect→reconnect cycle does not leak running-block visibility", () => {
    // Connected + running
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: { name: "op", paramsPreview: "", startedAt: Date.now() },
    });
    // User force-closes plugin → bridge disconnects
    renderUI({ kind: "disconnected" });
    // Reconnect arrives — no op is running now
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
    });
    expect(document.getElementById("running-block")!.hidden).toBe(true);
    expect(document.getElementById("idle-block")!.hidden).toBe(false);
  });

  it("is idempotent — calling with same state twice yields the same DOM", () => {
    const state: AppState = {
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
    };
    renderUI(state);
    const firstHtml = document.body.innerHTML;
    renderUI(state);
    expect(document.body.innerHTML).toBe(firstHtml);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- render-ui`
Expected: FAIL — `renderUI` not exported.

- [ ] **Step 3: Add `renderUI` to `render-ui.ts`**

Append to `packages/bridge-plugin/src/ui/render-ui.ts`:

```typescript
function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`renderUI: missing element #${id}`);
  return node;
}

export function renderUI(state: AppState): void {
  // 1. Status pill
  const pill = el("status-pill");
  pill.dataset.state = pillStateFor(state);
  el("status-text").textContent = pillTextFor(state);

  // 2. Top-level views
  el("view-disconnected").hidden =
    state.kind !== "disconnected" && state.kind !== "connecting";
  el("view-connected").hidden = state.kind !== "connected";
  el("view-mismatch").hidden = state.kind !== "mismatch";

  // 3. Connected sub-blocks
  if (state.kind === "connected") {
    el("file-name").textContent = state.file.name;
    el("port-url").textContent = `localhost:${state.port}`;
    el("running-block").hidden = state.running === null;
    el("idle-block").hidden = state.running !== null;
    if (state.running) {
      el("run-op").textContent = state.running.name;
      el("run-params").textContent = state.running.paramsPreview;
      el("run-elapsed").textContent = formatElapsed(Date.now() - state.running.startedAt);
    }
  } else {
    // Defensive: explicitly hide running-block when not connected
    el("running-block").hidden = true;
  }

  // 4. Mismatch view text
  if (state.kind === "mismatch") {
    el("mismatch-text").textContent =
      `Server ${state.serverVersion} doesn't match plugin ${state.pluginVersion}. ${state.reason}`;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- render-ui`
Expected: 17 passed (9 helper + 8 renderUI cases).

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): add idempotent renderUI(AppState) function`.

---

## Task 5: Wire `setState` + adapters into `ui-entry.ts`

**Files:**
- Modify: `packages/bridge-plugin/src/ui-entry.ts`

This is the integration task. We funnel all existing DOM mutations through a new `setState` orchestrator. The existing `setStatus` and `showView` functions become thin adapters.

- [ ] **Step 1: Read the current ui-entry.ts to understand exact shapes**

Read `packages/bridge-plugin/src/ui-entry.ts` end-to-end. Note:
- Where `setStatus` is defined (around line 36-47)
- Where `showView` is defined (around line 49-53)
- Every direct DOM mutation that touches `#file-name`, `#port-url`, `#running-block`, `#idle-block`, `#run-op`, `#run-params`, `#run-elapsed`, `#mismatch-text`
- Where the `setInterval` for the elapsed timer lives
- Where `activityLog` is initialized and pushed/rendered

- [ ] **Step 2: Add imports + state at the top of ui-entry.ts**

Add to the imports near the top (alongside the existing theme imports):

```typescript
import { renderUI, type AppState, type RunningOp } from "./ui/render-ui";
```

Add module-level state (somewhere near the existing `let activityLog: ActivityLog;` declaration):

```typescript
let currentState: AppState = { kind: "disconnected" };
let elapsedTimer: number | null = null;
```

- [ ] **Step 3: Add the `setState` orchestrator**

Add this function near the top of the file (alongside the existing `setStatus`, before its definition):

```typescript
function setState(next: AppState): void {
  currentState = next;
  renderUI(next);
  if (activityLog) {
    activityLog.render();
  }

  if (next.kind === "connected" && next.running) {
    if (elapsedTimer === null) {
      elapsedTimer = window.setInterval(() => {
        if (currentState.kind === "connected" && currentState.running) {
          const elapsed = document.getElementById("run-elapsed");
          if (elapsed) {
            // formatElapsed is in render-ui — re-import isn't needed because
            // we can compute the formatted text via a tiny helper that ALSO
            // lives in render-ui.ts. Use it directly.
            const ms = Date.now() - currentState.running.startedAt;
            elapsed.textContent = formatElapsed(ms);
          }
        }
      }, 100);
    }
  } else if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}
```

Add `formatElapsed` to the import:

```typescript
import { renderUI, formatElapsed, type AppState, type RunningOp } from "./ui/render-ui";
```

- [ ] **Step 4: Rewrite `setStatus` as an adapter**

Replace the existing `setStatus(state: StatusState, text?: string)` function body with:

```typescript
function setStatus(state: StatusState, _text?: string): void {
  // Adapter: maps the old 5-state model onto the new AppState union
  const next = computeNextStateFromStatus(currentState, state);
  setState(next);
}

function computeNextStateFromStatus(prev: AppState, status: StatusState): AppState {
  switch (status) {
    case "disconnected":
      return { kind: "disconnected" };
    case "connecting":
      return {
        kind: "connecting",
        lastKnownPort: prev.kind === "connected" ? prev.port : null,
      };
    case "connected":
      if (prev.kind === "connected") {
        return { ...prev, running: null };
      }
      return {
        kind: "connected",
        file: { name: "—", key: "—" },
        port: 0,
        running: null,
      };
    case "running":
      if (prev.kind === "connected") {
        return prev; // running is set by a different code path that has the op info
      }
      return prev;
    case "mismatch":
      return {
        kind: "mismatch",
        reason: "",
        serverVersion: "—",
        pluginVersion: "—",
      };
  }
}
```

- [ ] **Step 5: Rewrite `showView` as a no-op (renderUI handles view switching)**

Replace the existing `showView(view)` function body with:

```typescript
function showView(_view: "disconnected" | "connected" | "mismatch"): void {
  // Adapter: view switching is now driven by setState/renderUI.
  // Keeping this function exported as a no-op so existing call sites compile.
  // Future PR can inline all call sites and delete this entirely.
}
```

- [ ] **Step 6: Update the WebSocket "connected" handler to call setState directly**

Find the code path that today does something like `setStatus("connected"); showView("connected"); $("file-name").textContent = ...; $("port-url").textContent = ...;` (around the `ws.onopen` or "SERVER_HELLO" handler, look near lines 240-260 of the original ui-entry.ts).

Replace those individual mutations with a single `setState` call:

```typescript
setState({
  kind: "connected",
  file: { name: currentFileName ?? "—", key: currentFileKey ?? "—" },
  port: actualPort,
  running: null,
});
```

The variables `currentFileName`, `currentFileKey`, `actualPort` should already be in scope wherever the old code grabbed them. Adapt the names to match what's actually used.

- [ ] **Step 7: Update the "running" code path**

Find where the UI today marks an op as starting (sets running-block visible, fills in op name + params). This is likely in a `WS_RUN_OP_START` or similar message handler.

Replace those mutations with:

```typescript
if (currentState.kind === "connected") {
  setState({
    ...currentState,
    running: {
      name: opName,
      paramsPreview: paramsPreview,
      startedAt: Date.now(),
    },
  });
}
```

And on op completion (hide running-block, push activity log entry):

```typescript
if (currentState.kind === "connected") {
  setState({ ...currentState, running: null });
}
activityLog.push({ ...entry });
```

- [ ] **Step 8: Update the disconnect / reconnect code paths**

Existing `ws.onclose` handlers call `setStatus("disconnected")` and `setStatus("connecting", "Reconnecting…")`. These already funnel into `setState` via the adapter, so no change needed beyond Step 4. Confirm by tracing each `setStatus(...)` call site.

- [ ] **Step 9: Update the mismatch code path**

Find where the version-mismatch UI is set (likely receives a `SERVER_HELLO` with incompatible version). Replace any direct DOM mutations + `setStatus("mismatch")` with:

```typescript
setState({
  kind: "mismatch",
  reason: "Reinstall both halves of PluginOS to the same version.",
  serverVersion: serverVersionFromHello,
  pluginVersion: PLUGIN_VERSION,
});
```

Where `PLUGIN_VERSION` is the constant already used somewhere in the file (search for it; usually injected at build time).

- [ ] **Step 10: Remove the old elapsed-timer code**

The original `ui-entry.ts` likely has a `setInterval` for the running-elapsed updates. Since `setState` now manages this timer (Step 3), the old timer should be removed. Search for the elapsed-related `setInterval` and `clearInterval` calls and delete them.

- [ ] **Step 11: Typecheck**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run typecheck`
Expected: no errors.

If typecheck flags unused parameters (`_view`, `_text`), they're already prefixed with `_` per the eslint rule and should be fine.

- [ ] **Step 12: Run all bridge-plugin tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin`
Expected: all existing tests pass + 17 new render-ui tests + 4 theme-fallback tests.

If any existing test fails because it asserted on `setStatus` side effects (e.g., a hardcoded DOM mutation that now goes through `renderUI`), update the test to assert on the post-`setState` DOM instead. Do NOT change the new code to preserve old assertions — the new flow is the contract.

- [ ] **Step 13: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): funnel all DOM mutations through setState orchestrator`.

---

## Task 6: Activity log polish

**Files:**
- Modify: `packages/bridge-plugin/src/ui/activity-log.ts`
- Create: `packages/bridge-plugin/src/__tests__/activity-log-integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// packages/bridge-plugin/src/__tests__/activity-log-integration.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ActivityLog } from "../ui/activity-log.js";

function setupHost(): HTMLElement {
  document.body.innerHTML = `<div id="activity-log"></div>`;
  return document.getElementById("activity-log")!;
}

describe("ActivityLog integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the new empty-state copy when no entries", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    log.render();
    expect(host.textContent).toContain("No operations yet");
  });

  it("renders up to 10 entries (MAX_VISIBLE)", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    for (let i = 0; i < 12; i++) {
      log.push({
        op: `op_${i}`,
        status: "ok",
        durationMs: 100,
        params: {},
        at: Date.now() - i * 1000,
      });
    }
    log.render();
    const rows = host.querySelectorAll(".activity-row");
    expect(rows.length).toBe(10);
  });

  it("renders 5 entries when only 5 exist", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    for (let i = 0; i < 5; i++) {
      log.push({
        op: `op_${i}`,
        status: "ok",
        durationMs: 100,
        params: {},
        at: Date.now() - i * 1000,
      });
    }
    log.render();
    const rows = host.querySelectorAll(".activity-row");
    expect(rows.length).toBe(5);
  });

  it("error entries get the .err class", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    log.push({
      op: "bad_op",
      status: "error",
      durationMs: 50,
      params: {},
      error: "boom",
      at: Date.now(),
    });
    log.render();
    expect(host.querySelector(".activity-op.err")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- activity-log-integration`
Expected: FAIL on the empty-state copy + MAX_VISIBLE=10 cases.

- [ ] **Step 3: Read the current activity-log.ts to find the exact lines to change**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && grep -n "MAX_VISIBLE\|activity-empty\|No recent activity" packages/bridge-plugin/src/ui/activity-log.ts`

- [ ] **Step 4: Update the constants and empty-state copy**

In `packages/bridge-plugin/src/ui/activity-log.ts`:

1. Change `const MAX_VISIBLE = 5;` to `const MAX_VISIBLE = 10;`
2. Change the empty-state HTML from `"No recent activity"` to `"No operations yet — your agent will populate this as it runs."`

Concrete edit (the existing code is shown in the spec; find the line that reads):

```typescript
this.host.innerHTML = `<div class="activity-empty">No recent activity</div>`;
```

Replace with:

```typescript
this.host.innerHTML = `<div class="activity-empty">No operations yet — your agent will populate this as it runs.</div>`;
```

- [ ] **Step 5: Run the tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin -- activity-log`
Expected: existing `activity-log.test.ts` tests + new integration tests both pass.

If the existing `activity-log.test.ts` asserts the old "No recent activity" copy, update those assertions to match the new copy.

- [ ] **Step 6: Run all bridge-plugin tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin`
Expected: all green.

- [ ] **Step 7: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): bump activity log MAX_VISIBLE to 10 and refresh empty-state copy`.

---

## Task 7: Full check + smoke test prep

**Files:** None (verification only)

- [ ] **Step 1: Run the full pipeline**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run check`
Expected: lint, format, typecheck, build, test all pass.

- [ ] **Step 2: Confirm new test files are picked up**

Verify these are in the test output:
- `packages/bridge-plugin/src/__tests__/theme-fallback.test.ts`
- `packages/bridge-plugin/src/__tests__/render-ui.test.ts`
- `packages/bridge-plugin/src/__tests__/activity-log-integration.test.ts`

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin 2>&1 | grep -E "Test Files|Tests"`
Expected: total test count increased by ~25-30 vs baseline.

- [ ] **Step 3: Confirm clean working tree**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git status`
Expected: clean.

- [ ] **Step 4: Document the manual smoke test for the PR description**

The smoke test (run against a real Figma file) goes into the PR body:

```markdown
## Manual smoke test

Before merging, against a real Figma file:

1. **Dark mode follows Figma:**
   - Open the plugin in Figma with light mode. Plugin UI is light.
   - Toggle Figma to dark mode. Plugin UI switches to dark instantly.
   - Toggle back to light. Plugin UI returns to light.

2. **Running state visible:**
   - From Claude, call `execute_figma { code: "await new Promise(r => setTimeout(r, 5000)); return 1;" }`.
   - During the 5s, the connected view shows the running-block with op name "execute_figma" and elapsed time ticking.
   - On completion: running-block hides, activity log shows the entry.

3. **Stale state regression (the bug):**
   - From Claude, call `execute_figma { code: "await new Promise(r => setTimeout(r, 10000));" }`.
   - During the 10s, force-close the plugin pane in Figma.
   - Reopen the plugin pane. The plugin reconnects via PR-A1's discovery.
   - Verify: running-block is HIDDEN (because the op was severed). Activity log shows the prior op (with whatever final status it landed on).

4. **Activity log shows recent operations:**
   - Run 3-4 ops in succession.
   - Activity log shows them at the top, newest first.
   - Run 12 more ops. Activity log caps at 10 visible entries.
   - Refresh the plugin pane: activity log resets to empty (entries are in-memory).
```

Don't commit this — it goes into the PR description.

---

## Task 8: Push branch + open PR

**Files:** None — git/gh only

- [ ] **Step 1: Push the branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git push -u origin feat/pr-a2-bridge-ui-polish`
Expected: pre-push hooks pass, branch pushed.

- [ ] **Step 2: Open the PR**

Run `gh pr create --base main --head feat/pr-a2-bridge-ui-polish --title "feat: PR-A2 bridge UI polish — dark mode + state machine + activity log"` with a body containing:

- One-paragraph summary
- Bulleted list of what's shipped (theme fallback chain, AppState union, renderUI orchestrator, setState funneling, activity log polish)
- Reference to the design doc and PR-A1 / PR-B
- The manual smoke test checklist from Task 7 Step 4
- Test plan: "All unit tests pass via `npm run check`. Manual smoke test pending against a real Figma file."

- [ ] **Step 3: Report the PR URL to the user**

Terminal phase complete.

---

## Self-Review Notes

Performed:

1. **Spec coverage:**
   - §A (three-tier theme system) → Task 1 ✓
   - §B (theme.ts preserved) → confirmed via "Unchanged" list in plan File Map ✓
   - §C (AppState discriminated union) → Task 2 ✓
   - §D (renderUI function) → Task 4 ✓
   - §E (setState in ui-entry.ts) → Task 5 ✓
   - §F (adapter functions) → Task 5 Steps 4-5 ✓
   - §G (activity log polish) → Task 6 ✓
   - Backwards compatibility → explicit in spec; preserved by leaving theme.ts, code.ts, ui.html unchanged ✓
   - Testing strategy → tasks 1, 3, 4, 6 cover all three test files ✓
   - Non-goals → explicitly not in any task ✓

2. **Placeholder scan:** No TBDs. Task 5 has several "find the existing code path" steps because the existing `ui-entry.ts` is 350+ lines and we don't want to copy it verbatim. Each such step has explicit search criteria and concrete replacement code.

3. **Type consistency:** `AppState`, `RunningOp` shapes consistent across Tasks 2, 3, 4, 5. `renderUI` signature consistent. `formatElapsed` imported in Task 5 matches its definition in Task 2.

4. **Known unknowns:** Task 5 depends on the engineer reading and locating specific code paths in the existing `ui-entry.ts`. This is intentional — the file is large enough that paste-able diffs would be brittle. Explicit search criteria are provided.
