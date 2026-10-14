# Changelog

All notable changes to PluginOS are documented here. Versions are kept in lockstep across `mcp-server`, `shared`, `bridge-plugin`, and `claude-plugin` (see `scripts/check-version-lockstep.cjs`).

## 0.8.1 — 2026-10-14

- **Dependency security lift (#63):** `@modelcontextprotocol/sdk` 1.29.0 → 1.32.1 (GHSA-6qxp-vccf-f47h), `proxy-addr` 2.0.7 → 2.0.8 (GHSA-jqcg-44mw-7w3h), `fast-uri` → 3.1.8, `hono` → 4.13.13, `ip-address` → 10.7.4, `qs` → 6.16.0. `npm audit --audit-level=high --omit=dev` is clean again on `main`.
- Dev dependencies: `adm-zip` 0.6.1, `browserslist` 4.29.3, `baseline-browser-mapping` 2.11.28.
- No behaviour or protocol changes. 0.8.0 plugins and servers interoperate with 0.8.1.

## 0.8.0 — 2026-07-17

- **Multi-session daemon (B1):** concurrent `pluginos` sessions now share one daemon instead of racing to bind a port and reaping each other. Every `pluginos` process starts as a stdio session layer; the first one to start hosts the daemon role (bridge + HTTP + `/agent`), and later sessions attach to it over a WebSocket `/agent` endpoint instead of killing the running server.
- `get_status` now reports `attachedAgents`, the count of sessions currently sharing the daemon.
- If the daemon-hosting session exits or crashes, a surviving attached session is promoted to host via the existing singleton lock — no manual restart needed.
- Added `PLUGINOS_PORT_RANGE` env var to control the port range used by the daemon and its test suites. This is a dev/test isolation knob, not a general deployment option: the Figma plugin and bootloader only scan ports 9500-9510, so a daemon started on a range outside that window is undiscoverable by the plugin.
- **Bridge plugin: reconnect never gives up.** The plugin's WebSocket reconnect loop no longer stops after 30 seconds of failed attempts. After the initial `[1s, 3s, 5s, 10s]` backoff window (~30s), it falls back to a quiet 15-second slow poll that continues indefinitely. The version-mismatch UI now stays sticky (visible) while this polling continues in the background, instead of disappearing after the old giveup timeout.

Note: 0.7 → 0.8 is a breaking bump under the 0.x versioning convention. Plugins on 0.7 will show the version-mismatch UI against a 0.8 server — update the Figma bridge plugin together with the MCP server. Mixed `pluginos` versions running on one machine still take over from each other rather than sharing: a session on an incompatible version reaps a running daemon, killing its host session, while equal versions share as described above. Version-skew handover (attach across compatible versions without reaping) lands in B2.
