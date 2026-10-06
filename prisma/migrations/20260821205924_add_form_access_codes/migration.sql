-- Per-visitor username/password access gating for public forms.
ALTER TABLE "Form" ADD COLUMN "requireAccessCode" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FormAccessCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormAccessCode_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FormAccessCode_formId_username_key" ON "FormAccessCode"("formId", "username");
