import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import {
  deleteForm,
  deleteFormPermanently,
  loadForm,
  restoreFormFromBin,
  setMaintenanceMode,
} from "@/lib/form-actions";
import { purgeExpiredBinnedForms } from "@/lib/form-bin";
import { BIN_LIMIT, BIN_RETENTION_DAYS } from "@/lib/form-limits";
import { submitFormAction } from "@/app/[slug]/actions";
import { initialSubmitState } from "@/types/submission";
import { UPLOADS_ROOT } from "@/lib/local-storage";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
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

const DAY_MS = 24 * 60 * 60 * 1000;
const statusOf = async (formId: string) =>
  (await prisma.form.findUniqueOrThrow({ where: { id: formId } })).status;

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("moving a form to the Bin", () => {
  it("takes it offline but keeps it, its responses and files", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    await prisma.submission.create({ data: { formId: form.id, dataJson: "{}" } });
    mockSession.current = { user: { id: admin.id } };

    expect(await deleteForm(form.id)).toEqual({ ok: true });
    const binned = await prisma.form.findUniqueOrThrow({ where: { id: form.id } });
    expect(binned).toMatchObject({ status: "binned", binnedFromStatus: "published" });
    expect(binned.binnedAt).toBeInstanceOf(Date);
    expect(await prisma.submission.count()).toBe(1);

    const result = await submitFormAction(form.slug, initialSubmitState, new FormData());
    expect(result.status).toBe("error");
  });

  it(`refuses a ${BIN_LIMIT + 1}th form while the Bin holds ${BIN_LIMIT}`, async () => {
    const admin = await createTestAdmin();
    mockSession.current = { user: { id: admin.id } };
    for (let i = 0; i < BIN_LIMIT; i++) {
      const form = await createTestForm(admin.id);
      expect(await deleteForm(form.id)).toEqual({ ok: true });
    }
    const extra = await createTestForm(admin.id);
    expect(await deleteForm(extra.id)).toEqual({ ok: false, error: "bin-full" });
    expect(await statusOf(extra.id)).toBe("published");
  });

  it("only lets the owner bin a form", async () => {
    const owner = await createTestAdmin();
    const other = await createTestAdmin();
    const form = await createTestForm(owner.id);
    mockSession.current = { user: { id: other.id } };
    expect(await deleteForm(form.id)).toEqual({ ok: false, error: "not-found" });
    expect(await statusOf(form.id)).toBe("published");
  });

  it("can't be edited or put into maintenance while binned", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    mockSession.current = { user: { id: admin.id } };
    await deleteForm(form.id);

    expect(await loadForm(form.id)).toEqual({ ok: false, error: "not-found" });
    expect(await setMaintenanceMode(form.id, true)).toEqual({ ok: false });
    expect(await statusOf(form.id)).toBe("binned");
  });
});

describe("restoring from the Bin", () => {
  it("brings a published form back as archived, never straight online", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    mockSession.current = { user: { id: admin.id } };
    await deleteForm(form.id);

    expect(await restoreFormFromBin(form.id)).toEqual({ ok: true, status: "archived" });
    expect(await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).toMatchObject({
      status: "archived",
      binnedAt: null,
      binnedFromStatus: null,
    });
  });

  it("brings a draft back as a draft, if under the draft limit", async () => {
    const admin = await createTestAdmin();
    await prisma.admin.update({ where: { id: admin.id }, data: { maxDrafts: 1 } });
    const draft = await createTestForm(admin.id, { status: "draft" });
    mockSession.current = { user: { id: admin.id } };
    await deleteForm(draft.id);

    // Another draft takes the only slot in the meantime.
    const other = await createTestForm(admin.id, { status: "draft" });
    expect(await restoreFormFromBin(draft.id)).toEqual({ ok: false, error: "draft-limit" });

    await prisma.form.delete({ where: { id: other.id } });
    expect(await restoreFormFromBin(draft.id)).toEqual({ ok: true, status: "draft" });
  });
});

describe("deleting for good", () => {
  it("removes a binned form, its responses and files right away", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    const submission = await prisma.submission.create({ data: { formId: form.id, dataJson: "{}" } });
    const dir = path.join(UPLOADS_ROOT, form.id, submission.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "p.png"), "x");
    mockSession.current = { user: { id: admin.id } };

    // Not straight from Manage forms — only from the Bin.
    expect(await deleteFormPermanently(form.id)).toEqual({ ok: false });

    await deleteForm(form.id);
    expect(await deleteFormPermanently(form.id)).toEqual({ ok: true });
    expect(await prisma.form.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id))).toBe(false);
  });

  it(`empties forms from the Bin after ${BIN_RETENTION_DAYS} days, and only those`, async () => {
    const admin = await createTestAdmin();
    const old = await createTestForm(admin.id);
    const recent = await createTestForm(admin.id);
    const now = new Date();
    await prisma.form.update({
      where: { id: old.id },
      data: {
        status: "binned",
        binnedFromStatus: "published",
        binnedAt: new Date(now.getTime() - (BIN_RETENTION_DAYS + 1) * DAY_MS),
      },
    });
    await prisma.form.update({
      where: { id: recent.id },
      data: {
        status: "binned",
        binnedFromStatus: "published",
        binnedAt: new Date(now.getTime() - (BIN_RETENTION_DAYS - 1) * DAY_MS),
      },
    });

    expect(await purgeExpiredBinnedForms(undefined, now)).toBe(1);
    expect((await prisma.form.findMany()).map((f) => f.id)).toEqual([recent.id]);
  });
});
