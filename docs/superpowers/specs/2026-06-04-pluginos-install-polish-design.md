# PluginOS Install Polish (PR-C) — Design

**Date:** 2026-06-04
**Status:** Approved for implementation planning
**Author:** Brainstorm session with Claude
**Scope:** Single PR. Adds a `pluginos install` CLI subcommand, restructures `INSTALL.md` per-agent, and makes the bridge plugin's mismatch view actionable with copy-paste update commands.

## Context

The 2026-06-03 feedback flagged the install path as the highest non-blocking friction. Concretely:

- Claude Code marketplace install gets users the MCP server but not the Figma bridge plugin — they still have to navigate to GitHub releases, download a zip, unzip, and import in Figma.
- Cursor and generic MCP users edit JSON manually to register the server.
- The bridge plugin's "Update needed" mismatch view shows no actionable command — users have to remember the update path.
- `INSTALL.md` is an 88-line wall mixing four install paths with shared troubleshooting; nobody reads it linearly.

This PR ships in the final position of the original 3-PR sequence (PR-B, PR-A1, PR-A2 already complete). The connection-foundation and quality fixes were higher priority because they removed silent failure modes. Install ergonomics doesn't break anything — it just costs each new user time.

The full feedback document is at `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md`.

## Goals

1. **One command for non-DXT users to install both halves.** `npx pluginos install` extracts the bridge plugin to a known path and tells the user where to point Figma. Optional `--with-agent <name>` writes the agent's MCP config.
2. **Self-contained install paths.** Each agent has its own 10-line section in `INSTALL.md`. A comparison table at the top lets users find their path in 5 seconds.
3. **Make the mismatch view actionable.** Users with a version conflict get a copy-paste command they can run immediately.

## Non-goals (deferred or rejected)

- **Marketplace bundling** (the original D1) — redundant once `pluginos install` works. The Claude Code marketplace plugin's description tells users to run the command. No special hook needed.
- Auto-launching Figma and importing the manifest programmatically (OS-specific, brittle)
- `--with-agent claude-desktop` (DXT already covers it)
- `--with-agent claude-code` (marketplace already wires up MCP)
- Auto-detecting which agent is in use (`--with-agent` is explicit)
- `pluginos uninstall` subcommand (rarely needed; `rm -rf ~/.pluginos/bridge/` is fine)
- Auto-update mechanism (DXT handles its own updates; marketplace pulls latest; npm users re-run install)
- "Check for updates" button in the plugin UI (would need npm registry polling)
- Per-agent contextual update commands in the mismatch view (we don't know which agent is connected — one command covers all)

## Architecture

```
                                    npm tarball ships:
                                    packages/mcp-server/dist/bridge/
                                      ├── manifest.json
                                      ├── code.js
                                      ├── ui.html
                                      └── bootloader.html
                                              │
                                              ▼
   ┌─────────────────────────────────────────────────────────┐
   │ npx pluginos install [--with-agent cursor|generic]      │
   │                                                          │
   │   bin/pluginos.js routes via argv[2] subcommand check   │
   │      │                                                   │
   │      ▼                                                   │
   │   src/cli/index.ts (dispatcher)                          │
   │      ├── install.ts → extract bridge to ~/.pluginos/    │
   │      └── agents/                                         │
   │           ├── cursor.ts → merge into ~/.cursor/mcp.json │
   │           └── generic.ts → print JSON snippet           │
   └─────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ~/.pluginos/bridge/   (sibling to PR-A1's server.pid)
                              │
                              ▼
                   User opens Figma → imports manifest

   Bridge plugin mismatch view (D7):
   - Markup includes "Copy update command" button
   - PR-A2's renderUI fills in the dynamic command
   - Existing AppState.mismatch variant unchanged
```

## Component-by-component design

### A. CLI subcommand surface

**Signatures:**

```bash
npx pluginos install                          # bridge-only, default
npx pluginos install --with-agent cursor      # bridge + Cursor MCP config
npx pluginos install --with-agent generic     # bridge + print JSON for any agent
npx pluginos --help                           # usage
npx pluginos --version                        # version string
npx pluginos                                  # falls through to MCP server (existing behavior)
```

**Backwards compatibility:** bare `npx pluginos` with no argv still starts the MCP server. Anything that didn't pass an argv before keeps working.

### B. `bin/pluginos.js` routing

Current:

```javascript
#!/usr/bin/env node
import "../dist/index.js";
```

New:

```javascript
#!/usr/bin/env node

const subcommand = process.argv[2];
const SUBCOMMANDS = new Set(["install", "--help", "-h", "--version", "-v"]);

if (subcommand && SUBCOMMANDS.has(subcommand)) {
  await import("../dist/cli/index.js");
} else {
  await import("../dist/index.js");
}
```

If `argv[2]` is a recognized subcommand, route to the CLI dispatcher. Otherwise fall through to MCP server startup. The dispatcher handles its own arg-parsing and process exit.

### C. Bridge extraction (`src/cli/install.ts`)

`~/.pluginos/bridge/` becomes a sibling of PR-A1's `server.pid` / `state.json`. Same parent directory, different subdir.

```
~/.pluginos/
├── server.pid          (PR-A1)
├── server.pid.lock     (PR-A1)
├── state.json          (PR-A1)
└── bridge/             (PR-C — new)
    ├── manifest.json
    ├── code.js
    ├── ui.html
    └── bootloader.html
```

**Install flow:**

1. Resolve the source dir: bundled bridge files at `<package-root>/dist/bridge/`. If missing, exit 1 with "your pluginos install seems corrupted — try `npm install -g pluginos@latest` again".
2. Create `~/.pluginos/bridge/` if missing (mode `0700`).
3. Copy each of the 4 files. Write to `.tmp` + rename for atomicity.
4. Print success message with the manifest path.

**Success output:**

```
✓ PluginOS Bridge v0.4.4 installed to:
  ~/.pluginos/bridge/

Next: open Figma → Plugins → Development → Import plugin from manifest…
      and select: /Users/<you>/.pluginos/bridge/manifest.json

Then run "PluginOS Bridge" from the Plugins menu and you're connected.
```

Idempotent — re-running overwrites the files. If the version differs (read from `manifest.json`), the output says `✓ updated to v0.4.4` instead of `✓ installed`.

### D. Cursor MCP config writer (`src/cli/agents/cursor.ts`)

Writes/merges into `~/.cursor/mcp.json` to add the `pluginos` server entry:

```json
{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["-y", "pluginos@latest"]
    }
  }
}
```

**Merge logic:**

| Existing state | Behavior |
|---|---|
| File doesn't exist | Create with the entry above |
| File exists, has `mcpServers.pluginos` | Overwrite that entry only, preserve everything else |
| File exists, no `mcpServers` key | Add the `mcpServers` key with the entry |
| File exists, invalid JSON | Exit 1 with "your `~/.cursor/mcp.json` contains invalid JSON. Fix it first, then re-run." Don't clobber. |

**Success output:**

```
✓ Cursor MCP config updated:
  ~/.cursor/mcp.json

Restart Cursor to load the new server.
```

### E. Generic JSON printer (`src/cli/agents/generic.ts`)

No file writes. Prints to stdout:

```
For any MCP-compatible agent, add this to your config:

{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["-y", "pluginos@latest"]
    }
  }
}

Common config locations:
  - Cursor:        ~/.cursor/mcp.json
  - Windsurf:      ~/.codeium/windsurf/mcp_config.json
  - Custom:        check your agent's docs
```

### F. CLI dispatcher (`src/cli/index.ts`)

Small switch statement:

```typescript
const subcommand = process.argv[2];
const args = process.argv.slice(3);

switch (subcommand) {
  case "install":
    await runInstall(args);
    break;
  case "--help":
  case "-h":
    printUsage();
    break;
  case "--version":
  case "-v":
    printVersion();
    break;
  default:
    printUsage();
    process.exit(1);
}
```

`runInstall(args)` parses `--with-agent <name>`, invokes the bridge extraction, then optionally invokes the agent writer.

### G. Build pipeline change

Current `packages/mcp-server/package.json` build script:

```json
"build": "tsup && cp ../bridge-plugin/dist/ui.html dist/ui.html"
```

New:

```json
"build": "tsup && node scripts/bundle-bridge.cjs"
```

Where `scripts/bundle-bridge.cjs`:

1. Reads source files from `../bridge-plugin/dist/`
2. Writes them to `dist/bridge/` (creating the dir)
3. Also writes `dist/ui.html` for backwards compat (existing consumers of the bundled UI path)

The npm `files` field in `packages/mcp-server/package.json` already includes `dist`, so `dist/bridge/` is shipped automatically.

### H. INSTALL.md restructure (D6)

**Top of file — comparison table:**

```markdown
| You're using       | Install method                              | Time  |
|--------------------|---------------------------------------------|-------|
| Claude Desktop     | Double-click `pluginos.dxt`                 | 30 s  |
| Claude Code        | `/plugin marketplace add LSDimi/pluginos`   | 30 s  |
| Cursor             | `npx pluginos install --with-agent cursor`  | 45 s  |
| Any other MCP host | `npx pluginos install`                      | 60 s  |
```

Each "Install method" cell links to the section below.

**Per-agent section template:**

```markdown
## Claude Desktop

1. Download [`pluginos.dxt`](https://github.com/LSDimi/pluginos/releases/latest)
2. Double-click. Confirm the install dialog.
3. Restart Claude Desktop.

The MCP server auto-starts. To install the bridge plugin:

\`\`\`bash
npx pluginos install
\`\`\`

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.
```

Same shape for Claude Code, Cursor, and "Any other MCP host" — each ~10 lines, self-contained.

**Shared troubleshooting at bottom** — same content as today's block, plus one new entry:

> **"Update needed" in the plugin pane.**
> Bridge plugin and MCP server are on incompatible versions. Run the command shown in the pane's "Copy update command" button, or manually: `npx pluginos@latest install` to refresh both halves.

### I. Mismatch view becomes actionable (D7)

PR-A2 refactored the mismatch view through `renderUI(state)`. This PR extends the view markup and uses the existing `state.serverVersion` / `state.pluginVersion` already in `AppState.mismatch`.

**New mismatch markup** (`packages/bridge-plugin/src/ui.html`):

```html
<section id="view-mismatch" class="pb" hidden>
  <div class="lead">Update needed</div>
  <div class="lead-sub" id="mismatch-text">
    The MCP server version doesn't match this plugin.
  </div>

  <div class="divider"></div>

  <div class="step">
    <div class="step-header">
      <span class="step-num">1</span>
      <span class="step-label">Update command</span>
    </div>
    <div class="step-body">
      <code class="step-code" id="mismatch-cmd">npx pluginos@latest install</code>
      <button class="btn-secondary" id="btn-copy-update">Copy</button>
    </div>
    <div class="step-hint">
      Run this in a terminal, then restart your agent.
    </div>
  </div>

  <div class="step">
    <div class="step-header">
      <span class="step-num">2</span>
      <span class="step-label">Re-import the plugin in Figma</span>
    </div>
    <div class="step-body">
      <code class="step-code" id="mismatch-path">~/.pluginos/bridge/manifest.json</code>
      <button class="btn-secondary" id="btn-copy-path">Copy</button>
    </div>
    <div class="step-hint">
      Plugins → Development → Import plugin from manifest…
    </div>
  </div>
</section>
```

**Wire copy buttons once at init** (`packages/bridge-plugin/src/ui-entry.ts`):

```typescript
function wireMismatchCopyButtons(): void {
  document.getElementById("btn-copy-update")?.addEventListener("click", () => {
    const cmd = document.getElementById("mismatch-cmd")?.textContent ?? "";
    navigator.clipboard?.writeText(cmd);
  });
  document.getElementById("btn-copy-path")?.addEventListener("click", () => {
    const path = document.getElementById("mismatch-path")?.textContent ?? "";
    navigator.clipboard?.writeText(path);
  });
}
```

Called once during the init sequence — buttons stay live across state transitions because they're inside the `#view-mismatch` section, which `renderUI` only toggles visibility on. No re-binding needed.

The dynamic mismatch text (already handled by PR-A2's `renderUI`) reads:

> "Server 0.4.4 doesn't match plugin 0.4.2."

No changes to `renderUI` or `AppState` needed.

## Backwards compatibility

- Bare `npx pluginos` starts the MCP server — unchanged
- DXT install path — unchanged (DXT manifest still pinned to a specific pluginos version)
- Claude Code marketplace — unchanged (still installs the claude-plugin)
- The bridge plugin's existing connection logic — unchanged
- `AppState` and `renderUI` from PR-A2 — unchanged
- `~/.pluginos/server.pid`, `state.json` from PR-A1 — unchanged (PR-C only adds the `bridge/` subdir)

## Testing strategy

**Unit tests:**

| File | Coverage |
|---|---|
| `cli/__tests__/install.test.ts` | Bridge extraction: fresh install, re-install (idempotent), missing source dir, unwritable target |
| `cli/__tests__/cursor.test.ts` | Cursor merge: file missing, file with existing pluginos entry (overwrite), file without mcpServers (add key), invalid JSON (don't clobber) |
| `cli/__tests__/generic.test.ts` | Snapshot of stdout output |
| `cli/__tests__/dispatcher.test.ts` | Subcommand routing: install, --help, --version, unknown subcommand exits 1 |

All tests use temp dirs (via `mkdtemp`) for filesystem operations to avoid cross-test contamination.

**No new bridge-plugin tests required for D7** — the mismatch view markup change is covered by PR-A2's existing `render-ui.test.ts` mismatch case (it asserts the dynamic text content). The copy-button wiring is best smoke-tested manually.

**Manual smoke test** (PR description, run before merge):

1. Install via `npx pluginos@<this-version> install`. Verify `~/.pluginos/bridge/manifest.json` exists.
2. Re-run the install. Verify "✓ updated" appears in output, files refreshed.
3. Run `npx pluginos install --with-agent cursor` with no existing `~/.cursor/mcp.json`. Verify the file is created with just the pluginos entry.
4. Add a fake `~/.cursor/mcp.json` with another MCP server entry, re-run. Verify the other entry is preserved.
5. Corrupt `~/.cursor/mcp.json` (add invalid JSON), re-run. Verify error message and exit 1, file not clobbered.
6. Run `npx pluginos install --with-agent generic`. Verify stdout matches the spec.
7. Run `npx pluginos --help`. Verify usage message.
8. Run `npx pluginos` (no args). Verify MCP server starts.
9. In Figma, force a version mismatch (run a v0.4.4 plugin against a v0.4.5 server). Verify the mismatch view shows both copy buttons, clicking copies to clipboard.

## Sequencing within the PR

Eight phases:

1. **Bundle bridge into mcp-server dist** — add `scripts/bundle-bridge.cjs`, update build script, verify `dist/bridge/` populated after build
2. **CLI dispatcher skeleton** — `cli/index.ts`, `--help`, `--version`, unknown-subcommand handling
3. **Install subcommand (bridge-only)** — `cli/install.ts` + tests
4. **Cursor agent writer** — `cli/agents/cursor.ts` + tests
5. **Generic agent printer** — `cli/agents/generic.ts` + tests
6. **`bin/pluginos.js` routing** — subcommand check before falling through to server
7. **D6: INSTALL.md restructure** — comparison table, per-agent sections, troubleshooting bottom
8. **D7: Mismatch view markup + copy-button wiring** — HTML + ui-entry.ts init step
9. **Full check + manual smoke prep + PR open**

After phase 6 the CLI works end-to-end. After phase 8 all three user-facing fixes are in.

## Files touched

```
CREATE  packages/mcp-server/scripts/bundle-bridge.cjs
CREATE  packages/mcp-server/src/cli/index.ts
CREATE  packages/mcp-server/src/cli/install.ts
CREATE  packages/mcp-server/src/cli/agents/cursor.ts
CREATE  packages/mcp-server/src/cli/agents/generic.ts
CREATE  packages/mcp-server/src/cli/__tests__/install.test.ts
CREATE  packages/mcp-server/src/cli/__tests__/cursor.test.ts
CREATE  packages/mcp-server/src/cli/__tests__/generic.test.ts
CREATE  packages/mcp-server/src/cli/__tests__/dispatcher.test.ts

MODIFY  packages/mcp-server/bin/pluginos.js
MODIFY  packages/mcp-server/package.json                       (build script + files field if needed)
MODIFY  INSTALL.md
MODIFY  packages/bridge-plugin/src/ui.html
MODIFY  packages/bridge-plugin/src/ui-entry.ts                 (wireMismatchCopyButtons + init call)

UNCHANGED (preserved):
  AppState and renderUI from PR-A2
  All PR-A1 singleton + discovery code
  DXT manifest, marketplace.json
  Bridge plugin connection/runtime logic
```

## Open questions deferred to implementation

1. **Exact npm `files` field updates** — verify whether `dist/` already includes nested directories. If `files: ["dist"]` is set, `dist/bridge/` ships automatically. If it's an explicit list, need to add `dist/bridge/`. Confirm during implementation.
2. **Where the bundled bridge version number lives** — read from the bundled `manifest.json` at install time (already has `version` field) vs. from a constant. Defer to implementation.
3. **Whether `--with-agent` should accept a path** — `--with-agent cursor:/custom/path/mcp.json`. Probably overkill for v1. Defer to feedback.

## References

- Feedback source: `/Users/dimi/Documents/TheVault/03 Vice Versa/TYPO3 Bootstrap/2026-06-03-pluginos-feedback.md`
- Existing `bin/pluginos.js`: 2 lines, just imports `../dist/index.js`
- Existing build pipeline: `packages/mcp-server/package.json` `"build": "tsup && cp ../bridge-plugin/dist/ui.html dist/ui.html"`
- Existing bridge packager (for GitHub releases): `packages/bridge-plugin/scripts/package-bridge.mjs`
- Existing INSTALL.md: 88 lines, four install paths interleaved
- Companion PR-B (quality helpers): #27
- Companion PR-A1 (connection foundation): #29
- Companion PR-A2 (bridge UI polish): #31
