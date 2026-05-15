# @pluginos/bridge-plugin

The Figma plugin half of PluginOS. Connects to the local `pluginos` MCP server over WebSocket and exposes the Figma Plugin API to LLM agents.

**For installation, see [the root INSTALL.md](../../INSTALL.md).** This README is for contributors.

## Architecture

- `src/code.ts` — runs in Figma's plugin sandbox. Dispatches operations.
- `src/ui.html` + `src/ui-entry.ts` — runs in the plugin's iframe. Connects to the MCP server, shows status UI.
- `src/bootloader.html` — lightweight setup-state shell. Loaded first; fetches the richer `ui.html` from the MCP server's HTTP endpoint when the server is up.
- `src/ui/*.ts` — focused modules used by `ui-entry.ts` (theme, storage, agent picker, version check, activity log, strings).
- `src/ui/{tokens,icons}.cjs` — shared CSS tokens and inline SVG symbols injected into both HTML templates at webpack build time.
- `src/operations/*` — operation handlers that run inside the plugin sandbox.

## Build

```bash
npm run build       # webpack production build → dist/
npm run dev         # webpack watch mode
npm run package     # bundles pre-built dist into pluginos-bridge-v<X.Y.Z>.zip (run build first)
```

## Tests

```bash
npm test
```

UI tests run under `happy-dom` (mapped via `environmentMatchGlobs` in `vitest.config.ts`). Non-UI tests run under `node`.

## Adding a new operation

See `src/operations/registry.ts`. Operations self-register via `registerOperation` and are imported in `operations/index.ts`.
