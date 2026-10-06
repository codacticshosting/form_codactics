import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

// Runs once before the whole test run, in its own process — applies every
// migration to a throwaway test.db so tests run against the real schema,
// not a hand-maintained copy of it that could drift out of sync.
export default function globalSetup() {
  for (const file of ["test.db", "test.db-journal"]) {
    if (existsSync(file)) unlinkSync(file);
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
