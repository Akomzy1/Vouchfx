import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@vouchfx/config": resolve(__dirname, "../../packages/config/src/index.ts"),
    },
  },
});
