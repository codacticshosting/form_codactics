-- Nextcloud storage option removed; Google Drive is the only supported storage provider again.
ALTER TABLE "Form" DROP COLUMN "storageProvider";
ALTER TABLE "Form" DROP COLUMN "nextcloudUrl";
ALTER TABLE "Form" DROP COLUMN "nextcloudPasswordEnc";
