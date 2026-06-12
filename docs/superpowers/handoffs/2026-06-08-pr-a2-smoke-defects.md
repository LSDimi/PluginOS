# PR-A2 Smoke Defects — 2026-06-08

> **For the next session:** User ran §4b Test 1 (dark mode follows Figma editor) from `2026-06-05-pr-sweep-handoff.md` and observed that NONE of PR-A2's UI polish appears to be visible at runtime. This document captures what was seen, what I verified, and where the bugs likely live. **The user explicitly asked me not to fix anything in this session — weekly limit approaching.** Read this end-to-end before touching code.

---

## 1. What the user observed

Two screenshots, both on `integration/all-prs` after `node packages/mcp-server/bin/pluginos.js install` + Figma manifest import:

**Connected view:**
- Bare layout (no card design, no port-selection chrome, no theme polish)
- Header reads `Connected · file TYPO3 Bootstrap · port 9500`
- Single collapsed disclosure: **"Operations (26)"**
- Empty body
- Footer: `Ready for operations` / `0 ops run`
- **Light theme regardless of Figma editor theme** (user reported "no dark mode picked up")

**Setup view (the "Done" / install-helpers screen):**
- Three cards rendered (Claude Desktop / Cursor / Claude Code) — **this part looks correct**.
- Card styling, copy buttons, icons all present.

User's words: *"what I see is the legacy coming from more than a month ago"*.

---

## 2. Defects (severity-ranked)

### D1 — CRITICAL: Theme tokens NOT in any bundled `ui.html`
Bundled ui.html (everywhere) contains **zero** occurrences of `figma-color-`:

```text
0  packages/bridge-plugin/dist/ui.html
0  packages/bridge-plugin/dist/bootloader.html
0  packages/mcp-server/dist/bridge/ui.html
0  packages/mcp-server/dist/bridge/bootloader.html
0  packages/mcp-server/dist/ui.html              ← legacy server-serve path
0  /Users/dimi/.pluginos/bridge/ui.html
0  /Users/dimi/.pluginos/bridge/bootloader.html
```

But `packages/bridge-plugin/src/ui/tokens.cjs` is full of them:

```css
--po-bg: var(--figma-color-bg, #ffffff);
--po-surface: var(--figma-color-bg-secondary, #ffffff);
…25 more lines like this
```

And the file header says it's meant to be **"injected into both at webpack build time via `HtmlWebpackPlugin.templateParameters`"**.

`webpack.config.js` does `require("./src/ui/tokens.cjs")` — confirmed. Yet the build output has nothing. **Either the template params binding is broken, or the HTML templates no longer reference the injected `<%= tokensCss %>` (or equivalent) placeholder.**

This explains "no dark mode" entirely: the runtime CSS has hardcoded literals only — no `var(--figma-color-*)` chain to pick up Figma's editor theme.

**Look at:**
- `packages/bridge-plugin/webpack.config.js` — `HtmlWebpackPlugin` config blocks, `templateParameters` for both `ui.html` and `bootloader.html`
- `packages/bridge-plugin/src/ui.html` — confirm the template includes whatever placeholder the plugin expects (likely `<%= tokensCss %>` or `<%= TOKENS_CSS %>`)
- `packages/bridge-plugin/src/__tests__/ui/theme-fallback.test.ts` — this test exists and presumably passes; it may be testing tokens.cjs in isolation rather than the bundled HTML. Worth checking what it actually asserts.

### D2 — CRITICAL: UI shows 26 ops, source has 37–39
Source counts:

```text
registerOperation occurrences across packages/bridge-plugin/src/operations/: 39
  (minus 1 in operations/index.ts, 1 in operations/registry.ts → 37 actually-registering calls)

operations/index.ts imports 11 files:
  lint accessibility components cleanup tokens layout write colors typography content export
  → these 11 files contain ≈37 registerOperation calls
```

But the bundled bridge plugin reports **26 operations** in the UI. That's **11 operations missing** from runtime registration.

Possible causes (ranked by suspicion):
1. **Stale `~/.pluginos/bridge/code.js`** — installed at `Jun 8 09:04:22`, predates my `npm run build` at `09:42:05`. Even though byte size matches (39523 in both dist and ~/.pluginos), I never re-ran `pluginos install` after the rebuild. **User should run `node packages/mcp-server/bin/pluginos.js install` once more and re-import.** This may resolve D2 alone.
2. **Conditional registration** — some operations may bail at module-load time (e.g., if a Figma API isn't available in the current editor mode). Less likely but worth checking by adding logging at registerOperation.
3. **Treeshaking** — webpack production mode might be eliminating ops it thinks are unused. Bridge-plugin is bundled as `production` per `webpack --mode production` in build output. Check if individual ops are exported in a way webpack sees as side-effect-only.

### D3 — HIGH: Connected view doesn't look like PR-A2's design
Even if D1/D2 weren't issues, the user's expectation was a richer Connected view. What I can't verify from the handoff alone: did PR-A2 explicitly redesign the Connected view, or only refactor state management?

Re-read of handoff `§2a` for PR-A2:
> **PR-A2 (Bridge UI Polish)** — `AppState` discriminated union, idempotent `renderUI(state)` orchestrator, `setState` funnel with adapter shims, Figma CSS var theme fallback chain, activity log polish (`MAX_VISIBLE` 5→10).

So PR-A2's user-visible deliverables were: **(a)** theme fallback (D1 covers this), **(b)** activity log polish (5→10 visible entries), **(c)** state machine refactor (invisible to user when things work). **No visual redesign of the Connected view was promised.**

The user's "legacy coming from more than a month ago" comment may partly reflect a **mismatch between expectation and actual scope**. The Setup view (3 cards) IS the new PR-C/PR-A2 work and IT shows correctly — that's a strong signal that the build is mostly working, but tokens.cjs injection is broken.

**Open question for the user:** beyond D1 (theme) and D2 (ops count), what specific visual change in the Connected view did you expect that I should track as a separate defect?

### D4 — MEDIUM: Setup view is fine, but lives behind a click
Screenshot 2 (Setup) renders correctly. To get to it the user clicked "Setup" in the top-right. **This means the renderUI orchestrator (PR-A2's core abstraction) IS working** — state transitions Connected ↔ Setup do happen. Reinforces the theory that D1 is purely a webpack-injection issue, not a deeper React/state failure.

### D5 — LOW: Possible stale bundled artifacts
Mtime evidence:
```text
Jun  8 09:42:05  packages/mcp-server/dist/bridge/code.js  (freshly built this session)
Jun  8 09:04:22  /Users/dimi/.pluginos/bridge/code.js     (from earlier smoke-test install)
```

Both 39523 bytes — likely identical content, but **not verified by hash**. If D2 doesn't resolve after a fresh `pluginos install`, run:

```bash
shasum /Users/dimi/Documents/TheVault/00\ Joint\ Projects/PluginOS/packages/mcp-server/dist/bridge/code.js ~/.pluginos/bridge/code.js
```

to confirm.

---

## 3. What I already verified is NOT broken

- PR-A2 commits ARE on `integration/all-prs`:
  - `66cce83 feat(bridge-plugin): add AppState type union and pure helpers`
  - `c4175d3 feat(bridge-plugin): add idempotent renderUI(AppState) function`
  - `fca2ca6 fix(bridge-plugin): apply Gemini review findings for PR-A2 UI polish`
  - `29a0bcf Merge branch 'feat/pr-a2-bridge-ui-polish' into integration/all-prs`
- 229 tests pass across all 4 workspaces (`npm run check` clean, lint clean, format clean).
- `pluginos install` bridge-flat-path fix landed this session (commit `0ce4ee3` on feat, `1919ab5` on integration) and Figma manifest import now succeeds.
- Setup view renders the three new install cards correctly.
- Theme test exists: `packages/bridge-plugin/src/__tests__/ui/theme-fallback.test.ts` (need to verify what it actually asserts — may be passing for wrong reasons if it tests tokens.cjs in isolation instead of bundled output).

---

## 4. Recommended next-session sequence

1. **First**, eliminate the stale install possibility:
   ```bash
   cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js install
   ```
   Then in Figma: close the plugin pane → reopen via Plugins → Development → PluginOS Bridge. **Do NOT re-import the manifest** — Figma already has it; reopening triggers a fresh bootloader fetch.
   Re-run Test 1. If ops count is now 37 and theme is still broken, D2 is resolved and only D1 remains.

2. **Investigate D1**:
   ```bash
   cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && grep -n "tokens\|TOKENS\|templateParameters\|HtmlWebpackPlugin" packages/bridge-plugin/webpack.config.js
   cat packages/bridge-plugin/src/ui.html | head -50
   ```
   Compare what tokens placeholder the template expects vs what webpack passes.

3. **Verify D1 fix produces tokens in bundle**:
   After fix, rebuild and grep:
   ```bash
   npm run build -w packages/bridge-plugin && grep -c "figma-color" packages/bridge-plugin/dist/ui.html
   ```
   Expect ≥ 25.

4. **If D2 doesn't resolve via step 1**, add temporary logging in `packages/bridge-plugin/src/operations/registry.ts` at the registerOperation entry to dump the name of each op as it registers. Count what shows up in Figma's plugin console.

5. **Fix forward on `feat/pr-a2-bridge-ui-polish` per handoff §5**, cherry-pick to `integration/all-prs`, push both. Tag the cherry-pick SHAs in this doc.

6. **Add a build-output regression test** so D1 can't escape again:
   ```ts
   // somewhere in bridge-plugin tests, gated on existsSync(dist/ui.html)
   it("bundles theme tokens into ui.html", () => {
     const html = readFileSync("dist/ui.html", "utf8");
     expect(html.match(/figma-color-/g)?.length ?? 0).toBeGreaterThan(20);
   });
   ```

---

## 5. Open questions to confirm with the user

1. Was Figma's editor theme **actually** in dark mode when the screenshots were taken? (D1 only manifests visibly if user expects dark.)
2. Beyond theme + op count, is there a specific visual change in the Connected view that was promised somewhere I haven't found? (D3 — clarify scope.)
3. After step 1 of §4 above (reinstall + reopen), do D1 and D2 both still reproduce?

---

## 6. Verification commands I ran (raw)

For audit trail / reproducibility:

```bash
# Ops counts
grep -rn "registerOperation\b" packages/bridge-plugin/src/operations/ | wc -l   # 39
grep "^import" packages/bridge-plugin/src/operations/index.ts                   # 11 files

# Theme tokens missing in bundle
for f in packages/bridge-plugin/dist/ui.html packages/mcp-server/dist/bridge/ui.html ~/.pluginos/bridge/ui.html; do
  echo "$(grep -c figma-color "$f")  $f"
done   # all 0

# Theme tokens present in source
grep -rln "figma-color" packages/bridge-plugin/src/   # tokens.cjs + theme-fallback.test.ts

# Files PR-A2 polish commit touched
git show --stat fca2ca6
#  ui-entry.ts | 9 ++--
#  ui/render-ui.ts | 17 ++--
#  ui/tokens.cjs | 24 ++--  ← the theme work lives here

# Mtimes
stat -f "%Sm %z %N" packages/mcp-server/dist/bridge/code.js ~/.pluginos/bridge/code.js
#  Jun 8 09:42:05 39523 bytes  (dist)
#  Jun 8 09:04:22 39523 bytes  (installed — stale by 38 min, same size)
```

---

## 7. Branch / commit pointers

- Current branch: `integration/all-prs`
- Latest integration SHA: `1919ab5` (manifest path fix)
- Latest feat/pr-c SHA: `0ce4ee3` (same fix, on PR #34)
- PR-A2 feat branch (where any D1/D2/D3 fixes go): `feat/pr-a2-bridge-ui-polish`
- PR-A2 latest known SHA: `fca2ca6` (Gemini fixes)
- Original handoff (read first): `docs/superpowers/handoffs/2026-06-05-pr-sweep-handoff.md`
- This file: `docs/superpowers/handoffs/2026-06-08-pr-a2-smoke-defects.md`

User's hard rule from this session: **defects only, no fixes** — limit was approaching. Next session may resume implementation when the user gives the go.
