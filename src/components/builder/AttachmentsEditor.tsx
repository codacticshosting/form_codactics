"use client";

import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import { uploadFormAttachment } from "@/lib/attachment-actions";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_LABEL,
  MAX_ATTACHMENTS_PER_KIND,
  type AttachmentKind,
  type FormAttachment,
} from "@/lib/attachments";
import { formatBytes } from "@/lib/storage-limits";
import { useBuilderFormId } from "./BuilderFormContext";

const UPLOAD_ERRORS: Record<string, string> = {
  "not-signed-in": "You're not signed in any more. Please sign in again.",
  "not-found": "This form can't take attachments right now.",
  "too-large": `That file is bigger than ${ATTACHMENT_MAX_LABEL}.`,
  "wrong-type": "That file isn't a real image or PDF.",
  "storage-full": "Not enough storage left for this file. Delete old responses or contact Codactics Form Support.",
};

// Images and PDFs to share with respondents — uploaded the moment they're
// picked (see attachment-actions.ts), then kept in the field's
// `attachments` and saved with the form's next autosave.
export function AttachmentsEditor({
  attachments,
  onChange,
  title = "Attach files to download (optional)",
}: {
  attachments: FormAttachment[];
  onChange: (attachments: FormAttachment[]) => void;
  title?: string;
}) {
  const formId = useBuilderFormId();
  const inputRefs = { image: useRef<HTMLInputElement>(null), pdf: useRef<HTMLInputElement>(null) };
  const [uploading, setUploading] = useState<AttachmentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = (kind: AttachmentKind) => attachments.filter((a) => a.kind === kind).length;

  async function handlePick(kind: AttachmentKind, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !formId) return;
    setError(null);
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError(UPLOAD_ERRORS["too-large"]);
      return;
    }
    setUploading(kind);
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await uploadFormAttachment(formId, kind, data);
      if (result.ok) onChange([...attachments, result.attachment]);
      else setError(UPLOAD_ERRORS[result.error]);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-royal-100 p-3" onClick={(e) => e.stopPropagation()}>
      <div>
        <p className="text-xs font-medium text-royal-700">{title}</p>
        <p className="text-[11px] text-royal-400">
          Up to {MAX_ATTACHMENTS_PER_KIND} images and {MAX_ATTACHMENTS_PER_KIND} PDFs, {ATTACHMENT_MAX_LABEL} each.
          People filling in the form can download them.
        </p>
      </div>

      {!formId ? (
        <p className="text-xs text-amber-700">Sign in so the form is saved, then you can attach files.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(["image", "pdf"] as const).map((kind) => {
            const full = count(kind) >= MAX_ATTACHMENTS_PER_KIND;
            const Icon = kind === "image" ? ImageIcon : FileText;
            return (
              <div key={kind}>
                <input
                  ref={inputRefs[kind]}
                  type="file"
                  accept={ATTACHMENT_ACCEPT[kind]}
                  onChange={(e) => handlePick(kind, e)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={full || uploading !== null}
                  onClick={() => inputRefs[kind].current?.click()}
                  className="flex items-center gap-1.5 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon size={13} />
                  {uploading === kind
                    ? "Uploading…"
                    : `${kind === "image" ? "Add image" : "Add PDF"} (${count(kind)}/${MAX_ATTACHMENTS_PER_KIND})`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-md bg-royal-50/60 px-2 py-1.5 text-xs text-royal-800"
            >
              {attachment.kind === "image" ? (
                <ImageIcon size={13} className="shrink-0 text-royal-500" />
              ) : (
                <FileText size={13} className="shrink-0 text-red-500" />
              )}
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              {attachment.size > 0 && (
                <span className="shrink-0 text-royal-400">{formatBytes(attachment.size)}</span>
              )}
              <button
                type="button"
                onClick={() => onChange(attachments.filter((a) => a.id !== attachment.id))}
                aria-label={`Remove ${attachment.name}`}
                className="shrink-0 rounded p-0.5 text-royal-400 hover:bg-red-50 hover:text-red-600"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
