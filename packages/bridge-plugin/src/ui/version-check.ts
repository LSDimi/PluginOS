/**
 * Version compatibility check between the plugin build and the connected MCP server.
 *
 * Semver convention: while major is 0, minor carries breaking-change significance
 * (per https://semver.org §4). So:
 *   - 1.x vs 1.y: compatible (same major).
 *   - 0.4.x vs 0.4.y: compatible (same minor under 0.x).
 *   - 0.4.x vs 0.5.x: NOT compatible (0.x minor bumps are breaking).
 *   - 1.x vs 2.x: NOT compatible (major mismatch).
 */

export function parseMajor(version: string): number {
  const m = /^(\d+)\./.exec(version.trim());
  return m ? Number(m[1]) : 0;
}

export function parseMinor(version: string): number {
  const m = /^\d+\.(\d+)/.exec(version.trim());
  return m ? Number(m[1]) : 0;
}

export function isCompatible(pluginVersion: string, serverVersion: string): boolean {
  const pluginMajor = parseMajor(pluginVersion);
  const serverMajor = parseMajor(serverVersion);
  if (pluginMajor !== serverMajor) return false;
  if (pluginMajor === 0) return parseMinor(pluginVersion) === parseMinor(serverVersion);
  return true;
}
