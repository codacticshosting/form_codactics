import { prisma } from "@/lib/prisma";

// Clears every table between tests so one test's rows never leak into the
// next — cheap enough on SQLite to just do for every test rather than
// reasoning about which tables a given test actually touched.
export async function resetDb() {
  await prisma.contactMessage.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.formAccessCode.deleteMany();
  await prisma.form.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.storageSettings.deleteMany();
}
