-- AlterTable
ALTER TABLE "Admin" ADD COLUMN "loginLimitFeatureEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FormAccessCode" ADD COLUMN "maxLogins" INTEGER;
ALTER TABLE "FormAccessCode" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0;
