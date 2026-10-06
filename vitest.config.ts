import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // A dedicated SQLite file, separate from dev.db — migrated fresh by
    // globalSetup below, never touching real data.
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "vitest-only-secret-never-used-outside-tests",
    },
    globalSetup: ["./tests/global-setup.ts"],
    // All test files share one SQLite file (test.db) and each resets
    // shared tables in beforeEach — running files in parallel lets one
    // file's reset race another file's still-in-progress test. Simpler to
    // run serially than to give every file/worker its own database.
    fileParallelism: false,
  },
});
