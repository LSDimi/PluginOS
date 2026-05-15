---
paths:
  - "packages/bridge-plugin/src/operations/**"
---

# Adding a New Operation

1. Create file in `packages/bridge-plugin/src/operations/`
2. Call `registerOperation({ manifest: {...}, execute: async (ctx: OperationContext) => {...} })`
   - `ctx.nodes` — pre-resolved SceneNodes (respects `scope` param: `"selection"` or `"page"`)
   - `ctx.figma` — Figma API reference
   - `ctx.params` — raw operation params
   - `ctx.MAX_RESULTS` — standard result cap (200)
3. Import the file in `operations/index.ts`
4. Rebuild bridge-plugin — agent discovers it via `list_operations`
5. Regenerate the ops reference: `npm run sync-ops -w packages/claude-plugin`
