# @pluginos/claude-plugin

Claude Code plugin that bundles the PluginOS MCP server registration and the `pluginos-figma` skill.

## Install

```
/plugin marketplace add github:LSDimi/pluginos
/plugin install pluginos
```

## Contents

- `.claude-plugin/plugin.json` — plugin manifest
- `.mcp.json` — MCP server registration (spawns `npx pluginos`)
- `skills/pluginos-figma/SKILL.md` — procedural skill teaching Claude to use PluginOS efficiently
- `skills/pluginos-figma/references/operations.md` — auto-generated ops reference

Version is in lockstep with `pluginos` npm package.
