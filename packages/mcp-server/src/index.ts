import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runDaemon } from "./daemon.js";
import { decideRole } from "./role.js";
import { connectDaemonLink } from "./shim/daemon-link.js";
import { createShimServer, LINK_WAIT_MS } from "./shim/passthrough-server.js";
import { LinkManager } from "./shim/link-manager.js";
import { defaultStateDir } from "./singleton/index.js";

export { createPluginOSServer } from "./server.js";
export {
  WebSocketPluginBridge,
  WebSocketPluginBridge as PluginOSWebSocketServer,
} from "./WebSocketPluginBridge.js";
export type { IPluginBridge, BridgeStatus, FileInfo } from "@pluginos/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function parsePortRange(raw: string | undefined): [number, number] {
  const m = /^(\d{2,5})-(\d{2,5})$/.exec(raw ?? "");
  if (!m) return [9500, 9510];
  const min = Number(m[1]);
  const max = Number(m[2]);
  return min <= max ? [min, max] : [9500, 9510];
}

async function main(): Promise<void> {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  const stateDir = defaultStateDir();
  const portRange = parsePortRange(process.env.PLUGINOS_PORT_RANGE);

  let managerRef: LinkManager | null = null;
  const shimServer = createShimServer(
    () => (managerRef ? managerRef.waitForLink(LINK_WAIT_MS) : Promise.resolve(null)),
    pkg.version
  );

  const manager = new LinkManager({
    decideRole: () => decideRole({ stateDir, myVersion: pkg.version }),
    connectLink: (port) => connectDaemonLink(port, pkg.version),
    startDaemon: () =>
      runDaemon({ stateDir, portRange, version: pkg.version, parentPid: process.ppid }),
    onRelink: () => {
      void shimServer.sendToolListChanged().catch(() => {});
    },
  });
  managerRef = manager;

  const stdio = new StdioServerTransport();
  await shimServer.connect(stdio);
  shimServer.onclose = () => {
    void manager.handleStdioClosed().then((verdict) => {
      if (verdict === "exit") process.exit(0);
      console.error("[shim] stdio closed; lingering to serve attached agents.");
    });
  };
  await manager.start();
  console.error(
    manager.isHosting()
      ? "PluginOS session layer running on stdio (hosting daemon)"
      : "PluginOS session layer running on stdio (attached to daemon)"
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
