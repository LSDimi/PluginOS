import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fork, ChildProcess } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "mock-server.ts");

interface ReadyMessage {
  ready: boolean;
  takeoverFromPid?: number;
}

function spawnMockServer(stateDir: string): Promise<{
  proc: ChildProcess;
  ready: ReadyMessage;
}> {
  return new Promise((resolve, reject) => {
    const proc = fork(fixturePath, {
      env: { ...process.env, PLUGINOS_STATE_DIR: stateDir },
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    proc.once("error", reject);
    proc.once("message", (msg) => resolve({ proc, ready: msg as ReadyMessage }));
  });
}

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<number | null> {
  // If the process already exited, return immediately.
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve(proc.exitCode);
  }
  return new Promise((resolve) => {
    let resolved = false;
    proc.once("exit", (code) => {
      if (!resolved) {
        resolved = true;
        resolve(code);
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);
  });
}

describe("singleton integration: two-process takeover", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-integ-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("second invocation reaps the first and reports takeoverFromPid", async () => {
    const first = await spawnMockServer(dir);
    expect(first.ready.ready).toBe(true);
    expect(first.ready.takeoverFromPid).toBeUndefined();

    const firstPid = first.proc.pid!;

    const second = await spawnMockServer(dir);
    expect(second.ready.ready).toBe(true);
    expect(second.ready.takeoverFromPid).toBe(firstPid);

    const firstExitCode = await waitForExit(first.proc, 3000);
    expect(firstExitCode).not.toBeNull();

    const pidContent = (await readFile(join(dir, "server.pid"), "utf8")).trim();
    expect(Number.parseInt(pidContent, 10)).toBe(second.proc.pid);

    second.proc.kill("SIGTERM");
    await waitForExit(second.proc, 3000);
  }, 15000);

  it("a fresh start with no prior state has no takeoverFromPid", async () => {
    const one = await spawnMockServer(dir);
    expect(one.ready.takeoverFromPid).toBeUndefined();
    one.proc.kill("SIGTERM");
    await waitForExit(one.proc, 3000);
  }, 10000);
});
