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
    "googleSheetId" TEXT,
    "googleDriveFolderId" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'google',
    "nextcloudUrl" TEXT,
    "nextcloudPasswordEnc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "Form_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Form" ("adminId", "createdAt", "googleDriveFolderId", "googleSheetId", "id", "publishedAt", "schema", "slug", "status", "theme", "title", "updatedAt") SELECT "adminId", "createdAt", "googleDriveFolderId", "googleSheetId", "id", "publishedAt", "schema", "slug", "status", "theme", "title", "updatedAt" FROM "Form";
DROP TABLE "Form";
ALTER TABLE "new_Form" RENAME TO "Form";
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
