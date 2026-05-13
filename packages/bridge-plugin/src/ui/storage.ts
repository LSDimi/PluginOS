/**
 * Typed wrapper around localStorage for plugin preferences.
 * Figma's clientStorage is async; in the UI iframe we use localStorage,
 * which is synchronous and persists across plugin reopens within the same
 * Figma origin. Keys are namespaced under `pluginos.*`.
 */

export type PreferredAgent = "claude-desktop" | "claude-code" | "other";

const VALID_AGENTS: ReadonlySet<PreferredAgent> = new Set([
  "claude-desktop",
  "claude-code",
  "other",
]);

const KEY_AGENT = "pluginos.preferredAgent";
const KEY_PORT = "pluginos.lastConnectedPort";

export function getPreferredAgent(): PreferredAgent | null {
  const raw = safeRead(KEY_AGENT);
  if (raw && VALID_AGENTS.has(raw as PreferredAgent)) {
    return raw as PreferredAgent;
  }
  return null;
}

export function setPreferredAgent(agent: PreferredAgent): void {
  safeWrite(KEY_AGENT, agent);
}

export function getLastPort(): number | null {
  const raw = safeRead(KEY_PORT);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setLastPort(port: number): void {
  safeWrite(KEY_PORT, String(port));
}

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignored — storage may be disabled in some Figma environments
  }
}
