# Contributing to PluginOS

Thanks for your interest in contributing to PluginOS!

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- npm 9+
- A Figma account (for testing the bridge plugin)

## Setup

```bash
git clone https://github.com/LSDimi/PluginOS.git
cd PluginOS
npm install
npm run check   # lint, format, typecheck, build, test
```

## Development

```bash
npm run dev:server    # MCP server with hot reload
npm run dev:plugin    # Bridge plugin with webpack watch
```

### Monorepo Structure

- `packages/shared` — Shared types and protocol (build first)
- `packages/mcp-server` — Node.js MCP server (published as `pluginos` on npm)
- `packages/bridge-plugin` — Figma plugin (no tests, runs in Figma runtime)

### Build Order

Shared must be built before mcp-server:

```bash
npm run build:shared
npm run build
```

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run the full quality pipeline: `npm run check`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) format
5. Open a pull request against `main`

## Quality Gates

All of these run in CI and must pass:

- `npm run lint` — ESLint
- `npm run format:check` — Prettier
- `npm run typecheck` — TypeScript strict mode
- `npm run build` — All packages build
- `npm test` — Vitest test suite
- `npm audit --audit-level=high` — No high/critical vulnerabilities

## Adding a New Operation

1. Create a file in `packages/bridge-plugin/src/operations/`
2. Call `registerOperation({ manifest: {...}, execute: async (ctx) => {...} })`
3. Import the file in `operations/index.ts`
4. Rebuild the bridge plugin — agents discover it via `list_operations`

See `CLAUDE.md` for full architecture details.

## Reporting Issues

Use the [issue templates](https://github.com/LSDimi/PluginOS/issues/new/choose) for bug reports and feature requests.
