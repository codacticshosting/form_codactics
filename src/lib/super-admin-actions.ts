"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { recalculateAllStorage, type RecalculateStorageResult } from "@/lib/storage-usage";

// Re-checked here on every call, independent of whatever the client-side
// "show the link" check already did — the real gate for every action in
// this file, never trusted from the caller.
async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return null;
  }
  return session;
}

// Client-safe way to ask "is the current user a super-admin" — reading
// super-admins.txt directly isn't possible from a "use client" component
// (no filesystem access in the browser), so UserMenu calls this instead to
// decide whether to show the "Control panel" link.
export async function checkIsSuperAdmin(): Promise<boolean> {
  const session = await auth();
  return isSuperAdminEmail(session?.user?.email);
}

export type SetAdminLimitsResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not-found" };

export async function setAdminLimits(
  adminId: string,
  limits: { maxDrafts: number | null; maxPublished: number | null },
): Promise<SetAdminLimitsResult> {
  const session = await requireSuperAdmin();
  if (!session) return { ok: false, error: "forbidden" };

  const target = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!target) return { ok: false, error: "not-found" };

  await prisma.admin.update({
    where: { id: adminId },
    data: {
      maxDrafts: limits.maxDrafts,
      maxPublished: limits.maxPublished,
    },
  });
  return { ok: true };
}

export type SetLoginLimitFeatureResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not-found" };

// Grants or revokes an admin's ability to set per-access-code login limits
// on their own forms (see FormAccessCode.maxLogins) — a straightforward
// on/off toggle, unlike the draft/publish caps which are numbers to type
// and save.
export async function setLoginLimitFeature(
  adminId: string,
  enabled: boolean,
): Promise<SetLoginLimitFeatureResult> {
  const session = await requireSuperAdmin();
  if (!session) return { ok: false, error: "forbidden" };

  const target = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!target) return { ok: false, error: "not-found" };

  await prisma.admin.update({
    where: { id: adminId },
    data: { loginLimitFeatureEnabled: enabled },
  });
  return { ok: true };
}

export type RecalculateStorageActionResult =
  | ({ ok: true } & RecalculateStorageResult)
  | { ok: false; error: "forbidden" };

// The control panel's "Recalculate & clean up" button — see
// recalculateAllStorage for what it does. Safe to run any time; also the
// way to fill in sizes for data stored before sizes were tracked.
export async function recalculateStorage(): Promise<RecalculateStorageActionResult> {
  const session = await requireSuperAdmin();
  if (!session) return { ok: false, error: "forbidden" };
  return { ok: true, ...(await recalculateAllStorage()) };
}
