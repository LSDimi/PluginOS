# PluginOS Onboarding Test Plan — 2026-06-08

> **Goal:** Validate the experience of a cold visitor who arrives via the announcement post or the GitHub README, going from "never heard of this" → "running an operation in Figma" — with quality-bar judgments at each step. The plan covers all three install paths the README promotes (Claude Desktop, Cursor, Claude Code CLI), the in-plugin Setup view, and the recovery flows.
>
> **Rule of engagement:** treat yourself as a stranger. If a step needs context you only know because you built the thing, that's a defect — write it in the notes column.

---

## Phase 0 — Reset to fresh state (one-time, ~3 min)

You must look like a user who has never installed PluginOS. Run these before anything else.

1. **Quit Claude Desktop, Figma, and Cursor entirely** (Cmd-Q each). Not just close the windows.
2. **Disconnect PluginOS from Claude Desktop's Connectors:**
   - Reopen Claude Desktop → Settings → Connectors (or "Extensions" / "Developer" depending on version).
   - If `pluginos` or "PluginOS" is listed, **Remove** / **Uninstall** it.
   - Confirm it's gone from the Connectors list.
3. **Purge any local PluginOS state:**
   ```bash
   rm -rf ~/.pluginos ~/Library/Application\ Support/Claude/claude_desktop_config.json.pluginos-backup* 2>/dev/null
   ```
   And inspect `~/Library/Application Support/Claude/claude_desktop_config.json` — if it has a `pluginos` entry under `mcpServers`, delete that entry (keep the rest of the file).
4. **Remove the Figma plugin import:**
   - Open Figma → any file → **Plugins → Development → Manage plugins in development…**
   - If "PluginOS Bridge" is in the list, click the trash / remove.
5. **Remove Cursor MCP entry (if you'll test Cursor path later):**
   - Open `~/.cursor/mcp.json` — if a `pluginos` entry exists, delete it (keep other servers).
6. **Kill any running pluginos process:**
   ```bash
   pkill -f "pluginos" 2>/dev/null; lsof -ti:9500-9510 | xargs -r kill 2>/dev/null; ls ~/.pluginos 2>/dev/null
   ```
   The last `ls` should error with "No such file or directory". If not, run `rm -rf ~/.pluginos` again.
7. **Confirm clean state:**
   - Claude Desktop Connectors: no pluginos ✓
   - `~/.pluginos/`: doesn't exist ✓
   - `~/.cursor/mcp.json`: no pluginos entry ✓
   - Figma → Plugins → Development: no PluginOS Bridge ✓
   - No process on ports 9500-9510 ✓

---

## Phase 1 — README discovery (act as cold visitor, ~5 min)

You arrived from a post or a Google search. The repo is the first thing you see.

1. **Open https://github.com/LSDimi/PluginOS in an incognito window** (so no logged-in goodies hide friction).
2. **Read the README top-to-bottom WITHOUT scrolling ahead.** Stop at the end of "Quick Start → 1. Install for your agent".

**Quality questions — write a one-line judgment for each:**

| # | Question | Pass / Fail |
|---|---|---|
| Q1.1 | In the first 200 words, do I understand what PluginOS does and why I'd want it? | |
| Q1.2 | Is "5 tools vs 80+" framed as a benefit I care about, or as a curiosity? | |
| Q1.3 | Is the install path I should use **obvious** for my agent (Claude Desktop), or do I have to skim? | |
| Q1.4 | Does the Quick Start promise a clear "you'll be done in N steps"? | |
| Q1.5 | Any jargon I'd have to Google? (`MCP`, `stdio`, `bootloader`, `DXT`…) | |

**If you trip on any Q1.x, note the exact phrasing that tripped you.** That's a README defect, not a code defect.

---

## Phase 2 — Primary path: Claude Desktop via DXT (~5 min)

This is what the announcement should send people to. If this isn't smooth, nothing else matters.

> **Note on availability of the DXT:** the README says "Download the PluginOS extension for Claude Desktop, double-click to install." Verify the GitHub release actually has a downloadable `.dxt` artifact attached, or that the README link points to one. If neither exists yet, **that's defect P2.0 — kill the launch.** A local copy lives at `packages/mcp-server/dist/pluginos.dxt` for testing.

1. **Find the download link in the README.** Time it: how many seconds from "Quick Start" heading to "I have a file downloading"?
   - If the README references a GitHub Release, click through and download from there (more realistic).
   - If no release exists, use the local `packages/mcp-server/dist/pluginos.dxt` and note "P2.0: no public DXT artifact yet" in your sheet.
2. **Double-click the `.dxt` file.** Claude Desktop should foreground itself and open the install dialog.
3. **Walk the install dialog.** Read every screen — would a non-engineer understand the permissions ask?
4. **Click Install / Allow.** Then **immediately quit Claude Desktop and reopen** (some MCP changes only apply on relaunch).
5. **In a fresh Claude Desktop conversation**, ask: *"What MCP tools do you have access to?"*

**Expected:** Claude lists `list_operations`, `run_operation`, `execute_figma`, `get_status`, `list_files`, `wait_for_reconnect` — six tools, all prefixed `pluginos` or named so it's obvious which server they came from.

**Quality questions:**

| # | Question | Pass / Fail |
|---|---|---|
| Q2.1 | DXT install dialog: did it explain what permissions PluginOS needs and why? | |
| Q2.2 | Did the dialog tell me to restart Claude Desktop, or did I have to figure that out? | |
| Q2.3 | First conversation after install: can Claude actually see the tools, or do I get "I don't have access to any tools"? | |
| Q2.4 | Total time, "click download" → "Claude lists the tools": ____ seconds. **Target: under 90.** | |

---

## Phase 3 — Install the Figma bridge + first operation (~5 min)

The user is now in Claude. The next thing the README promises is "open Figma → import plugin → run it." Walk it.

1. **Re-read README "2. Install the Bridge Plugin in Figma".** Don't trust memory; pretend you've never done this.
2. **Where does the README tell you to get the manifest?** Three options exist depending on README phrasing:
   - "Run `pluginos install` in your terminal" — needs Node + the package globally
   - "Download the bridge zip from the release" — needs a release artifact
   - "Clone the repo and point Figma at packages/bridge-plugin/manifest.json" — dev-only

   **Q3.1:** which path does the README make most prominent for a non-developer? If it's the third one, that's a defect — non-engineers won't clone.

3. **Whichever path you used, you end up with files somewhere on disk.** For our test, run:
   ```bash
   cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js install
   ```
   Then open Figma → **Plugins → Development → Import plugin from manifest…** → select `~/.pluginos/bridge/manifest.json`.
4. **Open any Figma file** (an existing one is fine — even an empty new file).
5. **Plugins → Development → PluginOS Bridge.** The plugin pane opens.

**Expected at this moment:**
- Status pill says **Connected** (green)
- Header reads `Connected · file <your file name> · port 9500`
- Operations disclosure shows a count
- Theme **matches your Figma editor theme** (dark if Figma is dark, light if Figma is light)

6. **In Claude Desktop**, ask: *"Use PluginOS to list the operations available, then summarize them by category."*

**Expected:** Claude calls `list_operations`, gets back categories (layout, content, write, lint, accessibility, components, cleanup, tokens, colors, typography, export), and replies with a categorized summary.

7. **Then ask:** *"Create a frame called 'Hello' at 100,100 sized 200×200."*

**Expected:** Claude calls `execute_figma` or the appropriate `run_operation`. Within a few seconds, a new frame named "Hello" appears in Figma at the requested position.

**Quality questions:**

| # | Question | Pass / Fail |
|---|---|---|
| Q3.1 | What install path did the README make most prominent for non-devs? Was it actually doable without a terminal? | |
| Q3.2 | After importing the manifest, did Figma give a clear next step, or did I have to find "Run plugin" myself? | |
| Q3.3 | Does the plugin theme follow Figma's editor theme? (Toggle Figma light↔dark in Preferences and watch.) | |
| Q3.4 | Time from "open Figma" → "frame appeared in canvas": ____ seconds. **Target: under 90.** | |
| Q3.5 | Did anything in the plugin pane confuse you? (Cryptic icons, unlabeled disclosures, port number leaking through, etc.) | |

---

## Phase 4 — Validate the in-plugin Setup view (~5 min)

The plugin's "Setup" tab (top-right corner) is the secondary onboarding surface — what users see if they imported the plugin BEFORE wiring an agent. Validate it stands alone.

1. **Click the Setup link** in the top-right of the plugin pane.
2. **Read all three cards as if you've never seen the README.** Each card is one agent: Claude Desktop / Cursor / Claude Code (CLI).

**Quality questions:**

| # | Question | Pass / Fail |
|---|---|---|
| Q4.1 | Claude Desktop card: does "Download" link to the real DXT artifact, or 404? Click it. | |
| Q4.2 | Claude Desktop card: "Copy link" copies what URL? Paste it somewhere and check. | |
| Q4.3 | Cursor card: "Copy MCP config" — paste the result. Is it a valid `mcpServers` block? Would it merge cleanly into an existing `mcp.json`? | |
| Q4.4 | Cursor card: "Copy rules" — what's in the clipboard? Are these the Tier 1 rules from the README? Are they short enough for `.cursorrules`? | |
| Q4.5 | Claude Code card: "Copy install commands" — paste. Does the snippet make sense pasted into a terminal? Does it need `cd <somewhere>` first? | |
| Q4.6 | If a user only ever saw this Setup view (no README), could they complete a full install? (For each agent: yes/no/with one obvious question.) | |
| Q4.7 | Any card lacking visible feedback on copy ("✓ Copied")? Did it disappear after a moment, or stay broken? | |

---

## Phase 5 — Alternate path: Cursor (~5 min)

Skip if you're not testing Cursor. Otherwise:

1. **Open Cursor.** Settings → MCP → check what's there.
2. **Follow the README's Cursor section AND the Setup view's Cursor card.** Do they agree?
3. Paste the MCP config into `~/.cursor/mcp.json`. Restart Cursor.
4. Open a project. Ask the Cursor agent: *"List PluginOS operations."*

**Quality questions:**

| # | Question | Pass / Fail |
|---|---|---|
| Q5.1 | Do README and Setup card give the SAME JSON snippet? (Diff them if not — single source of truth or not?) | |
| Q5.2 | Does Cursor pick up the new MCP server without me having to debug? | |
| Q5.3 | When the agent calls a tool, does Cursor surface the call cleanly, or is the UI janky? | |

---

## Phase 6 — Alternate path: Claude Code CLI (~3 min)

1. In a fresh terminal: `claude` (or however you launch Claude Code CLI).
2. Inside, run: `/plugin install pluginos`
3. Wait for the install to complete. Quit and relaunch the CLI.
4. New session: *"List PluginOS operations."*

**Quality questions:**

| # | Question | Pass / Fail |
|---|---|---|
| Q6.1 | Does `/plugin install pluginos` work, or does it error? | |
| Q6.2 | After install, does the `pluginos-figma` skill appear in `/skills`? | |
| Q6.3 | Does the CLI prompt for restart, or just work? | |

---

## Phase 7 — Recovery flows (the moments users hate) (~10 min)

These are where products live or die. Run them in order; each one assumes the previous worked.

### 7a. Plugin pane closed mid-conversation
1. Have Claude Desktop running an active PluginOS session.
2. In Figma, click the **X** on the plugin pane (close it).
3. In Claude, ask: *"What's the current Figma file name?"*

**Expected:** Claude should call `get_status` (or similar), get a "not connected" response, and tell the user clearly: *"The PluginOS Bridge is closed — please reopen it via Plugins → Development → PluginOS Bridge."* Then if you reopen the pane and ask again, it should work.

| # | Pass / Fail |
|---|---|
| Q7a.1 Was the error message actionable, or was it cryptic ("WebSocket disconnect" etc.)? | |
| Q7a.2 After reopening the pane, did it reconnect automatically? | |

### 7b. Multi-session orphan reap
1. Keep Claude Desktop conversation open with pluginos connected.
2. In a separate terminal: open Claude Code CLI (or another Claude Desktop conversation) in a project with pluginos wired.
3. From the second session, ask: *"Use PluginOS to list operations."*

**Expected:** The first session's connection is silently severed; the second session's request succeeds. If the user goes back to session 1 and asks something, Claude reports "not connected" with the same actionable error as 7a.

| # | Pass / Fail |
|---|---|
| Q7b.1 Did session 2 work without manual intervention? | |
| Q7b.2 When session 1 broke, was the error gentle ("another session took over") or scary ("connection refused")? | |

### 7c. Force-quit Figma during a long operation
1. From Claude: *"Use execute_figma to run `await new Promise(r=>setTimeout(r,8000)); return 1`."*
2. While it's running, **force-quit Figma** (Cmd-Q on the menu, or Force Quit if needed).
3. Watch what Claude says when the operation times out.

**Expected:** Claude reports a clear timeout, suggests reopening Figma + the bridge. No silent hang.

| # | Pass / Fail |
|---|---|
| Q7c.1 How long until Claude noticed Figma was gone? | |
| Q7c.2 Did the error tell the user what to do, or just dump a stack? | |

### 7d. Reopen Figma, ask a question
1. Reopen Figma, reopen the bridge plugin pane.
2. In Claude: *"Try the operation again."*

**Expected:** Works. No need to restart Claude Desktop.

| # | Pass / Fail |
|---|---|
| Q7d.1 Did it Just Work, or did Claude need a hint? | |

---

## Phase 8 — Quality bar checklist

After Phases 1–7, score the overall experience on this rubric. Anything below "Pass" needs a defect ticket.

| Aspect | Pass criterion | Score |
|---|---|---|
| **Time to first frame** | Under 5 minutes from landing on README to seeing a frame in Figma | |
| **Zero terminal usage on Claude Desktop path** | A non-developer could complete Phase 2 + 3 without typing one shell command | |
| **README clarity** | A reader who skipped Phases and just read the README could explain to a friend what PluginOS does and how to install it | |
| **Theme integration** | Plugin UI tracks Figma editor theme in real time (light/dark toggle) | |
| **Operation discoverability** | The agent can list operations and the list is meaningful — not just opaque names | |
| **Setup view stands alone** | A user who imported the plugin BEFORE wiring an agent can complete the install from the Setup view alone | |
| **Error legibility** | Every error message in Phase 7 told the user what to do next | |
| **Multi-session sanity** | Phase 7b's orphan reap was invisible to the active user | |
| **DXT artifact exists** | A real `.dxt` file is downloadable from the public GitHub Release, not from a local dev build | |
| **Documentation cohesion** | README Cursor JSON ≡ Setup-view Cursor JSON ≡ INSTALL.md Cursor JSON (no drift) | |

---

## Phase 9 — Write up your findings

For each defect, capture:

1. **Phase number** (so we know where in the journey it surfaced)
2. **What you expected** vs **what happened**
3. **Severity:** blocker / high / medium / low (blocker = a real user gives up here)
4. **Which surface owns it:** README, INSTALL.md, DXT bundle, Setup view, plugin runtime, Claude Desktop integration, etc.

Drop them in a new file: `docs/superpowers/handoffs/2026-06-08-onboarding-findings.md`. Next session picks up from there.

---

## Quick reference

- Local DXT: `packages/mcp-server/dist/pluginos.dxt`
- Local install (for re-runs): `node packages/mcp-server/bin/pluginos.js install`
- Reset to clean state: re-run all of Phase 0
- Bridge manifest path after install: `~/.pluginos/bridge/manifest.json`
- Known open defects (read first): `docs/superpowers/handoffs/2026-06-08-pr-a2-smoke-defects.md`
- Original PR sweep handoff: `docs/superpowers/handoffs/2026-06-05-pr-sweep-handoff.md`

---

## Suggested test order if you only have 30 minutes

Skip Phases 5, 6, and 7c-d. Run:
1. Phase 0 (3 min)
2. Phase 1 (5 min)
3. Phase 2 (5 min)
4. Phase 3 (5 min)
5. Phase 4 (5 min)
6. Phase 7a + 7b only (5 min)
7. Phase 8 quick scoring (2 min)

That covers the headline experience end-to-end without the long tail.
