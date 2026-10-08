// Server-only — never imported from a "use client" file. Storage quotas:
// how much each admin may store, how much they use, how much the server
// has, and the single capacity check every upload goes through.
//
// What counts toward an admin's usage: every form of theirs
// (Form.storageBytes — definition text incl. draft images, plus saved
// form images) and every locally-stored response (Submission.sizeBytes).
// Google Drive responses live in the admin's own Drive and never count.
import { stat, statfs } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { MB } from "@/lib/storage-limits";

export interface StorageSettingsValues {
  defaultQuotaMB: number;
  totalLimitMB: number | null;
  reserveMB: number;
}

export async function getStorageSettings(): Promise<StorageSettingsValues> {
  const existing = await prisma.storageSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  try {
    return await prisma.storageSettings.create({ data: { id: 1 } });
  } catch {
    // Two requests both found no row and raced to create it — the other
    // one won, so its row is there now.
    return prisma.storageSettings.findUniqueOrThrow({ where: { id: 1 } });
  }
}

type QuotaFields = { storageQuotaMB: number | null; storageUnlimited: boolean };

// null = unlimited.
export function quotaBytesFor(admin: QuotaFields, settings: StorageSettingsValues): number | null {
  if (admin.storageUnlimited) return null;
  return (admin.storageQuotaMB ?? settings.defaultQuotaMB) * MB;
}

export async function adminUsageBytes(adminId: string): Promise<number> {
  const [forms, submissions] = await Promise.all([
    prisma.form.aggregate({ where: { adminId }, _sum: { storageBytes: true } }),
    prisma.submission.aggregate({ where: { form: { adminId } }, _sum: { sizeBytes: true } }),
  ]);
  return (forms._sum.storageBytes ?? 0) + (submissions._sum.sizeBytes ?? 0);
}

async function usageByAdmin(): Promise<Map<string, number>> {
  const [forms, submissionsByForm] = await Promise.all([
    prisma.form.findMany({ select: { id: true, adminId: true, storageBytes: true } }),
    prisma.submission.groupBy({ by: ["formId"], _sum: { sizeBytes: true } }),
  ]);
  const usage = new Map<string, number>();
  const adminOfForm = new Map<string, string>();
  for (const form of forms) {
    adminOfForm.set(form.id, form.adminId);
    usage.set(form.adminId, (usage.get(form.adminId) ?? 0) + form.storageBytes);
  }
  for (const row of submissionsByForm) {
    const adminId = adminOfForm.get(row.formId);
    if (adminId) usage.set(adminId, (usage.get(adminId) ?? 0) + (row._sum.sizeBytes ?? 0));
  }
  return usage;
}

async function totalTrackedBytes(): Promise<{ formsBytes: number; responsesBytes: number }> {
  const [forms, submissions] = await Promise.all([
    prisma.form.aggregate({ _sum: { storageBytes: true } }),
    prisma.submission.aggregate({ _sum: { sizeBytes: true } }),
  ]);
  return {
    formsBytes: forms._sum.storageBytes ?? 0,
    responsesBytes: submissions._sum.sizeBytes ?? 0,
  };
}

export interface DiskStats {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

// The real disk (on Railway: the volume mounted at LOCAL_STORAGE_ROOT),
// read live — so enlarging the volume shows up without any change here.
// If the folder doesn't exist yet (nothing uploaded so far), its nearest
// existing parent is on the same disk. null if the platform can't report
// it at all.
export async function getDiskStats(): Promise<DiskStats | null> {
  let dir = path.resolve(LOCAL_STORAGE_ROOT);
  while (true) {
    try {
      const fs = await statfs(dir);
      const totalBytes = fs.blocks * fs.bsize;
      return {
        totalBytes,
        usedBytes: totalBytes - fs.bfree * fs.bsize,
        freeBytes: fs.bavail * fs.bsize,
      };
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

// The SQLite file itself (plus its journal/WAL), wherever DATABASE_URL
// points — shown separately in the super-admin overview.
async function databaseFileBytes(): Promise<number> {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!url.startsWith("file:")) return 0;
  const dbPath = path.resolve(url.slice("file:".length));
  let total = 0;
  for (const suffix of ["", "-journal", "-wal"]) {
    try {
      total += (await stat(dbPath + suffix)).size;
    } catch {
      // Not every one of these exists at any given time.
    }
  }
  return total;
}

export type CapacityResult =
  | { ok: true }
  | { ok: false; reason: "admin-full" | "admin-insufficient" | "server-full" };

// The one check before anything new is stored for an admin.
//  - admin-full: they're at/over their quota — nothing more is accepted,
//    not even a text-only response.
//  - admin-insufficient: there's room left, just not `incomingBytes` of it.
//  - server-full: this would break the server-wide total limit, or leave
//    less than the reserve free on disk. Only checked when files are
//    actually being stored, so small text-only writes keep working.
export async function checkStorageCapacity(
  adminId: string,
  incomingBytes: number,
  fileBytes: number = incomingBytes,
): Promise<CapacityResult> {
  const [settings, admin] = await Promise.all([
    getStorageSettings(),
    prisma.admin.findUnique({
      where: { id: adminId },
      select: { storageQuotaMB: true, storageUnlimited: true },
    }),
  ]);
  if (!admin) return { ok: false, reason: "admin-full" };

  const quota = quotaBytesFor(admin, settings);
  if (quota !== null) {
    const used = await adminUsageBytes(adminId);
    if (used >= quota) return { ok: false, reason: "admin-full" };
    if (used + incomingBytes > quota) return { ok: false, reason: "admin-insufficient" };
  }

  if (fileBytes > 0) {
    if (settings.totalLimitMB !== null) {
      const { formsBytes, responsesBytes } = await totalTrackedBytes();
      if (formsBytes + responsesBytes + fileBytes > settings.totalLimitMB * MB) {
        return { ok: false, reason: "server-full" };
      }
    }
    const disk = await getDiskStats();
    if (disk && disk.freeBytes - fileBytes < settings.reserveMB * MB) {
      return { ok: false, reason: "server-full" };
    }
  }
  return { ok: true };
}

export async function isAdminStorageFull(adminId: string): Promise<boolean> {
  const [settings, admin] = await Promise.all([
    getStorageSettings(),
    prisma.admin.findUnique({
      where: { id: adminId },
      select: { storageQuotaMB: true, storageUnlimited: true },
    }),
  ]);
  if (!admin) return false;
  const quota = quotaBytesFor(admin, settings);
  return quota !== null && (await adminUsageBytes(adminId)) >= quota;
}

export interface FormStorageRow {
  id: string;
  title: string;
  status: string;
  storageProvider: string;
  formBytes: number;
  responseBytes: number;
  responseCount: number;
}

export interface AdminStorageSummary {
  usedBytes: number;
  // null = unlimited.
  quotaBytes: number | null;
  freeBytes: number | null;
  isFull: boolean;
  forms: FormStorageRow[];
}

export async function getAdminStorageSummary(adminId: string): Promise<AdminStorageSummary> {
  const [settings, admin, forms, perForm] = await Promise.all([
    getStorageSettings(),
    prisma.admin.findUnique({
      where: { id: adminId },
      select: { storageQuotaMB: true, storageUnlimited: true },
    }),
    prisma.form.findMany({
      where: { adminId },
      select: { id: true, title: true, status: true, storageProvider: true, storageBytes: true },
    }),
    prisma.submission.groupBy({
      by: ["formId"],
      where: { form: { adminId } },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
  ]);
  const responsesByForm = new Map(perForm.map((row) => [row.formId, row]));
  const rows: FormStorageRow[] = forms.map((form) => {
    const responses = responsesByForm.get(form.id);
    return {
      id: form.id,
      title: form.title,
      status: form.status,
      storageProvider: form.storageProvider,
      formBytes: form.storageBytes,
      responseBytes: responses?._sum.sizeBytes ?? 0,
      responseCount: responses?._count._all ?? 0,
    };
  });
  const usedBytes = rows.reduce((sum, row) => sum + row.formBytes + row.responseBytes, 0);
  const quotaBytes = admin ? quotaBytesFor(admin, settings) : settings.defaultQuotaMB * MB;
  return {
    usedBytes,
    quotaBytes,
    freeBytes: quotaBytes === null ? null : Math.max(0, quotaBytes - usedBytes),
    isFull: quotaBytes !== null && usedBytes >= quotaBytes,
    forms: rows.sort((a, b) => b.formBytes + b.responseBytes - (a.formBytes + a.responseBytes)),
  };
}

export interface AdminStorageRow {
  adminId: string;
  usedBytes: number;
  quotaBytes: number | null;
}

export interface ServerStorageOverview {
  settings: StorageSettingsValues;
  disk: DiskStats | null;
  databaseBytes: number;
  formsBytes: number;
  responsesBytes: number;
  adminCount: number;
  adminsStoringData: number;
  adminsNearQuota: number;
  adminsFull: number;
  adminsCustomQuota: number;
  adminsUnlimited: number;
  // Sum of every limited admin's quota — what's been promised, which can
  // exceed the disk (most admins never fill theirs).
  allocatedBytes: number;
  perAdmin: AdminStorageRow[];
}

export async function getServerStorageOverview(): Promise<ServerStorageOverview> {
  const [settings, disk, databaseBytes, tracked, admins, usage] = await Promise.all([
    getStorageSettings(),
    getDiskStats(),
    databaseFileBytes(),
    totalTrackedBytes(),
    prisma.admin.findMany({ select: { id: true, storageQuotaMB: true, storageUnlimited: true } }),
    usageByAdmin(),
  ]);

  const overview: ServerStorageOverview = {
    settings,
    disk,
    databaseBytes,
    ...tracked,
    adminCount: admins.length,
    adminsStoringData: 0,
    adminsNearQuota: 0,
    adminsFull: 0,
    adminsCustomQuota: 0,
    adminsUnlimited: 0,
    allocatedBytes: 0,
    perAdmin: [],
  };
  for (const admin of admins) {
    const usedBytes = usage.get(admin.id) ?? 0;
    const quotaBytes = quotaBytesFor(admin, settings);
    if (usedBytes > 0) overview.adminsStoringData += 1;
    if (admin.storageUnlimited) overview.adminsUnlimited += 1;
    else if (admin.storageQuotaMB !== null) overview.adminsCustomQuota += 1;
    if (quotaBytes !== null) {
      overview.allocatedBytes += quotaBytes;
      if (usedBytes >= quotaBytes) overview.adminsFull += 1;
      else if (usedBytes >= quotaBytes * 0.8) overview.adminsNearQuota += 1;
    }
    overview.perAdmin.push({ adminId: admin.id, usedBytes, quotaBytes });
  }
  return overview;
}
