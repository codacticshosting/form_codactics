import os from "node:os";
import path from "node:path";
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
      // Uploaded files and form images written during tests go to a
      // throwaway folder, never into the project's own data/ directory.
      LOCAL_STORAGE_ROOT: path.join(os.tmpdir(), "codactics-test-storage"),
    },
    globalSetup: ["./tests/global-setup.ts"],
    // All test files share one SQLite file (test.db) and each resets
    // shared tables in beforeEach — running files in parallel lets one
    // file's reset race another file's still-in-progress test. Simpler to
    // run serially than to give every file/worker its own database.
    fileParallelism: false,
  },
});
