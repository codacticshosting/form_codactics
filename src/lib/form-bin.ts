// Server-only — never imported from a "use client" file.
import { prisma } from "@/lib/prisma";
import { BIN_RETENTION_DAYS } from "@/lib/form-limits";
import { removeFormFiles } from "@/lib/storage-usage";

const DAY_MS = 24 * 60 * 60 * 1000;

export function binPurgeDate(binnedAt: Date): Date {
  return new Date(binnedAt.getTime() + BIN_RETENTION_DAYS * DAY_MS);
}

// Deletes a form for good: its files on disk, then the form itself (its
// responses and access codes go with it via the database's cascade).
export async function deleteFormForGood(formId: string): Promise<void> {
  await removeFormFiles(formId);
  await prisma.form.delete({ where: { id: formId } });
}

// Permanently deletes every form that has sat in a Bin for longer than
// BIN_RETENTION_DAYS — for one admin, or everyone when adminId is
// omitted. Run lazily wherever bin contents or storage numbers matter
// (Manage forms, the control panel, the storage check) instead of on a
// schedule, since there's no job runner here.
export async function purgeExpiredBinnedForms(adminId?: string, now = new Date()): Promise<number> {
  const expired = await prisma.form.findMany({
    where: {
      status: "binned",
      binnedAt: { lt: new Date(now.getTime() - BIN_RETENTION_DAYS * DAY_MS) },
      ...(adminId ? { adminId } : {}),
    },
    select: { id: true },
  });
  for (const form of expired) await deleteFormForGood(form.id);
  return expired.length;
}
