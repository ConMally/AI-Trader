import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "."),
      // See test/server-only-stub.ts for why this alias exists.
      "server-only": path.resolve(rootDir, "test/server-only-stub.ts"),
    },
  },
});
