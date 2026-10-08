// Server-only — never imported from a "use client" file. Account
// deletion: an admin asks for it on the Account page, the account is
// isolated for ACCOUNT_DELETION_DAYS (every form offline, nothing new
// accepted), and then the admin and everything they own on this server is
// erased for good. Signing in again afterwards creates a brand-new, empty
// account.
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_DELETION_DAYS } from "@/lib/form-limits";
import { removeFormFiles } from "@/lib/storage-usage";

const DAY_MS = 24 * 60 * 60 * 1000;

export function accountDeletionDate(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_DAYS * DAY_MS);
}

export async function isAccountDeletionPending(adminId: string): Promise<boolean> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { deletionRequestedAt: true },
  });
  return admin?.deletionRequestedAt != null;
}

// Erases one admin for good: every form's files on disk, their contact
// messages, Google's grant to this app, then the admin row — which takes
// every form, response and access code with it (database cascade).
export async function eraseAccount(adminId: string): Promise<void> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { googleRefreshToken: true, forms: { select: { id: true } } },
  });
  if (!admin) return;

  for (const form of admin.forms) await removeFormFiles(form.id);
  await prisma.contactMessage.deleteMany({ where: { adminId } });

  // Best effort: also withdraw the Drive access the admin once granted.
  // Their Sheets and Drive files stay — those are in their own Google
  // account, not ours.
  if (admin.googleRefreshToken) {
    try {
      const client = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
      await client.revokeToken(admin.googleRefreshToken);
    } catch {
      // Already revoked, expired, or Google unreachable — nothing more to do.
    }
  }

  await prisma.admin.delete({ where: { id: adminId } });
}

// Erases every account whose isolation period is over — or only the one
// with `email`, which sign-in uses so a returning admin always starts
// fresh instead of finding their old account. Run lazily (sign-in, Manage
// forms, the control panel, storage recalculation) since there's no job
// runner here.
export async function purgeDeletedAccounts(
  options: { email?: string; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const due = await prisma.admin.findMany({
    where: {
      deletionRequestedAt: { lt: new Date(now.getTime() - ACCOUNT_DELETION_DAYS * DAY_MS) },
      ...(options.email ? { email: options.email } : {}),
    },
    select: { id: true },
  });
  for (const admin of due) await eraseAccount(admin.id);
  return due.length;
}
