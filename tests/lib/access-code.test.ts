import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  verifyAccessToken,
} from "@/lib/access-code";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("salts each hash differently, even for the same password", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("createAccessToken / verifyAccessToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a valid token for the right form", () => {
    const token = createAccessToken("form-1", "alice");
    const verified = verifyAccessToken(token, "form-1");
    expect(verified).toEqual({ username: "alice" });
  });

  it("rejects a token presented for a different form", () => {
    const token = createAccessToken("form-1", "alice");
    expect(verifyAccessToken(token, "form-2")).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = createAccessToken("form-1", "alice");
    const tampered = token.replace("alice", "mallory");
    expect(verifyAccessToken(tampered, "form-1")).toBeNull();
  });

  it("rejects a token after it expires", () => {
    const token = createAccessToken("form-1", "alice");
    vi.advanceTimersByTime(1000 * 60 * 60 * 13); // past the 12h session
    expect(verifyAccessToken(token, "form-1")).toBeNull();
  });

  it("rejects a malformed token instead of throwing", () => {
    expect(verifyAccessToken("not.a.real.token", "form-1")).toBeNull();
  });
});
