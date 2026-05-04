# PluginOS Marketplace Publication Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire PluginOS for `/plugin marketplace add github:LSDimi/pluginos` + `/plugin install pluginos`, and unblock its appearance in the Anthropic curated marketplace.

**Architecture:** Add a single `marketplace.json` at the repo root that references the existing nested plugin manifest at `packages/claude-plugin/.claude-plugin/plugin.json`. Fix two validation errors in that manifest (`repository` shape, unrecognized `displayName`). Float the `pluginos` version pin in the bundled `.mcp.json` so it tracks the latest npm release like every other reference in the project. No code changes, no test suite work — this is configuration wiring.

**Tech Stack:** JSON config files, Claude Code plugin manifest schema, npm-published `pluginos` package.

**Spec:** [docs/superpowers/specs/2026-05-04-pluginos-marketplace-publication-fix-design.md](../specs/2026-05-04-pluginos-marketplace-publication-fix-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.claude-plugin/marketplace.json` | Create | Root-level marketplace listing — discovered by `/plugin marketplace add`. Owns user-facing branding ("PluginOS for Figma"). Single plugin entry whose `source` references the nested package. |
| `packages/claude-plugin/.claude-plugin/plugin.json` | Modify | Remove `displayName` (not in schema). Convert `repository` from object to string URL. Keep all other fields. |
| `packages/claude-plugin/.mcp.json` | Modify | Replace `pluginos@0.4.0` arg with `-y pluginos` (floating). Removes drift surface vs. `plugin.json` and matches `npx -y pluginos` pattern used elsewhere. |

No README changes required — both READMEs already document the correct install commands; they just don't work today because `marketplace.json` is missing.

---

## Task 1: Create root marketplace.json

**Files:**
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Verify the path doesn't already exist**

Run: `ls .claude-plugin/marketplace.json 2>/dev/null && echo EXISTS || echo OK`
Expected: `OK` (file does not exist).

If `EXISTS`, stop and reconcile with the spec author — the spec assumed this file is missing.

- [ ] **Step 2: Create the file**

Create `.claude-plugin/marketplace.json` with this exact content:

```json
{
  "name": "pluginos",
  "owner": {
    "name": "LSDimi",
    "url": "https://github.com/LSDimi"
  },
  "plugins": [
    {
      "name": "pluginos",
      "source": "./packages/claude-plugin",
      "description": "Token-efficient Figma automation via MCP. Bridges Claude to Figma without burning tokens on raw node dumps.",
      "category": "design"
    }
  ]
}
```

Notes:
- `source` is a relative path from the repo root to the directory containing the existing nested `.claude-plugin/plugin.json`.
- No `version` field — version is sourced from the referenced `plugin.json` to avoid duplication.
- `category` is included on a best-effort basis; a later validation step will confirm the schema accepts it.

- [ ] **Step 3: Validate JSON syntax**

Run: `python3 -m json.tool .claude-plugin/marketplace.json > /dev/null && echo OK`
Expected: `OK` (no parse errors).

- [ ] **Step 4: Commit**

```bash
git add -f .claude-plugin/marketplace.json
git commit -m "feat(plugin): add root marketplace.json for /plugin marketplace add support"
```

Note: `-f` is required because the parent ignore rules apply differently in different repo configs; if it commits without `-f`, drop the flag. (Verified: `.claude-plugin/` at repo root is **not** in `.gitignore` — only `docs/` is — so the plain `git add` should suffice. Use `-f` only as fallback if the commit refuses.)

---

## Task 2: Fix plugin.json validation errors

**Files:**
- Modify: `packages/claude-plugin/.claude-plugin/plugin.json`

- [ ] **Step 1: Snapshot current content**

Run: `cat packages/claude-plugin/.claude-plugin/plugin.json`
Expected: contains `"displayName": "PluginOS for Figma"` and `"repository": { "type": "git", "url": "..." }`.

- [ ] **Step 2: Replace the file with the corrected manifest**

Overwrite `packages/claude-plugin/.claude-plugin/plugin.json` with:

```json
{
  "name": "pluginos",
  "version": "0.4.3",
  "description": "Token-efficient Figma automation via MCP. Bridges Claude to Figma without burning tokens on raw node dumps.",
  "author": {
    "name": "LSDimi",
    "url": "https://github.com/LSDimi/pluginos"
  },
  "repository": "https://github.com/LSDimi/pluginos",
  "homepage": "https://github.com/LSDimi/pluginos#readme",
  "license": "MIT"
}
```

Diff summary:
- Removed: `"displayName": "PluginOS for Figma"` (not a recognized key in the plugin manifest schema; user-facing branding now lives in `marketplace.json`).
- Changed: `"repository": { "type": "git", "url": "..." }` → `"repository": "https://github.com/LSDimi/pluginos"` (schema requires a string).
- Unchanged: `name`, `version`, `description`, `author`, `homepage`, `license`.

- [ ] **Step 3: Validate JSON syntax**

Run: `python3 -m json.tool packages/claude-plugin/.claude-plugin/plugin.json > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 4: Confirm the two error patterns are gone**

Run: `grep -E '"displayName"|"repository":\s*\{' packages/claude-plugin/.claude-plugin/plugin.json && echo STILL_PRESENT || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add packages/claude-plugin/.claude-plugin/plugin.json
git commit -m "fix(plugin): repository as string, drop unrecognized displayName

Resolves the two manifest validation errors that block the Anthropic
marketplace sync. User-facing branding moves to marketplace.json."
```

---

## Task 3: Float the .mcp.json version pin

**Files:**
- Modify: `packages/claude-plugin/.mcp.json`

- [ ] **Step 1: Snapshot current content**

Run: `cat packages/claude-plugin/.mcp.json`
Expected: contains `"args": ["pluginos@0.4.0"]`.

- [ ] **Step 2: Replace the file**

Overwrite `packages/claude-plugin/.mcp.json` with:

```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["-y", "pluginos"]
    }
  }
}
```

Diff: `["pluginos@0.4.0"]` → `["-y", "pluginos"]`. The `-y` flag auto-confirms `npx`'s install prompt; the unpinned package name fetches the latest published version. Matches the install snippet documented in the main README.

- [ ] **Step 3: Validate JSON syntax**

Run: `python3 -m json.tool packages/claude-plugin/.mcp.json > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add packages/claude-plugin/.mcp.json
git commit -m "fix(plugin): float pluginos version in bundled .mcp.json

Removes pluginos@0.4.0 pin that drifted from plugin.json (0.4.3).
Matches 'npx -y pluginos' pattern documented in README install snippet."
```

---

## Task 4: Verify the install path end-to-end (manual)

This task does not change files. It confirms the three commits above produce a working marketplace install and a clean validator result.

**Files:** none

- [ ] **Step 1: Run the plugin validator from repo root**

Run: `claude plugin validate .` (from repo root, not from `packages/claude-plugin/`)

Expected: 0 errors. Specifically confirm:
- The previous error `repository: Invalid input: expected string, received object` is gone.
- The previous error `root: Unrecognized key: "displayName"` is gone.

If the validator reports an unrecognized-key warning on `category` in `marketplace.json`, remove the `category` field and amend the Task 1 commit:

```bash
# Edit .claude-plugin/marketplace.json to drop the "category" line
git add .claude-plugin/marketplace.json
git commit -m "fix(plugin): drop unsupported marketplace.json category field"
```

If the validator reports any other unrecognized-key warnings, stop and reconcile against the actual marketplace.json schema before proceeding.

- [ ] **Step 2: Local marketplace install dry-run**

In a Claude Code session, run:

```
/plugin marketplace add file:///<absolute-path-to-this-worktree>
/plugin install pluginos
```

Expected:
- Marketplace add succeeds (lists "PluginOS for Figma" with the description from `marketplace.json`).
- Install succeeds — registers the `pluginos` MCP server.
- In the same session, `list_operations` (pluginos) returns the operations registry with at least 26 operations.

If install or `list_operations` fails, capture the error and stop — do not proceed to Step 3 until the local install works.

- [ ] **Step 3: Confirm READMEs already match the working install command**

Run: `grep -n "/plugin marketplace add github:LSDimi/pluginos" README.md packages/claude-plugin/README.md`

Expected: both files reference the correct command. No edits required.

If either file references a different command (legacy or stale guidance), update it in a separate commit:

```bash
git add README.md packages/claude-plugin/README.md
git commit -m "docs: align install instructions with marketplace install path"
```

- [ ] **Step 4: Push and re-submit to Anthropic marketplace**

After merge to `main`:

```bash
# from your normal workflow — push the branch, open a PR, merge as usual
```

Then re-test from the GitHub source:

```
/plugin marketplace add github:LSDimi/pluginos
/plugin install pluginos
```

Same expectations as Step 2.

Re-submit (or wait for re-sync) the plugin to the Anthropic marketplace. Track that the listing transitions from "Published" in the submissions dashboard to actually appearing in the curated marketplace listing.

---

## Self-Review Notes

This plan was checked against the spec for coverage. All four file-change items in the spec's "Solution" section map to Tasks 1–3 (file changes) and Task 4 (verification, including the README sweep that the spec called out as part of change #4). The spec's verification section maps directly to Task 4 steps 1–4. Out-of-scope items (skill exposure, monorepo restructure, design-superpowers work) are correctly excluded.

No placeholders. No unsupported references. Versions and field names cross-checked between tasks.
