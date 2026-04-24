/**
 * Handle `{ type: "open-external", url: string }` messages from the plugin UI.
 *
 * Why this exists: Figma renders plugin UIs in a sandboxed iframe. Clicking an
 * <a href="..." download> navigates the iframe itself and blanks the plugin
 * view — the `download` attribute is ignored. The Figma-standard way to open
 * an external URL is `figma.openExternal(url)`, which opens the user's
 * default browser without touching the iframe.
 *
 * Returns true when the message was dispatched, false otherwise — lets the
 * caller chain handlers without re-checking `msg.type`.
 */
export function handleOpenExternal(
  msg: { type?: string; url?: unknown },
  figmaRef: Pick<PluginAPI, "openExternal">
): boolean {
  if (msg.type !== "open-external") return false;
  if (typeof msg.url !== "string") return false;
  figmaRef.openExternal(msg.url);
  return true;
}
