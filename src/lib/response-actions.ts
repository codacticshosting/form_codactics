"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { removeAllSubmissionFiles, removeSubmissionFiles } from "@/lib/storage-usage";

export type DeleteResponsesResult =
  | { ok: true; deleted: number }
  | { ok: false; error: "not-signed-in" | "not-found" };

// Only locally-stored responses live here at all — Google Sheet/Drive
// responses are in the admin's own Google account, not on this server.
async function ownedLocalFormError(
  formId: string,
): Promise<"not-signed-in" | "not-found" | null> {
  const session = await auth();
  if (!session?.user?.id) return "not-signed-in";
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id || form.storageProvider !== "local") {
    return "not-found";
  }
  return null;
}

export async function deleteResponse(
  formId: string,
  submissionId: string,
): Promise<DeleteResponsesResult> {
  const error = await ownedLocalFormError(formId);
  if (error) return { ok: false, error };

  // deleteMany so a submission belonging to some other form (or already
  // gone) simply deletes nothing rather than throwing.
  const { count } = await prisma.submission.deleteMany({ where: { id: submissionId, formId } });
  if (count === 0) return { ok: false, error: "not-found" };
  await removeSubmissionFiles(formId, submissionId);
  return { ok: true, deleted: count };
}

export async function deleteAllResponses(formId: string): Promise<DeleteResponsesResult> {
  const error = await ownedLocalFormError(formId);
  if (error) return { ok: false, error };

  const { count } = await prisma.submission.deleteMany({ where: { formId } });
  await removeAllSubmissionFiles(formId);
  return { ok: true, deleted: count };
}
