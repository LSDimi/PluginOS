import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  // Bundle @pluginos/shared inline; keep real npm deps external
  noExternal: ["@pluginos/shared"],
  external: ["ws", "@modelcontextprotocol/sdk", "zod"],
});
