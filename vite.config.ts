import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      "@contracts": path.resolve(__dirname, "src/contracts"),
      "@server": path.resolve(__dirname, "src/server"),
    },
  },
  build: {
    outDir: "dist/client",
  },
  server: {
    port: 3000,
  },
});
