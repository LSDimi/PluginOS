# PR Sweep Handoff — 2026-06-05

> **For the next Claude session:** Read this end-to-end before doing anything. It captures the state of an 8-PR sweep addressing the 2026-06-03 TYPO3 Bootstrap feedback, including everything pushed, every Gemini review response, two bugs caught in smoke testing, and the manual test playbook still pending. The session that wrote this hit context budget. Continue from §4 (Manual smoke test) unless the user redirects.

---

## 1. Where we are right now

**Branches pushed and live on GitHub:**

| Branch | Purpose | Open PR |
|---|---|---|
| `docs/pr-b-quality-helpers-spec` | PR-B design + plan | #26 |
| `feat/pr-b-quality-helpers` | PR-B implementation | #27 |
| `docs/pr-a1-connection-foundation-spec` | PR-A1 design + plan | #28 |
| `feat/pr-a1-connection-foundation` | PR-A1 implementation | #29 |
| `docs/pr-a2-bridge-ui-polish-spec` | PR-A2 design + plan | #30 |
| `feat/pr-a2-bridge-ui-polish` | PR-A2 implementation | #31 |
| `docs/pr-c-install-polish-spec` | PR-C design + plan | #33 |
| `feat/pr-c-install-polish` | PR-C implementation | #34 |
| `integration/all-prs` | All 4 impl PRs merged (for local smoke-test) | (no PR — internal sanity check) |

**All 8 PRs are open and awaiting review from `apappascs` (Alexandros Pappas).** A coordinated review-ping was posted on #29 with merge-order recommendations; pointer comments on #27, #31, #34 link back to #29's thread. No human reviews or comments yet.

**CI status:** all 8 PRs have the vitest CI fix cherry-picked. Most should be green now. Two impl PRs (#29, #31) had transient Node-version-specific failures earlier that should have cleared with the latest pushes — verify before assuming.

## 2. What changed across the sweep (chronological)

### 2a. Original work (4 workstreams)

Pre-feedback baseline was the 4 design specs + 4 implementations:

- **PR-B (Quality Helpers)** — 5 `PluginOS.*` sandbox helpers (`createStyledText`, `bindSpacing`, `combineAsVariantsTiled`, `tileTopLevel`, `layoutSpaceBetween`), 7-rule pre-flight linter, skill recipes section in `pluginos-figma/SKILL.md`, op-count drift fix.
- **PR-A1 (Connection Foundation)** — Singleton enforcement via `~/.pluginos/server.pid.lock`, discovery file `~/.pluginos/state.json`, `wait_for_reconnect` MCP tool, aggressive SIGTERM→SIGKILL takeover, two-process integration test.
- **PR-A2 (Bridge UI Polish)** — `AppState` discriminated union, idempotent `renderUI(state)` orchestrator, `setState` funnel with adapter shims, Figma CSS var theme fallback chain, activity log polish (`MAX_VISIBLE` 5→10).
- **PR-C (Install Polish)** — `pluginos install` CLI subcommand with `--with-agent cursor|generic`, bundled bridge in `dist/bridge/`, INSTALL.md restructure per-agent, actionable mismatch view with copy buttons.

### 2b. Gemini auto-review responses

`gemini-code-assist` posted reviews on all 8 PRs. I applied every HIGH-severity finding and most MEDIUMs:

**PR-B fixes (commit `44af5b4`):**
- `bindSpacing` and `layoutSpaceBetween` null-arg guards
- `layoutSpaceBetween` vertical-mode handling (was always using `layoutSizingHorizontal`)
- `no-sync-style-setters` regex tightened with negative lookahead
- `no-notify` regex `/g` flag removed (unnecessary)
- `prefer-helpers` line-number `-1` fallback
- `prefer-helpers` regex pre-compiled outside nested loop
- Package version detection lenient to monorepo scoping (`@pluginos/*`)

**PR-A1 fixes (commit `514b7b9` + `13daba3`):**
- **HIGH:** `oldPid === process.pid` self-termination guard in `singleton/index.ts`
- **HIGH:** `INITIAL_PARENT_PID` captured at module load — `process.ppid` returns 1 (init) after parent dies on Unix due to re-parenting, which broke the orphan heartbeat entirely on Linux
- File handle leak fix in `lockfile.ts` (try/finally around `fh.write` → `fh.close`)
- `clearTimeout` moved into `finally` in `fetchStateJson` (was cleared before body parse)
- `reapProcess` self-PID guard
- Monotonic clock (`process.hrtime.bigint()`) in `wait_for_reconnect` deadline
- `discovery.js` import in `ui-entry.ts` changed to `discovery` (webpack ts-loader doesn't auto-resolve `.js` → `.ts`)

**PR-A2 fixes (commit `fca2ca6` + `68890da`):**
- **HIGH:** 12 dark-mode tokens migrated to `var(--figma-color-*, fallback)` (were hardcoded literals)
- `AppState.mismatch` gains optional `command` field; `renderUI` sets `#mismatch-cmd` from `state.command`
- `showMismatch` stops mutating DOM directly, passes `command` through `setState`
- `formatElapsed` clamps with `Math.max(0, ms)` (clock skew guard)
- `lastKnownPort` preserved across `connecting → connecting` transitions
- `tsconfig.json` excludes `src/__tests__` from webpack ts-loader (was importing `node:fs`, breaking browser bundle)

**PR-C fixes (commit `4a9223b`):**
- JSON.parse type guard in cursor agent (rejects `null`, arrays, primitives)
- Filesystem error wrapping in `installBridge`
- Copy buttons get "✓ Copied" feedback with restore timer

### 2c. Smoke-test bugs (caught locally during integration testing)

Two bugs that would have shipped to npm users:

**Bug 1: `pluginos install` couldn't find the bundled bridge** (commit `00049ab` on integration, `5670526` on `feat/pr-c-install-polish`)

`defaultSourceDir()` returned `<here>/../bridge` — but tsup chunks the install module into `dist/install-XXX.js` (one level up from `dist/cli/`), making `../bridge` resolve to `packages/mcp-server/bridge` (which doesn't exist) instead of `dist/bridge`. Fixed with a candidate-list walk:

```typescript
const candidates = [
  join(here, "bridge"),                              // dist/        → dist/bridge
  join(here, "..", "bridge"),                        // dist/cli     → dist/bridge
  join(here, "..", "..", "dist", "bridge"),          // src/cli      → dist/bridge
];
```

**Bug 2: Bridge version always displayed as `v?`** (same commits as Bug 1)

`readBridgeVersion` parsed Figma's `manifest.json` for a `version` field, but Figma plugin manifests don't have one (only `name`, `id`, `api`, `editorType`, `main`, `ui`, `networkAccess`, `permissions`). Fixed by reading `version` from mcp-server's `package.json` instead — the single source of truth that `pluginos --version` already uses.

Tests in `cli/__tests__/install.test.ts` updated: assertions now check that `result.version` is a non-empty semver-shaped string rather than the fixture's `"0.4.4"` value (which is now meaningless).

### 2d. Docs PR vitest cherry-picks

The 4 docs PRs (#26, #28, #30, #33) were branched off `main` before any of the vitest CI fixes existed, so their CI was failing on npm audit. Cherry-picked the 3 vitest commits (`cb43a4a`, `dec47d8`, `f5b8cfc`) into each docs branch (commits `276d80d`, `c45cb39`, `41be08a`, `f5effad`). Their CI should pass now.

## 3. Current local state (the session that wrote this)

The session that wrote this is currently on `integration/all-prs`. Built dist exists. Tests pass: **344 tests across 4 workspaces, 0 lint errors, webpack compiled clean.**

The integration branch contains every fix above. **It is NOT for merging to main** — Alex merges the individual feat branches in order. The integration branch only exists so the user can smoke-test the combined state locally before review.

`~/.pluginos/` may or may not have data from the session's smoke-test runs. Specifically the session ran `pluginos install` once into the user's real HOME, so `~/.pluginos/bridge/` should have current files. If anything weird happens during testing, `rm -rf ~/.pluginos/` to reset.

## 4. Manual smoke test playbook (continue here)

**This is the unfinished work.** The user has the build done, did the shell-level checks for `pluginos install`, and confirmed it works after the two bug fixes above. Remaining tests are listed below in priority order.

### 4a. Two-process orphan reap (no Figma needed)

This is PR-A1's headline feature — kills the cross-session orphan bug.

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS"
node packages/mcp-server/bin/pluginos.js >/dev/null 2>&1 & FIRST=$!
sleep 1
node packages/mcp-server/bin/pluginos.js >/dev/null 2>&1 & SECOND=$!
sleep 2
ps -p $FIRST -o pid= 2>/dev/null || echo "first reaped ✓"
ps -p $SECOND -o pid= && echo "second alive ✓"
cat ~/.pluginos/state.json | jq .pid
kill $SECOND 2>/dev/null
```

**Expected output:**
- `first reaped ✓`
- A PID number then `second alive ✓`
- `state.json` pid matches second's PID

**If first is still alive:** the takeover failed. Check `~/.pluginos/server.pid` — should contain second's PID. Likely cause: `INITIAL_PARENT_PID` capture issue or self-PID guard misbehaving. Look at `packages/mcp-server/src/singleton/index.ts:59` and `packages/mcp-server/src/index.ts:105`.

### 4b. Figma tests (need real Figma + an MCP-wired Claude/agent)

Install the bridge into the real `~/.pluginos/bridge/`:

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js install
```

In Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`. Run **PluginOS Bridge**.

From an MCP-wired agent (Claude, Cursor, etc.) run each test:

| # | Test | How | Expected |
|---|---|---|---|
| 1 | Dark mode follows Figma editor | Toggle Figma editor light ↔ dark | Plugin UI switches instantly. Inspect bg color in DevTools — should be from `--figma-color-bg` |
| 2 | Activity log | Call `execute_figma { code: "return 1" }` three times | Connected view shows 3 entries, newest at top |
| 3 | Running state | Call `execute_figma { code: "await new Promise(r=>setTimeout(r,5000)); return 1" }` | Running-block visible with op name "execute_figma" and elapsed time ticking |
| 4 | Stale state regression | During the 5s above, force-close the plugin pane in Figma. Reopen | Bridge reconnects via PR-A1 discovery. Running-block HIDDEN (op was severed). Activity log entry shows the prior op |
| 5 | Helpers wired into prelude | Call `execute_figma { code: "return PluginOS.version" }` | Response JSON includes `result: "0.4.x"`, `lint: []`, `preludeVersion: "0.4.x"`, `durationMs: <number>` |
| 6 | Linter (warn-first) | Call `execute_figma { code: 'figma.notify("hi"); return 1' }` | Response `lint` array contains `{ruleId: "no-notify", severity: "error", line: 1, ...}`. `result` is still `1` — warn-first policy, no block |
| 7 | Multi-agent orphan reap (live) | Open a SECOND Claude session in another terminal — both should have `pluginos` MCP wired | First session's pluginos gets silently reaped. Second session's `pluginos.get_status` returns live status. `~/.pluginos/state.json` reflects second's PID |
| 8 | `wait_for_reconnect` tool | Close plugin pane in Figma. Ask agent to call `pluginos.wait_for_reconnect({ timeoutSec: 60 })`. Reopen plugin within 60s | Tool returns `{ connected: true, waitedMs: <number>, fileName, fileKey }`. `waitedMs` should be ~equal to time you took to reopen |
| 9 | Mismatch view copy buttons | This is harder to trigger naturally — would need a version-mismatched bridge against the server. Skip unless suspicious about the view | If forced: clicking either Copy button should swap text to "✓ Copied" for 1500ms then restore |

### 4c. Cursor agent flow (if user has Cursor installed)

```bash
TEST_HOME=$(mktemp -d) && HOME=$TEST_HOME mkdir -p $TEST_HOME/.cursor
echo '{"mcpServers":{"other":{"command":"other-server"}}}' > $TEST_HOME/.cursor/mcp.json
HOME=$TEST_HOME node packages/mcp-server/bin/pluginos.js install --with-agent cursor
cat $TEST_HOME/.cursor/mcp.json
rm -rf $TEST_HOME
```

Expected: file has BOTH `other` and `pluginos` entries (merge preserved the pre-existing one).

```bash
TEST_HOME=$(mktemp -d) && HOME=$TEST_HOME mkdir -p $TEST_HOME/.cursor
echo '{ not valid json' > $TEST_HOME/.cursor/mcp.json
HOME=$TEST_HOME node packages/mcp-server/bin/pluginos.js install --with-agent cursor
echo "exit code: $?"
cat $TEST_HOME/.cursor/mcp.json
rm -rf $TEST_HOME
```

Expected: prints `✗ .../.cursor/mcp.json contains invalid JSON...`, exit code 1, file unchanged.

### 4d. Generic agent flow

```bash
node packages/mcp-server/bin/pluginos.js install --with-agent generic
```

Expected: prints JSON snippet with `mcpServers.pluginos` config, plus locations list for Cursor/Windsurf.

## 5. What to do with findings

**If everything passes:**
- All 4 PRs validated end-to-end together
- No further work needed before Alex's review
- Tell the user "smoke clean, ready for Alex"

**If something fails:**
1. Note which PR's surface it hits (PR-A1 = connection/singleton, PR-B = helpers/lint, PR-A2 = UI/state machine, PR-C = CLI/install)
2. Fix on the corresponding feat branch (`feat/pr-X-...`)
3. Cherry-pick or replay the fix to `integration/all-prs`
4. Push both
5. Re-run the failing test

**Order of branches for fixes:**
- Fix on the feat branch first (so PR review sees it)
- Cherry-pick to integration (so user can re-test)

**If a fix changes a Gemini-flagged area:** verify the original Gemini concern is still addressed.

## 6. After smoke tests pass — next steps for the project

Per the roadmap discussion in the previous session:

### Short-term (waiting on Alex)

1. Alex reviews #29 (PR-A1) first per the ping
2. Merge order recommended: A1 → B → A2 → C
3. After each impl PR merges, paired docs PR can be merged or closed
4. Vitest cherry-picks deduplicate naturally on merge

### Phase 2 — Validation (after PR-B + PR-A1 land)

5. **Rerun the TYPO3 Bootstrap seed** against merged trunk. Verify the original claims:
   - 306 → 0 unbound text nodes
   - 113 → 0 unbound padding values
   - 49 → 0 component overlaps
   - 58 → 0 SPACE_BETWEEN collapses
6. Multi-session orphan repro confirmed via the playbook in §4a

### Phase 3 — Release

7. Version bump: 0.4.3 → 0.5.0 (substantial new surface)
8. `npm publish` mcp-server
9. GitHub release with bridge zip artifact
10. Update marketplace plugin description to reference `pluginos install`

### Mid-term

11. **Dependabot triage** — 5 critical alerts on main per security tab
12. **Bootstrap 5 token preset** (PR-D candidate, deferred from PR-B)
13. **Marketplace promotion** — leverage `pluginos install` in description
14. **CI smoke test job** — install in temp dir, assert files land

### Long-term

15. Runtime error translation (deferred from PR-B spec)
16. More agent-specific install flows (Windsurf, generic IDEs)
17. Recipes library expansion

## 7. Context for the new session

If you're picking this up cold, here's what to know about the project conventions:

### Repo structure

- Monorepo at `/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS`
- 4 packages: `mcp-server` (Node.js MCP), `bridge-plugin` (Figma plugin), `shared` (types), `claude-plugin` (Claude Code skill)
- Architecture summary at `.claude/rules/architecture.md`
- Project conventions at `CLAUDE.md` (root)

### Git workflow

- Never push to main directly. Always feature branches.
- Always use `Skill(commit-commands:commit)` for commits — never write commit messages by hand.
- Conventional Commits style.
- Pre-push hooks run lint + format:check. Run `npm run format` if format fails.
- The user's zsh doesn't have `interactive_comments` — never use `#` inline in bash commands.

### Testing rules

- Never claim tests pass without running them and showing full output.
- `npm run check` runs the full pipeline (lint → format:check → build:shared → typecheck → build → test).
- Tests use Vitest. Bridge plugin tests run under happy-dom.

### Permissions

- `.claude/settings.local.json` has the project's allowed Bash/Skill/Tool patterns
- If you need to add patterns, edit settings.local.json (per user's CLAUDE.md), not settings.json

### Where things live

| Topic | Location |
|---|---|
| Original feedback | `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md` |
| Spec docs | `docs/superpowers/specs/` (gitignored, force-add) |
| Plans | `docs/superpowers/plans/` (gitignored, force-add) |
| Handoffs (this file) | `docs/superpowers/handoffs/` (gitignored, force-add) |
| Existing operations | `packages/bridge-plugin/src/operations/` (39 registered) |
| Bridge UI markup | `packages/bridge-plugin/src/ui.html` |
| Bridge UI logic | `packages/bridge-plugin/src/ui-entry.ts` (380+ lines, the big file) |
| CLI dispatcher | `packages/mcp-server/src/cli/index.ts` |
| CLI install logic | `packages/mcp-server/src/cli/install.ts` |
| Singleton + discovery | `packages/mcp-server/src/singleton/` |
| Prelude + helpers | `packages/mcp-server/src/prelude/` |
| Linter | `packages/mcp-server/src/lint/` |

### Key commit references

| SHA | What |
|---|---|
| `cb43a4a` `dec47d8` `f5b8cfc` | The 3 vitest CI fix commits (cherry-picked everywhere) |
| `00049ab` | The integration-branch fix for `pluginos install` source-dir + version reading |
| `5670526` | Same fix cherry-picked onto `feat/pr-c-install-polish` |
| `44af5b4` | PR-B Gemini review responses |
| `514b7b9` `13daba3` | PR-A1 Gemini responses + webpack import fix |
| `fca2ca6` `68890da` | PR-A2 Gemini responses + tsconfig __tests__ exclude |
| `4a9223b` | PR-C Gemini responses |

### Open question if anything stalls

If you find yourself doing investigation that takes more than 10 minutes, surface a checkpoint to the user. They prefer aggressive action on decisive direction, but want explicit confirmation when something feels off (e.g., merge conflict that needs intent, a Gemini finding that might not apply, etc.).

## 8. Quick-reference summary for the user

**You wrote this session — here's what you need to know to continue:**

1. **You are on `integration/all-prs`.** Build is done, dist files in place.
2. **`pluginos install` works** — already tested, prints correct version, copies 4 files.
3. **Remaining tests** are in §4 above. The two-process orphan reap (§4a) is the most critical — it validates PR-A1's headline feature without needing Figma.
4. **Figma tests** (§4b) take 15-20 min and validate PR-A2 (UI) + PR-B (helpers/linter) + PR-A1 (multi-agent reap).
5. **Cursor merge test** (§4c) takes 30 seconds.
6. **If anything fails**, the new session knows which branch + file to look at per §5.
7. **After tests pass**, the next concrete step is waiting for Alex's review on #26-#34. The roadmap from §6 kicks in after merges.

You're 90% through the sweep. The smoke tests are the last validation before review.
