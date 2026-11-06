// Client- and server-safe rules for files an admin attaches to a form for
// respondents to download — in a Message field or a Downloads field. The
// files themselves are uploaded straight away (attachment-actions.ts) and
// stored on this server for every form, Google Drive forms included; the
// form's schema only keeps these small references.
import { FORM_IMAGE_ACCEPT, FORM_IMAGE_MIME_TYPES } from "@/lib/image-types";
import type { FormField } from "@/types/form-builder";

export type AttachmentKind = "image" | "pdf";

export interface FormAttachment {
  id: string;
  kind: AttachmentKind;
  // The original file name, offered as the download name.
  name: string;
  size: number;
  url: string;
}

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_LABEL = "5 MB";
// Per field: up to this many of each kind.
export const MAX_ATTACHMENTS_PER_KIND = 3;

export const ATTACHMENT_ACCEPT: Record<AttachmentKind, string> = {
  image: FORM_IMAGE_ACCEPT,
  pdf: "application/pdf,.pdf",
};

export function attachmentKindOfMime(mime: string): AttachmentKind | null {
  if (mime === "application/pdf") return "pdf";
  if (FORM_IMAGE_MIME_TYPES.includes(mime)) return "image";
  return null;
}

// Stored files are named `<uuid>.<ext>` — nothing from the uploader's own
// file name ever reaches the disk.
export const ATTACHMENT_FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|gif|webp|pdf)$/;

export function attachmentUrl(formId: string, fileName: string): string {
  return `/api/forms/${formId}/files/${fileName}`;
}

export function attachmentFileName(url: string, formId: string): string | null {
  const prefix = `/api/forms/${formId}/files/`;
  if (!url.startsWith(prefix)) return null;
  const fileName = url.slice(prefix.length);
  return ATTACHMENT_FILE_NAME_PATTERN.test(fileName) ? fileName : null;
}

// What's kept when a form is saved: only attachments that are this form's
// own uploaded files (never a link to anything else, nor another form's
// files), with a sane name, at most MAX_ATTACHMENTS_PER_KIND of each kind.
export function sanitizeAttachments(formId: string | null, list: unknown): FormAttachment[] {
  if (!formId || !Array.isArray(list)) return [];
  const counts: Record<AttachmentKind, number> = { image: 0, pdf: 0 };
  const kept: FormAttachment[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Partial<FormAttachment>;
    if (a.kind !== "image" && a.kind !== "pdf") continue;
    if (typeof a.url !== "string" || typeof a.id !== "string") continue;
    const fileName = attachmentFileName(a.url, formId);
    if (!fileName || (a.kind === "pdf") !== fileName.endsWith(".pdf")) continue;
    if (counts[a.kind] >= MAX_ATTACHMENTS_PER_KIND) continue;
    counts[a.kind] += 1;
    kept.push({
      id: a.id,
      kind: a.kind,
      name: (typeof a.name === "string" && a.name.trim() ? a.name.trim() : fileName).slice(0, 200),
      size: typeof a.size === "number" && a.size > 0 ? a.size : 0,
      url: a.url,
    });
  }
  return kept;
}

// Applies sanitizeAttachments to every field that can carry attachments —
// run on the builder's input whenever a form is saved or published.
export function withSanitizedAttachments(
  fields: FormField[],
  formId: string | null,
): FormField[] {
  return fields.map((field) => {
    if (field.type === "downloads") {
      return { ...field, attachments: sanitizeAttachments(formId, field.attachments) };
    }
    if (field.type === "static-text") {
      const attachments = sanitizeAttachments(formId, field.attachments);
      const { attachments: _previous, ...rest } = field;
      void _previous;
      return attachments.length > 0 ? { ...rest, attachments } : rest;
    }
    return field;
  });
}
