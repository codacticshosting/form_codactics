import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { createTestAdmin } from "../helpers/fixtures";
import { submitContactMessage, updateContactMessage } from "@/lib/contact-actions";
import { purgeExpiredContactMessages } from "@/lib/contact-inbox";
import { CONTACT_RATE_LIMIT } from "@/lib/contact-messages";
import { prisma } from "@/lib/prisma";

// Who auth() says is signed in for the current test — null means nobody.
const mockSession: { current: { user: { id?: string; email?: string } } | null } = {
  current: null,
};
const SUPER_ADMIN_EMAIL = "boss@example.com";

// Vitest hoists vi.mock calls above every import in this file, so these
// are in place before contact-actions.ts (which imports all three) loads.
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

const VALID = { name: "Ada", email: "ada@example.com", message: "Hello there" };
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
  mockSession.current = null;
});

describe("submitContactMessage", () => {
  it("saves a valid message as new, without any IP", async () => {
    const result = await submitContactMessage(VALID);
    expect(result).toEqual({ ok: true });

    const rows = await prisma.contactMessage.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Ada",
      email: "ada@example.com",
      message: "Hello there",
      status: "new",
      source: "widget",
      adminId: null,
    });
    expect(JSON.stringify(rows[0])).not.toContain("127.0.0.1");
  });

  it("trims input and stores an empty name as null", async () => {
    await submitContactMessage({ name: "   ", email: "  ada@example.com ", message: "  Hi  " });
    const row = await prisma.contactMessage.findFirstOrThrow();
    expect(row).toMatchObject({ name: null, email: "ada@example.com", message: "Hi" });
  });

  it("links the message to the signed-in admin", async () => {
    const admin = await createTestAdmin();
    mockSession.current = { user: { id: admin.id, email: admin.email } };
    await submitContactMessage(VALID);
    const row = await prisma.contactMessage.findFirstOrThrow();
    expect(row.adminId).toBe(admin.id);
  });

  it("only accepts known sources", async () => {
    await submitContactMessage({ ...VALID, source: "feature-request" });
    await submitContactMessage({ ...VALID, source: "something-else" });
    const sources = (await prisma.contactMessage.findMany({ orderBy: { createdAt: "asc" } })).map(
      (row) => row.source,
    );
    expect(sources.sort()).toEqual(["feature-request", "widget"]);
  });

  it("reports success but saves nothing when the honeypot is filled", async () => {
    const result = await submitContactMessage({ ...VALID, website: "http://spam.example" });
    expect(result).toEqual({ ok: true });
    expect(await prisma.contactMessage.count()).toBe(0);
  });

  it("rejects an invalid email", async () => {
    const result = await submitContactMessage({ ...VALID, email: "not-an-email" });
    expect(result).toEqual({ ok: false, error: "invalid-email" });
    expect(await prisma.contactMessage.count()).toBe(0);
  });

  it("rejects an empty or overlong message", async () => {
    expect(await submitContactMessage({ ...VALID, message: "   " })).toEqual({
      ok: false,
      error: "invalid-message",
    });
    expect(await submitContactMessage({ ...VALID, message: "x".repeat(5001) })).toEqual({
      ok: false,
      error: "invalid-message",
    });
  });

  it("rejects an overlong name", async () => {
    expect(await submitContactMessage({ ...VALID, name: "x".repeat(101) })).toEqual({
      ok: false,
      error: "invalid-name",
    });
  });

  it(`blocks the message after ${CONTACT_RATE_LIMIT} per hour from one IP`, async () => {
    for (let i = 0; i < CONTACT_RATE_LIMIT; i++) {
      expect(await submitContactMessage(VALID)).toEqual({ ok: true });
    }
    const blocked = await submitContactMessage(VALID);
    expect(blocked).toMatchObject({ ok: false, error: "rate-limited" });
    expect(await prisma.contactMessage.count()).toBe(CONTACT_RATE_LIMIT);
  });

  it("doesn't count invalid submissions against the rate limit", async () => {
    for (let i = 0; i < CONTACT_RATE_LIMIT + 2; i++) {
      await submitContactMessage({ ...VALID, email: "typo" });
    }
    expect(await submitContactMessage(VALID)).toEqual({ ok: true });
  });
});

describe("updateContactMessage", () => {
  async function createMessage() {
    return prisma.contactMessage.create({ data: { email: "ada@example.com", message: "Hi" } });
  }

  it("refuses anyone who isn't a super-admin", async () => {
    const message = await createMessage();
    mockSession.current = { user: { email: "someone@example.com" } };
    expect(await updateContactMessage(message.id, "delete")).toEqual({
      ok: false,
      error: "forbidden",
    });
    mockSession.current = null;
    expect(await updateContactMessage(message.id, "delete")).toEqual({
      ok: false,
      error: "forbidden",
    });
    const unchanged = await prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(unchanged.status).toBe("new");
  });

  it("moves a message through read, unread, archive, delete and restore", async () => {
    const message = await createMessage();
    mockSession.current = { user: { email: SUPER_ADMIN_EMAIL } };
    const get = () => prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } });

    await updateContactMessage(message.id, "read");
    expect(await get()).toMatchObject({ status: "read", readAt: expect.any(Date) });

    await updateContactMessage(message.id, "unread");
    expect(await get()).toMatchObject({ status: "new", readAt: null });

    await updateContactMessage(message.id, "archive");
    expect(await get()).toMatchObject({ status: "archived", archivedAt: expect.any(Date) });

    await updateContactMessage(message.id, "delete");
    expect(await get()).toMatchObject({ status: "deleted", deletedAt: expect.any(Date) });

    await updateContactMessage(message.id, "restore");
    expect(await get()).toMatchObject({
      status: "read",
      readAt: expect.any(Date),
      archivedAt: null,
      deletedAt: null,
    });
  });

  it("permanently deletes a message from Archived or Trash", async () => {
    mockSession.current = { user: { email: SUPER_ADMIN_EMAIL } };
    const archived = await prisma.contactMessage.create({
      data: { email: "a@x.com", message: "Hi", status: "archived", archivedAt: new Date() },
    });
    const trashed = await prisma.contactMessage.create({
      data: { email: "b@x.com", message: "Hi", status: "deleted", deletedAt: new Date() },
    });

    expect(await updateContactMessage(archived.id, "purge")).toEqual({ ok: true });
    expect(await updateContactMessage(trashed.id, "purge")).toEqual({ ok: true });
    expect(await prisma.contactMessage.count()).toBe(0);
  });

  it("refuses to permanently delete a message still in the inbox", async () => {
    mockSession.current = { user: { email: SUPER_ADMIN_EMAIL } };
    const fresh = await createMessage();
    const read = await prisma.contactMessage.create({
      data: { email: "r@x.com", message: "Hi", status: "read", readAt: new Date() },
    });

    expect(await updateContactMessage(fresh.id, "purge")).toEqual({ ok: false, error: "not-allowed" });
    expect(await updateContactMessage(read.id, "purge")).toEqual({ ok: false, error: "not-allowed" });
    expect(await prisma.contactMessage.count()).toBe(2);
  });

  it("refuses permanent deletion to non-super-admins", async () => {
    const trashed = await prisma.contactMessage.create({
      data: { email: "b@x.com", message: "Hi", status: "deleted", deletedAt: new Date() },
    });
    mockSession.current = { user: { email: "someone@example.com" } };
    expect(await updateContactMessage(trashed.id, "purge")).toEqual({ ok: false, error: "forbidden" });
    expect(await prisma.contactMessage.count()).toBe(1);
  });

  it("reports a missing message", async () => {
    mockSession.current = { user: { email: SUPER_ADMIN_EMAIL } };
    expect(await updateContactMessage("does-not-exist", "read")).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});

describe("purgeExpiredContactMessages", () => {
  const now = new Date("2027-06-01T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  async function seed(email: string, data: Record<string, unknown>) {
    await prisma.contactMessage.create({ data: { email, message: "Hi", ...data } });
  }

  it("removes only messages past their status's retention period", async () => {
    await seed("new-expired@x.com", { status: "new", createdAt: daysAgo(366) });
    await seed("new-kept@x.com", { status: "new", createdAt: daysAgo(364) });
    // A read message's clock runs from readAt, not from when it arrived.
    await seed("read-expired@x.com", { status: "read", createdAt: daysAgo(300), readAt: daysAgo(121) });
    await seed("read-kept@x.com", { status: "read", createdAt: daysAgo(300), readAt: daysAgo(119) });
    await seed("archived-expired@x.com", { status: "archived", archivedAt: daysAgo(61) });
    await seed("archived-kept@x.com", { status: "archived", archivedAt: daysAgo(59) });
    await seed("deleted-expired@x.com", { status: "deleted", deletedAt: daysAgo(31) });
    await seed("deleted-kept@x.com", { status: "deleted", deletedAt: daysAgo(29) });

    expect(await purgeExpiredContactMessages(now)).toBe(4);

    const remaining = (await prisma.contactMessage.findMany()).map((row) => row.email).sort();
    expect(remaining).toEqual([
      "archived-kept@x.com",
      "deleted-kept@x.com",
      "new-kept@x.com",
      "read-kept@x.com",
    ]);
  });
});
