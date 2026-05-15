/**
 * Theme detection for the bridge plugin UI.
 *
 * Figma sends the current editor theme via figma.editorPreferences.theme in
 * the plugin sandbox; code.ts forwards it to the UI as a postMessage of type
 * THEME_CHANGE on initial load and whenever it changes. This module applies
 * the theme by setting `data-theme="light|dark"` on <html>, which the v4 CSS
 * tokens use to switch palettes.
 */

export type Theme = "light" | "dark";

const VALID: ReadonlySet<Theme> = new Set(["light", "dark"]);

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function attachThemeListener(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (msg?.type !== "THEME_CHANGE") return;
    if (!VALID.has(msg.theme)) return;
    applyTheme(msg.theme as Theme);
  });
}

export function detectInitialTheme(): Theme {
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}
