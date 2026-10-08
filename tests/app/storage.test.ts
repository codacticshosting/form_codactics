import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { submitFormAction } from "@/app/[slug]/actions";
import { initialSubmitState } from "@/types/submission";
import { deleteForm, duplicateForm } from "@/lib/form-actions";
import { deleteAllResponses, deleteResponse } from "@/lib/response-actions";
import {
  recalculateAllStorage,
  refreshFormStorageBytes,
  removeUnusedFormAssets,
} from "@/lib/storage-usage";
import { SCHEMA_ASSETS_ROOT, UPLOADS_ROOT } from "@/lib/local-storage";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { MAX_UPLOAD_BYTES } from "@/lib/storage-limits";
import { prisma } from "@/lib/prisma";

const mockSession: { current: { user: { id?: string; email?: string } } | null } = {
  current: null,
};

// Vitest hoists vi.mock calls above every import in this file.
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

const PHOTO_SCHEMA = JSON.stringify([
  { id: "photo1", type: "photo", label: "Photo", required: false },
]);

// The smallest valid PNG header is enough — nothing here decodes it.
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function photoFormData(file: File) {
  const fd = new FormData();
  fd.set("formRenderedAt", String(Date.now() - 5000));
  fd.set("photo1", file);
  return fd;
}

async function signIn(adminId: string) {
  mockSession.current = { user: { id: adminId } };
}

async function createPhotoForm(adminId: string) {
  const form = await createTestForm(adminId);
  return prisma.form.update({ where: { id: form.id }, data: { schema: PHOTO_SCHEMA } });
}

async function writeAsset(formId: string, fileName: string, content = "img") {
  const dir = path.join(SCHEMA_ASSETS_ROOT, formId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), content);
}

const assetUrl = (formId: string, fileName: string) =>
  `/api/forms/${formId}/schema-assets/${fileName}`;

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("response size tracking", () => {
  it("records a response's file bytes plus its text as sizeBytes", async () => {
    const admin = await createTestAdmin();
    const form = await createPhotoForm(admin.id);

    const result = await submitFormAction(
      form.slug,
      initialSubmitState,
      photoFormData(new File([PNG_BYTES], "me.png", { type: "image/png" })),
    );
    expect(result).toEqual({ status: "success" });

    const submission = await prisma.submission.findFirstOrThrow({ where: { formId: form.id } });
    expect(submission.sizeBytes).toBe(
      PNG_BYTES.length + Buffer.byteLength(submission.dataJson, "utf8"),
    );
    expect(existsSync(path.join(UPLOADS_ROOT, form.id, submission.id, "me.png"))).toBe(true);
  });

  it("rejects a file over the per-file limit without saving anything", async () => {
    const admin = await createTestAdmin();
    const form = await createPhotoForm(admin.id);

    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.png", { type: "image/png" });
    const result = await submitFormAction(form.slug, initialSubmitState, photoFormData(big));
    expect(result.status).toBe("error");
    expect(result.message).toContain("was not submitted");
    expect(result.message).toContain("huge.png");
    expect(await prisma.submission.count()).toBe(0);
  });
});

describe("deleting responses", () => {
  async function submitOne(slug: string) {
    await submitFormAction(
      slug,
      initialSubmitState,
      photoFormData(new File([PNG_BYTES], "p.png", { type: "image/png" })),
    );
    // Each submission from the same IP counts toward the per-form rate
    // limit; a fresh IP keeps these setup submissions from tripping it.
    mockRequestHeaders.set("x-forwarded-for", `10.0.0.${Math.floor(Math.random() * 250)}`);
  }

  it("deletes one response together with its files", async () => {
    const admin = await createTestAdmin();
    const form = await createPhotoForm(admin.id);
    await submitOne(form.slug);
    await submitOne(form.slug);
    const [first, second] = await prisma.submission.findMany({ where: { formId: form.id } });

    await signIn(admin.id);
    expect(await deleteResponse(form.id, first.id)).toEqual({ ok: true, deleted: 1 });

    expect(await prisma.submission.count()).toBe(1);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id, first.id))).toBe(false);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id, second.id))).toBe(true);
  });

  it("deletes all of a form's responses and their files", async () => {
    const admin = await createTestAdmin();
    const form = await createPhotoForm(admin.id);
    await submitOne(form.slug);
    await submitOne(form.slug);

    await signIn(admin.id);
    expect(await deleteAllResponses(form.id)).toEqual({ ok: true, deleted: 2 });
    expect(await prisma.submission.count()).toBe(0);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id))).toBe(false);
  });

  it("refuses to delete another admin's responses", async () => {
    const owner = await createTestAdmin();
    const intruder = await createTestAdmin();
    const form = await createPhotoForm(owner.id);
    await submitOne(form.slug);
    const submission = await prisma.submission.findFirstOrThrow();

    await signIn(intruder.id);
    expect(await deleteResponse(form.id, submission.id)).toEqual({ ok: false, error: "not-found" });
    expect(await deleteAllResponses(form.id)).toEqual({ ok: false, error: "not-found" });
    mockSession.current = null;
    expect(await deleteAllResponses(form.id)).toEqual({ ok: false, error: "not-signed-in" });
    expect(await prisma.submission.count()).toBe(1);
  });
});

describe("form files", () => {
  it("deleting a form removes its uploads and form images", async () => {
    const admin = await createTestAdmin();
    const form = await createPhotoForm(admin.id);
    await submitFormAction(
      form.slug,
      initialSubmitState,
      photoFormData(new File([PNG_BYTES], "p.png", { type: "image/png" })),
    );
    await writeAsset(form.id, "logo.png");

    await signIn(admin.id);
    expect(await deleteForm(form.id)).toEqual({ ok: true });
    expect(existsSync(path.join(UPLOADS_ROOT, form.id))).toBe(false);
    expect(existsSync(path.join(SCHEMA_ASSETS_ROOT, form.id))).toBe(false);
  });

  it("inlines a deleted form's images into any copy that still points at them", async () => {
    const admin = await createTestAdmin();
    const original = await createTestForm(admin.id);
    await writeAsset(original.id, "logo.png", "LOGO");
    const copy = await createTestForm(admin.id);
    await prisma.form.update({
      where: { id: copy.id },
      data: { theme: JSON.stringify({ logo: assetUrl(original.id, "logo.png") }) },
    });

    await signIn(admin.id);
    await deleteForm(original.id);

    const updated = await prisma.form.findUniqueOrThrow({ where: { id: copy.id } });
    expect(updated.theme).not.toContain(original.id);
    expect(updated.theme).toContain(
      `data:image/png;base64,${Buffer.from("LOGO").toString("base64")}`,
    );
  });

  it("duplicating a form embeds its saved images instead of pointing at them", async () => {
    const admin = await createTestAdmin();
    const source = await createTestForm(admin.id);
    await writeAsset(source.id, "a.png", "A");
    await prisma.form.update({
      where: { id: source.id },
      data: { schema: JSON.stringify([{ id: "x", imageDataUrl: assetUrl(source.id, "a.png") }]) },
    });

    await signIn(admin.id);
    const result = await duplicateForm(source.id);
    if (!result.ok) throw new Error("duplicate failed");

    const copy = await prisma.form.findUniqueOrThrow({ where: { id: result.formId } });
    expect(copy.schema).not.toContain("/schema-assets/");
    expect(copy.schema).toContain("data:image/png;base64,");
    expect(copy.storageBytes).toBe(
      Buffer.byteLength(copy.schema, "utf8") + Buffer.byteLength(copy.theme, "utf8"),
    );
  });

  it("removes form images the form no longer references", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    await writeAsset(form.id, "new.png", "NEW");
    await writeAsset(form.id, "old.png", "OLD");
    await prisma.form.update({
      where: { id: form.id },
      data: { theme: JSON.stringify({ logo: assetUrl(form.id, "new.png") }) },
    });

    expect(await removeUnusedFormAssets(form.id)).toBe(3);
    expect(await readdir(path.join(SCHEMA_ASSETS_ROOT, form.id))).toEqual(["new.png"]);
  });

  it("counts a form's definition text plus its saved images", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    await writeAsset(form.id, "logo.png", "12345");

    const bytes = await refreshFormStorageBytes(form.id);
    expect(bytes).toBe(
      Buffer.byteLength(form.schema, "utf8") + Buffer.byteLength(form.theme, "utf8") + 5,
    );
    expect((await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).storageBytes).toBe(bytes);
  });
});

describe("recalculateAllStorage", () => {
  it("fixes drifted sizes and removes leftovers no form or response owns", async () => {
    const admin = await createTestAdmin();
    const form = await createPhotoForm(admin.id);
    await submitFormAction(
      form.slug,
      initialSubmitState,
      photoFormData(new File([PNG_BYTES], "p.png", { type: "image/png" })),
    );
    const submission = await prisma.submission.findFirstOrThrow();
    const correctSize = submission.sizeBytes;
    await prisma.submission.update({ where: { id: submission.id }, data: { sizeBytes: 0 } });

    // Leftovers: a deleted form's uploads and images, and a response
    // folder for a response that no longer exists.
    await mkdir(path.join(UPLOADS_ROOT, "gone-form", "gone-sub"), { recursive: true });
    await writeFile(path.join(UPLOADS_ROOT, "gone-form", "gone-sub", "x.png"), "12345");
    await writeAsset("gone-form", "logo.png", "123");
    await mkdir(path.join(UPLOADS_ROOT, form.id, "gone-sub"), { recursive: true });
    await writeFile(path.join(UPLOADS_ROOT, form.id, "gone-sub", "y.png"), "1234567");

    const result = await recalculateAllStorage();

    expect(result).toMatchObject({
      formsMeasured: 1,
      submissionsMeasured: 1,
      leftoversRemoved: 3,
      bytesFreed: 5 + 3 + 7,
    });
    expect(result.sizesCorrected).toBeGreaterThanOrEqual(1);
    expect((await prisma.submission.findFirstOrThrow()).sizeBytes).toBe(correctSize);
    expect(existsSync(path.join(UPLOADS_ROOT, "gone-form"))).toBe(false);
    expect(existsSync(path.join(SCHEMA_ASSETS_ROOT, "gone-form"))).toBe(false);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id, "gone-sub"))).toBe(false);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id, submission.id))).toBe(true);
  });
});
