// Server-only — never imported from a "use client" file.
import { prisma } from "@/lib/prisma";
import { retentionCutoff } from "@/lib/contact-messages";

// Permanently removes every message past its status's retention period.
// Run lazily each time the inbox page loads rather than on a schedule —
// there's no job runner here, and an expired message nobody looks at
// doing no harm for a little longer is fine.
export async function purgeExpiredContactMessages(now = new Date()): Promise<number> {
  const result = await prisma.contactMessage.deleteMany({
    where: {
      OR: [
        { status: "new", createdAt: { lt: retentionCutoff("new", now) } },
        { status: "read", readAt: { lt: retentionCutoff("read", now) } },
        { status: "archived", archivedAt: { lt: retentionCutoff("archived", now) } },
        { status: "deleted", deletedAt: { lt: retentionCutoff("deleted", now) } },
      ],
    },
  });
  return result.count;
}
