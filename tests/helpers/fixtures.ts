import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/access-code";

export async function createTestAdmin(
  overrides: Partial<{ email: string; loginLimitFeatureEnabled: boolean }> = {},
) {
  return prisma.admin.create({
    data: {
      email: overrides.email ?? `admin-${randomUUID()}@example.com`,
      loginLimitFeatureEnabled: overrides.loginLimitFeatureEnabled ?? false,
    },
  });
}

export async function createTestForm(
  adminId: string,
  overrides: Partial<{
    slug: string;
    status: string;
    storageProvider: string;
    requireAccessCode: boolean;
    closeMode: string | null;
  }> = {},
) {
  return prisma.form.create({
    data: {
      adminId,
      slug: overrides.slug ?? `form-${randomUUID()}`,
      title: "Test form",
      status: overrides.status ?? "published",
      schema: "[]",
      theme: "{}",
      storageProvider: overrides.storageProvider ?? "local",
      requireAccessCode: overrides.requireAccessCode ?? false,
      closeMode: overrides.closeMode ?? null,
    },
  });
}

export async function createTestAccessCode(
  formId: string,
  username: string,
  password: string,
  overrides: Partial<{ maxLogins: number | null }> = {},
) {
  return prisma.formAccessCode.create({
    data: {
      formId,
      username,
      passwordHash: hashPassword(password),
      maxLogins: overrides.maxLogins ?? null,
    },
  });
}
