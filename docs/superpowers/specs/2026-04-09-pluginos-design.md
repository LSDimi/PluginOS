# PluginOS — Agent-Native Figma Operations Platform

## Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Problem

LLM agents interacting with Figma through `use_figma` consume 8,000-28,000 tokens per operation by sending raw Plugin API code through the LLM context and processing raw results. This is up to 300x more expensive than having a native plugin do the same work. The Figma Plugin API only runs inside the Figma client — there is no public REST endpoint for code execution. This creates a fundamental gap: agents cannot use Figma plugins without manual human intervention.

## Solution

**PluginOS** is two independent products that work together:

1. **PluginOS MCP Server** — A standalone npm package (`pluginos`) that any LLM agent connects to via MCP protocol. It routes operation requests and exposes structured tools. Shareable as an independent GitHub repo or embeddable in other projects.

2. **PluginOS Bridge Plugin** — A single Figma plugin installed once. It stores and executes all pre-built operations locally, communicates with the MCP server via WebSocket, and returns structured results. The plugin IS the universal runtime — no other plugins needed.

## Architecture

```
Agent (any LLM)
    │  MCP protocol (stdio/HTTP)
    ▼
PluginOS MCP Server (npm package)
    │  Exposes: list_operations, run_operation, execute_figma, get_status
    │  Embedded WebSocket server (port 9500-9510)
    │  Thin router — sends command name + params, receives results
    │
    │  WebSocket (localhost)
    ▼
PluginOS Bridge Plugin (Figma)
    ├── ui.html (iframe) — WebSocket client, auto-connects to MCP server
    └── code.js (sandbox) — Operation registry, figma.* executor, result serializer
```

### Execution Modes

**Fast Path (built-in operations):**
Agent → MCP: `run_operation("lint_styles", {scope: "page"})` (~80 tokens)
MCP → Plugin via WS: `{op: "lint_styles", params: {scope: "page"}}` (~100 bytes)
Plugin executes locally → returns structured results via WS
MCP → Agent: `{issues: 12, summary: "..."}` (~150 tokens)
**Total: ~230 LLM tokens**

**Fallback Path (custom/new operations):**
Agent → MCP: `execute_figma("const nodes = figma.currentPage.findAll(...)...")` (~500 tokens)
MCP → Plugin via WS: sends full script
Plugin eval()s script → returns results via WS
MCP → Agent: structured summary (~200 tokens)
**Total: ~700 LLM tokens**

**Comparison: Raw `use_figma` today: ~8,000-28,000 tokens**

## MCP Server Design

### Package Structure

```
pluginos/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── server.ts             # MCP server with tool definitions
│   ├── websocket.ts          # WebSocket server (embedded)
│   ├── connection-manager.ts # Multi-file tracking, reconnection
│   └── types.ts              # Shared types
├── bin/
│   └── pluginos.js           # CLI entry: npx pluginos
└── README.md
```

### MCP Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `list_operations` | List available operations, optionally by category | `{category?: string}` | Array of `{name, description, category, params_schema}` |
| `run_operation` | Execute a pre-built operation | `{name: string, params: object, file_key?: string}` | Structured results from the operation |
| `execute_figma` | Run arbitrary Plugin API code (fallback) | `{code: string, timeout?: number}` | Execution result |
| `get_status` | Check bridge plugin connection status | `{}` | `{connected: boolean, file_key?: string, file_name?: string}` |

### WebSocket Protocol

```typescript
// MCP Server → Plugin (run built-in operation)
{
  id: "req_1712345678",
  type: "run_operation",
  operation: "lint_styles",
  params: { scope: "page" }
}

// MCP Server → Plugin (execute raw code)
{
  id: "req_1712345679",
  type: "execute",
  code: "return figma.currentPage.findAll(n => n.type === 'TEXT').length",
  timeout: 5000
}

// Plugin → MCP Server (success response)
{
  id: "req_1712345678",
  type: "result",
  success: true,
  result: { issues: 12, details: [...] }
}

// Plugin → MCP Server (error response)
{
  id: "req_1712345678",
  type: "result",
  success: false,
  error: "Font not loaded: Inter Bold"
}

// Plugin → MCP Server (unsolicited status)
{
  type: "status",
  file_key: "abc123",
  file_name: "My Design",
  page: "Page 1"
}
```

## Bridge Plugin Design

### Plugin Structure

```
pluginos-bridge/
├── manifest.json
├── src/
│   ├── code.ts               # Plugin sandbox — operation router + eval executor
│   ├── ui.html               # Minimal iframe — WebSocket client + status display
│   ├── operations/
│   │   ├── index.ts           # Operation registry (name → handler map)
│   │   ├── lint.ts            # Linting & quality operations
│   │   ├── accessibility.ts   # Accessibility operations
│   │   ├── components.ts      # Component management operations
│   │   ├── tokens.ts          # Token & style operations
│   │   ├── layout.ts          # Layout & spacing operations
│   │   ├── content.ts         # Content population operations
│   │   ├── export.ts          # Export & code generation operations
│   │   ├── assets.ts          # Asset insertion operations
│   │   ├── annotations.ts     # Annotation & documentation operations
│   │   ├── colors.ts          # Color management operations
│   │   ├── typography.ts      # Typography operations
│   │   ├── cleanup.ts         # Cleanup & organization operations
│   │   └── data.ts            # Data visualization operations
│   └── utils/
│       ├── serializer.ts      # Safe result serialization (handles circular refs)
│       └── traversal.ts       # Shared node traversal helpers
├── package.json
├── tsconfig.json
└── webpack.config.js          # or esbuild config
```

### manifest.json

```json
{
  "name": "PluginOS Bridge",
  "id": "pluginos-bridge",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": [
      "ws://localhost:9500",
      "ws://localhost:9501",
      "ws://localhost:9502",
      "ws://localhost:9503",
      "ws://localhost:9504",
      "ws://localhost:9505",
      "ws://localhost:9506",
      "ws://localhost:9507",
      "ws://localhost:9508",
      "ws://localhost:9509",
      "ws://localhost:9510"
    ]
  },
  "permissions": ["teamlibrary"]
}
```

### Operation Registration Pattern

Each operation file exports operations following a standard interface:

```typescript
// types shared between MCP server and plugin
interface OperationManifest {
  name: string;
  description: string;
  category: OperationCategory;
  params: Record<string, ParamDef>;
  returns: string; // description of return shape
}

interface ParamDef {
  type: "string" | "number" | "boolean" | "string[]";
  required: boolean;
  description: string;
  default?: any;
}

type OperationCategory =
  | "lint"
  | "accessibility"
  | "components"
  | "tokens"
  | "layout"
  | "content"
  | "export"
  | "assets"
  | "annotations"
  | "colors"
  | "typography"
  | "cleanup"
  | "data"
  | "custom";

interface OperationHandler {
  manifest: OperationManifest;
  execute: (params: Record<string, any>) => Promise<any>;
}
```

### Data Flow: Plugin Internals

```
ui.html (iframe)                          code.js (sandbox)
┌────────────────────┐                   ┌────────────────────────┐
│ WebSocket client   │                   │ figma.ui.onmessage     │
│ connects to        │                   │                        │
│ localhost:9500-9510 │                   │ if type == "run_op":   │
│                    │                   │   look up registry     │
│ on WS message:     │                   │   execute handler      │
│   parse JSON       │   postMessage     │   serialize result     │
│   forward to ──────│──────────────────►│   postMessage back     │
│   code.js          │                   │                        │
│                    │   postMessage     │ if type == "execute":  │
│ on code.js msg: ◄──│◄─────────────────│   eval(wrapped code)   │
│   send via WS      │                   │   serialize result     │
│                    │                   │   postMessage back     │
└────────────────────┘                   └────────────────────────┘
```

## Operation Categories & Plugin Coverage

### Phase 1 (MVP) — 6 categories, ~20 operations

| Category | Operations | Covers Plugins Like |
|----------|-----------|-------------------|
| **lint** | `lint_styles`, `lint_naming`, `lint_detached`, `lint_spacing`, `lint_all` | Design Lint, Roller, Tone Lint |
| **accessibility** | `check_contrast`, `check_touch_targets`, `simulate_colorblind`, `wcag_audit` | Stark, Contrast, A11y, Polychrom |
| **components** | `find_instances`, `find_detached`, `swap_component`, `analyze_overrides` | Instance Finder, Master |
| **cleanup** | `remove_hidden`, `rename_layers`, `round_values`, `find_duplicates` | Clean Document, Rename It, Round All |
| **tokens** | `export_tokens`, `list_variables`, `audit_token_usage` | Tokens Studio, Design Tokens |
| **layout** | `audit_spacing`, `check_auto_layout`, `find_fixed_values` | Spacing Manager, Similayer |

### Phase 2 — 4 more categories, ~15 operations

| Category | Operations | Covers Plugins Like |
|----------|-----------|-------------------|
| **colors** | `extract_palette`, `generate_palette`, `find_non_style_colors` | Coolors, Image Palette |
| **typography** | `audit_text_styles`, `find_missing_fonts`, `generate_type_scale` | Typescales, Google Fonts |
| **annotations** | `add_measurements`, `generate_redlines`, `annotate_spacing` | EightShapes Specs, Redlines |
| **content** | `populate_lorem`, `populate_from_data`, `list_all_copy` | Content Reel, Lorem Ipsum |

### Phase 3 — Remaining categories, ~15 operations

| Category | Operations | Covers Plugins Like |
|----------|-----------|-------------------|
| **export** | `export_css`, `export_svg_optimized`, `export_html_structure` | Figma to Code, SVG Export |
| **assets** | `insert_icon`, `insert_placeholder_image` | Iconify, Unsplash |
| **data** | `create_chart`, `create_table`, `populate_from_json` | Charts, Table Creator |
| **custom** | (user-defined via `execute_figma` fallback) | Any plugin |

## Top Figma Plugins Mapped to Operations

| Plugin | Free/Paid | Category | PluginOS Operation(s) | Open Source |
|--------|-----------|----------|----------------------|-------------|
| **Design Lint** | Free | lint | `lint_styles`, `lint_naming`, `lint_all` | Yes — github.com/destefanis/design-lint |
| **Roller** | Free | lint | `lint_styles`, `lint_detached` | No |
| **SPELLL** | Freemium | content | `check_spelling` (Phase 3) | No |
| **Stark** | Freemium | accessibility | `check_contrast`, `wcag_audit`, `simulate_colorblind` | No |
| **A11y Contrast Checker** | Free | accessibility | `check_contrast` | No |
| **Contrast** | Free | accessibility | `check_contrast` | Yes — github.com/romannurik/Figma-Contrast |
| **Include (eBay)** | Free | annotations | `annotate_landmarks`, `annotate_focus_order` | Yes — github.com/eBay/figma-include-accessibility-annotations |
| **Polychrom** | Free | accessibility | `check_contrast_apca` | Yes — github.com/evilmartians/figma-polychrom |
| **Content Reel** | Free | content | `populate_lorem`, `populate_from_data` | No |
| **Iconify** | Free | assets | `insert_icon` | Yes — github.com/iconify/iconify-figma |
| **Unsplash** | Free | assets | `insert_placeholder_image` | No |
| **Tokens Studio** | Freemium | tokens | `export_tokens`, `list_variables`, `audit_token_usage` | Yes — github.com/tokens-studio/figma-plugin |
| **Batch Styler** | Paid | tokens | `batch_edit_styles` (Phase 2) | No |
| **Instance Finder** | Free | components | `find_instances` | No |
| **Master** | Paid | components | `swap_component`, `analyze_overrides` | No |
| **EightShapes Specs** | Freemium | annotations | `add_measurements`, `generate_redlines` | No |
| **Redlines** | Free | annotations | `add_measurements` | No |
| **Similayer** | Free | layout | `find_similar_layers` | No |
| **Round All** | Free | cleanup | `round_values` | No |
| **Clean Document** | Free | cleanup | `remove_hidden`, `find_duplicates` | No |
| **Rename It** | Free | cleanup | `rename_layers` | No |
| **Automator** | Freemium | cleanup | (multiple cleanup ops) | Partial |
| **Figma to Code** | Free | export | `export_css`, `export_html_structure` | Yes — github.com/bernaferrari/FigmaToCode |
| **Anima** | Paid ($39/mo) | export | `export_css`, `export_html_structure` | No (SDK only) |
| **Coolors** | Freemium | colors | `generate_palette` | No |
| **Image Palette** | Free | colors | `extract_palette` | No |
| **Typescales** | Free | typography | `generate_type_scale` | No |
| **Charts** | Freemium | data | `create_chart` | No |
| **Table Creator** | Free | data | `create_table` | No |
| **Spacing Manager** | Free | layout | `audit_spacing` | No |
| **LottieFiles** | Freemium | export | (animation export — Phase 3+) | No |
| **html.to.design** | Freemium | assets | (HTML import — Phase 3+) | No |
| **Autoflow** | Paid ($49) | annotations | `draw_flow_arrows` (Phase 3) | No |

## Authentication & Security

- **No Figma API token required** for the bridge plugin — it runs inside Figma with full Plugin API access
- **WebSocket binds to localhost only** — no external network exposure
- **Port scanning** (9500-9510 range) for multi-instance support
- **Origin verification** on WebSocket — only accept connections from Figma's origin or null (sandboxed iframe)
- **Request correlation** via unique IDs — prevents response mixing in multi-agent scenarios

## Token Economics Summary

| Scenario | LLM Tokens | Notes |
|----------|-----------|-------|
| Built-in operation (fast path) | ~230 | Command name + params + structured result |
| Custom operation (fallback) | ~700 | Full script + structured result |
| Raw `use_figma` (status quo) | ~8,000-28,000 | Full script through LLM context + raw results |
| **Savings vs status quo** | **35-120x** | |
