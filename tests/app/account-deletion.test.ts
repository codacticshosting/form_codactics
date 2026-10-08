import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/account-actions";
import { purgeDeletedAccounts } from "@/lib/account-deletion";
import { createDraft, loadForm, updateLiveForm } from "@/lib/form-actions";
import { submitFormAction } from "@/app/[slug]/actions";
import { initialSubmitState } from "@/types/submission";
import { ACCOUNT_DELETION_DAYS } from "@/lib/form-limits";
import { UPLOADS_ROOT } from "@/lib/local-storage";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { DEFAULT_THEME } from "@/types/theme";
import { DEFAULT_CLOSING } from "@/types/closing";
import { prisma } from "@/lib/prisma";

const mockSession: { current: { user: { id?: string; email?: string } } | null } = {
  current: null,
};

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

function legitFormData() {
  const fd = new FormData();
  fd.set("formRenderedAt", String(Date.now() - 5000));
  return fd;
}

async function signInAs(admin: { id: string; email: string }) {
  mockSession.current = { user: { id: admin.id, email: admin.email } };
}

// Puts an admin's deletion request `daysAgo` days in the past.
async function requestedDaysAgo(adminId: string, daysAgo: number) {
  await prisma.admin.update({
    where: { id: adminId },
    data: { deletionRequestedAt: new Date(Date.now() - daysAgo * DAY_MS) },
  });
}

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("requesting account deletion", () => {
  it("needs DELETE typed to confirm", async () => {
    const admin = await createTestAdmin();
    await signInAs(admin);
    expect(await requestAccountDeletion("delete me")).toEqual({ ok: false, error: "not-confirmed" });
    expect((await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } })).deletionRequestedAt).toBeNull();

    expect(await requestAccountDeletion("DELETE")).toEqual({ ok: true });
    expect(
      (await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } })).deletionRequestedAt,
    ).toBeInstanceOf(Date);
  });

  it("isolates the account at once: no responses, nothing new, nothing to edit", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    await signInAs(admin);
    await requestAccountDeletion("DELETE");

    const submit = await submitFormAction(form.slug, initialSubmitState, legitFormData());
    expect(submit).toEqual({ status: "error", message: "This form isn't accepting responses right now." });
    expect(await createDraft()).toEqual({ ok: false, error: "not-signed-in" });
    expect(await loadForm(form.id)).toEqual({ ok: false, error: "not-found" });
    expect(
      await updateLiveForm(form.id, {
        title: "X",
        fields: [],
        theme: DEFAULT_THEME,
        closing: DEFAULT_CLOSING,
      }),
    ).toEqual({ ok: false, error: "not-found" });
  });
});

describe("cancelling", () => {
  it("brings everything back within the deletion period", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    await signInAs(admin);
    await requestAccountDeletion("DELETE");

    expect(await cancelAccountDeletion()).toEqual({ ok: true });
    expect(await submitFormAction(form.slug, initialSubmitState, legitFormData())).toEqual({
      status: "success",
    });
  });

  it("is too late once the period is over — the account is erased instead", async () => {
    const admin = await createTestAdmin();
    await signInAs(admin);
    await requestedDaysAgo(admin.id, ACCOUNT_DELETION_DAYS + 1);

    expect(await cancelAccountDeletion()).toEqual({ ok: false });
    expect(await prisma.admin.count()).toBe(0);
  });
});

describe("erasing for good", () => {
  it(`erases the account and everything in it after ${ACCOUNT_DELETION_DAYS} days`, async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    const submission = await prisma.submission.create({ data: { formId: form.id, dataJson: "{}" } });
    const dir = path.join(UPLOADS_ROOT, form.id, submission.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "photo.png"), "x");
    await prisma.contactMessage.create({
      data: { email: admin.email, message: "Hi", adminId: admin.id },
    });
    await requestedDaysAgo(admin.id, ACCOUNT_DELETION_DAYS + 1);

    // Someone else, not deleting anything, is left alone.
    const bystander = await createTestAdmin();
    const theirForm = await createTestForm(bystander.id);

    expect(await purgeDeletedAccounts()).toBe(1);

    expect(await prisma.admin.findUnique({ where: { id: admin.id } })).toBeNull();
    expect(await prisma.form.findUnique({ where: { id: form.id } })).toBeNull();
    expect(await prisma.submission.count()).toBe(0);
    expect(await prisma.contactMessage.count()).toBe(0);
    expect(existsSync(path.join(UPLOADS_ROOT, form.id))).toBe(false);
    expect(await prisma.form.findUnique({ where: { id: theirForm.id } })).not.toBeNull();
  });

  it("keeps an account whose deletion period isn't over yet", async () => {
    const admin = await createTestAdmin();
    await requestedDaysAgo(admin.id, ACCOUNT_DELETION_DAYS - 1);
    expect(await purgeDeletedAccounts()).toBe(0);
    expect(await prisma.admin.count()).toBe(1);
  });

  it("lets the same person start again from zero afterwards", async () => {
    const admin = await createTestAdmin({ email: "returning@example.com" });
    await createTestForm(admin.id);
    await requestedDaysAgo(admin.id, ACCOUNT_DELETION_DAYS + 1);

    // What sign-in does for that email before creating the account.
    await purgeDeletedAccounts({ email: "returning@example.com" });
    const fresh = await prisma.admin.create({ data: { email: "returning@example.com" } });

    expect(fresh.id).not.toBe(admin.id);
    expect(fresh.deletionRequestedAt).toBeNull();
    expect(await prisma.form.count({ where: { adminId: fresh.id } })).toBe(0);
  });
});
