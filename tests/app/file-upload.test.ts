import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { submitFormAction } from "@/app/[slug]/actions";
import { initialSubmitState } from "@/types/submission";
import { UPLOADS_ROOT } from "@/lib/local-storage";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { MAX_UPLOAD_BYTES } from "@/lib/storage-limits";
import { prisma } from "@/lib/prisma";

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

const FIELD_ID = "proof";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const PDF = Buffer.from("%PDF-1.7\ntest");
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2]);
const officeZip = (folder: string) =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(`[Content_Types].xml ${folder}document.xml`),
  ]);

function formData(...files: File[]) {
  const data = new FormData();
  data.set("formRenderedAt", String(Date.now() - 5000));
  for (const file of files) data.append(FIELD_ID, file);
  return data;
}

const fileOf = (name: string, bytes: Buffer) => new File([new Uint8Array(bytes)], name);

async function createUploadForm() {
  const admin = await createTestAdmin();
  const form = await createTestForm(admin.id);
  return prisma.form.update({
    where: { id: form.id },
    data: {
      schema: JSON.stringify([
        { id: FIELD_ID, type: "file-upload", label: "Payment proof", required: false },
      ]),
    },
  });
}

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("File upload field", () => {
  it.each([
    ["proof.png", PNG],
    ["proof.jpg", JPEG],
    ["proof.jpeg", JPEG],
    ["proof.pdf", PDF],
    ["proof.doc", OLE],
    ["proof.docx", officeZip("word/")],
    ["proof.xls", OLE],
    ["proof.xlsx", officeZip("xl/")],
    ["proof.pptx", officeZip("ppt/")],
  ])("stores %s", async (name, bytes) => {
    const form = await createUploadForm();

    const result = await submitFormAction(form.slug, initialSubmitState, formData(fileOf(name, bytes)));

    expect(result).toEqual({ status: "success" });
    const submission = await prisma.submission.findFirstOrThrow();
    expect(existsSync(path.join(UPLOADS_ROOT, form.id, submission.id, name))).toBe(true);
    expect(JSON.parse(submission.dataJson).answers[FIELD_ID].value.originalName).toBe(name);
  });

  it.each([
    ["a program renamed to .pdf", "proof.pdf", Buffer.from("MZ pretend program")],
    ["an ordinary zip renamed to .docx", "proof.docx", Buffer.from("PK\x03\x04 holiday photos")],
    ["a Word package renamed to .xlsx", "proof.xlsx", officeZip("word/")],
    ["a type that isn't allowed", "notes.txt", Buffer.from("plain text")],
    ["an old PowerPoint file", "slides.ppt", OLE],
  ])("refuses %s", async (_case, name, bytes) => {
    const form = await createUploadForm();

    const result = await submitFormAction(form.slug, initialSubmitState, formData(fileOf(name, bytes)));

    expect(result.status).toBe("error");
    expect(result.message).toContain("was not submitted");
    expect(await prisma.submission.count()).toBe(0);
  });

  it("refuses more than one file", async () => {
    const form = await createUploadForm();

    const result = await submitFormAction(
      form.slug,
      initialSubmitState,
      formData(fileOf("a.png", PNG), fileOf("b.pdf", PDF)),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("only one file");
    expect(await prisma.submission.count()).toBe(0);
  });

  it("refuses a file over 10 MB", async () => {
    const form = await createUploadForm();
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_UPLOAD_BYTES)]);

    const result = await submitFormAction(form.slug, initialSubmitState, formData(fileOf("big.pdf", big)));

    expect(result.status).toBe("error");
    expect(result.message).toContain("larger than 10 MB");
    expect(await prisma.submission.count()).toBe(0);
  });

  it("is optional unless the admin makes it required", async () => {
    const form = await createUploadForm();

    const result = await submitFormAction(form.slug, initialSubmitState, formData());

    expect(result).toEqual({ status: "success" });
  });
});
