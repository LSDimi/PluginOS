export const PAT_STORAGE_KEY = "pluginos_pat";

export async function getPat(figmaApi: PluginAPI): Promise<string | null> {
  const raw = (await figmaApi.clientStorage.getAsync(PAT_STORAGE_KEY)) as string | undefined;
  const token = typeof raw === "string" ? raw.trim() : "";
  return token.length > 0 ? token : null;
}

export async function setPat(figmaApi: PluginAPI, token: string): Promise<void> {
  await figmaApi.clientStorage.setAsync(PAT_STORAGE_KEY, token.trim());
}

export async function clearPat(figmaApi: PluginAPI): Promise<void> {
  await figmaApi.clientStorage.deleteAsync(PAT_STORAGE_KEY);
}
