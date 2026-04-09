# PluginOS

Agent-native Figma operations platform. Run any Figma plugin operation from any LLM agent at ~230 tokens per call instead of ~28,000.

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

Tell your agent: "Check the contrast ratios in my design"

The agent calls `run_operation("check_contrast", {scope: "page"})` → the bridge plugin executes locally → returns structured results → agent sees a clean summary.

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
| `rename_layers` | cleanup | Batch rename layers |
| `remove_hidden` | cleanup | Remove hidden layers |
| `round_values` | cleanup | Round fractional values |
| `list_variables` | tokens | List all variables |
| `export_tokens` | tokens | Export tokens as JSON |
| `audit_spacing` | layout | Audit spacing values |

## Token Economics

| Action | Tokens |
|--------|--------|
| Any built-in operation | ~230 |
| Custom `execute_figma` | ~700 |
| Raw `use_figma` (status quo) | ~8,000-28,000 |

## Architecture

```
Agent ─── MCP protocol ──→ PluginOS MCP Server ─── WebSocket ──→ Bridge Plugin (Figma)
                           (thin router)                         (operations + figma.* access)
```

The MCP server sends only operation names + params (~100 bytes). All heavy computation happens inside the Figma plugin. Scripts never touch the LLM context.

## Adding Custom Operations

See `packages/bridge-plugin/src/operations/` for examples. Each operation exports a manifest + execute function. Register in `operations/index.ts`.

## License

MIT
