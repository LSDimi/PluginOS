# PluginOS Install Polish (PR-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `pluginos install` CLI subcommand, restructure INSTALL.md per-agent, and make the bridge plugin's mismatch view actionable with copy-paste update commands.

**Architecture:** Bundle the bridge plugin files (`manifest.json`, `code.js`, `ui.html`, `bootloader.html`) into the npm tarball at `mcp-server/dist/bridge/`. Route `argv[2]` subcommands in `bin/pluginos.js` to a new CLI dispatcher that handles `install` (with optional `--with-agent cursor|generic`). Extend the bridge plugin's mismatch view markup with copy buttons wired once at init.

**Tech Stack:** TypeScript, Vitest with temp-dir filesystem testing, Node `fs/promises` for atomic writes, no new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-06-04-pluginos-install-polish-design.md](../specs/2026-06-04-pluginos-install-polish-design.md)

---

## File Map

**Create (mcp-server CLI):**
- `packages/mcp-server/scripts/bundle-bridge.cjs` — build-time copier from bridge-plugin/dist to mcp-server/dist/bridge
- `packages/mcp-server/src/cli/index.ts` — argv dispatcher
- `packages/mcp-server/src/cli/install.ts` — bridge extraction + `--with-agent` flag handler
- `packages/mcp-server/src/cli/agents/cursor.ts` — Cursor MCP config merge
- `packages/mcp-server/src/cli/agents/generic.ts` — generic JSON printer
- `packages/mcp-server/src/cli/__tests__/install.test.ts`
- `packages/mcp-server/src/cli/__tests__/cursor.test.ts`
- `packages/mcp-server/src/cli/__tests__/generic.test.ts`
- `packages/mcp-server/src/cli/__tests__/dispatcher.test.ts`

**Modify:**
- `packages/mcp-server/bin/pluginos.js` — subcommand check before falling through to server
- `packages/mcp-server/package.json` — build script invokes the new bundle-bridge step
- `INSTALL.md` — per-agent split + comparison table
- `packages/bridge-plugin/src/ui.html` — mismatch view markup adds copy buttons
- `packages/bridge-plugin/src/ui-entry.ts` — `wireMismatchCopyButtons()` + init call

**Unchanged (preserved):**
- `AppState` and `renderUI` from PR-A2
- All PR-A1 singleton + discovery code
- DXT manifest, marketplace.json
- Bridge plugin connection/runtime logic

---

## Conventions

- Commits via `Skill(commit-commands:commit)` — never write commit messages manually
- After every passing test, read the FULL test output before claiming pass
- Filesystem tests use `mkdtemp(join(tmpdir(), "pluginos-..."))` per test, cleanup in `afterEach`
- All work lands on branch `feat/pr-c-install-polish` (created in Task 0)
- Push only after the full PR is ready

---

## Task 0: Branch setup + dep parity

**Files:** None — git only

- [ ] **Step 1: Confirm clean starting state**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git status && git branch --show-current`
Expected: clean tree on `main`.

- [ ] **Step 2: Create branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git checkout -b feat/pr-c-install-polish`
Expected: `Switched to a new branch 'feat/pr-c-install-polish'`.

- [ ] **Step 3: Cherry-pick the vitest CI fix commits from PR-B's branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git cherry-pick cb43a4a dec47d8 f5b8cfc`
Expected: 3 commits applied cleanly.

- [ ] **Step 4: Install deps**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm install`
Expected: 0 vulnerabilities.

- [ ] **Step 5: Baseline test pass**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server`
Expected: all existing mcp-server tests pass (baseline 61).

---

## Task 1: Bundle bridge files into mcp-server dist

**Files:**
- Create: `packages/mcp-server/scripts/bundle-bridge.cjs`
- Modify: `packages/mcp-server/package.json` (build script)

This task replaces the existing `cp ../bridge-plugin/dist/ui.html dist/ui.html` step with a small Node script that copies the full bridge file set into `dist/bridge/`.

- [ ] **Step 1: Write the bundler script**

Create `packages/mcp-server/scripts/bundle-bridge.cjs`:

```javascript
#!/usr/bin/env node
/**
 * Copies the built Figma bridge plugin files into mcp-server/dist/bridge/
 * so they ship in the npm tarball. Used by `pluginos install`.
 *
 * Also preserves the legacy dist/ui.html for any existing consumers of
 * that path.
 */
const { mkdirSync, copyFileSync, existsSync } = require("node:fs");
const { join, dirname } = require("node:path");

const here = __dirname;
const pkgRoot = join(here, "..");
const bridgeDistSrc = join(pkgRoot, "../bridge-plugin/dist");
const mcpDist = join(pkgRoot, "dist");
const bridgeDistOut = join(mcpDist, "bridge");

const FILES = ["manifest.json", "code.js", "ui.html", "bootloader.html"];

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

ensureDir(mcpDist);
ensureDir(bridgeDistOut);

// manifest.json lives next to the source (not in dist/) for the bridge-plugin workspace
const manifestSrc = join(pkgRoot, "../bridge-plugin/manifest.json");

const sources = {
  "manifest.json": manifestSrc,
  "code.js": join(bridgeDistSrc, "code.js"),
  "ui.html": join(bridgeDistSrc, "ui.html"),
  "bootloader.html": join(bridgeDistSrc, "bootloader.html"),
};

for (const name of FILES) {
  const src = sources[name];
  if (!existsSync(src)) {
    console.error(
      `[bundle-bridge] missing ${src} — run \`npm run build -w packages/bridge-plugin\` first`
    );
    process.exit(1);
  }
  copyFileSync(src, join(bridgeDistOut, name));
}

// Legacy: keep dist/ui.html for existing HTTP server consumers
copyFileSync(join(bridgeDistSrc, "ui.html"), join(mcpDist, "ui.html"));

console.warn(`[bundle-bridge] copied ${FILES.length} files to ${bridgeDistOut}`);
```

- [ ] **Step 2: Update mcp-server build script**

In `packages/mcp-server/package.json`, change the `build` field from:

```json
"build": "tsup && cp ../bridge-plugin/dist/ui.html dist/ui.html"
```

to:

```json
"build": "tsup && node scripts/bundle-bridge.cjs"
```

- [ ] **Step 3: Run the build**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run build -w packages/bridge-plugin && npm run build -w packages/mcp-server`
Expected: build succeeds, last line is `[bundle-bridge] copied 4 files to .../dist/bridge`.

- [ ] **Step 4: Verify dist/bridge contents**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && ls packages/mcp-server/dist/bridge/`
Expected: 4 files — `manifest.json`, `code.js`, `ui.html`, `bootloader.html`.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): bundle bridge plugin into dist/bridge/ for npm tarball`.

---

## Task 2: CLI dispatcher skeleton (TDD)

**Files:**
- Create: `packages/mcp-server/src/cli/index.ts`
- Create: `packages/mcp-server/src/cli/__tests__/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp-server/src/cli/__tests__/dispatcher.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runCli, printUsage, printVersion } from "../index.js";

describe("CLI dispatcher", () => {
  it("printUsage writes usage to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printUsage();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("pluginos");
    expect(output).toContain("install");
    log.mockRestore();
  });

  it("printVersion writes a semver string to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printVersion();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/\d+\.\d+\.\d+/);
    log.mockRestore();
  });

  it("runCli('--help') prints usage and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("runCli('--version') prints version and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(["--version"]);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("runCli with unknown subcommand returns exit code 1", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(["nonsense"]);
    expect(code).toBe(1);
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/dispatcher`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the dispatcher**

Create `packages/mcp-server/src/cli/index.ts`:

```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(dir, "..", "..", "package.json"),
    join(dir, "..", "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (pkg.name === "pluginos" && typeof pkg.version === "string") return pkg.version;
    } catch {
      // try next
    }
  }
  return "0.0.0";
}

export function printUsage(): void {
  console.log("pluginos — agent-native Figma operations platform");
  console.log("");
  console.log("Usage:");
  console.log("  pluginos                          start the MCP server (default)");
  console.log("  pluginos install                  install the Figma bridge plugin");
  console.log("  pluginos install --with-agent N   also write MCP config for agent N");
  console.log("                                    (N: cursor | generic)");
  console.log("  pluginos --help                   show this help");
  console.log("  pluginos --version                show the installed version");
}

export function printVersion(): void {
  console.log(readPackageVersion());
}

export async function runCli(args: string[]): Promise<number> {
  const subcommand = args[0];
  switch (subcommand) {
    case "install":
      // Implemented in a later task — for now return 0 to keep the dispatcher self-contained
      console.log("install: not yet implemented");
      return 0;
    case "--help":
    case "-h":
      printUsage();
      return 0;
    case "--version":
    case "-v":
      printVersion();
      return 0;
    default:
      console.log(`unknown subcommand: ${subcommand ?? "(none)"}`);
      printUsage();
      return 1;
  }
}

// When invoked as `node cli/index.js`, run with process.argv.slice(2)
const isDirectExecution = process.argv[1] && process.argv[1].endsWith("cli/index.js");
if (isDirectExecution) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
```

- [ ] **Step 4: Run test, expect 5 passed**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/dispatcher`
Expected: 5 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add CLI dispatcher with --help and --version`.

---

## Task 3: Bridge extraction (`install.ts` — TDD)

**Files:**
- Create: `packages/mcp-server/src/cli/install.ts`
- Create: `packages/mcp-server/src/cli/__tests__/install.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp-server/src/cli/__tests__/install.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBridge, type InstallOptions } from "../install.js";

const FIXTURE_FILES = {
  "manifest.json": '{"name":"PluginOS Bridge","version":"0.4.4"}',
  "code.js": "// stub code",
  "ui.html": "<html></html>",
  "bootloader.html": "<html></html>",
};

async function setupSourceDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pluginos-source-"));
  for (const [name, contents] of Object.entries(FIXTURE_FILES)) {
    await writeFile(join(dir, name), contents);
  }
  return dir;
}

describe("installBridge", () => {
  let targetDir: string;
  let sourceDir: string;
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), "pluginos-target-"));
    sourceDir = await setupSourceDir();
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    log.mockRestore();
    err.mockRestore();
    await rm(targetDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it("copies all 4 bridge files to the target dir", async () => {
    const opts: InstallOptions = { sourceDir, targetDir };
    const result = await installBridge(opts);
    expect(result.ok).toBe(true);
    expect(result.version).toBe("0.4.4");
    for (const name of Object.keys(FIXTURE_FILES)) {
      const content = await readFile(join(targetDir, name), "utf-8");
      expect(content).toBe(FIXTURE_FILES[name as keyof typeof FIXTURE_FILES]);
    }
  });

  it("is idempotent: re-running with new contents overwrites", async () => {
    await installBridge({ sourceDir, targetDir });
    // Update source manifest version
    await writeFile(
      join(sourceDir, "manifest.json"),
      '{"name":"PluginOS Bridge","version":"0.4.5"}'
    );
    const result = await installBridge({ sourceDir, targetDir });
    expect(result.ok).toBe(true);
    expect(result.version).toBe("0.4.5");
    const manifest = await readFile(join(targetDir, "manifest.json"), "utf-8");
    expect(manifest).toContain("0.4.5");
  });

  it("creates the target dir if missing", async () => {
    const nestedTarget = join(targetDir, "nested", "bridge");
    const result = await installBridge({ sourceDir, targetDir: nestedTarget });
    expect(result.ok).toBe(true);
    const manifest = await readFile(join(nestedTarget, "manifest.json"), "utf-8");
    expect(manifest).toContain("0.4.4");
  });

  it("fails when sourceDir is missing files", async () => {
    const brokenSource = await mkdtemp(join(tmpdir(), "pluginos-broken-"));
    try {
      await writeFile(join(brokenSource, "manifest.json"), "{}");
      // Missing code.js, ui.html, bootloader.html
      const result = await installBridge({ sourceDir: brokenSource, targetDir });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/missing/i);
    } finally {
      await rm(brokenSource, { recursive: true, force: true });
    }
  });

  it("reports the correct version on success", async () => {
    const result = await installBridge({ sourceDir, targetDir });
    expect(result.version).toBe("0.4.4");
  });

  it("uses 'updated' verb on second run (idempotency reflected in output)", async () => {
    const first = await installBridge({ sourceDir, targetDir });
    expect(first.action).toBe("installed");
    const second = await installBridge({ sourceDir, targetDir });
    expect(second.action).toBe("updated");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/install`
Expected: FAIL.

- [ ] **Step 3: Implement `install.ts`**

Create `packages/mcp-server/src/cli/install.ts`:

```typescript
import { readFile, writeFile, rename, mkdir, access, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export interface InstallOptions {
  sourceDir?: string;
  targetDir?: string;
}

export interface InstallResult {
  ok: boolean;
  action?: "installed" | "updated";
  version?: string;
  error?: string;
}

const BRIDGE_FILES = ["manifest.json", "code.js", "ui.html", "bootloader.html"] as const;

function defaultSourceDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist runtime: dir = .../packages/mcp-server/dist/cli
  // src runtime: dir = .../packages/mcp-server/src/cli
  return join(here, "..", "bridge");
}

function defaultTargetDir(): string {
  return join(homedir(), ".pluginos", "bridge");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readBridgeVersion(manifestPath: string): Promise<string | null> {
  try {
    const text = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(text) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

async function copyAtomically(src: string, dest: string): Promise<void> {
  const tmp = `${dest}.tmp`;
  const content = await readFile(src);
  await writeFile(tmp, content);
  await rename(tmp, dest);
}

export async function installBridge(opts: InstallOptions = {}): Promise<InstallResult> {
  const sourceDir = opts.sourceDir ?? defaultSourceDir();
  const targetDir = opts.targetDir ?? defaultTargetDir();

  // Verify source has all 4 files
  for (const name of BRIDGE_FILES) {
    if (!(await pathExists(join(sourceDir, name)))) {
      return {
        ok: false,
        error: `missing source file: ${name} (looked in ${sourceDir})`,
      };
    }
  }

  // Determine action: install or update?
  const targetManifest = join(targetDir, "manifest.json");
  const alreadyInstalled = await pathExists(targetManifest);
  const action: "installed" | "updated" = alreadyInstalled ? "updated" : "installed";

  // Ensure target dir
  await mkdir(targetDir, { recursive: true });
  await chmod(targetDir, 0o700).catch(() => {
    // chmod may fail on Windows/special FS — ignore
  });

  // Copy each file atomically
  for (const name of BRIDGE_FILES) {
    await copyAtomically(join(sourceDir, name), join(targetDir, name));
  }

  const version = (await readBridgeVersion(join(targetDir, "manifest.json"))) ?? "?";

  return { ok: true, action, version };
}

export async function runInstall(args: string[]): Promise<number> {
  const withAgentIdx = args.indexOf("--with-agent");
  const agent = withAgentIdx >= 0 ? args[withAgentIdx + 1] : null;

  const result = await installBridge();
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    console.error("Try: npm install -g pluginos@latest");
    return 1;
  }

  const verb = result.action === "updated" ? "✓ updated to" : "✓ PluginOS Bridge";
  const target = join(homedir(), ".pluginos", "bridge");
  console.log(`${verb} v${result.version} installed to:`);
  console.log(`  ${target}`);
  console.log("");
  console.log("Next: open Figma → Plugins → Development → Import plugin from manifest…");
  console.log(`      and select: ${join(target, "manifest.json")}`);
  console.log("");
  console.log('Then run "PluginOS Bridge" from the Plugins menu and you\'re connected.');

  if (agent) {
    // Delegated to the agents/ modules in later tasks; placeholder for now.
    console.log("");
    console.log(`(--with-agent ${agent}: not yet wired in this task)`);
  }

  return 0;
}
```

- [ ] **Step 4: Run test, expect 6 passed**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/install`
Expected: 6 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add installBridge with atomic copy + idempotency`.

---

## Task 4: Cursor agent writer (TDD)

**Files:**
- Create: `packages/mcp-server/src/cli/agents/cursor.ts`
- Create: `packages/mcp-server/src/cli/__tests__/cursor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp-server/src/cli/__tests__/cursor.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCursorMcpConfig } from "../agents/cursor.js";

describe("writeCursorMcpConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pluginos-cursor-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates the file when missing, with just the pluginos entry", async () => {
    const path = join(dir, "mcp.json");
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.mcpServers.pluginos.command).toBe("npx");
    expect(written.mcpServers.pluginos.args).toEqual(["-y", "pluginos@latest"]);
  });

  it("preserves other mcpServers entries when adding pluginos", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          other: { command: "other-server" },
        },
      })
    );
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.mcpServers.other).toEqual({ command: "other-server" });
    expect(written.mcpServers.pluginos.command).toBe("npx");
  });

  it("overwrites existing pluginos entry", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          pluginos: { command: "old-command", args: ["old"] },
        },
      })
    );
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.mcpServers.pluginos.command).toBe("npx");
    expect(written.mcpServers.pluginos.args).toEqual(["-y", "pluginos@latest"]);
  });

  it("adds mcpServers key when missing", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(path, JSON.stringify({ otherKey: "value" }));
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(true);
    const written = JSON.parse(await readFile(path, "utf-8"));
    expect(written.otherKey).toBe("value");
    expect(written.mcpServers.pluginos).toBeDefined();
  });

  it("refuses to clobber malformed JSON", async () => {
    const path = join(dir, "mcp.json");
    await writeFile(path, "{ not valid json");
    const result = await writeCursorMcpConfig({ configPath: path });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid json/i);
    // File should be unchanged
    const after = await readFile(path, "utf-8");
    expect(after).toBe("{ not valid json");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/cursor`
Expected: FAIL.

- [ ] **Step 3: Implement `cursor.ts`**

Create `packages/mcp-server/src/cli/agents/cursor.ts`:

```typescript
import { readFile, writeFile, rename, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface CursorOptions {
  configPath?: string;
}

export interface CursorResult {
  ok: boolean;
  configPath?: string;
  error?: string;
}

const PLUGINOS_ENTRY = {
  command: "npx",
  args: ["-y", "pluginos@latest"],
} as const;

function defaultConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomically(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}

export async function writeCursorMcpConfig(opts: CursorOptions = {}): Promise<CursorResult> {
  const configPath = opts.configPath ?? defaultConfigPath();

  // Ensure parent dir
  await mkdir(dirname(configPath), { recursive: true });

  let parsed: Record<string, unknown> = {};
  if (await pathExists(configPath)) {
    const raw = await readFile(configPath, "utf-8");
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        configPath,
        error: `${configPath} contains invalid JSON — fix it first, then re-run`,
      };
    }
  }

  const mcpServers = (parsed.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers.pluginos = PLUGINOS_ENTRY;
  parsed.mcpServers = mcpServers;

  await writeAtomically(configPath, JSON.stringify(parsed, null, 2) + "\n");

  return { ok: true, configPath };
}

export async function runCursorAgent(): Promise<number> {
  const result = await writeCursorMcpConfig();
  if (!result.ok) {
    console.error(`✗ ${result.error}`);
    return 1;
  }
  console.log(`✓ Cursor MCP config updated:`);
  console.log(`  ${result.configPath}`);
  console.log("");
  console.log("Restart Cursor to load the new server.");
  return 0;
}
```

- [ ] **Step 4: Run test, expect 5 passed**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/cursor`
Expected: 5 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add Cursor MCP config writer with merge + clobber safety`.

---

## Task 5: Generic agent printer (TDD)

**Files:**
- Create: `packages/mcp-server/src/cli/agents/generic.ts`
- Create: `packages/mcp-server/src/cli/__tests__/generic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp-server/src/cli/__tests__/generic.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { printGenericMcpConfig, runGenericAgent } from "../agents/generic.js";

describe("printGenericMcpConfig", () => {
  it("prints the canonical JSON snippet to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printGenericMcpConfig();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("mcpServers");
    expect(output).toContain("pluginos");
    expect(output).toContain("npx");
    expect(output).toContain("pluginos@latest");
    log.mockRestore();
  });

  it("includes common agent config locations", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printGenericMcpConfig();
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Cursor");
    expect(output).toContain("Windsurf");
    log.mockRestore();
  });
});

describe("runGenericAgent", () => {
  it("returns exit code 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runGenericAgent();
    expect(code).toBe(0);
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/generic`
Expected: FAIL.

- [ ] **Step 3: Implement `generic.ts`**

Create `packages/mcp-server/src/cli/agents/generic.ts`:

```typescript
const SNIPPET = `{
  "mcpServers": {
    "pluginos": {
      "command": "npx",
      "args": ["-y", "pluginos@latest"]
    }
  }
}`;

export function printGenericMcpConfig(): void {
  console.log("For any MCP-compatible agent, add this to your config:");
  console.log("");
  console.log(SNIPPET);
  console.log("");
  console.log("Common config locations:");
  console.log("  - Cursor:        ~/.cursor/mcp.json");
  console.log("  - Windsurf:      ~/.codeium/windsurf/mcp_config.json");
  console.log("  - Custom:        check your agent's docs");
}

export async function runGenericAgent(): Promise<number> {
  printGenericMcpConfig();
  return 0;
}
```

- [ ] **Step 4: Run test, expect 3 passed**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/generic`
Expected: 3 passed.

- [ ] **Step 5: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): add generic MCP config snippet printer`.

---

## Task 6: Wire `--with-agent` into `runInstall`

**Files:**
- Modify: `packages/mcp-server/src/cli/install.ts`
- Modify: `packages/mcp-server/src/cli/index.ts`
- Modify: `packages/mcp-server/src/cli/__tests__/install.test.ts`

- [ ] **Step 1: Append new test cases to install.test.ts**

Add these tests at the bottom of `packages/mcp-server/src/cli/__tests__/install.test.ts` (after the existing `describe("installBridge")` block):

```typescript
import { runInstall } from "../install.js";

describe("runInstall --with-agent", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    err.mockRestore();
  });

  it("rejects unknown --with-agent value", async () => {
    const code = await runInstall(["--with-agent", "nonsense"], { skipBridge: true });
    expect(code).toBe(1);
    const errOutput = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toMatch(/unknown agent/i);
    expect(errOutput).toContain("cursor");
    expect(errOutput).toContain("generic");
  });

  it("accepts --with-agent generic and prints the snippet", async () => {
    const code = await runInstall(["--with-agent", "generic"], { skipBridge: true });
    expect(code).toBe(0);
    const logOutput = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logOutput).toContain("mcpServers");
  });
});
```

The `skipBridge` option (added in this task) lets tests skip the actual bridge install step.

- [ ] **Step 2: Run test, expect FAIL (skipBridge not supported)**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__/install`
Expected: FAIL on the new test cases.

- [ ] **Step 3: Modify `runInstall` to accept the `--with-agent` flag**

Replace the existing `runInstall` function in `packages/mcp-server/src/cli/install.ts` with:

```typescript
import { runCursorAgent } from "./agents/cursor.js";
import { runGenericAgent } from "./agents/generic.js";

const SUPPORTED_AGENTS = new Set(["cursor", "generic"]);

export interface RunInstallOptions {
  skipBridge?: boolean;
}

export async function runInstall(args: string[], opts: RunInstallOptions = {}): Promise<number> {
  const withAgentIdx = args.indexOf("--with-agent");
  const agent = withAgentIdx >= 0 ? args[withAgentIdx + 1] : null;

  if (agent !== null && !SUPPORTED_AGENTS.has(agent)) {
    console.error(`✗ unknown agent: ${agent}`);
    console.error("supported agents: cursor, generic");
    return 1;
  }

  if (!opts.skipBridge) {
    const result = await installBridge();
    if (!result.ok) {
      console.error(`✗ ${result.error}`);
      console.error("Try: npm install -g pluginos@latest");
      return 1;
    }

    const verb = result.action === "updated" ? "✓ updated to" : "✓ PluginOS Bridge";
    const target = join(homedir(), ".pluginos", "bridge");
    console.log(`${verb} v${result.version} installed to:`);
    console.log(`  ${target}`);
    console.log("");
    console.log("Next: open Figma → Plugins → Development → Import plugin from manifest…");
    console.log(`      and select: ${join(target, "manifest.json")}`);
    console.log("");
    console.log('Then run "PluginOS Bridge" from the Plugins menu and you\'re connected.');
  }

  if (agent === "cursor") {
    console.log("");
    const code = await runCursorAgent();
    if (code !== 0) return code;
  } else if (agent === "generic") {
    console.log("");
    const code = await runGenericAgent();
    if (code !== 0) return code;
  }

  return 0;
}
```

- [ ] **Step 4: Wire `runInstall` into the dispatcher**

In `packages/mcp-server/src/cli/index.ts`, replace the `case "install":` body:

```typescript
case "install": {
  const { runInstall } = await import("./install.js");
  return runInstall(args.slice(1));
}
```

- [ ] **Step 5: Run all CLI tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server -- cli/__tests__`
Expected: all green (5 dispatcher + 6 install + 5 cursor + 3 generic + 2 new runInstall = 21 tests).

- [ ] **Step 6: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): wire --with-agent flag into runInstall`.

---

## Task 7: Route subcommands in `bin/pluginos.js`

**Files:**
- Modify: `packages/mcp-server/bin/pluginos.js`

- [ ] **Step 1: Read current bin script**

Run: `cat packages/mcp-server/bin/pluginos.js`
Expected: 2 lines (shebang + `import "../dist/index.js"`).

- [ ] **Step 2: Replace with subcommand router**

Replace `packages/mcp-server/bin/pluginos.js` with:

```javascript
#!/usr/bin/env node

const subcommand = process.argv[2];
const SUBCOMMANDS = new Set(["install", "--help", "-h", "--version", "-v"]);

if (subcommand && SUBCOMMANDS.has(subcommand)) {
  const { runCli } = await import("../dist/cli/index.js");
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
} else {
  await import("../dist/index.js");
}
```

- [ ] **Step 3: Build mcp-server and smoke-test**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run build:shared && npm run build -w packages/mcp-server && node packages/mcp-server/bin/pluginos.js --version`
Expected: version string printed, process exits 0.

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js --help`
Expected: usage printed.

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && node packages/mcp-server/bin/pluginos.js nonsense`
Expected: "unknown subcommand", exit 1.

- [ ] **Step 4: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(mcp-server): route argv subcommands in bin/pluginos.js`.

---

## Task 8: INSTALL.md restructure (D6)

**Files:**
- Modify: `INSTALL.md`

- [ ] **Step 1: Replace INSTALL.md with the per-agent structure**

Replace the entire contents of `INSTALL.md` with:

```markdown
# Installing PluginOS

PluginOS has two halves: **the Figma plugin** (runs inside Figma) and **the MCP server** (runs alongside your agent tool). Install both.

| You're using       | Install method                                      | Time  |
|--------------------|-----------------------------------------------------|-------|
| Claude Desktop     | [Double-click `pluginos.dxt`](#claude-desktop)      | 30 s  |
| Claude Code        | [`/plugin marketplace add LSDimi/pluginos`](#claude-code) | 30 s  |
| Cursor             | [`npx pluginos install --with-agent cursor`](#cursor) | 45 s  |
| Any other MCP host | [`npx pluginos install`](#any-other-mcp-host)       | 60 s  |

---

## Claude Desktop

1. Download [`pluginos.dxt`](https://github.com/LSDimi/pluginos/releases/latest) from the latest release.
2. Double-click the file. Claude Desktop opens an install dialog — confirm.
3. Restart Claude Desktop.

The MCP server auto-starts. To install the bridge plugin in Figma:

\`\`\`bash
npx pluginos install
\`\`\`

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Claude Code

Paste both commands into Claude Code:

\`\`\`
/plugin marketplace add LSDimi/pluginos
/plugin install pluginos
\`\`\`

The MCP server registers automatically. To install the bridge plugin in Figma:

\`\`\`bash
npx pluginos install
\`\`\`

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Cursor

\`\`\`bash
npx pluginos install --with-agent cursor
\`\`\`

This installs the bridge plugin AND writes the MCP server entry into `~/.cursor/mcp.json` (preserving any other servers you have). Restart Cursor.

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Any other MCP host

\`\`\`bash
npx pluginos install --with-agent generic
\`\`\`

This installs the bridge plugin and prints the MCP config JSON for you to copy into your agent's config file. Restart your agent.

Then in Figma: **Plugins → Development → Import plugin from manifest** → `~/.pluginos/bridge/manifest.json`.

---

## Verifying the install

1. Open the PluginOS Bridge plugin in Figma. The status pill should turn green ("Connected") within a few seconds.
2. In your agent, ask: "list available pluginos operations". You should get a list of operations and their categories.

---

## Troubleshooting

**Plugin shows "Not connected" forever.**
The MCP server isn't running. Confirm your agent tool is open and the install above is complete. The bridge plugin cannot start the server itself — it's sandboxed.

**Plugin shows "Update needed".**
Bridge plugin and MCP server are on incompatible versions. Click the **Copy** button next to the update command in the plugin pane, paste it into a terminal, and re-run.

Manual equivalent: `npx pluginos@latest install` to refresh both halves.

**Port conflict — "All PluginOS ports in use".**
PluginOS scans ports 9500–9510. If all are in use, free one (`lsof -i :9500` then kill the process).

**Multiple Figma files connected.**
The MCP server tracks files by Figma's `fileKey`. The Bridge plugin in each file shows status only for its own file. If your agent picks the wrong file, run `list_files` to see what's connected and target the right one.

---

## For teams: private/org plugin distribution

To make PluginOS Bridge available to every designer in your org without manual install:

1. In Figma, open **Organization Settings → Plugins**.
2. Upload `~/.pluginos/bridge/` contents (or the contents of `pluginos-bridge-v<version>.zip` from GitHub releases) as a private plugin.
3. All org members see it under their Plugins menu.

The MCP server still installs per user — that's the part that runs locally next to the agent.
```

- [ ] **Step 2: Confirm clean diff**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git diff INSTALL.md | head -40`
Expected: shows the restructure clearly.

- [ ] **Step 3: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `docs(install): restructure INSTALL.md per-agent with comparison table`.

---

## Task 9: Mismatch view markup (D7)

**Files:**
- Modify: `packages/bridge-plugin/src/ui.html`
- Modify: `packages/bridge-plugin/src/ui-entry.ts`

- [ ] **Step 1: Read current mismatch markup**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && grep -n "view-mismatch" packages/bridge-plugin/src/ui.html`
Note the line range of `<section id="view-mismatch" ...>`.

- [ ] **Step 2: Replace the mismatch section markup**

In `packages/bridge-plugin/src/ui.html`, find the existing `<section id="view-mismatch" class="pb" hidden>` and replace its inner content (preserving the outer section tag) with:

```html
<section id="view-mismatch" class="pb" hidden>
  <div class="lead">Update needed</div>
  <div class="lead-sub" id="mismatch-text">
    The MCP server version doesn't match this plugin.
  </div>

  <div class="divider"></div>

  <div class="step">
    <div class="step-header">
      <span class="step-num">1</span>
      <span class="step-label">Update command</span>
    </div>
    <div class="step-body">
      <code class="step-code" id="mismatch-cmd">npx pluginos@latest install</code>
      <button class="btn-secondary" id="btn-copy-update">Copy</button>
    </div>
    <div class="step-hint">
      Run this in a terminal, then restart your agent.
    </div>
  </div>

  <div class="step">
    <div class="step-header">
      <span class="step-num">2</span>
      <span class="step-label">Re-import the plugin in Figma</span>
    </div>
    <div class="step-body">
      <code class="step-code" id="mismatch-path">~/.pluginos/bridge/manifest.json</code>
      <button class="btn-secondary" id="btn-copy-path">Copy</button>
    </div>
    <div class="step-hint">
      Plugins → Development → Import plugin from manifest…
    </div>
  </div>
</section>
```

If the existing markup has other elements not shown here (e.g., a different inner structure), preserve any unrelated children. The above is the canonical new content — replace whatever is between the open and close section tags.

- [ ] **Step 3: Add `wireMismatchCopyButtons` to ui-entry.ts**

In `packages/bridge-plugin/src/ui-entry.ts`, add this function (near other init helpers — search for `attachThemeListener` and put it nearby):

```typescript
function wireMismatchCopyButtons(): void {
  const copyUpdate = document.getElementById("btn-copy-update");
  const copyPath = document.getElementById("btn-copy-path");
  copyUpdate?.addEventListener("click", () => {
    const cmd = document.getElementById("mismatch-cmd")?.textContent ?? "";
    navigator.clipboard?.writeText(cmd);
  });
  copyPath?.addEventListener("click", () => {
    const path = document.getElementById("mismatch-path")?.textContent ?? "";
    navigator.clipboard?.writeText(path);
  });
}
```

- [ ] **Step 4: Call `wireMismatchCopyButtons()` at init**

Find the init sequence in `ui-entry.ts` (search for `applyTheme(detectInitialTheme())` or `activityLog = new ActivityLog(`). Add a call to `wireMismatchCopyButtons()` adjacent to those init calls:

```typescript
applyTheme(detectInitialTheme());
attachThemeListener();
activityLog = new ActivityLog($("activity-log"));
activityLog.render();
wireMismatchCopyButtons();
```

- [ ] **Step 5: Build the bridge plugin**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run build -w packages/bridge-plugin`
Expected: build succeeds.

- [ ] **Step 6: Run all bridge-plugin tests**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/bridge-plugin`
Expected: all green.

- [ ] **Step 7: Commit**

Use `Skill(commit-commands:commit)`. Suggested message: `feat(bridge-plugin): make mismatch view actionable with copy-paste update buttons`.

---

## Task 10: Full check + smoke test prep

**Files:** None (verification only)

- [ ] **Step 1: Run full pipeline**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm run check`
Expected: lint, format, typecheck, build, test all pass.

- [ ] **Step 2: Confirm new test files are picked up**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && npm test -w packages/mcp-server 2>&1 | grep -E "Test Files|Tests"`
Expected: includes the 4 new CLI test files (dispatcher, install, cursor, generic). Total mcp-server tests +21 vs baseline (61 → 82).

- [ ] **Step 3: Smoke-test `pluginos install` end-to-end**

Run (in a fresh shell to avoid env pollution):

```bash
cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && \
  npm run build -w packages/shared && \
  npm run build -w packages/bridge-plugin && \
  npm run build -w packages/mcp-server && \
  PLUGINOS_STATE_DIR_OVERRIDE="" node packages/mcp-server/bin/pluginos.js install
```

Expected: success message printed, `~/.pluginos/bridge/manifest.json` exists.

If you don't want to affect the real `~/.pluginos/`, point HOME at a temp dir for the smoke test:

```bash
TEST_HOME=$(mktemp -d) HOME=$TEST_HOME node packages/mcp-server/bin/pluginos.js install
ls $TEST_HOME/.pluginos/bridge/
rm -rf $TEST_HOME
```

Expected: 4 files in `$TEST_HOME/.pluginos/bridge/`.

- [ ] **Step 4: Confirm clean working tree**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git status`
Expected: clean.

- [ ] **Step 5: Write the manual smoke test checklist for the PR body**

(For the PR description — not committed.)

```markdown
## Manual smoke test

Before merging, against a real Figma file + real shell:

1. **Fresh install:** `npx pluginos@<this-version> install`
   - Expect: "✓ PluginOS Bridge v<version> installed to ~/.pluginos/bridge/"
   - Verify: `~/.pluginos/bridge/manifest.json` exists
2. **Re-install (idempotent):** Re-run the same command.
   - Expect: "✓ updated to v<version>"
3. **Cursor agent:**
   - Pre-condition: `~/.cursor/mcp.json` exists with another MCP server entry
   - Run: `npx pluginos install --with-agent cursor`
   - Verify: `~/.cursor/mcp.json` now has both the other entry AND a `pluginos` entry
4. **Cursor agent — invalid JSON:**
   - Corrupt `~/.cursor/mcp.json` (add `{ not valid`)
   - Run: `npx pluginos install --with-agent cursor`
   - Expect: error message, exit 1, file unchanged
5. **Generic agent:** `npx pluginos install --with-agent generic`
   - Expect: JSON snippet printed with config locations for Cursor + Windsurf
6. **Help:** `npx pluginos --help`
   - Expect: usage message
7. **Version:** `npx pluginos --version`
   - Expect: semver string
8. **Server still starts:** `npx pluginos`
   - Expect: MCP server starts (no subcommand routing kicks in)
9. **Mismatch view:**
   - Open the bridge plugin in Figma against a version-mismatched server (build a 0.4.5 plugin, run a 0.4.4 server)
   - Verify: mismatch view shows the dynamic text + 2 copy buttons
   - Click each copy button, verify clipboard contains the expected string
```

---

## Task 11: Push branch + open PR

**Files:** None — git/gh only

- [ ] **Step 1: Push the branch**

Run: `cd "/Users/dimi/Documents/TheVault/00 Joint Projects/PluginOS" && git push -u origin feat/pr-c-install-polish`
Expected: pre-push hooks pass, branch pushed.

- [ ] **Step 2: Open the PR**

Run `gh pr create --base main --head feat/pr-c-install-polish --title "feat: PR-C install polish — pluginos install CLI + docs + mismatch view"` with a body containing:

- One-paragraph summary
- Bulleted list of what's shipped (CLI subcommand, Cursor + generic agents, INSTALL.md restructure, actionable mismatch view)
- Reference to the design doc and prior PRs (#27, #29, #31)
- The manual smoke test checklist from Task 10 Step 5
- Test plan: "All unit tests pass via `npm run check`. Manual smoke test pending against a real shell + Figma file."

- [ ] **Step 3: Report the PR URL to the user**

Terminal phase complete.

---

## Self-Review Notes

Performed:

1. **Spec coverage:**
   - §A (CLI surface) → Task 2 (dispatcher), Task 6 (wire flags) ✓
   - §B (bin/pluginos.js routing) → Task 7 ✓
   - §C (bridge extraction) → Task 3 ✓
   - §D (Cursor writer) → Task 4 ✓
   - §E (generic printer) → Task 5 ✓
   - §F (dispatcher) → Task 2 ✓
   - §G (build pipeline) → Task 1 ✓
   - §H (INSTALL.md) → Task 8 ✓
   - §I (mismatch view) → Task 9 ✓
   - Backwards compatibility → preserved by Task 7's fall-through to `dist/index.js` ✓
   - Testing strategy → Tasks 2-5 cover dispatcher + 3 unit test files; Task 10 covers manual smoke ✓
   - Non-goals → explicitly not in any task ✓

2. **Placeholder scan:** No TBDs. Task 6's `skipBridge` option is a real implementation choice motivated by the test design — it's explicit. Task 9 has a "preserve unrelated children" instruction because the existing markup may have CSS classes not shown in the spec — that's a defensive instruction, not a placeholder.

3. **Type consistency:** `InstallOptions`, `InstallResult`, `CursorOptions`, `CursorResult` shapes consistent across Tasks 3-6. `RunInstallOptions.skipBridge` defined in Task 6 used only in Task 6's tests.

4. **Known unknowns:**
   - Task 1 assumes the bridge plugin's `manifest.json` lives at `packages/bridge-plugin/manifest.json` (not in `dist/`). Verified during investigation: `package-bridge.mjs` reads it from this exact path.
   - Task 9 depends on the engineer reading and updating specific markup in `ui.html`. Explicit instruction to preserve unrelated children handles any structural drift.
