import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { uploadFormAttachment } from "@/lib/attachment-actions";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentUrl,
  sanitizeAttachments,
  type FormAttachment,
} from "@/lib/attachments";
import { deleteForm, deleteFormPermanently, duplicateForm, updateDraft } from "@/lib/form-actions";
import { removeUnusedFormFiles } from "@/lib/storage-usage";
import { FORM_FILES_ROOT } from "@/lib/local-storage";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { GET as getFile } from "@/app/api/forms/[formId]/files/[file]/route";
import { DEFAULT_THEME } from "@/types/theme";
import { DEFAULT_CLOSING } from "@/types/closing";
import type { FormField } from "@/types/form-builder";
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

const PDF = Buffer.from("%PDF-1.4\n% test document\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const EXE = Buffer.from("MZ\x90\x00 pretend program");

function upload(name: string, bytes: Buffer) {
  const data = new FormData();
  data.set("file", new File([new Uint8Array(bytes)], name));
  return data;
}

async function ownerWithForm(status = "draft") {
  const admin = await createTestAdmin();
  const form = await createTestForm(admin.id, { status });
  mockSession.current = { user: { id: admin.id } };
  return { admin, form };
}

function downloadsField(attachments: FormAttachment[]): FormField {
  return { id: "dl", type: "downloads", label: "Documents", required: false, attachments };
}

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("uploading", () => {
  it("accepts a real PDF and image, stores them and counts their size", async () => {
    const { form } = await ownerWithForm();
    const pdf = await uploadFormAttachment(form.id, "pdf", upload("Rules 2026.pdf", PDF));
    const png = await uploadFormAttachment(form.id, "image", upload("map.png", PNG));
    if (!pdf.ok || !png.ok) throw new Error("upload failed");

    expect(pdf.attachment).toMatchObject({ kind: "pdf", name: "Rules 2026.pdf", size: PDF.length });
    expect(pdf.attachment.url).toMatch(new RegExp(`^/api/forms/${form.id}/files/[0-9a-f-]{36}\\.pdf$`));
    expect(png.attachment.url).toMatch(/\.png$/);
    expect(await readdir(path.join(FORM_FILES_ROOT, form.id))).toHaveLength(2);
    const stored = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(stored.storageBytes).toBeGreaterThanOrEqual(PDF.length + PNG.length);
  });

  it("refuses a disguised file, judged by its content not its name", async () => {
    const { form } = await ownerWithForm();
    expect(await uploadFormAttachment(form.id, "pdf", upload("rules.pdf", EXE))).toEqual({
      ok: false,
      error: "wrong-type",
    });
    // A real PNG offered as a "PDF" is refused too.
    expect(await uploadFormAttachment(form.id, "pdf", upload("rules.pdf", PNG))).toEqual({
      ok: false,
      error: "wrong-type",
    });
  });

  it(`refuses files over ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`, async () => {
    const { form } = await ownerWithForm();
    const big = Buffer.concat([PDF, Buffer.alloc(ATTACHMENT_MAX_BYTES)]);
    expect(await uploadFormAttachment(form.id, "pdf", upload("big.pdf", big))).toEqual({
      ok: false,
      error: "too-large",
    });
  });

  it("refuses when the admin's storage is full", async () => {
    const { admin, form } = await ownerWithForm();
    await prisma.admin.update({ where: { id: admin.id }, data: { storageQuotaMB: 1 } });
    await prisma.form.update({ where: { id: form.id }, data: { storageBytes: 1024 * 1024 } });
    expect(await uploadFormAttachment(form.id, "pdf", upload("r.pdf", PDF))).toEqual({
      ok: false,
      error: "storage-full",
    });
  });

  it("only lets the form's owner upload", async () => {
    const { form } = await ownerWithForm();
    mockSession.current = { user: { id: (await createTestAdmin()).id } };
    expect(await uploadFormAttachment(form.id, "pdf", upload("r.pdf", PDF))).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});

describe("saving a form", () => {
  it("keeps only this form's own files, at most 3 of each kind", () => {
    const own = (n: number, ext: string): FormAttachment => ({
      id: `a${n}`,
      kind: ext === "pdf" ? "pdf" : "image",
      name: `f${n}.${ext}`,
      size: 10,
      url: attachmentUrl("form1", `00000000-0000-0000-0000-00000000000${n}.${ext}`),
    });
    const kept = sanitizeAttachments("form1", [
      own(1, "pdf"),
      own(2, "pdf"),
      own(3, "pdf"),
      own(4, "pdf"), // a 4th PDF
      own(5, "png"),
      { ...own(6, "pdf"), url: "https://evil.example/x.pdf" }, // not ours
      { ...own(7, "pdf"), url: attachmentUrl("otherForm", "00000000-0000-0000-0000-000000000007.pdf") },
      { ...own(8, "png"), kind: "pdf" }, // kind doesn't match the file
    ]);
    expect(kept.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a5"]);
  });

  it("drops foreign attachments when the builder autosaves", async () => {
    const { form } = await ownerWithForm();
    await updateDraft(form.id, {
      title: "T",
      fields: [
        downloadsField([
          { id: "x", kind: "pdf", name: "x.pdf", size: 1, url: "https://evil.example/x.pdf" },
        ]),
      ],
      theme: DEFAULT_THEME,
      closing: DEFAULT_CLOSING,
    });
    const saved = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(JSON.parse(saved.schema)[0].attachments).toEqual([]);
  });
});

describe("downloading", () => {
  async function publishedWithPdf() {
    const { form } = await ownerWithForm("published");
    const result = await uploadFormAttachment(form.id, "pdf", upload("Rules 2026.pdf", PDF));
    if (!result.ok) throw new Error("upload failed");
    await prisma.form.update({
      where: { id: form.id },
      data: { schema: JSON.stringify([downloadsField([result.attachment])]) },
    });
    const file = result.attachment.url.split("/").pop()!;
    return { form, file };
  }

  const get = (formId: string, file: string) =>
    getFile(new Request("http://localhost/x"), { params: Promise.resolve({ formId, file }) });

  it("serves a live form's file to anyone, as a protected download", async () => {
    const { form, file } = await publishedWithPdf();
    mockSession.current = null;
    const response = await get(form.id, file);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("Content-Disposition")).toContain("Rules%202026.pdf");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  });

  it("serves a draft's file only to its owner", async () => {
    const { form, file } = await publishedWithPdf();
    await prisma.form.update({ where: { id: form.id }, data: { status: "draft" } });

    expect((await get(form.id, file)).status).toBe(200); // owner still signed in
    mockSession.current = null;
    expect((await get(form.id, file)).status).toBe(404);
  });

  it("rejects anything that isn't a stored file name", async () => {
    const { form } = await publishedWithPdf();
    expect((await get(form.id, "../../prod.db")).status).toBe(404);
    expect((await get(form.id, "notes.txt")).status).toBe(404);
  });
});

describe("cleanup and copies", () => {
  it("removes files the form no longer uses, but not ones just uploaded", async () => {
    const { form } = await ownerWithForm();
    const dir = path.join(FORM_FILES_ROOT, form.id);
    await mkdir(dir, { recursive: true });
    const oldFile = "11111111-1111-1111-1111-111111111111.pdf";
    const freshFile = "22222222-2222-2222-2222-222222222222.pdf";
    await writeFile(path.join(dir, oldFile), PDF);
    await writeFile(path.join(dir, freshFile), PDF);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(path.join(dir, oldFile), twoHoursAgo, twoHoursAgo);

    await removeUnusedFormFiles(form.id);
    expect(await readdir(dir)).toEqual([freshFile]);
  });

  it("gives a duplicated form its own copies of the attached files", async () => {
    const { form } = await ownerWithForm("published");
    const result = await uploadFormAttachment(form.id, "pdf", upload("r.pdf", PDF));
    if (!result.ok) throw new Error("upload failed");
    await prisma.form.update({
      where: { id: form.id },
      data: { schema: JSON.stringify([downloadsField([result.attachment])]) },
    });

    const copy = await duplicateForm(form.id);
    if (!copy.ok) throw new Error("duplicate failed");
    const copied = await prisma.form.findUniqueOrThrow({ where: { id: copy.formId } });
    const url = JSON.parse(copied.schema)[0].attachments[0].url as string;
    expect(url.startsWith(`/api/forms/${copy.formId}/files/`)).toBe(true);
    expect(existsSync(path.join(FORM_FILES_ROOT, copy.formId, url.split("/").pop()!))).toBe(true);
  });

  it("deletes a form's attached files when it's deleted for good", async () => {
    const { form } = await ownerWithForm("published");
    await uploadFormAttachment(form.id, "pdf", upload("r.pdf", PDF));
    await deleteForm(form.id);
    await deleteFormPermanently(form.id);
    expect(existsSync(path.join(FORM_FILES_ROOT, form.id))).toBe(false);
  });
});
