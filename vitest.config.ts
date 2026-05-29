import { defineConfig } from "vitest/config";

/**
 * Standalone Vitest config (separate from `vite.config.ts`) so tests don't
 * load the CRX/React plugins. Tests target pure logic and run in Node.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
