export interface StateFile {
  version: 1;
  pid: number;
  port: number;
  serverVersion: string;
  startedAt: number;
  parentPid: number;
  parentAlive: boolean;
  socketPath: string | null;
}

export const SUPPORTED_VERSION = 1;
export const FETCH_TIMEOUT_MS = 300;

export interface DiscoveryCandidate {
  port: number;
  state: StateFile;
}

export async function fetchStateJson(port: number): Promise<StateFile | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`http://127.0.0.1:${port}/state.json`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      if (
        typeof body === "object" &&
        body !== null &&
        typeof (body as { version?: unknown }).version === "number" &&
        (body as { version: number }).version <= SUPPORTED_VERSION
      ) {
        return body as StateFile;
      }
      return null;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

export function rankCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return candidates
    .filter((c) => c.state.parentAlive !== false)
    .sort((a, b) => b.state.startedAt - a.state.startedAt);
}

export async function discoverCandidatePorts(ports: number[]): Promise<DiscoveryCandidate[]> {
  const probed = await Promise.all(
    ports.map(async (port) => {
      const state = await fetchStateJson(port);
      return state ? { port, state } : null;
    })
  );
  const candidates = probed.filter((c): c is DiscoveryCandidate => c !== null);
  return rankCandidates(candidates);
}
