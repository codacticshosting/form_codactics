// Server-only. Encrypts Google refresh tokens that were stored before
// encryption existed (see secret-box.ts). Run once at every server start
// from src/instrumentation.ts; a no-op once everything is encrypted.
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secret-box";

export async function encryptStoredGoogleTokens(): Promise<number> {
  const plain = await prisma.admin.findMany({
    where: { googleRefreshToken: { not: null }, NOT: { googleRefreshToken: { startsWith: "v1:" } } },
    select: { id: true, googleRefreshToken: true },
  });
  for (const admin of plain) {
    await prisma.admin.update({
      where: { id: admin.id },
      data: { googleRefreshToken: encryptSecret(admin.googleRefreshToken!) },
    });
  }
  return plain.length;
}
