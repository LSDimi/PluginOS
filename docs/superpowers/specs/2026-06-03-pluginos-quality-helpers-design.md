# PluginOS Quality Helpers (PR-B) — Design

**Date:** 2026-06-03
**Status:** Approved for implementation planning
**Author:** Brainstorm session with Claude
**Scope:** Single PR. Additive only — zero behavior change to existing operations or `execute_figma` calls that don't reference new helpers.

## Context

PluginOS shipped 39 operations through v0.4.3, but a real-world bulk-seed run (TYPO3 Bootstrap, 2026-06-03, ~450 nodes) surfaced quality gaps in `execute_figma`-driven scripts:

- 306 text nodes left unbound to text styles (font properties set manually instead of via `setTextStyleIdAsync`)
- 113 padding/gap values left unbound to spacing variables (`setBoundVariable` boilerplate skipped)
- 49 top-level components stacked at (0,0)
- 58 frames with broken SPACE_BETWEEN layouts (collapse on selection inspect)
- Multiple rounds of debugging `figma.notify`, `itemSpacing = "AUTO"`, and invalid variable names — all sandbox-known errors with poor surfacing

These are not Figma API bugs — they are patterns PluginOS can codify on behalf of the agent.

The full feedback document lives at `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md` (15 numbered items + revised tl;dr).

## Goals

1. **Codify five high-frequency patterns** as `PluginOS.*` helpers usable inside `execute_figma` scripts.
2. **Catch a class of sandbox no-gos** before sending JS to Figma via a pre-flight linter.
3. **Surface the helpers in the skill** so the agent reaches for them by default.
4. **Stop drift on the "how many operations" number** by sourcing it from the registry.

## Non-goals (deferred)

- Connection reliability, port/process discovery, dark mode, UI state machine → **PR-A**
- Install and distribution polish → **PR-C**
- Runtime error translation (chasing Figma's error strings is a never-ending job)
- Standalone op (`run_operation`) versions of the helpers — the bugs happen inside loops in `execute_figma` scripts, which is where the helpers must live
- `wait_for_reconnect` MCP tool — moved to PR-A
- Bootstrap-5 token preset (feedback item #15) — niche, defer

## Architecture

```
┌─────────────────┐                  ┌──────────────────────┐
│ agent (Claude)  │  execute_figma   │ mcp-server           │
│                 ├─────────────────►│                      │
│ script body     │                  │  1. lint(script)     │
└─────────────────┘                  │  2. wrap(script)     │
                                     │     = prelude+script │
                                     │  3. send to bridge   │
                                     └──────────┬───────────┘
                                                │ WebSocket
                                                ▼
                                     ┌──────────────────────┐
                                     │ bridge-plugin        │
                                     │  execute wrapped JS  │
                                     │  in figma sandbox    │
                                     └──────────────────────┘
```

**Source of truth for the prelude:** `mcp-server`. The bridge plugin remains unaware of `PluginOS.*` — it just executes whatever JS arrives. This keeps the helper surface versioned with the npm-published server.

## Component-by-component design

### A. Sandbox prelude (`packages/mcp-server/src/prelude/`)

New module. Exports:

```ts
export const PLUGINOS_PRELUDE: string;          // the JS source blob
export const PRELUDE_VERSION: string;           // pinned to package.json version
export function wrapScript(userJs: string): {
  wrapped: string;                              // prelude + "\n" + userJs
  preludeLineCount: number;                     // so the linter can offset line numbers
};
```

The prelude defines `globalThis.PluginOS = { createStyledText, bindSpacing, combineAsVariantsTiled, tileTopLevel, layoutSpaceBetween }`. All five functions are pure JS — no imports — written directly into the source blob.

Helper signatures (full TS types are documented in the prelude source via JSDoc):

```ts
PluginOS.createStyledText(opts: {
  characters: string;
  textStyleId?: string;
  family?: string;
  weight?: string;
  size?: number;
  fillStyleId?: string;
  name?: string;
}): Promise<TextNode>

PluginOS.bindSpacing(node: FrameNode, vars: {
  padding?: VariableAlias;
  paddingX?: VariableAlias;
  paddingY?: VariableAlias;
  paddingTop?: VariableAlias;
  paddingBottom?: VariableAlias;
  paddingLeft?: VariableAlias;
  paddingRight?: VariableAlias;
  itemSpacing?: VariableAlias;
}): Promise<void>

PluginOS.combineAsVariantsTiled(cells: ComponentNode[], parent: BaseNode & ChildrenMixin, opts?: {
  cols?: number;        // default: Math.ceil(Math.sqrt(cells.length))
  gutter?: number;      // default: 16
  width?: number;       // default: computed
  layoutMode?: "HORIZONTAL" | "VERTICAL";  // default: "HORIZONTAL"
  wrap?: boolean;       // default: true
}): ComponentSetNode

PluginOS.tileTopLevel(page: PageNode, opts?: {
  cols?: number;        // default 4
  gutter?: number;      // default 64
  origin?: { x: number; y: number };
}): (node: SceneNode) => void

PluginOS.layoutSpaceBetween(frame: FrameNode, opts: {
  growChild?: SceneNode;
  children?: SceneNode[];   // auto-picks middle (3+) or last (2)
}): void
```

**Behavior details:**

- `createStyledText`: `loadFontAsync` → `createText` → if `textStyleId` then `setTextStyleIdAsync`, else apply `fontName`+`fontSize` → if `fillStyleId` then `setFillStyleIdAsync` → set `name`. Throws if neither `textStyleId` nor (`family`+`size`) is provided.
- `bindSpacing`: per provided key, calls `node.setBoundVariable(field, variable)`. Specificity wins — explicit `paddingTop` overrides `padding`. Warns (returns in lint output) if the node isn't an auto-layout frame, no-ops.
- `combineAsVariantsTiled`: `figma.combineAsVariants(cells, parent)` → set `layoutMode`, `layoutWrap = wrap ? "WRAP" : "NO_WRAP"`, `primaryAxisSizingMode = "FIXED"`, `counterAxisSizingMode = "AUTO"`, `itemSpacing = gutter`, `width`. Returns the set.
- `tileTopLevel`: returns a *placer closure* with the cursor state. Cursor lifetime is the single `execute_figma` call — not persisted to plugin data.
- `layoutSpaceBetween`: set `frame.primaryAxisAlignItems = "MIN"`, then on `growChild` (or auto-picked child): if `TEXT`, `layoutSizingHorizontal = "FILL"`; else `layoutGrow = 1`.

**Error convention:** all helpers throw `Error` with prefix `[PluginOS.<helperName>]` so call sites are obvious in response payloads.

### B. Pre-flight linter (`packages/mcp-server/src/lint/`)

New module. Regex+heuristic — no AST parser. Rules registered via an index.

**Rule set v1:**

| ID | Severity | Trigger |
|---|---|---|
| `no-notify` | error | `figma.notify(...)` calls (sandbox-forbidden) |
| `no-sync-style-setters` | warn | `.{fill,text,stroke,effect,grid}StyleId = ...` (deprecated) |
| `no-itemspacing-auto` | error | `itemSpacing = "AUTO"` string literal (runtime-rejected) |
| `invalid-variable-name` | error | `createVariable("...", ...)` first arg containing non-`[A-Za-z0-9_]` |
| `no-hyphenated-plugindata-key` | error | `setPluginData(...)` first arg containing `-` |
| `no-text-encoders` | error | `TextEncoder` / `TextDecoder` / `crypto.subtle` references |
| `prefer-helpers` | hint | `createText` + `loadFontAsync` proximity (suggest `createStyledText`); 3+ padding bindings (suggest `bindSpacing`) |

**Result shape:**

```ts
type LintResult = {
  ruleId: string;
  severity: "error" | "warn" | "hint";
  line: number;         // 1-based, in user's submitted script (prelude excluded)
  message: string;
  fix?: string;
};
```

**Policy v1: warn first, do not block.** Lint results are returned alongside the execution result in the response payload. Tightening to "block on error" is a follow-up after we've observed real false-positive rates. No `skipLint` escape hatch in v1.

**Line numbers:** lint runs against the user's original script. The `preludeLineCount` from `wrapScript` is used to offset any positions reported back from the sandbox; lint itself sees no prelude.

### C. `execute_figma` response shape (extended)

```ts
{
  result: unknown;            // unchanged
  lint: LintResult[];         // new; may be empty
  preludeVersion: string;     // new; pinned to mcp-server package version
  durationMs: number;         // unchanged
}
```

`preludeVersion` lets the agent detect when its mental model of `PluginOS.*` is stale.

### D. Skill recipes (`packages/claude-plugin/skills/pluginos-figma/SKILL.md`)

Append a new section: `## Recipes for bulk-seed scripts`. Five short recipes, one per helper, format:

```
### Styled text nodes
Don't: createText + set fontName + set fontSize manually — leaves text unbound to styles.
Do:    PluginOS.createStyledText({ characters, textStyleId, fillStyleId, name })
Why:   load-font + create + bind-style + set-fill in one async call.
```

Plus a 3-line preamble: *"These helpers are available inside every `execute_figma` script. They prevent the most common bulk-seed bugs."*

**Budget:** stay under 1000 tokens total (current 72-line skill is well under the 1150 CI cap; recipes add ~150-200 tokens).

**Sync:** recipes are generated from the prelude's helper metadata via `npm run sync-recipes -w packages/claude-plugin`. CI check identical to existing ops-reference drift check.

### E. Op count truth (`list_operations`)

- `list_operations` tool response includes `total: <N>` from the registry at startup.
- `README.md` and `INSTALL.md` reference no specific number — they say "see `list_operations` for the current set."
- `INSTALL.md`'s verification step changes from "You should get a list of 39 operations" to "You should get a list of operations."

## Backwards compatibility

- All existing 39 operations: untouched.
- `execute_figma` scripts that don't reference `PluginOS.*`: behavior identical (prelude is injected but never executed beyond its top-level definitions, which are pure assignments).
- Response shape: existing fields preserved; new fields are additive — existing agents and tests that read `result` and `durationMs` continue to work.
- Linter policy "warn first": no script that runs today will be blocked tomorrow.

## Testing strategy

**Unit (Vitest):**

- `mcp-server/src/lint/__tests__/<rule>.test.ts` — one file per rule, positive and negative cases each.
- `mcp-server/src/prelude/__tests__/wrap.test.ts` — wrapping correctness; line-number offset preserved.

**Integration:**

- `bridge-plugin/src/__tests__/prelude-integration.test.ts` — execute a fixture script per helper against happy-dom mock of the Figma API; assert side-effects and return values.
- `mcp-server/src/__tests__/execute-with-lint.test.ts` — full `execute_figma` flow: script with lint trigger → response contains lint output and execution result.

**Drift / CI:**

- `claude-plugin/scripts/sync-recipes.test.ts` — recipes in `SKILL.md` match the prelude's helper metadata.
- Existing skill token budget check (1150) continues to enforce ceiling.

**End-to-end (manual):**

- Rerun the TYPO3 Bootstrap seed runbook using the new helpers.
- Acceptance: zero unbound text nodes, zero unbound paddings, zero variant overlaps, zero SPACE_BETWEEN collapses.
- Capture before/after metrics in the PR description.

## Open questions deferred to implementation

1. Should the prelude expose `PluginOS.version` at runtime for in-script introspection? (Probably yes — small.)
2. Should `prefer-helpers` hints include the exact suggested code as `fix`? (Yes if we can generate it cleanly; otherwise just a textual nudge.)
3. Vitest mock for `figma.combineAsVariants` — does the happy-dom fixture already cover this, or do we need a stub? (Investigate during implementation.)

## Sequencing within the PR

1. Prelude module + `wrapScript` + tests (foundation)
2. Each helper + its integration test (parallel, one commit each)
3. Linter module + rule set + tests
4. `execute_figma` handler wiring (lint → wrap → send → augmented response)
5. Skill recipes + sync script + CI hook
6. Op count: registry total + tool response + docs cleanup
7. End-to-end rerun of TYPO3 Bootstrap seed; capture metrics

## References

- Feedback document: `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md`
- Existing operations registry: `packages/bridge-plugin/src/operations/registry.ts`
- Existing skill: `packages/claude-plugin/skills/pluginos-figma/SKILL.md`
- Existing `execute_figma` handler: `packages/bridge-plugin/src/handlers/execute.ts` (called by mcp-server's tool)
