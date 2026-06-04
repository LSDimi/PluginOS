# Installing PluginOS

PluginOS has two halves: **the Figma plugin** (runs inside Figma) and **the MCP server** (runs alongside your agent tool). Install both.

| You're using       | Install method                                            | Time  |
|--------------------|-----------------------------------------------------------|-------|
| Claude Desktop     | [Double-click `pluginos.dxt`](#claude-desktop)            | 30 s  |
| Claude Code        | [`/plugin marketplace add LSDimi/pluginos`](#claude-code) | 30 s  |
| Cursor             | [`npx pluginos install --with-agent cursor`](#cursor)     | 45 s  |
| Any other MCP host | [`npx pluginos install`](#any-other-mcp-host)             | 60 s  |

---

## Claude Desktop

1. Download [`pluginos.dxt`](https://github.com/LSDimi/pluginos/releases/latest) from the latest release.
2. Double-click the file. Claude Desktop opens an install dialog — confirm.
3. Restart Claude Desktop.

The MCP server auto-starts. To install the bridge plugin in Figma:

```bash
npx pluginos install
```

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Claude Code

Paste both commands into Claude Code:

```
/plugin marketplace add LSDimi/pluginos
/plugin install pluginos
```

The MCP server registers automatically. To install the bridge plugin in Figma:

```bash
npx pluginos install
```

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Cursor

```bash
npx pluginos install --with-agent cursor
```

This installs the bridge plugin AND writes the MCP server entry into `~/.cursor/mcp.json` (preserving any other servers you have). Restart Cursor.

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Any other MCP host

```bash
npx pluginos install --with-agent generic
```

This installs the bridge plugin and prints the MCP config JSON for you to copy into your agent's config file. Restart your agent.

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Verifying the install

1. Open the PluginOS Bridge plugin in Figma. The status pill should turn green ("Connected") within a few seconds.
2. In your agent, ask: "list available pluginos operations". You should get a list of operations and their categories.

---

## Troubleshooting

**Plugin shows "Not connected" forever.**
The MCP server isn't running. Confirm your agent tool is open and the install above is complete. The bridge plugin cannot start the server itself — it's sandboxed.

**Plugin shows "Update needed".**
Bridge plugin and MCP server are on incompatible versions. Click the **Copy** button next to the update command in the plugin pane, paste it into a terminal, and re-run.

Manual equivalent: `npx pluginos@latest install` to refresh both halves.

**Port conflict — "All PluginOS ports in use".**
PluginOS scans ports 9500–9510. If all are in use, free one (`lsof -i :9500` then kill the process).

**Multiple Figma files connected.**
The MCP server tracks files by Figma's `fileKey`. The Bridge plugin in each file shows status only for its own file. If your agent picks the wrong file, run `list_files` to see what's connected and target the right one.

---

## For teams: private/org plugin distribution

To make PluginOS Bridge available to every designer in your org without manual install:

1. In Figma, open **Organization Settings → Plugins**.
2. Upload `~/.pluginos/bridge/` contents (or the contents of `pluginos-bridge-v<version>.zip` from GitHub releases) as a private plugin.
3. All org members see it under their Plugins menu.

The MCP server still installs per user — that's the part that runs locally next to the agent.
