import { describe, it, expect, beforeEach, vi } from "vitest";
import { rm } from "node:fs/promises";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { checkUploadFits, submitFormAction } from "@/app/[slug]/actions";
import { initialSubmitState } from "@/types/submission";
import { publishForm, updateLiveForm } from "@/lib/form-actions";
import { setAdminStorageQuota, setStorageSettings } from "@/lib/super-admin-actions";
import {
  checkStorageCapacity,
  getAdminStorageSummary,
  getServerStorageOverview,
  getStorageSettings,
  isAdminStorageFull,
  quotaBytesFor,
} from "@/lib/storage-quota";
import {
  MB,
  STORAGE_FILE_TOO_BIG_MESSAGE,
  STORAGE_FULL_SUBMIT_MESSAGE,
} from "@/lib/storage-limits";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { DEFAULT_THEME } from "@/types/theme";
import { DEFAULT_CLOSING } from "@/types/closing";
import type { FormField } from "@/types/form-builder";
import { prisma } from "@/lib/prisma";

const mockSession: { current: { user: { id?: string; email?: string } } | null } = {
  current: null,
};
const SUPER_ADMIN_EMAIL = "boss@example.com";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mockCookies.has(name) ? { value: mockCookies.get(name)! } : undefined),
    set: (name: string, value: string) => {
      mockCookies.set(name, value);
    },
    delete: (name: string) => {
      mockCookies.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) => mockRequestHeaders.get(name) ?? null,
  }),
}));
vi.mock("@/auth", () => ({
  auth: async () => mockSession.current,
}));
vi.mock("@/lib/super-admin", () => ({
  isSuperAdminEmail: (email: string | null | undefined) => email === SUPER_ADMIN_EMAIL,
}));

const PHOTO_SCHEMA = JSON.stringify([
  { id: "photo1", type: "photo", label: "Photo", required: false },
  { id: "name1", type: "short-text", label: "Name", required: false },
]);

function formData(file?: File) {
  const fd = new FormData();
  fd.set("formRenderedAt", String(Date.now() - 5000));
  fd.set("name1", "Ada");
  if (file) fd.set("photo1", file);
  return fd;
}

const fileOf = (bytes: number) => new File([new Uint8Array(bytes)], "p.png", { type: "image/png" });

// An admin with a quota of `quotaMB`, already using `usedBytes` (put on a
// throwaway draft's storageBytes), and a published local form to submit to.
async function setup({ quotaMB = 1, usedBytes = 0, unlimited = false } = {}) {
  const admin = await prisma.admin.update({
    where: { id: (await createTestAdmin()).id },
    data: { storageQuotaMB: quotaMB, storageUnlimited: unlimited },
  });
  const form = await prisma.form.update({
    where: { id: (await createTestForm(admin.id)).id },
    data: { schema: PHOTO_SCHEMA },
  });
  if (usedBytes > 0) {
    const filler = await createTestForm(admin.id, { status: "draft" });
    await prisma.form.update({ where: { id: filler.id }, data: { storageBytes: usedBytes } });
  }
  return { admin, form };
}

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("settings and quotas", () => {
  it("creates the settings row with the agreed defaults", async () => {
    expect(await getStorageSettings()).toMatchObject({
      defaultQuotaMB: 200,
      totalLimitMB: null,
      reserveMB: 300,
    });
  });

  it("resolves an admin's quota from default, custom value or unlimited", () => {
    const settings = { defaultQuotaMB: 200, totalLimitMB: null, reserveMB: 300 };
    expect(quotaBytesFor({ storageQuotaMB: null, storageUnlimited: false }, settings)).toBe(200 * MB);
    expect(quotaBytesFor({ storageQuotaMB: 500, storageUnlimited: false }, settings)).toBe(500 * MB);
    expect(quotaBytesFor({ storageQuotaMB: 500, storageUnlimited: true }, settings)).toBeNull();
  });

  it("follows a changed default for admins without their own quota", async () => {
    const admin = await createTestAdmin();
    await prisma.storageSettings.create({ data: { id: 1, defaultQuotaMB: 300 } });
    expect((await getAdminStorageSummary(admin.id)).quotaBytes).toBe(300 * MB);
  });
});

describe("submitting to a local form", () => {
  it("accepts a response that fits", async () => {
    const { form } = await setup({ quotaMB: 1 });
    expect(await submitFormAction(form.slug, initialSubmitState, formData(fileOf(1000)))).toEqual({
      status: "success",
    });
  });

  it("refuses every response, even text-only, once the owner's storage is full", async () => {
    const { admin, form } = await setup({ quotaMB: 1, usedBytes: MB });
    expect(await isAdminStorageFull(admin.id)).toBe(true);
    expect(await submitFormAction(form.slug, initialSubmitState, formData())).toEqual({
      status: "error",
      message: STORAGE_FULL_SUBMIT_MESSAGE,
    });
    expect(await prisma.submission.count()).toBe(0);
  });

  it("refuses a file that doesn't fit the space left, with the file message", async () => {
    const { form } = await setup({ quotaMB: 1, usedBytes: MB - 5000 });
    expect(await submitFormAction(form.slug, initialSubmitState, formData(fileOf(10_000)))).toEqual({
      status: "error",
      message: STORAGE_FILE_TOO_BIG_MESSAGE,
    });
    // The same response without the file still fits.
    expect(await submitFormAction(form.slug, initialSubmitState, formData())).toEqual({
      status: "success",
    });
  });

  it("never limits an unlimited admin", async () => {
    const { admin, form } = await setup({ quotaMB: 1, usedBytes: 50 * MB, unlimited: true });
    expect(await isAdminStorageFull(admin.id)).toBe(false);
    expect(await submitFormAction(form.slug, initialSubmitState, formData(fileOf(1000)))).toEqual({
      status: "success",
    });
  });

  it("stops file uploads for everyone at the server-wide total limit, but not text", async () => {
    const { form } = await setup({ quotaMB: 100 });
    await prisma.storageSettings.create({ data: { id: 1, totalLimitMB: 1 } });
    const other = await createTestForm((await createTestAdmin()).id, { status: "draft" });
    await prisma.form.update({ where: { id: other.id }, data: { storageBytes: MB } });

    expect(await submitFormAction(form.slug, initialSubmitState, formData(fileOf(1000)))).toEqual({
      status: "error",
      message: STORAGE_FILE_TOO_BIG_MESSAGE,
    });
    expect(await submitFormAction(form.slug, initialSubmitState, formData())).toEqual({
      status: "success",
    });
  });

  it("stops file uploads when they'd eat into the disk reserve", async () => {
    const { admin } = await setup({ quotaMB: 100 });
    // A reserve bigger than any real disk — the free space is always under it.
    await prisma.storageSettings.create({ data: { id: 1, reserveMB: 1_000_000_000 } });
    expect(await checkStorageCapacity(admin.id, 1000)).toEqual({ ok: false, reason: "server-full" });
    expect(await checkStorageCapacity(admin.id, 1000, 0)).toEqual({ ok: true });
  });

  it("tells the page early whether a picked file fits", async () => {
    const { form } = await setup({ quotaMB: 1, usedBytes: MB - 5000 });
    expect(await checkUploadFits(form.slug, 1000)).toBe(true);
    expect(await checkUploadFits(form.slug, 10_000)).toBe(false);
  });
});

describe("publishing and editing local forms", () => {
  // A form whose only content is one embedded image of `bytes` bytes.
  function imageFields(bytes: number): FormField[] {
    const base64 = Buffer.alloc(bytes, 1).toString("base64");
    return [
      { id: "img", type: "image-display", label: "Pic", required: false, imageDataUrl: `data:image/png;base64,${base64}` },
    ] as unknown as FormField[];
  }

  it("refuses to publish images that don't fit", async () => {
    const { admin } = await setup({ quotaMB: 1 });
    mockSession.current = { user: { id: admin.id } };
    const result = await publishForm({
      title: "Big",
      fields: imageFields(2 * MB),
      theme: DEFAULT_THEME,
      storage: "local",
      closing: DEFAULT_CLOSING,
    });
    expect(result).toEqual({ ok: false, error: "storage-full" });
  });

  it("still saves an edit that adds no new image, even when storage is full", async () => {
    const { admin, form } = await setup({ quotaMB: 1, usedBytes: MB });
    mockSession.current = { user: { id: admin.id } };
    const fields = imageFields(1000);
    const theme = DEFAULT_THEME;
    // The form is already this size — the builder re-sends the same image
    // on every autosave.
    const { estimateStoredFormBytes } = await import("@/lib/storage-usage");
    await prisma.form.update({
      where: { id: form.id },
      data: {
        storageBytes: estimateStoredFormBytes(JSON.stringify(fields), JSON.stringify(theme)),
      },
    });

    const result = await updateLiveForm(form.id, {
      title: "Renamed",
      fields,
      theme,
      closing: DEFAULT_CLOSING,
    });
    expect(result.ok).toBe(true);
  });
});

describe("super-admin controls", () => {
  it("lets only super-admins change settings and quotas", async () => {
    const admin = await createTestAdmin();
    mockSession.current = { user: { email: "someone@example.com" } };
    expect(
      await setStorageSettings({ defaultQuotaMB: 500, totalLimitMB: null, reserveMB: 300 }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await setAdminStorageQuota(admin.id, { mode: "unlimited" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("sets an admin to a custom quota, unlimited, and back to the default", async () => {
    const admin = await createTestAdmin();
    mockSession.current = { user: { email: SUPER_ADMIN_EMAIL } };
    const get = () => prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });

    expect(await setAdminStorageQuota(admin.id, { mode: "custom", quotaMB: 1024 })).toEqual({ ok: true });
    expect(await get()).toMatchObject({ storageQuotaMB: 1024, storageUnlimited: false });

    await setAdminStorageQuota(admin.id, { mode: "unlimited" });
    expect(await get()).toMatchObject({ storageQuotaMB: null, storageUnlimited: true });

    await setAdminStorageQuota(admin.id, { mode: "default" });
    expect(await get()).toMatchObject({ storageQuotaMB: null, storageUnlimited: false });

    expect(await setAdminStorageQuota(admin.id, { mode: "custom", quotaMB: 0 })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("saves the storage settings and rejects nonsense", async () => {
    mockSession.current = { user: { email: SUPER_ADMIN_EMAIL } };
    expect(
      await setStorageSettings({ defaultQuotaMB: 500, totalLimitMB: 4096, reserveMB: 200 }),
    ).toEqual({ ok: true });
    expect(await getStorageSettings()).toMatchObject({
      defaultQuotaMB: 500,
      totalLimitMB: 4096,
      reserveMB: 200,
    });
    expect(
      await setStorageSettings({ defaultQuotaMB: 1.5, totalLimitMB: null, reserveMB: 200 }),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("summarizes usage across admins", async () => {
    await setup({ quotaMB: 1, usedBytes: MB }); // full
    await setup({ quotaMB: 1, usedBytes: 0.9 * MB }); // near
    await setup({ quotaMB: 1, unlimited: true });

    const overview = await getServerStorageOverview();
    expect(overview).toMatchObject({
      adminCount: 3,
      adminsFull: 1,
      adminsNearQuota: 1,
      adminsUnlimited: 1,
      adminsCustomQuota: 2,
      allocatedBytes: 2 * MB,
    });
  });
});
