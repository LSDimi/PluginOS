import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["src/__tests__/ui/**/*.test.ts", "happy-dom"]],
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
