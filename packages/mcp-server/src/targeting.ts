export function resolveFileTarget(
  files: ReadonlyMap<string, { fileName: string }>,
  requested: string | undefined,
  activeKey: string | null
): { key: string; note?: string } | { error: string } {
  if (!requested) {
    if (activeKey && files.has(activeKey)) return { key: activeKey };
    return { error: "No plugin connected. Open PluginOS Bridge in Figma." };
  }
  if (files.has(requested)) return { key: requested };

  const lower = requested.toLowerCase();
  const byName = Array.from(files.entries()).filter(
    ([, f]) => (f.fileName || "").toLowerCase() === lower
  );
  if (byName.length === 1) {
    return { key: byName[0][0], note: `matched by file name "${byName[0][1].fileName || ""}"` };
  }
  if (files.size === 1) {
    const [key, f] = Array.from(files.entries())[0];
    return {
      key,
      note: `requested key "${requested}" is not registered — routed to the only connected file "${f.fileName || ""}"`,
    };
  }
  const listing = Array.from(files.entries())
    .map(([k, f]) => `"${f.fileName || ""}" (${k})`)
    .join(", ");
  return {
    error: `File "${requested}" not connected. Connected files: ${listing || "none"}.`,
  };
}
