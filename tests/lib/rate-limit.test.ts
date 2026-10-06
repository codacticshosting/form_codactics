import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockCookies, mockRequestHeaders, resetMockRequest } from "../helpers/mock-request";
import { resetDb } from "../helpers/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Vitest hoists vi.mock calls above every import in this file (static or
// dynamic), so next/headers is already mocked by the time the import above
// runs — this just has to appear somewhere in the file, not necessarily
// textually first.
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

beforeEach(async () => {
  await resetDb();
  resetMockRequest();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit("test-kind", "key-a", 3, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks once the limit is reached", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("test-kind", "key-b", 3, 60_000);
    }
    const result = await checkRateLimit("test-kind", "key-b", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("test-kind", "key-c1", 3, 60_000);
    }
    const blocked = await checkRateLimit("test-kind", "key-c1", 3, 60_000);
    const stillAllowed = await checkRateLimit("test-kind", "key-c2", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(stillAllowed.allowed).toBe(true);
  });

  it("tracks separate kinds independently, even with the same key", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("kind-one", "shared-key", 3, 60_000);
    }
    const blocked = await checkRateLimit("kind-one", "shared-key", 3, 60_000);
    const stillAllowed = await checkRateLimit("kind-two", "shared-key", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(stillAllowed.allowed).toBe(true);
  });

  it("resets once the window has passed", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("test-kind", "key-d", 3, 100);
    }
    expect((await checkRateLimit("test-kind", "key-d", 3, 100)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await checkRateLimit("test-kind", "key-d", 3, 100)).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("reads the first address from x-forwarded-for", async () => {
    mockRequestHeaders.set("x-forwarded-for", "203.0.113.5, 70.41.3.18");
    expect(await getClientIp()).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    mockRequestHeaders.delete("x-forwarded-for");
    mockRequestHeaders.set("x-real-ip", "198.51.100.9");
    expect(await getClientIp()).toBe("198.51.100.9");
  });

  it("falls back to \"unknown\" when neither header is present", async () => {
    mockRequestHeaders.delete("x-forwarded-for");
    expect(await getClientIp()).toBe("unknown");
  });
});
