import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { SCHEMA_ASSETS_ROOT } from "@/lib/local-storage";
import { resolveSafePath, IMAGE_EXT_TO_CONTENT_TYPE } from "@/lib/media-utils";

// Unlike /api/uploads (private submission files, requires the admin's own
// sign-in), this serves form-DEFINITION images — dropdown option
// thumbnails, Button images — meant to be visible to every visitor on the
// public form, so intentionally no auth check here.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formId: string; path: string[] }> },
) {
  const { formId, path: segments } = await params;
  const fileName = segments.join("/");
  if (!formId || !fileName) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.storageProvider !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // formId/fileName are both attacker-controlled URL segments.
  const resolved = resolveSafePath(SCHEMA_ASSETS_ROOT, formId, fileName);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(fileName).toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": IMAGE_EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
