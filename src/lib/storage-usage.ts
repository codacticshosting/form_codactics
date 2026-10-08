// Server-only — never imported from a "use client" file. Everything that
// measures or frees this server's own disk space: keeping the tracked
// sizes (Form.storageBytes, Submission.sizeBytes) current, removing files
// once nothing uses them, and the super-admin recalculate/clean-up pass.
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { SCHEMA_ASSETS_ROOT, UPLOADS_ROOT } from "@/lib/local-storage";
import { IMAGE_EXT_TO_CONTENT_TYPE, resolveSafePath } from "@/lib/media-utils";

// Total size of every file under `dir`, recursively — 0 if it doesn't
// exist (most forms never have a folder at all).
export async function dirSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      total += (await stat(full)).size;
    }
  }
  return total;
}

// Deletes a file or a whole folder; returns how many bytes that freed.
async function removePath(target: string | null): Promise<number> {
  if (!target) return 0;
  let bytes = 0;
  try {
    const info = await stat(target);
    bytes = info.isDirectory() ? await dirSize(target) : info.size;
  } catch {
    return 0;
  }
  await rm(target, { recursive: true, force: true });
  return bytes;
}

export function definitionBytes(schema: string, theme: string): number {
  return Buffer.byteLength(schema, "utf8") + Buffer.byteLength(theme, "utf8");
}

// Re-measures one form's own footprint (definition text + saved form
// images) and stores it. Called after anything that changes either.
export async function refreshFormStorageBytes(formId: string): Promise<number> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { schema: true, theme: true },
  });
  if (!form) return 0;
  const assetsDir = resolveSafePath(SCHEMA_ASSETS_ROOT, formId);
  const bytes =
    definitionBytes(form.schema, form.theme) + (assetsDir ? await dirSize(assetsDir) : 0);
  await prisma.form.update({ where: { id: formId }, data: { storageBytes: bytes } });
  return bytes;
}

// Matches a locally-saved form image as it appears inside a form's
// schema/theme JSON — see saveFormImagesLocally in local-storage.ts for
// how these URLs are minted (`<uuid>.<ext>` under the owning form's id).
const ASSET_URL_PATTERN = /\/api\/forms\/([A-Za-z0-9_-]+)\/schema-assets\/([A-Za-z0-9._-]+)/g;

function assetUrlMarker(formId: string) {
  return `/api/forms/${formId}/schema-assets/`;
}

// Replaces every reference to ANOTHER form's saved image with the image
// itself, as a base64 data URL — so a copy of a form never depends on
// files that belong to (and get deleted with) the original. The data URL
// is turned back into a file of the form's own the next time it's
// published or updated, exactly like any image added in the builder.
// References whose file is already gone are left as they are.
export async function inlineForeignAssets(json: string, ownFormId: string | null): Promise<string> {
  const replacements = new Map<string, string>();
  for (const match of json.matchAll(ASSET_URL_PATTERN)) {
    const [url, formId, fileName] = match;
    if (formId === ownFormId || replacements.has(url)) continue;
    const filePath = resolveSafePath(SCHEMA_ASSETS_ROOT, formId, fileName);
    const mime = IMAGE_EXT_TO_CONTENT_TYPE[path.extname(fileName).toLowerCase()];
    if (!filePath || !mime) continue;
    try {
      const buffer = await readFile(filePath);
      replacements.set(url, `data:${mime};base64,${buffer.toString("base64")}`);
    } catch {
      // Missing file — nothing to inline.
    }
  }
  let result = json;
  for (const [url, dataUrl] of replacements) {
    result = result.split(url).join(dataUrl);
  }
  return result;
}

// Which of `formId`'s saved image files some form (normally just that one
// form) still references.
async function assetFilesInUse(formId: string): Promise<Set<string>> {
  const marker = assetUrlMarker(formId);
  const forms = await prisma.form.findMany({
    where: { OR: [{ schema: { contains: marker } }, { theme: { contains: marker } }] },
    select: { schema: true, theme: true },
  });
  const inUse = new Set<string>();
  for (const form of forms) {
    for (const json of [form.schema, form.theme]) {
      for (const [, ownerId, fileName] of json.matchAll(ASSET_URL_PATTERN)) {
        if (ownerId === formId) inUse.add(fileName);
      }
    }
  }
  return inUse;
}

// Deletes a form's saved images that nothing references any more — e.g.
// the old logo after the admin swapped in a new one. Must run only after
// the form's new schema/theme has been written to the database, or it
// would delete the image that was just saved. Returns bytes freed.
export async function removeUnusedFormAssets(formId: string): Promise<number> {
  const dir = resolveSafePath(SCHEMA_ASSETS_ROOT, formId);
  if (!dir) return 0;
  let fileNames: string[];
  try {
    fileNames = await readdir(dir);
  } catch {
    return 0;
  }
  const inUse = await assetFilesInUse(formId);
  let freed = 0;
  for (const fileName of fileNames) {
    if (!inUse.has(fileName)) freed += await removePath(path.join(dir, fileName));
  }
  if (inUse.size === 0) await rm(dir, { recursive: true, force: true });
  return freed;
}

// Everything on disk that belongs to a form, for when the form itself is
// deleted. Any OTHER form still pointing at this one's images (a copy
// made before copies became self-contained) gets those images inlined
// first, so deleting the original can't break it.
export async function removeFormFiles(formId: string): Promise<number> {
  const marker = assetUrlMarker(formId);
  const dependents = await prisma.form.findMany({
    where: {
      id: { not: formId },
      OR: [{ schema: { contains: marker } }, { theme: { contains: marker } }],
    },
    select: { id: true, schema: true, theme: true },
  });
  for (const dependent of dependents) {
    await prisma.form.update({
      where: { id: dependent.id },
      data: {
        schema: await inlineForeignAssets(dependent.schema, dependent.id),
        theme: await inlineForeignAssets(dependent.theme, dependent.id),
      },
    });
    await refreshFormStorageBytes(dependent.id);
  }

  return (
    (await removePath(resolveSafePath(UPLOADS_ROOT, formId))) +
    (await removePath(resolveSafePath(SCHEMA_ASSETS_ROOT, formId)))
  );
}

export async function removeSubmissionFiles(formId: string, submissionId: string): Promise<number> {
  return removePath(resolveSafePath(UPLOADS_ROOT, formId, submissionId));
}

export async function removeAllSubmissionFiles(formId: string): Promise<number> {
  return removePath(resolveSafePath(UPLOADS_ROOT, formId));
}

async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export interface RecalculateStorageResult {
  formsMeasured: number;
  submissionsMeasured: number;
  sizesCorrected: number;
  leftoversRemoved: number;
  bytesFreed: number;
}

const SUBMISSION_BATCH = 200;

// The super-admin "Recalculate & clean up" pass: re-measures every form
// and response from what's actually on disk (fixing any stored size that
// drifted, and filling in sizes for data from before they were tracked),
// and deletes leftover folders/files that no form or response owns —
// e.g. from forms deleted before deleting a form also removed its files.
export async function recalculateAllStorage(): Promise<RecalculateStorageResult> {
  const result: RecalculateStorageResult = {
    formsMeasured: 0,
    submissionsMeasured: 0,
    sizesCorrected: 0,
    leftoversRemoved: 0,
    bytesFreed: 0,
  };

  const forms = await prisma.form.findMany({ select: { id: true, storageBytes: true } });
  const formIds = new Set(forms.map((f) => f.id));

  // Image folders of forms that no longer exist can't be served anyway
  // (the image route requires the owning form), so they're pure leftovers.
  for (const dirName of await listDirNames(SCHEMA_ASSETS_ROOT)) {
    if (!formIds.has(dirName)) {
      result.bytesFreed += await removePath(resolveSafePath(SCHEMA_ASSETS_ROOT, dirName));
      result.leftoversRemoved += 1;
    }
  }
  for (const form of forms) {
    const freed = await removeUnusedFormAssets(form.id);
    if (freed > 0) {
      result.bytesFreed += freed;
      result.leftoversRemoved += 1;
    }
    const bytes = await refreshFormStorageBytes(form.id);
    if (bytes !== form.storageBytes) result.sizesCorrected += 1;
    result.formsMeasured += 1;
  }

  // Upload folders: one per form, holding one folder per response.
  for (const formDir of await listDirNames(UPLOADS_ROOT)) {
    if (!formIds.has(formDir)) {
      result.bytesFreed += await removePath(resolveSafePath(UPLOADS_ROOT, formDir));
      result.leftoversRemoved += 1;
      continue;
    }
    const submissionDirs = await listDirNames(path.join(UPLOADS_ROOT, formDir));
    if (submissionDirs.length === 0) continue;
    const existing = await prisma.submission.findMany({
      where: { formId: formDir, id: { in: submissionDirs } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    for (const submissionDir of submissionDirs) {
      if (!existingIds.has(submissionDir)) {
        result.bytesFreed += await removeSubmissionFiles(formDir, submissionDir);
        result.leftoversRemoved += 1;
      }
    }
  }

  // Responses, in batches so a large table never has to sit in memory
  // all at once (dataJson is the bulk of each row).
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.submission.findMany({
      take: SUBMISSION_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, formId: true, dataJson: true, sizeBytes: true },
    });
    if (batch.length === 0) break;
    for (const submission of batch) {
      const filesDir = resolveSafePath(UPLOADS_ROOT, submission.formId, submission.id);
      const bytes =
        Buffer.byteLength(submission.dataJson, "utf8") + (filesDir ? await dirSize(filesDir) : 0);
      if (bytes !== submission.sizeBytes) {
        await prisma.submission.update({ where: { id: submission.id }, data: { sizeBytes: bytes } });
        result.sizesCorrected += 1;
      }
      result.submissionsMeasured += 1;
    }
    cursor = batch[batch.length - 1].id;
  }

  return result;
}

// What a form will take up once saved: its definition text, except that
// every base64-embedded image becomes a file at its decoded size (about
// 3/4 of the base64 text it replaces).
const EMBEDDED_IMAGE_PATTERN = /data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/gi;

export function estimateStoredFormBytes(schema: string, theme: string): number {
  let total = definitionBytes(schema, theme);
  for (const json of [schema, theme]) {
    for (const [, base64] of json.matchAll(EMBEDDED_IMAGE_PATTERN)) {
      total -= base64.length - Math.floor((base64.length * 3) / 4);
    }
  }
  return total;
}
