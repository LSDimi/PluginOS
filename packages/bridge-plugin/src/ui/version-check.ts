/**
 * Major-version compatibility check between the plugin build and the
 * connected MCP server. Same major = compatible.
 */

export function parseMajor(version: string): number {
  const m = /^(\d+)\./.exec(version.trim());
  return m ? Number(m[1]) : 0;
}

export function isCompatible(pluginVersion: string, serverVersion: string): boolean {
  return parseMajor(pluginVersion) === parseMajor(serverVersion);
}
