# PluginOS 0.5.0 Go-Live Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PluginOS 0.5.0 to npm + GitHub release, validate the full onboarding funnel against published artifacts, and hand Dimi + Alex announcement drafts — today.

**Architecture:** This is a release runbook, not a feature build. Approach A from the approved spec ([2026-06-12-go-live-release-design.md](../specs/2026-06-12-go-live-release-design.md)): bump on the release branch → merge PR #36 → publish → validate the published thing → announce. Sequencing refinement vs the spec: the version bump happens **on `release/0.5.0` before merging #36**, so `main` receives 0.5.0 via the PR merge and we never push to `main` directly (hard git rule).

**Tech Stack:** npm workspaces, `bump-lockstep.cjs`, `gh` CLI, npm registry, GitHub releases.

**Hard rules carried from CLAUDE.md:** never push `main` directly; all commits via `Skill(commit)`; never claim a test passed without showing its output; no `#` comments inside shell blocks.

**Known blockers to clear along the way:**
- `npm whoami` currently returns **E401** — Dimi must `npm login` before Task 7.
- Authoritative ops count is unresolved (reference says 28, stale UI said 26) — Task 2 settles it; README is corrected in Task 3 only if it differs from truth.

---

### Task 1: Pre-flight cleanup + fresh local install

**Files:** none modified (environment only)

- [ ] **Step 1: Kill the leaked test fixture and stale servers**

```bash
pkill -f "mock-server.ts"; pkill -f "bin/pluginos.js"; sleep 1; pgrep -fl "mock-server.ts|bin/pluginos.js" || echo "clean ✓"
```

Expected: `clean ✓`

- [ ] **Step 2: Confirm we're on release/0.5.0 with a current build**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git branch --show-current && npm run build:shared && npm run build -w packages/bridge-plugin && npm run build -w packages/mcp-server
```

Expected: `release/0.5.0`, three successful builds, `[bundle-bridge] copied 4 files`.

- [ ] **Step 3: Install fresh bridge and verify theme tokens landed**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js install && grep -c "figma-color" ~/.pluginos/bridge/ui.html && grep -E '"main"|"ui"' ~/.pluginos/bridge/manifest.json
```

Expected: install success message, token count **≥ 40** (was 0 in the stale build), `"main": "code.js"` and `"ui": "bootloader.html"` (flat paths).

---

### Task 2: USER CHECKPOINT — Figma sanity gate (Dimi, ~5 min)

**Files:** none. **This gates everything; do not proceed on failure.**

- [ ] **Step 1 (Dimi): Start the local server and relaunch the plugin**

Dimi: quit any Claude session that auto-spawns `npx pluginos` (it would serve the old npm UI to the bootloader). Then paste as-is:

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js
```

Leave it running. In Figma: **Plugins → Development → PluginOS Bridge**.

- [ ] **Step 2 (Dimi): Verify the two signals**

1. Toggle Figma editor light ↔ dark (Figma menu → Preferences → Theme). Plugin UI must follow instantly.
2. Note the exact number in the "Operations (N)" disclosure. Report N back.

- [ ] **Step 3: Record the verdict**

- Theme follows: PASS required. If FAIL → stop, invoke superpowers:systematic-debugging; the release waits.
- N becomes the authoritative ops count for Task 3. (Expected 26–28; the operations reference table has 28 rows.)

---

### Task 3: Docs truth sync on the release branch

**Files:**
- Modify: `README.md:116` (ops count heading, only if N ≠ 26)
- Possibly regenerated: `packages/claude-plugin/skills/pluginos-figma/references/operations.md`

- [ ] **Step 1: Regenerate the ops reference and check for drift**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run sync-ops -w packages/claude-plugin && git diff --stat
```

Expected: no diff (CI was green) — or a regenerated reference if drift existed.

- [ ] **Step 2: Fix the README ops count if N from Task 2 differs from 26**

Edit `README.md` line 116: `## Available Operations (26)` → `## Available Operations (<N>)`. Also update the row content below it if sync-ops revealed missing ops.

- [ ] **Step 3: Verify the release-critical links are correct (read-only check)**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && cat packages/bridge-plugin/src/constants.json && grep -n "releases/latest" README.md INSTALL.md
```

Expected: `DXT_URL` = `https://github.com/LSDimi/pluginos/releases/latest/download/pluginos.dxt`; README/INSTALL reference `releases/latest` and `pluginos-bridge-v<version>.zip` — these names dictate Task 8's asset names exactly.

- [ ] **Step 4: Commit (only if Steps 1–2 changed files)**

Use `Skill(commit)` with the changed files. Message shape: `docs: sync ops count to <N> for 0.5.0 release`.

---

### Task 4: Version bump 0.5.0 + full check on the release branch

**Files:**
- Modify (via scripts, never by hand): all 4 `package.json`, DXT manifest, `plugin.json`, lockfile

- [ ] **Step 1: Bump minor + propagate lockstep**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm version minor -w packages/mcp-server && node scripts/bump-lockstep.cjs && grep -h '"version"' packages/*/package.json
```

Expected: four lines all `"version": "0.5.0"`.

- [ ] **Step 2: Rebuild everything on the new version**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run build:shared && npm run build -w packages/bridge-plugin && npm run build -w packages/mcp-server
```

Expected: clean builds; bundle-bridge copies 4 files.

- [ ] **Step 3: Full pipeline gate — show complete output**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run check
```

Expected: lint 0 errors, prettier clean, typecheck clean, all workspace tests pass (was 229 tests). Paste the full tail of output in the transcript — no claiming, only showing.

- [ ] **Step 4: Commit the bump**

Use `Skill(commit)` staging every file the bump scripts touched (`git status -s` to enumerate: package.jsons, lockfile, DXT manifest, plugin.json). Message shape: `chore(release): bump lockstep to 0.5.0`.

- [ ] **Step 5: Push and confirm PR #36 CI goes green**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git push origin release/0.5.0 && sleep 60 && gh pr checks 36
```

Expected: all 5 checks pass (including version-lockstep). If lockstep check fails, a manifest was missed — `git status`, fix via the bump script only.

---

### Task 5: Merge PR #36

**Files:** none local; GitHub state.

- [ ] **Step 1: Merge with a merge commit (preserves the four workstreams)**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh pr merge 36 --merge --subject "PluginOS 0.5.0: TYPO3 Bootstrap feedback sweep (#36)"
```

Expected: merged. Do NOT delete `release/0.5.0` yet (validation may need patches; cleanup in Task 12).

- [ ] **Step 2: Sync local main and verify it's the merged state**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git checkout main && git pull origin main && grep '"version"' packages/mcp-server/package.json && git log --oneline -3
```

Expected: `0.5.0`, merge commit at HEAD.

- [ ] **Step 3: Wait for main CI to pass**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh run list --branch main --limit 3
```

Expected: latest run completes green. If red on main → fix forward immediately on a branch + fast PR; the release blocks until green.

---

### Task 6: Dependabot hygiene

**Files:** none local; GitHub state.

- [ ] **Step 1: Count open critical alerts post-merge**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh api "repos/LSDimi/PluginOS/dependabot/alerts?state=open&severity=critical" --jq 'length'
```

Expected: fewer than 5 (the sweep's vitest `>=4.1.8` overrides should clear most). Record the number for the announcement-readiness judgment; 0 is ideal.

- [ ] **Step 2: Merge the hono patch if its CI is green**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh pr checks 32 && gh pr merge 32 --squash
```

Expected: checks pass then merged. If checks fail because the PR is stale against the new main, comment `@dependabot rebase` instead and move on — not a release blocker.

- [ ] **Step 3: Close the stale vitest-3 PR**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh pr close 35 --comment "Repo moved to vitest ^4.1.8 via the 0.5.0 sweep (security overrides included) — this 2→3 bump is obsolete."
```

Expected: closed.

---

### Task 7: npm publish (needs Dimi's login)

**Files:** none local; npm registry state.

- [ ] **Step 1 (Dimi): Restore npm auth**

`npm whoami` currently returns E401. Dimi, paste as-is (global, no cd needed):

```bash
npm login
```

Then verify (paste as-is):

```bash
npm whoami
```

Expected: your npm username.

- [ ] **Step 2: Publish from main**

`prepublishOnly` chains `npm run build && npm run build:dxt` automatically.

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS/packages/mcp-server" && npm publish --access public
```

Expected: `+ pluginos@0.5.0`.

- [ ] **Step 3: Verify the registry serves 0.5.0**

```bash
npm view pluginos version
```

Expected: `0.5.0`.

---

### Task 8: GitHub release v0.5.0 with both assets

**Files:**
- Create (transient): `/tmp/pluginos-bridge-v0.5.0.zip`

- [ ] **Step 1: Confirm the DXT was rebuilt at 0.5.0 by prepublishOnly**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && ls -la packages/mcp-server/dist/pluginos.dxt && unzip -p packages/mcp-server/dist/pluginos.dxt manifest.json | grep '"version"'
```

Expected: file exists with today's timestamp, manifest version `0.5.0`. If the unzip path differs (DXT layout), fall back to checking the mtime is after Task 7 Step 2.

- [ ] **Step 2: Zip the bridge (flat files, exactly what Figma imports)**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS/packages/mcp-server/dist/bridge" && zip -j /tmp/pluginos-bridge-v0.5.0.zip manifest.json code.js ui.html bootloader.html && unzip -l /tmp/pluginos-bridge-v0.5.0.zip
```

Expected: 4 files in the zip listing.

- [ ] **Step 3: Create the release (tags main HEAD as v0.5.0)**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh release create v0.5.0 packages/mcp-server/dist/pluginos.dxt /tmp/pluginos-bridge-v0.5.0.zip --target main --title "PluginOS 0.5.0 — singleton connections, quality helpers, UI polish, one-command install" --notes "Highlights: singleton server with cross-session takeover and \`wait_for_reconnect\`; 5 PluginOS.* sandbox helpers + 7-rule pre-flight linter; bridge UI tracks the Figma editor theme with a full state-machine refactor; \`pluginos install\` one-command setup with --with-agent cursor|generic. Full details in #36."
```

Expected: release URL printed.

- [ ] **Step 4: Verify the two URLs the docs promise actually resolve**

```bash
curl -sIL "https://github.com/LSDimi/pluginos/releases/latest/download/pluginos.dxt" -o /dev/null -w "%{http_code}\n" && curl -sIL "https://github.com/LSDimi/PluginOS/releases/download/v0.5.0/pluginos-bridge-v0.5.0.zip" -o /dev/null -w "%{http_code}\n"
```

Expected: `200` twice. The first URL is hardcoded in the bootloader's Download button (`DXT_URL`) — it MUST resolve.

---

### Task 9: USER — marketplace dashboard check (Dimi, ~10 min)

- [ ] **Step 1 (Dimi):** Open the Anthropic plugin submissions dashboard; confirm the pluginos listing syncs `main` (now 0.5.0 with the trimmed skill + ops reference). Resubmit/trigger sync if it's manual. Report status back.
- [ ] **Step 2:** Non-blocker per spec: the server side updates regardless via unpinned `npx -y pluginos`. If sync lags, note it and continue.

---

### Task 10: Validation gate — compressed onboarding against published artifacts (both, ~30 min)

**Files:**
- Create: `docs/superpowers/handoffs/2026-06-12-onboarding-findings.md` (scores + defects)

Run from [2026-06-08-onboarding-test-plan.md](../handoffs/2026-06-08-onboarding-test-plan.md), compressed order. Dimi drives all GUI steps; Claude executes shell steps and records results.

- [ ] **Step 1: Phase 0 reset — plus the npx cache (critical for Approach A)**

Follow test-plan Phase 0 (Connectors removal, Figma dev-plugin removal, Cursor entry). The shell part, paste as-is (destructive only to caches/state, recreated on demand):

```bash
rm -rf ~/.pluginos ~/.npm/_npx && pkill -f "bin/pluginos.js"; pgrep -fl pluginos || echo "reset ✓"
```

Without clearing `~/.npm/_npx`, `npx -y pluginos` can serve a cached 0.4.3 and invalidate the whole gate.

- [ ] **Step 2: Phase 1 — README cold-read (Dimi, incognito), answer Q1.1–Q1.5**
- [ ] **Step 3: Phase 2 — Claude Desktop via the published DXT** (download from the release URL, not local). Target: tools listed in under 90 s of clicking download. Answer Q2.1–Q2.4.
- [ ] **Step 4: Phase 3 — Figma bridge + first frame.** `npx pluginos install` (published package!), import manifest, run plugin, create a frame from Claude. Target under 90 s. Answer Q3.1–Q3.5 — Q3.3 (theme) is the headline check.
- [ ] **Step 5: Phase 4 — Setup view stands alone.** All three cards, copy buttons give "✓ Copied", DXT download link resolves. Answer Q4.1–Q4.7.
- [ ] **Step 6: Phase 7a + 7b recovery flows.** Pane-close mid-conversation (error must be actionable) and the two-session orphan takeover (the "no port conflicts" promise). Answer Q7a/Q7b.
- [ ] **Step 7: Record Phase 8 scores + any defects in `docs/superpowers/handoffs/2026-06-12-onboarding-findings.md`, force-add, commit via `Skill(commit)` on a branch (NOT main — e.g. `docs/onboarding-findings`), open a small PR.**
- [ ] **Step 8: Verdict.** Any blocker → fix-forward loop: fix on a branch → PR → merge → `npm version patch -w packages/mcp-server` + `node scripts/bump-lockstep.cjs` → republish as 0.5.1 → re-run only the failed step. **Never announce on a red gate.**

---

### Task 11: Announcement drafts

**Files:**
- Create: `docs/announcements/2026-06-12-launch-drafts.md`

- [ ] **Step 1: Write both drafts with the measured numbers from Task 10** (install time, token figures from README's economics table). Starting draft to refine — LinkedIn:

> **We built PluginOS because connecting an AI agent to Figma shouldn't take an afternoon.**
>
> One command — `npx pluginos install` — and Claude (Desktop or Code), Cursor, or any MCP agent is driving your Figma file. No JSON surgery, no port juggling: the server manages a single instance across all your agent sessions and hands over automatically.
>
> Under the hood it's a token-efficiency play: 5 MCP tools instead of 80+, operations discovered dynamically at ~230 tokens per call instead of ~12,000 tokens of schema overhead before the agent even starts. Audits, linting, contrast checks, token exports, bulk frame ops — pre-summarized results, not raw node dumps.
>
> New in 0.5.0: one-command install for every agent, a bridge UI that follows your Figma theme, sandbox helpers + a pre-flight linter that catch the classic bulk-edit mistakes before they touch your canvas, and bulletproof multi-session connections.
>
> It's open source (MIT). We measured a cold start — announcement to first AI-created frame — at under [N] minutes. Try it: https://github.com/LSDimi/PluginOS
>
> Built with Alexandros Pappas.

Short variant (X/Mastodon):

> Your AI agent, inside Figma, in one command: `npx pluginos install`. 5 MCP tools instead of 80+, ~230 tokens/call instead of 12k of schema overhead. New 0.5.0: one-command install, theme-aware UI, pre-flight linting. MIT. https://github.com/LSDimi/PluginOS

- [ ] **Step 2: Replace `[N]` with the actual Task 10 Phase 3 timing; save the file; commit via `Skill(commit)` on the findings branch from Task 10.**
- [ ] **Step 3: Hand both drafts to Dimi + Alex for voice editing. Claude does not post.**

---

### Task 12: Post-release housekeeping

- [ ] **Step 1: Notify Alex — comment on the merged PR**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh pr comment 36 --body "@apappascs Merged and shipped as v0.5.0 (npm + GitHub release) ahead of today's announcement — post-merge review welcome; anything you flag becomes a 0.5.x patch. Validation results: docs/superpowers/handoffs/2026-06-12-onboarding-findings.md"
```

- [ ] **Step 2: Delete the release branch once the gate is green and no patches are pending**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git push origin --delete release/0.5.0 && git branch -d release/0.5.0
```

- [ ] **Step 3: Confirm end state**

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && gh pr list --state open && npm view pluginos version && gh release view v0.5.0 --json assets --jq '.assets[].name'
```

Expected: only dependabot PRs (or none) open; `0.5.0`; both asset names listed.

---

## Self-review notes

- **Spec coverage:** Phase 1→Task 1+2, Phase 2→Tasks 3+5+6, Phase 3→Tasks 4+7+8, Phase 4→Task 9, Phase 5→Task 10, Phase 6→Task 11. Bump-before-merge deviation documented in the header.
- **No placeholders:** the single `[N]` in Task 11 is an explicit measured-value substitution instruction, filled in Step 2 of that task.
- **Consistency:** asset names (`pluginos.dxt`, `pluginos-bridge-v0.5.0.zip`) match `DXT_URL` and README/INSTALL references checked in Task 3 Step 3.
