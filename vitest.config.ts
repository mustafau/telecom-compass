import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@contracts": path.resolve(__dirname, "src/contracts"),
      "@server": path.resolve(__dirname, "src/server"),
    },
  },
  test: {
    environment: "node",
    env: {
      COMPASS_ENABLE_TEST_FIXTURES: "1",
      AUTHORIZATION_CONFIG_FILE: "./config/auth/test-personas.yaml",
    },
    include: [
      "tests/unit/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
  },
});
