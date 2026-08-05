import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    // Component tests (React rendering via @testing-library/react) opt
    // into jsdom individually via a `// @vitest-environment jsdom`
    // docblock at the top of the file (see any *.component.test.tsx) —
    // more reliable across vitest versions than glob-based environment
    // matching. Everything else (the vast majority — pure logic,
    // repositories, routes) runs under plain Node, which is faster and
    // doesn't need a DOM.
    environment: "node",
    setupFiles: ["./test/setup-jsdom.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "."),
      // See test/server-only-stub.ts for why this alias exists.
      "server-only": path.resolve(rootDir, "test/server-only-stub.ts"),
    },
  },
});
