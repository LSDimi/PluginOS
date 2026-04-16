# Setup UX Redesign — Design Spec

**Date:** 2026-04-16  
**Status:** Approved

---

## Problem

The current disconnected-state UI in the PluginOS Bridge plugin has two issues:

1. **Wrong audience assumption.** Card 1 ("Get Claude Desktop") assumes users don't have an AI tool yet. In practice, anyone running PluginOS already has an AI agent — that's the product's entire context. The CTA is wasted space.

2. **Agent priority not addressed.** When users instruct agents to use PluginOS in a different project, agents default to Figma MCP instead. There's no mechanism that travels with the user across projects. The plugin is the ideal place to surface this fix since it's the natural setup touchpoint.

---

## Solution

Replace the two setup cards with two better-targeted cards:

- **Card 1 — Copy MCP config**: unchanged in function; renamed/reordered to be the primary CTA.
- **Card 2 — Copy setup prompt**: new. Copies a plain-language prompt the user pastes into any AI chat. The agent then starts the MCP server and writes PluginOS preference rules into the project's instruction file.

---

## Setup View Design

### Card 1 — Copy MCP config

| Property | Value |
|---|---|
| Icon | ⎘ |
| Title | Copy MCP config |
| Description | Paste into Claude Desktop, Claude Code, or Cursor settings |
| Action | Copies JSON block to clipboard; shows "✓ Copied!" for 2.5s then reverts |

JSON copied:
```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos@latest"]
    }
  }
}
```

### Card 2 — Copy setup prompt

| Property | Value |
|---|---|
| Icon | › |
| Title | Copy setup prompt |
| Description | Paste into any AI chat to configure PluginOS |
| Action | Copies prompt text to clipboard; shows "✓ Copied!" for 2.5s then reverts |

Prompt copied:
```
Start the PluginOS MCP server if it's not already running: `npx pluginos`

Then find this project's agent instructions file (CLAUDE.md, AGENTS.md, .cursorrules, or equivalent — create one if none exists) and add the following rules:

- For ALL Figma operations, use PluginOS tools exclusively (pluginos MCP)
- Call list_operations first to discover what operations are available
- Use run_operation to execute them
- Use execute_figma only for one-off custom logic not covered by built-in operations
- Never use mcp__Figma__* tools — they bypass the plugin and return raw, token-heavy data (~10x token cost)
- If PluginOS returns "No plugin connected", ask the user to open the PluginOS Bridge plugin in Figma first

Confirm once the server is running and the instruction file has been updated.
```

### Status line

Always-visible line below the cards (element `#error-msg`, class `status-line`):
- Default: `Searching for server…`
- After 3 failed attempts: `Still searching — make sure your MCP config is set up`
- On disconnect: `Connection lost. Reconnecting…`

Note: message changed from "make sure Claude Desktop is open" → "make sure your MCP config is set up" to be tool-agnostic.

---

## Connected View

No changes. The connected stats view (logo, file name, ops count, activity) remains as-is.

---

## Files Changed

### `packages/bridge-plugin/src/ui.html`

1. Replace Card 1 HTML: was "Get Claude Desktop" (download button) → "Copy MCP config"
2. Replace Card 2 HTML: was "Copy MCP config" → "Copy setup prompt"
3. Remove `openDownload()` JS function
4. Rename `copyConfig()` → keep for Card 1 (already implemented, no logic change)
5. Add `copyPrompt()` JS function for Card 2 (mirrors `copyConfig()` pattern, different text and target element `#prompt-desc`)

### `packages/bridge-plugin/src/code.ts`

1. Remove `open-url` message handler — no UI element sends this message anymore (YAGNI)

### `packages/bridge-plugin/src/ui-entry.ts`

1. Update escalating error message: `"Still searching — make sure your MCP config is set up"` (tool-agnostic copy)

---

## What Is Not Changing

- Connected view layout and stats
- `showError` / `hideError` null-guard pattern
- Disconnect message (`Connection lost. Reconnecting…`)
- MCP server tool descriptions (`server.ts`)
- `CLAUDE.md` preference rules
- Plugin dimensions (280×240)

---

## Non-Goals

- Tool-specific config paths (JSON is identical across all tools; no selector needed)
- Remote/hosted MCP URL option (PluginOS has no hosted server)
- Claude Code plugin packaging (separate effort, out of scope)
