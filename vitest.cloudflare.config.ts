import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Placeholder Cloudflare gate for M0: asserts the Worker entry module loads in Node
 * after a successful cf:build. Full workerd e2e arrives in later milestones.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@contracts": path.resolve(__dirname, "src/contracts"),
      "@server": path.resolve(__dirname, "src/server"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/cloudflare/**/*.test.ts"],
  },
});
