-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'widget',
    "adminId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "readAt" DATETIME,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    CONSTRAINT "ContactMessage_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
-- Not part of the contact-messages change itself: brings RateLimitBucket.windowStart
-- in line with the schema's @default(now()), which the add_rate_limiting migration
-- left out. Data is copied across unchanged.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RateLimitBucket" ("count", "id", "key", "kind", "windowStart") SELECT "count", "id", "key", "kind", "windowStart" FROM "RateLimitBucket";
DROP TABLE "RateLimitBucket";
ALTER TABLE "new_RateLimitBucket" RENAME TO "RateLimitBucket";
CREATE UNIQUE INDEX "RateLimitBucket_kind_key_key" ON "RateLimitBucket"("kind", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");
