import { prisma } from "@/lib/prisma";

// Finds a title that doesn't collide with any of this admin's existing
// forms (draft or published), appending _2, _3, ... as needed — e.g.
// "Untitled", "Untitled_2", "Untitled_3", or "Summer Cup" -> "Summer Cup_2".
export async function generateUniqueTitle(
  adminId: string,
  desiredTitle: string,
  excludeFormId?: string,
): Promise<string> {
  const existing = await prisma.form.findMany({
    where: { adminId, ...(excludeFormId ? { id: { not: excludeFormId } } : {}) },
    select: { title: true },
  });
  const taken = new Set(existing.map((f) => f.title.toLowerCase()));

  if (!taken.has(desiredTitle.toLowerCase())) return desiredTitle;

  let suffix = 2;
  while (taken.has(`${desiredTitle}_${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${desiredTitle}_${suffix}`;
}
