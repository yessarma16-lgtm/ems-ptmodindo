import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Mirror Next.js's "react-server" conditional export (server-only's
      // package.json points there -> empty.js, a no-op) — Vitest has no
      // react-server condition, so without this alias any file importing
      // "server-only" throws immediately in plain Node. Only this one
      // marker package is aliased; nothing else about module resolution
      // changes.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
