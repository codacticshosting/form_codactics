import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // Falling back to the local dev file is only safe in dev — in
  // production a missing DATABASE_URL almost certainly means a
  // misconfigured deploy (e.g. forgot to point it at the Railway volume),
  // and silently running against a throwaway local file instead of
  // failing loudly would be far more confusing to debug later.
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. In production this must point at a file on persistent storage (e.g. a Railway volume) — see .env.example.",
    );
  }
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
