"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FORM_FILES_ROOT } from "@/lib/local-storage";
import { resolveSafePath } from "@/lib/media-utils";
import { checkStorageCapacity } from "@/lib/storage-quota";
import { refreshFormStorageBytes } from "@/lib/storage-usage";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentUrl,
  type AttachmentKind,
  type FormAttachment,
} from "@/lib/attachments";

export type UploadAttachmentResult =
  | { ok: true; attachment: FormAttachment }
  | {
      ok: false;
      error: "not-signed-in" | "not-found" | "too-large" | "wrong-type" | "storage-full";
    };

// What the file really is, from its first bytes — never from its name or
// the type the browser claims, which are both just whatever the uploader
// says. null for anything that isn't one of the allowed formats.
function sniffType(bytes: Buffer): { kind: AttachmentKind; ext: string } | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return { kind: "pdf", ext: "pdf" }; // %PDF-
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { kind: "image", ext: "png" };
  if (startsWith(0xff, 0xd8, 0xff)) return { kind: "image", ext: "jpg" };
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return { kind: "image", ext: "gif" }; // GIF8
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) && // RIFF
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { kind: "image", ext: "webp" };
  }
  return null;
}

// Uploads one image or PDF to attach to a form, the moment the admin
// picks it in the builder. Stored as `<uuid>.<ext>` in the form's own
// folder and counted toward the admin's storage; the builder then puts
// the returned reference into the field, saved with the next autosave.
export async function uploadFormAttachment(
  formId: string,
  expectedKind: AttachmentKind,
  formData: FormData,
): Promise<UploadAttachmentResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { adminId: true, status: true, admin: { select: { deletionRequestedAt: true } } },
  });
  if (
    !form ||
    form.adminId !== session.user.id ||
    form.status === "binned" ||
    form.admin.deletionRequestedAt
  ) {
    return { ok: false, error: "not-found" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "wrong-type" };
  if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, error: "too-large" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || type.kind !== expectedKind) return { ok: false, error: "wrong-type" };

  const capacity = await checkStorageCapacity(session.user.id, bytes.length);
  if (!capacity.ok) return { ok: false, error: "storage-full" };

  const dir = resolveSafePath(FORM_FILES_ROOT, formId);
  if (!dir) return { ok: false, error: "not-found" };
  await mkdir(dir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${type.ext}`;
  await writeFile(path.join(dir, fileName), new Uint8Array(bytes));
  await refreshFormStorageBytes(formId);

  return {
    ok: true,
    attachment: {
      id: crypto.randomUUID(),
      kind: type.kind,
      name: (file.name || fileName).slice(0, 200),
      size: bytes.length,
      url: attachmentUrl(formId, fileName),
    },
  };
}
