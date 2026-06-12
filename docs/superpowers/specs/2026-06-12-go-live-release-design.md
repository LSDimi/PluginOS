# PluginOS 0.5.0 Go-Live Release — Design Spec

**Date:** 2026-06-12
**Status:** Approved (Approach A — publish, then verify against published artifacts)
**Goal:** Public announcement on LinkedIn (Dimi + Alex) **today**, with the onboarding story as the headline: install on all four ends (Claude Desktop, Claude Code, Cursor, Figma) simply, working on the first go.

---

## Context and key findings

### The "old UI" mystery is solved — no code defect

The stale UI the user saw in Figma had two compounding causes, both artifacts of the dev environment:

1. **Stale local install.** The last `pluginos install` into `~/.pluginos/bridge/` ran while the repo was on `feat/pr-c-install-polish` (during the manifest-path fix). That branch predates PR-A2's theme work. Rebuilding on `release/0.5.0` produces a `ui.html` with 45 `figma-color` token references (the stale build had 0). **D1 from `2026-06-08-pr-a2-smoke-defects.md` is withdrawn.**
2. **The bootloader serves whatever the running MCP server has.** The bridge plugin's bootloader fetches `ui.html` over HTTP from the running server. The Claude marketplace plugin launches `npx -y pluginos` → the published npm **0.4.3** → which serves its own month-old bundled UI. Local builds can never reach the plugin pane through that path. **New UI reaches users only via npm publish.** D2 (ops count 26) is almost certainly the same staleness; verified in pre-flight below.

### Distribution map (what flows from where)

| Surface | Source of truth | Update mechanism |
|---|---|---|
| MCP server + served `ui.html` | npm package `pluginos` | `npm publish` (0.5.0) |
| Bridge plugin files (`code.js`, bootloader, manifest) | `~/.pluginos/bridge/` via `pluginos install` | npm publish (bundled in tarball) |
| Claude Desktop one-click | `pluginos.dxt` on GitHub release | Release asset at `releases/latest/download/pluginos.dxt` (pinned by `constants.json` `DXT_URL`) |
| Manual Figma sharing | `pluginos-bridge-v<version>.zip` on GitHub release | Release asset (Figma Community rejected the plugin; manual import is the documented path) |
| Claude Code skill + ops reference | `packages/claude-plugin` on `main` | Anthropic marketplace sync from GitHub (verify/resubmit via dashboard) |
| Cursor / generic agents | `npx -y pluginos` snippet | npm publish |

Everything funnels through **merge → bump → npm publish → GitHub release**.

## Decisions made

1. **Approach A:** publish first, then run the validation gate against the *published* artifacts. Rationale: every recent escape (tsup chunk paths, flat manifest, version reading) lived in the local-vs-packaged gap; testing the published artifact is the only test that counts. Pre-announcement, npm is effectively private — a blocker becomes a quiet 0.5.1.
2. **One 5-minute pre-publish sanity check** (local server) to kill the residual D2 uncertainty before stamping 0.5.0.
3. **PR #36 merges now; Alex reviews post-merge.** Findings become 0.5.x patches.
4. **Quality gate: compressed onboarding test (~30 min)** from `2026-06-08-onboarding-test-plan.md` (Phases 0, 1, 2, 3, 4, 7a, 7b + quick Phase 8 scoring).
5. **Announcement drafts are in scope** (LinkedIn + short variant); Dimi and Alex edit voice and post.
6. **Out of scope today:** Figma Community resubmission, the full 9-phase onboarding battery, Windsurf/other agent flows, runtime error translation, Bootstrap 5 token preset.

## The plan

### Phase 1 — Pre-flight sanity (~5 min, Dimi in Figma)

- Kill the leaked `mock-server.ts` test fixture process (port hygiene; it survived the takeover tests).
- `pluginos install` from the fresh `release/0.5.0` build (already rebuilt and verified: 45 theme tokens present).
- Dimi: relaunch PluginOS Bridge in Figma against the **local** server; confirm (a) theme follows the Figma editor (toggle light/dark), (b) the operations count matches the source registry (expected ~37, not 26).
- **Gate:** if either fails here, it's a real code defect — stop, debug before any publish.

### Phase 2 — Merge and repo hygiene (~20 min, Claude)

- Merge PR #36 (squash vs merge-commit: merge-commit, to preserve the four workstreams' provenance).
- Check Dependabot: the sweep carries vitest `>=4.1.8` overrides — verify whether the 5 critical alerts clear on main after merge. Merge the hono patch PR (#32) if CI is green (runtime dep, patch-level). Close the stale vitest-3 PR (#35) — the repo is on vitest 4.
- README sync: fix "Available Operations (26)" to the real count; verify install instructions reference 0.5.0 behavior (`pluginos install`, DXT link). `DXT_URL` already points at `releases/latest/download/pluginos.dxt` — naming of release assets below must match exactly.
- Run `npm run sync-ops -w packages/claude-plugin` if the ops reference drifted (CI enforces).

### Phase 3 — Version bump and publish (~20 min, Claude + Dimi's npm auth)

- `npm version minor -w packages/mcp-server` → 0.5.0, then `node scripts/bump-lockstep.cjs` (all 4 packages + DXT manifest + plugin.json; CI-enforced lockstep).
- Rebuild all (`build:shared` → bridge-plugin → mcp-server), `npm run check` — full pipeline must be green.
- `npm publish` from `packages/mcp-server` (the `release:minor` script does version+publish together — since we bump separately for lockstep, publish directly; Dimi must be logged in to npm).
- GitHub release `v0.5.0` with assets, names exactly as the docs reference them:
  - `pluginos.dxt` (Claude Desktop one-click; `DXT_URL` resolves via `releases/latest`)
  - `pluginos-bridge-v0.5.0.zip` (manual Figma import path)
- Release notes: condensed from PR #36's description.

### Phase 4 — Marketplace verification (~10 min, Dimi)

- Anthropic plugin dashboard: confirm the listing syncs `main` at 0.5.0; resubmit if the sync is manual. (Claude has no dashboard access.)
- The marketplace plugin's `.mcp.json` runs unpinned `npx -y pluginos`, so the server side updates automatically once npm has 0.5.0.

### Phase 5 — Validation gate: compressed onboarding (~30 min, Dimi drives GUI, Claude watches)

Run from `2026-06-08-onboarding-test-plan.md`:
- Phase 0 full reset (Connectors, `~/.pluginos`, Figma dev plugin, ports)
- Phase 1 README cold-read (incognito)
- Phase 2 Claude Desktop via the **published** DXT (download from the real release URL)
- Phase 3 Figma bridge + first frame (target: under 90 s)
- Phase 4 Setup view stands alone (all three cards, copy buttons)
- Phase 7a (pane closed mid-conversation) + 7b (multi-session orphan reap — the "no port conflicts" promise)
- Quick Phase 8 scoring

**Fix-forward policy:** any blocker → fix on `main`, `npm version patch` + lockstep, republish as 0.5.1, re-run only the failed step. No rollbacks; nobody is watching npm pre-announcement.

### Phase 6 — Announcement (~15 min)

- Claude drafts: LinkedIn post (onboarding-first story: "one command, four tools, no port juggling"; token-economics as the technical hook; link to repo) + a short X/Mastodon variant.
- Dimi and Alex edit voice, post, and notify Alex that post-merge review of #36 is open.

## Error handling

- **Pre-flight fails (Phase 1):** real defect → systematic-debugging before anything publishes. The release waits.
- **`npm run check` fails after bump (Phase 3):** fix before publish; the bump commit stays local until green.
- **Published artifact broken (Phase 5):** fix-forward as 0.5.1 (see policy above). The announcement waits for a green gate — never announce on a known-broken funnel.
- **Marketplace sync lags (Phase 4):** not a blocker — the npm side carries the server; note it in the announcement timing if the Claude Code path is degraded.

## Testing

The validation IS the test (Phase 1 sanity + Phase 5 compressed onboarding). CI covers the code-level regression surface (229 tests, lint, lockstep, skill budget, ops drift).

## References

- Sweep state: `docs/superpowers/handoffs/2026-06-05-pr-sweep-handoff.md`
- Defects (D1 withdrawn, D2 expected-stale): `docs/superpowers/handoffs/2026-06-08-pr-a2-smoke-defects.md`
- Onboarding test plan: `docs/superpowers/handoffs/2026-06-08-onboarding-test-plan.md`
- Consolidated PR: https://github.com/LSDimi/PluginOS/pull/36
