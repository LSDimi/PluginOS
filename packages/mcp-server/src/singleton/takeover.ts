export interface ReapOptions {
  kill?: (pid: number, signal: NodeJS.Signals | 0) => boolean;
  graceMs?: number;
  pollMs?: number;
  postKillWaitMs?: number;
}

export interface ReapResult {
  reaped: boolean;
  usedSignal: NodeJS.Signals | null;
}

function defaultKill(pid: number, signal: NodeJS.Signals | 0): boolean {
  return process.kill(pid, signal as NodeJS.Signals);
}

function isAlive(pid: number, kill: (pid: number, signal: 0) => boolean): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    return false;
  }
}

async function pollUntilDead(
  pid: number,
  kill: (pid: number, signal: 0) => boolean,
  timeoutMs: number,
  pollMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid, kill)) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return !isAlive(pid, kill);
}

export async function reapProcess(pid: number, opts: ReapOptions = {}): Promise<ReapResult> {
  const kill = opts.kill ?? defaultKill;
  const graceMs = opts.graceMs ?? 1000;
  const pollMs = opts.pollMs ?? 100;
  const postKillWaitMs = opts.postKillWaitMs ?? 200;

  try {
    kill(pid, "SIGTERM");
  } catch {
    // process may already be dead — that's fine
  }

  const diedFromSigterm = await pollUntilDead(
    pid,
    (p, s) => kill(p, s as NodeJS.Signals | 0),
    graceMs,
    pollMs
  );
  if (diedFromSigterm) {
    return { reaped: true, usedSignal: "SIGTERM" };
  }

  try {
    kill(pid, "SIGKILL");
  } catch {
    // proceed
  }
  const diedFromSigkill = await pollUntilDead(
    pid,
    (p, s) => kill(p, s as NodeJS.Signals | 0),
    postKillWaitMs,
    pollMs
  );
  return { reaped: diedFromSigkill, usedSignal: diedFromSigkill ? "SIGKILL" : null };
}
