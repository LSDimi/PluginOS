import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  // DTS disabled: McpServer.tool() triggers TS2589 (infinite type depth)
  // in declaration emit. This package is an executable, not a library.
  dts: false,
  sourcemap: true,
  // Bundle @pluginos/shared inline; keep real npm deps external
  noExternal: ["@pluginos/shared"],
  external: ["ws", "@modelcontextprotocol/sdk", "zod"],
});
