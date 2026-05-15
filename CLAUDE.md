# CLAUDE.md

Be concise. No preamble, no summaries.

## MCP Tool Preference

**When working with Figma, always use PluginOS tools exclusively.**

- Use `list_operations` (pluginos) first to discover available Figma operations.
- Use `run_operation` (pluginos) to execute them.
- Use `execute_figma` (pluginos) only for one-off custom logic not covered by built-in ops.
- **Do NOT use `mcp__Figma__*` tools** — these bypass the plugin and return raw, token-heavy data. PluginOS returns pre-summarized, structured results at ~230 tokens/call.
- If PluginOS returns "No plugin connected", instruct the user to open the PluginOS Bridge plugin in Figma before retrying.

### Scope defaults and hint protocol (v0.4+)

Audit/lint/check operations default to `scope: "selection"`. To scan the whole page, pass `scope: "page"`. Pages with 500+ nodes return `{ requires_confirm: true }` — re-invoke with `confirm: true` to proceed.

Responses may include `_hint` and `_next_hints`. Surface these when deciding what to do next.

## Build & Development Commands

```bash
npm install                                   # Install all workspaces
npm run check                                 # Full pipeline: lint -> format -> build:shared -> typecheck -> build -> test

# Build (shared must be built first — mcp-server depends on it)
npm run build:shared                          # shared -> dist/
npm run build -w packages/mcp-server          # tsup -> dist/
npm run build -w packages/bridge-plugin       # webpack -> dist/ (code.js, ui.html, bootloader.html)

# Quality gates (all enforced in CI)
npm run lint                                  # ESLint (TypeScript rules)
npm run format:check                          # Prettier check
npm run format                                # Prettier auto-fix
npm run typecheck                             # tsc --noEmit (shared + mcp-server)

# Development (hot reload)
npm run dev:server                            # MCP server with tsx watch
npm run dev:plugin                            # Bridge plugin webpack watch

# Tests (Vitest)
npm test                                      # All workspaces
npm test -w packages/mcp-server               # MCP server tests only
npm test -w packages/bridge-plugin            # Bridge plugin tests (UI tests run under happy-dom)
npm test -w packages/shared                   # Shared package tests only

# Claude plugin skill maintenance
npm run sync-ops -w packages/claude-plugin    # Regenerate ops reference from bridge-plugin registry

# Publishing (mcp-server only, published as "pluginos" on npm)
npm run release:patch
npm run release:minor
```

## Monorepo Packages

- **mcp-server** — Node.js MCP server (`npx pluginos`). 5 tools: `list_operations`, `run_operation`, `execute_figma`, `get_status`, `list_files`.
- **bridge-plugin** — Figma plugin. `code.ts` = figma.* API, `ui-entry.ts` = WebSocket <-> postMessage bridge.
- **shared** — TypeScript types and protocol definitions. Pure types, no runtime deps.
- **claude-plugin** — Claude Code plugin with `/pluginos-figma` skill. Skill budget: 1150 tokens (CI-enforced).

## Git Rules

- **Never push to `main` directly.** Always use feature branches.
- **Always use the `/commit` skill when committing.** Never write commit messages manually or add co-author lines. Invoke with `Skill(commit)`.
- Always create feature branches unless told otherwise. Never force-push; use rebase instead.
- Pre-push hook runs `npm run lint && npm run format:check`. Fix lint/format issues before pushing or the push will be rejected.

## Testing Rules

- **Never claim tests pass without actually running them and showing the output.**
- Always run `npm test` (or the workspace-scoped variant) and read the full output before making claims.
- Show complete logs — no `tail`, no `head`, no summarizing.

## Multi-file Changes

Always check ALL locations where a file or reference exists before declaring a task complete. Use grep/find to locate all instances. Docs and references exist in multiple packages that must stay in sync.

## Version Bumping

All 4 packages + DXT manifest + plugin.json must share the same version. CI enforces this via `check-version-lockstep.cjs`.

```bash
cd packages/mcp-server && npm version patch   # bumps mcp-server
node scripts/bump-lockstep.cjs                 # propagates to all other manifests
```

Never manually edit version fields — always use the bump script.

## CI Checks That Will Fail Your PR

Beyond lint/typecheck/test, CI also enforces:
- **Ops reference drift** — if you add/change operations, run `npm run sync-ops -w packages/claude-plugin` and commit the updated reference file.
- **Skill token budget** — `packages/claude-plugin/skills/pluginos-figma/SKILL.md` must stay under 1150 tokens.
- **Version lockstep** — all package versions must match (see Version Bumping above).

## Conventions

- **Build order matters**: always build `shared` first (`npm run build:shared`), then other packages. `mcp-server` imports from `shared`.
- TypeScript strict mode. Base config in `tsconfig.base.json` (ES2022, ESNext modules, bundler resolution). Bridge-plugin overrides to ES2015 with DOM lib + Figma typings.
- Operations self-register via `registerOperation()` in `bridge-plugin/src/operations/`. See `.claude/rules/adding-operations.md` for the full workflow.
- Target `settings.local.json` for local config changes, NOT `settings.json`.
