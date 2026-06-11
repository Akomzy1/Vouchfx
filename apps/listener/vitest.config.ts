import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@vouchfx/config": resolve(__dirname, "../../packages/config/src/index.ts"),
      "@vouchfx/core":   resolve(__dirname, "../../packages/core/src/index.ts"),
      "@vouchfx/db":     resolve(__dirname, "../../packages/db/src/index.ts"),
    },
  },
});
