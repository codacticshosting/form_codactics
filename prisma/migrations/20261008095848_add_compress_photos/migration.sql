-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Form" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schema" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'google',
    "googleSheetId" TEXT,
    "googleDriveFolderId" TEXT,
    "closeMode" TEXT,
    "closesAt" DATETIME,
    "closeTimezoneLabel" TEXT,
    "requireAccessCode" BOOLEAN NOT NULL DEFAULT false,
    "storageBytes" INTEGER NOT NULL DEFAULT 0,
    "compressPhotos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "Form_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Form" ("adminId", "closeMode", "closeTimezoneLabel", "closesAt", "createdAt", "googleDriveFolderId", "googleSheetId", "id", "publishedAt", "requireAccessCode", "schema", "slug", "status", "storageBytes", "storageProvider", "theme", "title", "updatedAt") SELECT "adminId", "closeMode", "closeTimezoneLabel", "closesAt", "createdAt", "googleDriveFolderId", "googleSheetId", "id", "publishedAt", "requireAccessCode", "schema", "slug", "status", "storageBytes", "storageProvider", "theme", "title", "updatedAt" FROM "Form";
DROP TABLE "Form";
ALTER TABLE "new_Form" RENAME TO "Form";
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
