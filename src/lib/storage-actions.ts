"use server";

import { auth } from "@/auth";
import { getAdminStorageSummary } from "@/lib/storage-quota";

export interface MyStorage {
  usedBytes: number;
  // null = unlimited.
  quotaBytes: number | null;
  freeBytes: number | null;
}

// The signed-in admin's own storage numbers, for client components (the
// publish dialog's "store locally" hint).
export async function getMyStorage(): Promise<MyStorage | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { usedBytes, quotaBytes, freeBytes } = await getAdminStorageSummary(session.user.id);
  return { usedBytes, quotaBytes, freeBytes };
}
