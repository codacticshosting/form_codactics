import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import {
  duplicateForm,
  loadForm,
  publishForm,
  setFormCompressPhotos,
  updateDraft,
} from "@/lib/form-actions";
import { compressPhoto } from "@/lib/compress-photo";
import { DEFAULT_THEME } from "@/types/theme";
import { DEFAULT_CLOSING } from "@/types/closing";
import { prisma } from "@/lib/prisma";

const mockSession: { current: { user: { id?: string } } | null } = { current: null };

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

const compressPhotosOf = async (formId: string) =>
  (await prisma.form.findUniqueOrThrow({ where: { id: formId } })).compressPhotos;

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
});

describe("the Optimize uploaded photos setting", () => {
  it("is on by default for new forms", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    expect(form.compressPhotos).toBe(true);
  });

  it("is saved from the builder's autosave and loaded back", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { status: "draft" });
    mockSession.current = { user: { id: admin.id } };

    await updateDraft(form.id, {
      title: "T",
      fields: [],
      theme: DEFAULT_THEME,
      closing: DEFAULT_CLOSING,
      compressPhotos: false,
    });
    expect(await compressPhotosOf(form.id)).toBe(false);
    const loaded = await loadForm(form.id);
    expect(loaded.ok && loaded.compressPhotos).toBe(false);

    // An autosave that doesn't mention it leaves it alone.
    await updateDraft(form.id, { title: "T2", fields: [], theme: DEFAULT_THEME, closing: DEFAULT_CLOSING });
    expect(await compressPhotosOf(form.id)).toBe(false);
  });

  it("is saved from the publish dialog", async () => {
    const admin = await createTestAdmin();
    mockSession.current = { user: { id: admin.id } };
    const result = await publishForm({
      title: "Event",
      fields: [],
      theme: DEFAULT_THEME,
      storage: "local",
      closing: DEFAULT_CLOSING,
      compressPhotos: false,
    });
    expect(result.ok).toBe(true);
    const form = await prisma.form.findFirstOrThrow({ where: { adminId: admin.id } });
    expect(form.compressPhotos).toBe(false);
  });

  it("is copied when a form is duplicated", async () => {
    const admin = await createTestAdmin();
    const source = await createTestForm(admin.id);
    await prisma.form.update({ where: { id: source.id }, data: { compressPhotos: false } });
    mockSession.current = { user: { id: admin.id } };

    const result = await duplicateForm(source.id);
    if (!result.ok) throw new Error("duplicate failed");
    expect(await compressPhotosOf(result.formId)).toBe(false);
  });

  it("can be changed from the Settings page only by the form's owner", async () => {
    const owner = await createTestAdmin();
    const other = await createTestAdmin();
    const form = await createTestForm(owner.id);

    mockSession.current = { user: { id: other.id } };
    expect(await setFormCompressPhotos(form.id, false)).toEqual({ ok: false });
    expect(await compressPhotosOf(form.id)).toBe(true);

    mockSession.current = { user: { id: owner.id } };
    expect(await setFormCompressPhotos(form.id, false)).toEqual({ ok: true });
    expect(await compressPhotosOf(form.id)).toBe(false);
  });
});

describe("compressPhoto", () => {
  it("leaves anything that isn't a PNG or JPEG untouched", async () => {
    const pdf = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    expect(await compressPhoto(pdf)).toBe(pdf);
  });

  it("falls back to the original photo instead of failing when it can't resize", async () => {
    // No canvas/createImageBitmap outside a browser — exactly the kind of
    // failure that must never block an upload.
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "me.jpg", { type: "image/jpeg" });
    expect(await compressPhoto(photo)).toBe(photo);
  });
});
