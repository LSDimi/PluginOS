# Installing PluginOS

PluginOS has two halves: **the Figma plugin** (runs inside Figma) and **the MCP server** (runs alongside your agent tool). Install both — it takes about 60 seconds combined.

---

## Step 1 — Install the Figma plugin

1. Go to the [latest release](https://github.com/LSDimi/pluginos/releases/latest) on GitHub.
2. Download `pluginos-bridge-v<version>.zip` and unzip it anywhere on your disk.
3. In Figma Desktop, open: **Menu → Plugins → Development → Import plugin from manifest…**
4. Select the `manifest.json` inside the unzipped folder.
5. PluginOS Bridge now appears under **Plugins → Development → PluginOS Bridge**. Run it once to open the panel.

The plugin works in any Figma file. You can keep it open while switching files.

---

## Step 2 — Install the MCP server in your agent tool

Pick the path that matches your setup:

### Claude Desktop — recommended, one click

1. Download `pluginos.dxt` from the [latest release](https://github.com/LSDimi/pluginos/releases/latest).
2. Double-click the `.dxt` file. Claude Desktop opens an install prompt — accept it.
3. Restart Claude Desktop. The PluginOS MCP server auto-starts on launch.

### Claude Code

Paste both commands into Claude Code:

```
/plugin marketplace add LSDimi/pluginos
/plugin install pluginos
```

The MCP server runs whenever Claude Code is open.

### Cursor / other MCP-compatible agents

1. Make sure Node 18+ is available (`node -v`).
2. Add this to your agent's MCP config (Cursor: **Settings → MCP Servers**, or edit `~/.cursor/mcp.json` directly):

   ```json
   {
     "mcpServers": {
       "pluginos": { "command": "npx", "args": ["-y", "pluginos@latest"] }
     }
   }
   ```

3. Restart the agent. It spawns the MCP server on first use.

---

## Verifying the install

1. Open the PluginOS Bridge plugin in Figma. The status pill should turn green ("Connected") within a few seconds.
2. In your agent, ask: "list available pluginos operations". You should get a list of 28 operations.

---

## Troubleshooting

**Plugin shows "Not connected" forever.**
The MCP server isn't running. Confirm your agent tool is open (Claude Desktop, Claude Code, or Cursor) and that Step 2 above is complete. The Bridge plugin cannot start the server itself — it's sandboxed.

**Plugin shows "Update needed".**
Bridge plugin and MCP server are on incompatible major versions. Reinstall the latest of both (see steps above).

**Port conflict — "All PluginOS ports in use".**
PluginOS scans ports 9500–9510. If all are in use, free one (`lsof -i :9500` then kill the process).

**Multiple Figma files connected.**
The MCP server tracks files by Figma's `fileKey`. The Bridge plugin in each file shows status only for its own file. If your agent picks the wrong file, run `list_files` to see what's connected and target the right one.

---

## For teams: private/org plugin distribution

To make PluginOS Bridge available to every designer in your org without manual install:

1. In Figma, open **Organization Settings → Plugins**.
2. Upload the contents of the unzipped `pluginos-bridge-v<version>.zip` as a private plugin.
3. All org members see it under their Plugins menu.

The MCP server still installs per user — that's the part that runs locally next to the agent.
