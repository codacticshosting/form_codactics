import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeAnswer,
  normalizeButtonAnswer,
  normalizePlayerList,
  UPLOADS_ROOT,
  type LocalSubmissionData,
} from "@/lib/local-storage";
import { resolveSafePath } from "@/lib/media-utils";

// Files saved before the storage helper preserved extensions (a sanitizer
// once turned "photo.png" into "photo_png") are still sitting on disk under
// that broken name — this looks up the submission's own recorded
// originalName so the download still offers a sensible filename regardless
// of what the file actually got saved as.
function findOriginalName(
  data: LocalSubmissionData,
  storedPath: string,
): string | null {
  for (const [key, raw] of Object.entries(data.answers)) {
    const { value } = normalizeAnswer(key, raw);
    if (value.kind === "file" && value.storedPath === storedPath) {
      return value.originalName;
    }
  }
  for (const [key, raw] of Object.entries(data.playerListEntries ?? {})) {
    const { entries } = normalizePlayerList(key, raw);
    for (const row of entries) {
      for (const cell of row) {
        if (cell.value.kind === "file" && cell.value.storedPath === storedPath) {
          return cell.value.originalName;
        }
      }
    }
  }
  for (const [key, raw] of Object.entries(data.buttonAnswers ?? {})) {
    const { entries } = normalizeButtonAnswer(key, raw);
    for (const cell of entries) {
      if (cell.value.kind === "file" && cell.value.storedPath === storedPath) {
        return cell.value.originalName;
      }
    }
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const [formId, submissionId, ...rest] = segments;
  const fileName = rest.join("/");
  if (!formId || !submissionId || !fileName) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (
    !form ||
    form.adminId !== session.user.id ||
    form.storageProvider !== "local"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // formId/submissionId/fileName are all attacker-controlled URL segments.
  const resolved = resolveSafePath(UPLOADS_ROOT, formId, submissionId, fileName);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let downloadName = fileName;
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
  });
  if (submission && submission.formId === formId) {
    const data = JSON.parse(submission.dataJson) as LocalSubmissionData;
    const storedPath = `${formId}/${submissionId}/${fileName}`;
    downloadName = findOriginalName(data, storedPath) ?? fileName;
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(downloadName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
