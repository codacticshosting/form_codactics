import { describe, it, expect, beforeEach } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/secret-box";
import { encryptStoredGoogleTokens } from "@/lib/token-migration";
import { resetDb } from "../helpers/db";
import { createTestAdmin } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";

const TOKEN = "1//0gExampleGoogleRefreshToken-abc_123";

beforeEach(async () => {
  await resetDb();
});

describe("secret box", () => {
  it("round-trips a token, and never stores it in plain text", () => {
    const stored = encryptSecret(TOKEN);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain(TOKEN);
    expect(decryptSecret(stored)).toBe(TOKEN);
  });

  it("gives a different ciphertext every time (random IV)", () => {
    expect(encryptSecret(TOKEN)).not.toBe(encryptSecret(TOKEN));
  });

  it("passes plain-text tokens stored before encryption through unchanged", () => {
    expect(decryptSecret(TOKEN)).toBe(TOKEN);
  });

  it("refuses a tampered value instead of returning garbage", () => {
    const stored = encryptSecret(TOKEN);
    const raw = Buffer.from(stored.slice(3), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptSecret(`v1:${raw.toString("base64")}`)).toThrow();
  });
});

describe("encryptStoredGoogleTokens", () => {
  it("encrypts tokens stored in plain text, and leaves encrypted ones alone", async () => {
    const legacy = await createTestAdmin();
    await prisma.admin.update({ where: { id: legacy.id }, data: { googleRefreshToken: TOKEN } });
    const modern = await createTestAdmin();
    const alreadyEncrypted = encryptSecret("other-token");
    await prisma.admin.update({ where: { id: modern.id }, data: { googleRefreshToken: alreadyEncrypted } });
    await createTestAdmin(); // no token at all

    expect(await encryptStoredGoogleTokens()).toBe(1);

    const legacyNow = (await prisma.admin.findUniqueOrThrow({ where: { id: legacy.id } })).googleRefreshToken!;
    expect(isEncrypted(legacyNow)).toBe(true);
    expect(decryptSecret(legacyNow)).toBe(TOKEN);
    expect((await prisma.admin.findUniqueOrThrow({ where: { id: modern.id } })).googleRefreshToken).toBe(
      alreadyEncrypted,
    );
    // Second run: nothing left to do.
    expect(await encryptStoredGoogleTokens()).toBe(0);
  });
});
