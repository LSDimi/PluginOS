# PluginOS

Agent-native Figma operations platform. Run any Figma plugin operation from any LLM agent at **~230 tokens per call** instead of ~28,000.

## Why PluginOS

Traditional Figma MCP integrations register dozens of tools — each with a full JSON schema the LLM must read on every conversation turn. For a server with 80+ tools, that's **~12,000 tokens of overhead before the agent even does anything.**

PluginOS takes a fundamentally different approach:

- **5 MCP tools, unlimited operations.** The server is a thin router. Operations are discovered dynamically, not hardcoded as tool schemas. Your agent's context stays clean.
- **15x cheaper per workflow.** A complex multi-step task (audit, fix, rename, export) costs ~6,600 tokens with PluginOS vs ~105,000 with traditional approaches. That's 94% savings that compound across users and sessions.
- **Pre-summarized results.** Operations return structured summaries ("Checked 12 text nodes. 10 pass WCAG AA, 2 fail."), not raw node dumps. Agents reason better with less noise.
- **Extensible by design.** Add custom operations as simple manifest + execute pairs. Drop them in, register, done — no server changes needed.
- **Embeddable.** 5 tools integrate cleanly into any agent. No namespace pollution, no config bloat.

## Quick Start

### 1. Add PluginOS to your MCP config

**Claude Code (`~/.claude.json`):**
```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos"]
    }
  }
}
```

**Cursor (`.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["pluginos"]
    }
  }
}
```

### 2. Install the Bridge Plugin in Figma

1. Open Figma Desktop
2. Right-click canvas → Plugins → Development → Import plugin from manifest
3. Select `packages/bridge-plugin/manifest.json`
4. Run the plugin — it auto-connects to the MCP server

### 3. Use it

Tell your agent:

> "Check the contrast ratios in my design"

The agent calls `run_operation("check_contrast", {scope: "page"})` → the bridge plugin executes locally → returns structured results → agent sees a clean summary. ~230 tokens, done.

> "Rename all instances by removing version numbers from their names"

The agent calls `execute_figma` with a short script → plugin runs it with full `figma.*` access → returns a summary. ~700 tokens for arbitrary custom logic.

## How It Works

```
Agent ─── MCP (stdio) ──→ PluginOS Server ─── WebSocket ──→ Bridge Plugin ──→ Figma
          5 tools            thin router         localhost       28 operations     full API
          ~600 tokens        sends names +       ports 9500-     executes locally  figma.*
          per turn           params only         9510            returns summaries
```

**Two execution paths:**

| Path | When | Token cost | How |
|------|------|-----------|-----|
| **Fast** | Built-in operation exists | ~230 tokens | `run_operation("check_contrast", {scope: "page"})` |
| **Fallback** | Custom/one-off logic needed | ~700 tokens | `execute_figma("return figma.currentPage.findAll().length")` |

Scripts travel over WebSocket (free) — they never enter the LLM context.

## Available Operations

| Operation | Category | Description |
|-----------|----------|-------------|
| `lint_styles` | lint | Find layers without styles |
| `lint_detached` | lint | Find detached instances |
| `lint_naming` | lint | Find default-named layers |
| `check_contrast` | accessibility | WCAG contrast audit |
| `check_touch_targets` | accessibility | Touch target size check |
| `find_instances` | components | Find component instances |
| `analyze_overrides` | components | Report instance overrides |
| `create_frame` | components | Create frames with auto-layout |
| `clone_node` | components | Clone and reposition nodes |
| `rename_layers` | cleanup | Batch rename layers |
| `remove_hidden` | cleanup | Remove hidden layers |
| `round_values` | cleanup | Round fractional values |
| `delete_node` | cleanup | Delete nodes by ID |
| `list_variables` | tokens | List all variables |
| `export_tokens` | tokens | Export tokens as JSON |
| `audit_spacing` | layout | Audit spacing values |
| `move_node` | layout | Move nodes to new positions |
| `resize_node` | layout | Resize nodes |
| `set_fills` | colors | Set fill colors on nodes |
| `extract_palette` | colors | Extract unique colors with counts |
| `find_non_style_colors` | colors | Find hardcoded (unstyled) colors |
| `audit_text_styles` | typography | Audit font/size/weight consistency |
| `list_fonts` | typography | List all fonts with usage counts |
| `set_text` | content | Set text content on nodes |
| `populate_text` | content | Fill text with lorem or custom text |
| `extract_css` | export | Extract CSS properties from nodes |

## Token Economics

| Scenario | Traditional MCP | PluginOS | Savings |
|----------|----------------|----------|---------|
| Tool schema overhead (per turn) | ~12,000 tokens | ~650 tokens | 95% |
| Single operation call | ~1,500 tokens | ~230 tokens | 85% |
| Complex workflow (8 steps) | ~105,000 tokens | ~6,600 tokens | 94% |
| 10 users × 5 runs/day × 30 days | ~157M tokens | ~10M tokens | 94% |

## Adding Custom Operations

Create a file in `packages/bridge-plugin/src/operations/`:

```typescript
import { registerOperation } from "./registry";

registerOperation({
  manifest: {
    name: "my_operation",
    description: "What it does",
    category: "custom",
    params: {
      scope: { type: "string", required: false, description: "'page' or 'selection'" },
    },
    returns: "{ result, summary }",
  },
  async execute(params) {
    // Full figma.* API access here
    const nodes = figma.currentPage.findAll();
    return { result: nodes.length, summary: `Found ${nodes.length} nodes.` };
  },
});
```

Register it in `operations/index.ts` and rebuild. The agent discovers it automatically via `list_operations`.

## Architecture

```
packages/
  shared/          Types, protocol messages, categories
  mcp-server/      MCP server (stdio) + WebSocket server
  bridge-plugin/   Figma plugin (webpack → code.js + ui.html)
```

- **Monorepo** with npm workspaces
- **MCP protocol** over stdio (server ↔ agent)
- **WebSocket** on localhost:9500-9510 (server ↔ plugin)
- **Port scanning** — plugin auto-discovers the server
- **Request correlation** — unique IDs match responses to commands

## Development

```bash
npm install
npm run dev:server    # MCP server with hot reload
npm run dev:plugin    # Webpack watch for bridge plugin
npm test              # 22 tests across all packages
```

## License

MIT
