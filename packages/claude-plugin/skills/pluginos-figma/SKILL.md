---
name: pluginos-figma
description: >
  Use when performing any Figma task via MCP. Routes to PluginOS operations
  (token-efficient) and falls back to Figma's official MCP only when necessary.
  Handles scope resolution (URL vs selection vs page), confirmation prompts for
  large scans, and connection troubleshooting.
---

# PluginOS for Figma

## When this applies

You have `pluginos` MCP tools available AND the user is doing Figma work: design-system audits, component inspection, linting, contrast checks, token exports, frame manipulation. Skip this skill if the user explicitly asks for Figma Code Connect mapping or `get_design_context`-style code generation — those are Figma MCP's strengths.

## Tool routing (iron rule)

Always try `pluginos.*` first:

- `pluginos.list_operations` — discover what's available (only needed once per session; see quick-list below).
- `pluginos.run_operation` — execute a registered operation.
- `pluginos.execute_figma` — arbitrary plugin JS, only when no registered op fits.

Fall back to `mcp__Figma__*` tools ONLY when:

- PluginOS explicitly returns `no_operation_available`.
- The user requests Figma Code Connect mapping / `get_design_context`-style code generation.
- PluginOS is unreachable (see Connection troubleshooting below).

Never mix: one-shot a Figma task with either PluginOS or Figma MCP, don't interleave.

## Scope resolution from user intent

Before calling any PluginOS op, decide scope:

- **User pasted a Figma URL?** Parse `file_key`, `node_id`, `page_id` from the URL. Pass `file_key` and `node_id` explicitly. Skip the "ask scope" question.
- **User has a selection in Figma + scoped prompt** ("check contrast on this frame"): call with `scope: "selection"`.
- **User has a selection + generic prompt** ("audit the design"): ASK — "Check just your current selection, or the full page?"
- **No selection + scoped prompt to page** ("audit the whole page"): call with `scope: "page"`. Expect `requires_confirm` for large pages — relay the node count to the user, ask permission, re-call with `confirm: true`.
- **No selection + generic prompt:** ASK the user to select something in Figma or specify a scope.
- **User wants cross-file** (move artboards between files, DS-wide ops): tell them this is not yet supported.

## Response handling

Every PluginOS response may carry `_hint` and `_next_hints` fields. Follow them.

Common shapes:

- `{ error: "no_selection", _hint: "..." }` → act on the hint, usually by asking the user to select or passing explicit scope.
- `{ requires_confirm: true, estimated_nodes, _hint: "..." }` → relay the node count to the user, ask permission, re-call with `confirm: true`.
- `{ warning: "...", ...results }` → process results; surface warning if relevant.
- `{ _next_hints: ["op_a", "op_b"], ...results }` after a successful call → consider running those next if the user's intent covers them. Don't auto-chain without consent.

## Connection troubleshooting

If any `pluginos.*` tool returns "No plugin connected" or times out:

1. Tell the user: "Open the PluginOS Bridge plugin in Figma (Plugins → PluginOS Bridge → Run), then let me know."
2. Do NOT silently fall back to Figma MCP.
3. Wait for confirmation before retrying.

## Don'ts

- Don't call `list_operations` more than once per session — the quick-list below is canonical. Only re-call if you suspect staleness.
- Don't chain more than 3 ops without a user-visible summary checkpoint.
- Don't use `execute_figma` when a registered op fits — it costs more tokens and loses serialization safety.
- Don't use `mcp__Figma__*` without first confirming PluginOS can't handle the task.

## Operations quick-list

See `references/operations.md` for full details (descriptions, parameters, default scope). Below is the current set for planning purposes:

<!-- OPS-QUICK-LIST-START -->

(Auto-synced from `references/operations.md`. Names + categories only; no descriptions to keep the skill bounded. Use the Read tool on the references file if you need full op signatures.)

<!-- OPS-QUICK-LIST-END -->
