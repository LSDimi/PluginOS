/**
 * Reconnect scheduling policy for the WebSocket bridge in ui-entry.ts.
 *
 * Two live-incident defects motivate this module:
 *  - The old giveup-after-30s behavior permanently stranded the plugin on
 *    any daemon gap longer than the backoff window (npx cold start, daemon
 *    handover, user restarting their agent app). This module never gives
 *    up: past the fast backoff window it degrades to a quiet slow poll.
 *  - The mismatch view (with its version-guidance UI) was getting stomped
 *    by "Connecting…" on every reconnect attempt. shouldShowConnecting
 *    keeps mismatch sticky and keeps slow-poll probes quiet so the UI
 *    doesn't flap on every background attempt.
 */

export const RECONNECT_BACKOFF_MS = [1000, 3000, 5000, 10000];
export const BACKOFF_WINDOW_MS = 30_000;
export const SLOW_POLL_MS = 15_000;

export type ReconnectPhase = "backoff" | "slow-poll";

export interface ReconnectDecision {
  delayMs: number;
  phase: ReconnectPhase;
}

/** Never returns "give up" — past the backoff window we poll slowly forever. */
export function nextReconnectDelay(attemptIndex: number, elapsedMs: number): ReconnectDecision {
  if (elapsedMs <= BACKOFF_WINDOW_MS) {
    return {
      delayMs: RECONNECT_BACKOFF_MS[Math.min(attemptIndex, RECONNECT_BACKOFF_MS.length - 1)],
      phase: "backoff",
    };
  }
  return { delayMs: SLOW_POLL_MS, phase: "slow-poll" };
}

/** Mismatch is sticky; slow-poll probes are quiet (no UI flip to "connecting"). */
export function shouldShowConnecting(currentKind: string, phase: ReconnectPhase): boolean {
  if (currentKind === "mismatch") return false;
  return phase === "backoff";
}
