-- Deadline / manual closing for published forms.
ALTER TABLE "Form" ADD COLUMN "closeMode" TEXT;
ALTER TABLE "Form" ADD COLUMN "closesAt" DATETIME;
ALTER TABLE "Form" ADD COLUMN "closeTimezoneLabel" TEXT;
