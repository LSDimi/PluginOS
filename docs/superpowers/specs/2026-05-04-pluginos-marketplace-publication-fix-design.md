# PluginOS Marketplace Publication Fix — Design Spec

**Date:** 2026-05-04
**Status:** Draft

---

## Problem

PluginOS shows "Published" in the Anthropic plugin submissions dashboard but does not appear in the Claude Code marketplace. Three concrete defects block publication and break the install path advertised in the README:

1. **Plugin manifest validation errors** ([packages/claude-plugin/.claude-plugin/plugin.json](../../../packages/claude-plugin/.claude-plugin/plugin.json)):
   - `repository` is an object (`{type, url}`) — schema requires a string URL.
   - `displayName` is not a recognized key in the plugin manifest schema.
   Anthropic's marketplace sync rejects the plugin on these errors even though Claude Code itself accepts the manifest at install time.

2. **No `marketplace.json` in the repository.** The README advertises `/plugin marketplace add github:LSDimi/pluginos` followed by `/plugin install pluginos`, but Claude Code's marketplace add command requires a `.claude-plugin/marketplace.json` at the repo root. None exists. The advertised install path cannot work.

3. **Version drift.** [packages/claude-plugin/.mcp.json](../../../packages/claude-plugin/.mcp.json) pins `pluginos@0.4.0` while [plugin.json](../../../packages/claude-plugin/.claude-plugin/plugin.json) is at `0.4.3`. The pin is inconsistent with `npx -y pluginos` used elsewhere in the docs and creates a permanent drift surface.

Downstream impact: design-superpowers cannot use the clean "marketplace install" integration path and is forced into either vendoring PluginOS (sync overhead) or shipping a partial integration. Fixing publication here unblocks design-superpowers' integration on its own.

---

## Solution

Four small file changes. All scoped to the `claude-plugin` package and repo root. No code, no tests required, no architecture changes.

### 1. New file: `.claude-plugin/marketplace.json` (repo root)

Single-plugin marketplace listing. This is the file Claude Code looks for when `/plugin marketplace add github:LSDimi/pluginos` runs. It also owns the user-facing branding ("PluginOS for Figma") that previously lived incorrectly in `plugin.json`.

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

The `source` field points at the existing nested package directory — no files move. Version is intentionally not duplicated here; it derives from the referenced `plugin.json` to avoid a third drift surface.

The `category` field assumes Claude Code's marketplace.json schema accepts a `category` key on plugin entries. Before merging, the implementation step must validate this file against the actual schema (run `claude plugin validate .` and inspect any unrecognized-key warnings); drop or rename `category` if rejected.

### 2. Modify: `packages/claude-plugin/.claude-plugin/plugin.json`

Fix validation errors. Strip branding fields that don't belong in the plugin manifest (now owned by `marketplace.json`).

**Before:**
```json
{
  "name": "pluginos",
  "displayName": "PluginOS for Figma",
  "version": "0.4.3",
  "description": "...",
  "author": { "name": "LSDimi", "url": "https://github.com/LSDimi/pluginos" },
  "repository": { "type": "git", "url": "https://github.com/LSDimi/pluginos" },
  "homepage": "https://github.com/LSDimi/pluginos#readme",
  "license": "MIT"
}
```

**After:**
```json
{
  "name": "pluginos",
  "version": "0.4.3",
  "description": "Token-efficient Figma automation via MCP. Bridges Claude to Figma without burning tokens on raw node dumps.",
  "author": { "name": "LSDimi", "url": "https://github.com/LSDimi/pluginos" },
  "repository": "https://github.com/LSDimi/pluginos",
  "homepage": "https://github.com/LSDimi/pluginos#readme",
  "license": "MIT"
}
```

Changes: remove `displayName`; convert `repository` from object to string.

### 3. Modify: `packages/claude-plugin/.mcp.json`

Replace the version-pinned arg with a floating reference. Matches the `npx -y pluginos` pattern documented elsewhere in the project and removes the drift surface against `plugin.json`.

**Before:**
```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos@0.4.0"]
    }
  }
}
```

**After:**
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

### 4. Modify: README.md (and any duplicated install docs)

Verify the install instructions match the now-real wiring:

```
/plugin marketplace add github:LSDimi/pluginos
/plugin install pluginos
```

Remove or correct any stale install guidance that referenced the broken path. Confirm by searching for `marketplace add` and `plugin install` across all `*.md` files in the repo.

---

## Verification

Manual checks; no automated tests required for this change.

1. **Validator passes.** Run `claude plugin validate .` from repo root. Expect 0 errors. The two errors flagged by Anthropic's Fin AI Agent (`repository: expected string`, `Unrecognized key: displayName`) should be gone.

2. **Local marketplace install works.**
   - `/plugin marketplace add file:///<absolute-path-to-repo>`
   - `/plugin install pluginos`
   - Confirm: PluginOS MCP server registers; `list_operations` returns the operations registry.

3. **GitHub source install works** (after merge to main).
   - `/plugin marketplace add github:LSDimi/pluginos`
   - `/plugin install pluginos`
   - Same confirmation as above.

4. **Anthropic marketplace listing.** Re-submit (or wait for re-sync). Track that the listing now appears in the curated marketplace, not just the submissions dashboard.

---

## Out of Scope

- Adding skills (e.g., `pluginos-figma`) into the marketplace listing's `plugins[].skills` field. Current scope is publication wiring only; skill exposure can be a follow-up.
- Restructuring the monorepo or moving `.claude-plugin/` files out of `packages/claude-plugin/`.
- Anything in the design-superpowers repo. The integration revision there is a separate spec, written after this change ships.
- Automated CI checks for plugin manifest validity. Useful but separate work.

---

## Rollback

All four changes are pure file edits. `git revert <commit>` fully restores the prior state. No migrations, no external state, no consumers depending on the new files yet.
