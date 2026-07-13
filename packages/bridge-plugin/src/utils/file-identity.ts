export const VERIFIED_KEY_PLUGINDATA = "pluginos_verified_file_key";
export const SYNTHETIC_ID_PLUGINDATA = "pluginos_synthetic_id";

/**
 * figma.fileKey is undefined without enablePrivatePluginApi (F2), so every
 * connection used to register as "unknown" — breaking key targeting and
 * colliding two open files in the server's Map. Identity priority:
 * real key → REST-verified key (set by list_comments) → stable synthetic id.
 */
export function resolveFileId(figmaApi: PluginAPI): string {
  if (figmaApi.fileKey) return figmaApi.fileKey;
  const verified = figmaApi.root.getPluginData(VERIFIED_KEY_PLUGINDATA);
  if (verified) return verified;
  let synthetic = figmaApi.root.getPluginData(SYNTHETIC_ID_PLUGINDATA);
  if (!synthetic) {
    synthetic = `syn_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
    figmaApi.root.setPluginData(SYNTHETIC_ID_PLUGINDATA, synthetic);
  }
  return synthetic;
}
