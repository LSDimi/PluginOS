# Changelog

All notable changes to PluginOS are documented here. Versions are kept in lockstep across `mcp-server`, `shared`, `bridge-plugin`, and `claude-plugin` (see `scripts/check-version-lockstep.cjs`).

## 0.8.0 — 2026-07-17

- **Multi-session daemon (B1):** concurrent `pluginos` sessions now share one daemon instead of racing to bind a port and reaping each other. Every `pluginos` process starts as a stdio session layer; the first one to start hosts the daemon role (bridge + HTTP + `/agent`), and later sessions attach to it over a WebSocket `/agent` endpoint instead of killing the running server.
- `get_status` now reports `attachedAgents`, the count of sessions currently sharing the daemon.
- If the daemon-hosting session exits or crashes, a surviving attached session is promoted to host via the existing singleton lock — no manual restart needed.
- Added `PLUGINOS_PORT_RANGE` env var to control the port range used by the daemon and its test suites. This is a dev/test isolation knob, not a general deployment option: the Figma plugin and bootloader only scan ports 9500-9510, so a daemon started on a range outside that window is undiscoverable by the plugin.
- **Bridge plugin: reconnect never gives up.** The plugin's WebSocket reconnect loop no longer stops after 30 seconds of failed attempts. After the initial `[1s, 3s, 5s, 10s]` backoff window (~30s), it falls back to a quiet 15-second slow poll that continues indefinitely. The version-mismatch UI now stays sticky (visible) while this polling continues in the background, instead of disappearing after the old giveup timeout.

Note: 0.7 → 0.8 is a breaking bump under the 0.x versioning convention. Plugins on 0.7 will show the version-mismatch UI against a 0.8 server — update the Figma bridge plugin together with the MCP server. Mixed `pluginos` versions running on one machine still take over from each other rather than sharing: a session on an incompatible version reaps a running daemon, killing its host session, while equal versions share as described above. Version-skew handover (attach across compatible versions without reaping) lands in B2.
