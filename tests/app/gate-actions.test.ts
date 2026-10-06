import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm, createTestAccessCode } from "../helpers/fixtures";
import { submitAccessCode } from "@/app/[slug]/gate-actions";
import { prisma } from "@/lib/prisma";
import { initialGateState } from "@/app/[slug]/gate-state";

// Vitest hoists vi.mock calls above every import in this file, so
// next/headers is already mocked by the time gate-actions.ts (which
// imports it) gets evaluated above.
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

function formDataFor(username: string, password: string) {
  const fd = new FormData();
  fd.set("username", username);
  fd.set("password", password);
  return fd;
}

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
});

describe("submitAccessCode", () => {
  it("rejects a wrong password without locking out on the first try", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { requireAccessCode: true });
    await createTestAccessCode(form.id, "alice", "correct-password");

    const result = await submitAccessCode(form.slug, initialGateState, formDataFor("alice", "wrong"));
    expect(result).toEqual({ status: "error", message: "Incorrect username or password." });

    const code = await prisma.formAccessCode.findUniqueOrThrow({
      where: { formId_username: { formId: form.id, username: "alice" } },
    });
    expect(code.failedAttempts).toBe(1);
    expect(code.lockedUntil).toBeNull();
  });

  it("locks the username out after 5 consecutive wrong passwords", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { requireAccessCode: true });
    await createTestAccessCode(form.id, "alice", "correct-password");

    let result;
    for (let i = 0; i < 5; i++) {
      result = await submitAccessCode(form.slug, initialGateState, formDataFor("alice", "wrong"));
    }
    expect(result).toEqual({
      status: "error",
      message: "Too many attempts. Please try again in 15 minutes.",
    });

    const code = await prisma.formAccessCode.findUniqueOrThrow({
      where: { formId_username: { formId: form.id, username: "alice" } },
    });
    expect(code.failedAttempts).toBe(5);
    expect(code.lockedUntil).not.toBeNull();
  });

  it("blocks the correct password while locked out", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { requireAccessCode: true });
    await createTestAccessCode(form.id, "alice", "correct-password");

    for (let i = 0; i < 5; i++) {
      await submitAccessCode(form.slug, initialGateState, formDataFor("alice", "wrong"));
    }

    const result = await submitAccessCode(
      form.slug,
      initialGateState,
      formDataFor("alice", "correct-password"),
    );
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toMatch(/Too many attempts/);
  });

  it("accepts the correct password and resets the failure counter", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { requireAccessCode: true });
    await createTestAccessCode(form.id, "alice", "correct-password");

    // One wrong guess first, to prove success resets it.
    await submitAccessCode(form.slug, initialGateState, formDataFor("alice", "wrong"));

    const result = await submitAccessCode(
      form.slug,
      initialGateState,
      formDataFor("alice", "correct-password"),
    );
    expect(result).toEqual({ status: "success", username: "alice" });

    const code = await prisma.formAccessCode.findUniqueOrThrow({
      where: { formId_username: { formId: form.id, username: "alice" } },
    });
    expect(code.failedAttempts).toBe(0);
    expect(code.loginCount).toBe(1);
  });

  it("enforces maxLogins once the admin has the feature enabled", async () => {
    const admin = await createTestAdmin({ loginLimitFeatureEnabled: true });
    const form = await createTestForm(admin.id, { requireAccessCode: true });
    await createTestAccessCode(form.id, "alice", "correct-password", { maxLogins: 1 });

    const first = await submitAccessCode(
      form.slug,
      initialGateState,
      formDataFor("alice", "correct-password"),
    );
    expect(first.status).toBe("success");

    const second = await submitAccessCode(
      form.slug,
      initialGateState,
      formDataFor("alice", "correct-password"),
    );
    expect(second).toEqual({
      status: "error",
      message: "This username has reached its login limit. Contact the organizer.",
    });
  });

  it("does NOT enforce maxLogins when the admin lacks the feature", async () => {
    const admin = await createTestAdmin({ loginLimitFeatureEnabled: false });
    const form = await createTestForm(admin.id, { requireAccessCode: true });
    await createTestAccessCode(form.id, "alice", "correct-password", { maxLogins: 1 });

    await submitAccessCode(form.slug, initialGateState, formDataFor("alice", "correct-password"));
    const second = await submitAccessCode(
      form.slug,
      initialGateState,
      formDataFor("alice", "correct-password"),
    );
    expect(second.status).toBe("success");
  });

  it("throttles repeated attempts from the same IP regardless of username", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id, { requireAccessCode: true });

    let result;
    for (let i = 0; i < 6; i++) {
      result = await submitAccessCode(
        form.slug,
        initialGateState,
        formDataFor("nonexistent-user", "whatever"),
      );
    }
    expect(result?.status).toBe("error");
    expect(result?.status === "error" && result.message).toMatch(/Too many attempts from this connection/);
  });
});
