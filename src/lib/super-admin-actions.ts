"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { recalculateAllStorage, type RecalculateStorageResult } from "@/lib/storage-usage";
import { getStorageSettings } from "@/lib/storage-quota";

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

export type SetStorageSettingsResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid" };

function isWholeNumber(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}

// The control panel's Storage settings: default quota for every admin
// without their own, an optional cap on everything stored combined
// (null = the whole disk), and the free-space reserve.
export async function setStorageSettings(input: {
  defaultQuotaMB: number;
  totalLimitMB: number | null;
  reserveMB: number;
}): Promise<SetStorageSettingsResult> {
  const session = await requireSuperAdmin();
  if (!session) return { ok: false, error: "forbidden" };
  if (
    !isWholeNumber(input.defaultQuotaMB, 1) ||
    !isWholeNumber(input.reserveMB, 0) ||
    (input.totalLimitMB !== null && !isWholeNumber(input.totalLimitMB, 1))
  ) {
    return { ok: false, error: "invalid" };
  }
  await getStorageSettings(); // makes sure the single settings row exists
  await prisma.storageSettings.update({
    where: { id: 1 },
    data: {
      defaultQuotaMB: input.defaultQuotaMB,
      totalLimitMB: input.totalLimitMB,
      reserveMB: input.reserveMB,
    },
  });
  return { ok: true };
}

export type AdminStorageQuota =
  | { mode: "default" }
  | { mode: "custom"; quotaMB: number }
  | { mode: "unlimited" };

export type SetAdminStorageQuotaResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not-found" | "invalid" };

// Raising or lowering one admin's storage. Lowering it below what they
// already use never deletes anything — it only stops new uploads (and
// new responses) until they're back under it.
export async function setAdminStorageQuota(
  adminId: string,
  quota: AdminStorageQuota,
): Promise<SetAdminStorageQuotaResult> {
  const session = await requireSuperAdmin();
  if (!session) return { ok: false, error: "forbidden" };
  if (quota.mode === "custom" && !isWholeNumber(quota.quotaMB, 1)) {
    return { ok: false, error: "invalid" };
  }

  const target = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!target) return { ok: false, error: "not-found" };

  await prisma.admin.update({
    where: { id: adminId },
    data: {
      storageUnlimited: quota.mode === "unlimited",
      storageQuotaMB: quota.mode === "custom" ? quota.quotaMB : null,
    },
  });
  return { ok: true };
}
