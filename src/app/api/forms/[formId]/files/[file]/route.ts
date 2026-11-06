import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FORM_FILES_ROOT } from "@/lib/local-storage";
import { resolveSafePath } from "@/lib/media-utils";
import { ATTACHMENT_FILE_NAME_PATTERN, attachmentUrl } from "@/lib/attachments";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// The download name an admin attached the file under, looked up in the
// form itself — falls back to the stored name.
function downloadNameFor(schema: string, url: string, fallback: string): string {
  try {
    const fields = JSON.parse(schema) as { attachments?: { url: string; name: string }[] }[];
    for (const field of fields) {
      const match = field.attachments?.find((a) => a.url === url);
      if (match?.name) return match.name;
    }
  } catch {
    // Malformed schema — use the fallback.
  }
  return fallback;
}

// Files an admin attached to a form for respondents to download. Public
// for live forms; for a draft (or archived form) only its owner — that's
// the builder's own preview.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formId: string; file: string }> },
) {
  const { formId, file } = await params;
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ATTACHMENT_FILE_NAME_PATTERN.test(file)) return notFound();

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      adminId: true,
      status: true,
      schema: true,
      admin: { select: { deletionRequestedAt: true } },
    },
  });
  if (!form || form.status === "binned" || form.admin.deletionRequestedAt) return notFound();

  const isLive = form.status === "published" || form.status === "maintenance";
  if (!isLive) {
    const session = await auth();
    if (session?.user?.id !== form.adminId) return notFound();
  }

  // formId/file are attacker-controlled URL segments.
  const resolved = resolveSafePath(FORM_FILES_ROOT, formId, file);
  if (!resolved) return notFound();
  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    return notFound();
  }

  const ext = file.split(".").pop() ?? "";
  const downloadName = downloadNameFor(form.schema, attachmentUrl(formId, file), file);
  // RFC 5987 so names with spaces/umlauts survive; plus a plain ASCII
  // fallback for very old clients.
  const asciiName = downloadName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      // Always a download, never opened as a page on this domain.
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": isLive ? "public, max-age=3600" : "private, no-store",
    },
  });
}
