# Setup UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disconnected-state setup view with two focused action cards — "Copy MCP config" and "Copy setup prompt" — and fix a duplicate `id="error-msg"` bug that leaks old step text into the UI.

**Architecture:** Three independent file changes: (1) `ui.html` gets the corrected setup view HTML and updated JS helpers; (2) `ui-entry.ts` gets tool-agnostic error copy; (3) `code.ts` loses the now-unused `open-url` handler. No new dependencies, no schema changes, no server-side changes.

**Tech Stack:** TypeScript, webpack (bridge-plugin), Figma Plugin API, `navigator.clipboard`, plain JS in `<script>` block inside `ui.html`.

---

## Files Modified

| File | Change |
|---|---|
| `packages/bridge-plugin/src/ui.html` | Replace `#view-setup` HTML; remove leftover step 2/3 HTML + duplicate `#error-msg`; replace `openDownload()` + update `copyConfig()` + add `copyPrompt()` |
| `packages/bridge-plugin/src/ui-entry.ts` | Update escalating error message to tool-agnostic copy |
| `packages/bridge-plugin/src/code.ts` | Remove `open-url` message handler |

---

### Task 1: Fix `#view-setup` HTML in `ui.html`

**Files:**
- Modify: `packages/bridge-plugin/src/ui.html`

The current file has two problems in the setup section:
1. Card 1 is "Get Claude Desktop" (wrong CTA — users already have AI tools).
2. Old step 2/3 HTML was never removed, creating a duplicate `id="error-msg"` element. This is the root cause of the screenshot bug where step text bleeds through.

The goal: replace the entire `#view-setup` div with the two new cards, and remove the orphaned old step HTML entirely.

- [ ] **Step 1: Replace the `#view-setup` div**

Find this exact block in `packages/bridge-plugin/src/ui.html`:

```html
  <div class="setup" id="view-setup">
    <div class="setup-heading">Connect to Claude</div>
    <button class="action-card" id="btn-download" onclick="openDownload()">
      <span class="action-icon">↓</span>
      <div>
        <div class="action-title">Get Claude Desktop</div>
        <div class="action-desc">Free · opens claude.ai/download</div>
      </div>
    </button>
    <button class="action-card" id="btn-copy" onclick="copyConfig()">
      <span class="action-icon">⎘</span>
      <div>
        <div class="action-title">Copy MCP config</div>
        <div class="action-desc" id="copy-desc">Paste into Claude Desktop settings</div>
      </div>
    </button>
    <div class="status-line" id="error-msg">Searching for server…</div>
  </div>
```

Replace with:

```html
  <div class="setup" id="view-setup">
    <div class="setup-heading">Connect to Claude</div>
    <button class="action-card" id="btn-copy" onclick="copyConfig()">
      <span class="action-icon">⎘</span>
      <div>
        <div class="action-title">Copy MCP config</div>
        <div class="action-desc" id="copy-desc">Paste into Claude Desktop, Claude Code, or Cursor settings</div>
      </div>
    </button>
    <button class="action-card" id="btn-prompt" onclick="copyPrompt()">
      <span class="action-icon">›</span>
      <div>
        <div class="action-title">Copy setup prompt</div>
        <div class="action-desc" id="prompt-desc">Paste into any AI chat to configure PluginOS</div>
      </div>
    </button>
    <div class="status-line" id="error-msg">Searching for server…</div>
  </div>
```

- [ ] **Step 2: Remove the leftover old step HTML**

Find this exact block immediately after the `#view-setup` div (the orphaned remnant):

```html
      <div class="step">
        <span class="step-num">2</span>
        <span>Add PluginOS to your AI tool's MCP config</span>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <span>Ask your agent to run Figma operations</span>
      </div>
    </div>
    <div class="error-msg hidden" id="error-msg"></div>
  </div>
```

Replace with nothing — delete it entirely. The block ends just before `<!-- Connected: stats -->`.

- [ ] **Step 3: Verify `#error-msg` appears exactly once**

Run:
```bash
grep -c 'id="error-msg"' "packages/bridge-plugin/src/ui.html"
```

Expected output: `1`

If output is `2` or more, Step 2 did not fully remove the old block. Re-check and remove the remaining instance.

- [ ] **Step 4: Commit**

```bash
git add packages/bridge-plugin/src/ui.html
git commit -m "fix(plugin-ui): replace setup cards with MCP config + setup prompt; remove duplicate error-msg"
```

---

### Task 2: Update JS helpers in `ui.html`

**Files:**
- Modify: `packages/bridge-plugin/src/ui.html`

The `<script>` block currently has `openDownload()` (dead — no button triggers it) and `copyConfig()` (working but with stale description revert text). We need to remove `openDownload()`, fix the revert text in `copyConfig()`, and add `copyPrompt()`.

- [ ] **Step 1: Replace the entire `<script>` block**

Find this exact block near the bottom of `ui.html` (just before `</body>`):

```html
  <script>
    function openDownload() {
      parent.postMessage({ pluginMessage: { type: "open-url", url: "https://claude.ai/download" } }, "*");
    }
    function copyConfig() {
      var config = JSON.stringify({
        mcpServers: { pluginos: { command: "npx", args: ["pluginos@latest"] } }
      }, null, 2);
      navigator.clipboard.writeText(config).then(function() {
        var desc = document.getElementById("copy-desc");
        desc.textContent = "✓ Copied to clipboard!";
        setTimeout(function() { desc.textContent = "Paste into Claude Desktop settings"; }, 2500);
      }).catch(function() {
        var desc = document.getElementById("copy-desc");
        desc.textContent = '{"mcpServers":{"pluginos":{"command":"npx","args":["pluginos@latest"]}}}';
      });
    }
  </script>
```

Replace with:

```html
  <script>
    function copyConfig() {
      var config = JSON.stringify({
        mcpServers: { pluginos: { command: "npx", args: ["pluginos@latest"] } }
      }, null, 2);
      navigator.clipboard.writeText(config).then(function() {
        var desc = document.getElementById("copy-desc");
        desc.textContent = "\u2713 Copied to clipboard!";
        setTimeout(function() { desc.textContent = "Paste into Claude Desktop, Claude Code, or Cursor settings"; }, 2500);
      }).catch(function() {
        var desc = document.getElementById("copy-desc");
        desc.textContent = '{"mcpServers":{"pluginos":{"command":"npx","args":["pluginos@latest"]}}}';
      });
    }
    function copyPrompt() {
      var prompt = "Start the PluginOS MCP server if it\u2019s not already running: \`npx pluginos\`\n\nThen find this project\u2019s agent instructions file (CLAUDE.md, AGENTS.md, .cursorrules, or equivalent \u2014 create one if none exists) and add the following rules:\n\n- For ALL Figma operations, use PluginOS tools exclusively (pluginos MCP)\n- Call list_operations first to discover what operations are available\n- Use run_operation to execute them\n- Use execute_figma only for one-off custom logic not covered by built-in operations\n- Never use mcp__Figma__* tools \u2014 they bypass the plugin and return raw, token-heavy data (~10x token cost)\n- If PluginOS returns \u201cNo plugin connected\u201d, ask the user to open the PluginOS Bridge plugin in Figma first\n\nConfirm once the server is running and the instruction file has been updated.";
      navigator.clipboard.writeText(prompt).then(function() {
        var desc = document.getElementById("prompt-desc");
        desc.textContent = "\u2713 Copied to clipboard!";
        setTimeout(function() { desc.textContent = "Paste into any AI chat to configure PluginOS"; }, 2500);
      }).catch(function() {
        var desc = document.getElementById("prompt-desc");
        desc.textContent = "Could not copy \u2014 clipboard access denied";
      });
    }
  </script>
```

- [ ] **Step 2: Verify `openDownload` is gone**

```bash
grep -c "openDownload" "packages/bridge-plugin/src/ui.html"
```

Expected output: `0`

- [ ] **Step 3: Commit**

```bash
git add packages/bridge-plugin/src/ui.html
git commit -m "feat(plugin-ui): add copyPrompt() JS helper; remove openDownload(); fix copyConfig() revert text"
```

---

### Task 3: Update escalating error copy in `ui-entry.ts`

**Files:**
- Modify: `packages/bridge-plugin/src/ui-entry.ts`

The current message "Still searching — make sure Claude Desktop is open." assumes Claude Desktop. Update to tool-agnostic copy.

- [ ] **Step 1: Update the escalating error message**

Find this exact block in `packages/bridge-plugin/src/ui-entry.ts` (around line 93):

```ts
  showError(scanAttempts < 4
    ? "Searching for server\u2026"
    : "Still searching \u2014 make sure Claude Desktop is open.");
```

Replace with:

```ts
  showError(scanAttempts < 4
    ? "Searching for server\u2026"
    : "Still searching \u2014 make sure your MCP config is set up.");
```

- [ ] **Step 2: Verify the old string is gone**

```bash
grep -c "Claude Desktop is open" "packages/bridge-plugin/src/ui-entry.ts"
```

Expected output: `0`

- [ ] **Step 3: Commit**

```bash
git add packages/bridge-plugin/src/ui-entry.ts
git commit -m "fix(plugin-ui): use tool-agnostic copy in escalating search message"
```

---

### Task 4: Remove `open-url` handler from `code.ts`

**Files:**
- Modify: `packages/bridge-plugin/src/code.ts`

No UI element sends `open-url` messages anymore. Remove the dead handler.

- [ ] **Step 1: Remove the `open-url` block**

Find this exact block in `packages/bridge-plugin/src/code.ts` (around line 32):

```ts
  if (msg.type === "open-url") {
    figma.openExternal(msg.url as string);
    return;
  }

```

Delete it entirely (including the trailing blank line). The surrounding context after removal should be:

```ts
  if (msg.type === "ws-connected") {
    sendFileStatus();
    return;
  }

  if (msg.type === "ws-disconnected") {
    return;
  }
```

- [ ] **Step 2: Verify the handler is gone**

```bash
grep -c "open-url" "packages/bridge-plugin/src/code.ts"
```

Expected output: `0`

- [ ] **Step 3: Commit**

```bash
git add packages/bridge-plugin/src/code.ts
git commit -m "refactor(plugin): remove unused open-url message handler"
```

---

### Task 5: Build, hotswap, and verify

**Files:**
- Read: `node_modules/pluginos/dist/ui.html` (hotswap target)

- [ ] **Step 1: Build shared (safety — ensure types are current)**

```bash
npm run build -w packages/shared
```

Expected: exits 0, no errors.

- [ ] **Step 2: Build bridge-plugin**

```bash
npm run build -w packages/bridge-plugin
```

Expected output includes:
```
webpack 5.x.x compiled successfully
asset ui.html ...
```

If webpack errors: check `packages/bridge-plugin/src/ui.html` for unclosed tags around the edited section. The most likely cause is an unterminated `<div>` if the old step block removal cut too much or too little.

- [ ] **Step 3: Verify `openDownload` and duplicate `error-msg` are absent from the built output**

```bash
grep -c "openDownload" packages/bridge-plugin/dist/ui.html
grep -c 'id="error-msg"' packages/bridge-plugin/dist/ui.html
```

Expected: `0` and `1` respectively.

- [ ] **Step 4: Hotswap into running MCP server**

```bash
cp packages/bridge-plugin/dist/ui.html node_modules/pluginos/dist/ui.html
```

- [ ] **Step 5: Kill the MCP server so it restarts fresh on next agent call**

```bash
pkill -f "node_modules/.bin/pluginos" || true
```

(`|| true` prevents an error exit if no process was running.)

- [ ] **Step 6: Verify in Figma**

Close the PluginOS Bridge plugin panel in Figma completely (× button on the plugin window — not just disconnect). Reopen from Plugins > Development > PluginOS Bridge.

The bootloader re-fetches `ui.html` from the server on cold open. You should see:
- Setup view: "Connect to Claude" heading
- Card 1: ⎘ "Copy MCP config" / "Paste into Claude Desktop, Claude Code, or Cursor settings"
- Card 2: › "Copy setup prompt" / "Paste into any AI chat to configure PluginOS"
- Status line: "Searching for server…"
- **No step 2/3 text anywhere**

Click "Copy setup prompt" — desc changes to "✓ Copied to clipboard!" for 2.5s.
Click "Copy MCP config" — desc changes to "✓ Copied to clipboard!" for 2.5s.

- [ ] **Step 7: Push branch**

```bash
git push origin fix/scope-defaults-and-branding
```

PR #3 already tracks this branch — the new commits will appear there for Alexandros to review.
