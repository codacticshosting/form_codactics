import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { submitFormAction } from "@/app/[slug]/actions";
import { prisma } from "@/lib/prisma";
import { initialSubmitState } from "@/types/submission";

// Vitest hoists vi.mock above every import in this file, so next/headers
// is already mocked by the time actions.ts (which imports it) is
// evaluated above.
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

// A plain submission old enough to pass the timing check, with no
// honeypot value — what a real visitor's browser would send.
function legitFormData() {
  const fd = new FormData();
  fd.set("formRenderedAt", String(Date.now() - 5000));
  return fd;
}

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
});

describe("submitFormAction", () => {
  it("rejects a form that doesn't exist", async () => {
    const result = await submitFormAction("no-such-slug", initialSubmitState, legitFormData());
    expect(result).toEqual({
      status: "error",
      message: "This form isn't accepting responses right now.",
    });
  });

  it("rejects a draft (unpublished) form", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { status: "draft" });
    const result = await submitFormAction(form.slug, initialSubmitState, legitFormData());
    expect(result.status).toBe("error");
  });

  it("rejects a manually closed form", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { closeMode: "manual" });
    const result = await submitFormAction(form.slug, initialSubmitState, legitFormData());
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toMatch(/not taking any more data/);
  });

  it("silently accepts without recording when the honeypot is filled", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    const fd = legitFormData();
    fd.set("website", "I am a bot");

    const result = await submitFormAction(form.slug, initialSubmitState, fd);
    expect(result).toEqual({ status: "success" });

    const count = await prisma.submission.count({ where: { formId: form.id } });
    expect(count).toBe(0);
  });

  it("silently accepts without recording when submitted too fast", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    const fd = new FormData();
    fd.set("formRenderedAt", String(Date.now())); // "just now" — under MIN_FILL_TIME_MS

    const result = await submitFormAction(form.slug, initialSubmitState, fd);
    expect(result).toEqual({ status: "success" });

    const count = await prisma.submission.count({ where: { formId: form.id } });
    expect(count).toBe(0);
  });

  it("accepts and actually records a normal, slow-enough submission", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);

    const result = await submitFormAction(form.slug, initialSubmitState, legitFormData());
    expect(result).toEqual({ status: "success" });

    const count = await prisma.submission.count({ where: { formId: form.id } });
    expect(count).toBe(1);
  });

  it("rate-limits repeated submissions from the same IP", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);

    let result;
    for (let i = 0; i < 6; i++) {
      result = await submitFormAction(form.slug, initialSubmitState, legitFormData());
    }
    expect(result).toEqual({
      status: "error",
      message: expect.stringMatching(/Too many submissions from this connection/),
    });

    // Only the first 5 (allowed) should have actually been recorded.
    const count = await prisma.submission.count({ where: { formId: form.id } });
    expect(count).toBe(5);
  });
});
