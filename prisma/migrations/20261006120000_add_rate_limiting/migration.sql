-- AlterTable
ALTER TABLE "FormAccessCode" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FormAccessCode" ADD COLUMN "lockedUntil" DATETIME;

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_kind_key_key" ON "RateLimitBucket"("kind", "key");
