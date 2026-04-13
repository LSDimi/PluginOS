# Figma Community Listing — PluginOS Bridge

---

## Plugin Name

PluginOS Bridge

---

## Tagline

Agent-native Figma ops — 28 operations via MCP

---

## Description

**PluginOS Bridge** connects Figma to any LLM agent (Claude, GPT-4, Cursor, custom agents) through the Model Context Protocol (MCP). It turns Figma into a fully programmable environment — agents can read, write, lint, and transform your designs without a human in the loop.

### How it works — 3 steps

1. **Add the MCP config** — point your agent tool (Claude Desktop, Cursor, etc.) to the `pluginos` MCP server (`npx pluginos@latest`). One JSON snippet in your config file.
2. **Run the plugin** — open PluginOS Bridge inside Figma. It starts a local WebSocket connection and waits for commands.
3. **Your agent can now work** — call any of the 28 built-in operations from your chat or automation. The agent talks to the MCP server; the server relays commands to Figma through the bridge.

No iframes. No manual copy-paste. No round-trips through a screenshot pipeline.

---

### 28 built-in operations across 10 categories

| Category          | What agents can do                                               |
| ----------------- | ---------------------------------------------------------------- |
| **Lint**          | Detect detached styles, missing components, inconsistent spacing |
| **Accessibility** | Check contrast ratios, flag missing labels, audit touch targets  |
| **Components**    | List, swap, detach, and sync component instances                 |
| **Cleanup**       | Remove hidden layers, flatten groups, delete empty frames        |
| **Tokens**        | Read and write color, spacing, and typography tokens             |
| **Layout**        | Inspect and apply auto-layout, padding, gap, and alignment       |
| **Colors**        | Extract palettes, replace fills, audit color usage               |
| **Typography**    | Audit text styles, normalize fonts, extract type scales          |
| **Content**       | Read and write text content on any layer                         |
| **Export**        | Export frames and components as PNG, SVG, or PDF                 |

---

### execute_figma — arbitrary code fallback

For anything outside the 28 built-in operations, the `execute_figma` MCP tool lets an agent send raw Figma Plugin API code to run inside the sandbox. This gives agents full, unrestricted access to the Figma API without requiring a plugin update.

---

### Built for agent-native workflows

PluginOS is designed to minimize LLM token usage. Each operation call costs ~230 tokens. The MCP server exposes 5 clean tools: `run_operation`, `execute_figma`, `list_operations`, `list_files`, and `get_status`. Agents get structured JSON back — no screenshots, no vision models required.

---

### Links

- GitHub & full documentation: https://github.com/LSDimi/PluginOS
- npm package: `npx pluginos@latest`

---

## Tags

mcp, agent, ai, design-system, lint, accessibility, tokens, css, cleanup

---

## Category

Development
