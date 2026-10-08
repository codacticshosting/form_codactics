-- CreateTable
CREATE TABLE "StorageSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "defaultQuotaMB" INTEGER NOT NULL DEFAULT 200,
    "totalLimitMB" INTEGER,
    "reserveMB" INTEGER NOT NULL DEFAULT 300,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "googleRefreshToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "maxDrafts" INTEGER,
    "maxPublished" INTEGER,
    "loginLimitFeatureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "storageQuotaMB" INTEGER,
    "storageUnlimited" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Admin" ("createdAt", "email", "googleRefreshToken", "id", "image", "loginLimitFeatureEnabled", "maxDrafts", "maxPublished", "name", "updatedAt") SELECT "createdAt", "email", "googleRefreshToken", "id", "image", "loginLimitFeatureEnabled", "maxDrafts", "maxPublished", "name", "updatedAt" FROM "Admin";
DROP TABLE "Admin";
ALTER TABLE "new_Admin" RENAME TO "Admin";
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
