// Server-only — reads super-admins.txt fresh on every call (it's a tiny
// file) rather than caching it, so adding or removing a line takes effect
// immediately without a restart or rebuild. Never imported from a "use
// client" file; see super-admin-actions.ts for the client-safe way to ask
// "is the current user a super-admin."
import { readFileSync } from "node:fs";
import path from "node:path";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";

const ALLOWLIST_PATH = path.join(LOCAL_STORAGE_ROOT, "super-admins.txt");

function readSuperAdminEmails(): Set<string> {
  let raw: string;
  try {
    raw = readFileSync(ALLOWLIST_PATH, "utf-8");
  } catch {
    // File missing entirely (e.g. a fresh clone before anyone copies
    // super-admins.example.txt) — no super-admins, not a crash.
    return new Set();
  }
  const usernames = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return new Set(usernames.map((username) => `${username.toLowerCase()}@gmail.com`));
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return readSuperAdminEmails().has(email.toLowerCase());
}
