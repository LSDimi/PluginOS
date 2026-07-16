import {
  acquireSingletonLock,
  writeSingletonState,
  buildStateFile,
  clearSingletonState,
} from "../../index.js";

const stateDir = process.env.PLUGINOS_STATE_DIR;
if (!stateDir) {
  console.error("PLUGINOS_STATE_DIR not set");
  process.exit(2);
}

async function main(): Promise<void> {
  const info = await acquireSingletonLock({ stateDir });
  const state = buildStateFile({
    pid: process.pid,
    port: 9500,
    serverVersion: "test",
    parentPid: process.ppid,
    parentAlive: true,
    agentProtocol: 1,
    attachedAgents: 0,
  });
  await writeSingletonState(info, state);

  if (process.send) {
    process.send({ ready: true, takeoverFromPid: info.takeoverFromPid });
  }

  await new Promise<void>((resolve) => {
    // keepalive timer — without an active handle Node exits immediately
    const keepalive = setInterval(() => {}, 60_000);

    process.on("SIGTERM", async () => {
      clearInterval(keepalive);
      await clearSingletonState(info);
      resolve();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error("mock-server fatal:", err);
  process.exit(1);
});
