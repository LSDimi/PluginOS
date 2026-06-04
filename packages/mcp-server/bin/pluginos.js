#!/usr/bin/env node

const subcommand = process.argv[2];

if (subcommand) {
  const { runCli } = await import("../dist/cli/index.js");
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
} else {
  await import("../dist/index.js");
}
