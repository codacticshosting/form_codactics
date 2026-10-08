"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { purgeDeletedAccounts } from "@/lib/account-deletion";

// What the admin has to type to confirm, so an account can't be deleted
// by one stray click.
const CONFIRMATION_WORD = "DELETE";

export type RequestAccountDeletionResult =
  | { ok: true }
  | { ok: false; error: "not-signed-in" | "not-confirmed" };

// Starts the deletion: the account is isolated from now on and erased for
// good after ACCOUNT_DELETION_DAYS (see account-deletion.ts).
export async function requestAccountDeletion(
  confirmation: string,
): Promise<RequestAccountDeletionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };
  if (confirmation.trim() !== CONFIRMATION_WORD) return { ok: false, error: "not-confirmed" };

  await prisma.admin.updateMany({
    where: { id: session.user.id, deletionRequestedAt: null },
    data: { deletionRequestedAt: new Date() },
  });
  return { ok: true };
}

// Changes of heart within the isolation period: everything comes back
// exactly as it was.
export async function cancelAccountDeletion(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { ok: false };
  // Too late once the period is over, even if nothing has erased the
  // account yet — do that now instead of reviving it.
  await purgeDeletedAccounts({ email: session.user.email });
  const { count } = await prisma.admin.updateMany({
    where: { id: session.user.id, deletionRequestedAt: { not: null } },
    data: { deletionRequestedAt: null },
  });
  return { ok: count > 0 };
}
