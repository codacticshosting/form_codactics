"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  publishFormToGoogle,
  syncSheetColumns,
  uploadFormImagesToDrive,
} from "@/lib/google";
import { saveFormImagesLocally } from "@/lib/local-storage";
import { checkStorageCapacity } from "@/lib/storage-quota";
import {
  estimateStoredFormBytes,
  inlineForeignAssets,
  refreshFormStorageBytes,
  removeUnusedFormAssets,
} from "@/lib/storage-usage";
import { slugify } from "@/lib/slug";
import { generateUniqueTitle } from "@/lib/form-naming";
import { BIN_LIMIT, effectiveDraftLimit, effectivePublishedLimit } from "@/lib/form-limits";
import { deleteFormForGood } from "@/lib/form-bin";
import { localToUtcInstant, getTimezoneOffset, utcInstantToLocal } from "@/lib/timezones";
import { hashPassword } from "@/lib/access-code";
import type { FormField } from "@/types/form-builder";
import { DEFAULT_THEME, type FormTheme } from "@/types/theme";
import { DEFAULT_CLOSING, type FormClosing } from "@/types/closing";

export type StorageChoice = "google" | "local";

// Computes the { closeMode, closesAt, closeTimezoneLabel } columns from the
// builder's FormClosing state. An incomplete "deadline" pick (date/time not
// both filled in yet) is saved as if it were "open", rather than half-
// applying a closing that isn't actually configured.
function closingToDbFields(closing: FormClosing) {
  if (closing.mode === "manual") {
    return { closeMode: "manual", closesAt: null, closeTimezoneLabel: null };
  }
  if (closing.mode === "deadline" && closing.dateStr && closing.timeStr) {
    const closesAt = localToUtcInstant(
      closing.dateStr,
      closing.timeStr,
      getTimezoneOffset(closing.timezoneId),
    );
    if (closesAt) {
      return {
        closeMode: "deadline",
        closesAt,
        closeTimezoneLabel: closing.timezoneId,
      };
    }
  }
  return { closeMode: null, closesAt: null, closeTimezoneLabel: null };
}

function dbFieldsToClosing(form: {
  closeMode: string | null;
  closesAt: Date | null;
  closeTimezoneLabel: string | null;
}): FormClosing {
  if (form.closeMode === "manual") {
    return { ...DEFAULT_CLOSING, mode: "manual" };
  }
  if (form.closeMode === "deadline" && form.closesAt && form.closeTimezoneLabel) {
    const { dateStr, timeStr } = utcInstantToLocal(
      form.closesAt,
      getTimezoneOffset(form.closeTimezoneLabel),
    );
    return { mode: "deadline", dateStr, timeStr, timezoneId: form.closeTimezoneLabel };
  }
  return DEFAULT_CLOSING;
}

// A single-line <input> normally can't have a newline typed into it, but a
// pasted clipboard value can still carry one through on some browsers —
// and a title with an embedded line break wrecks the PDF export's header
// (which draws it as one fixed-position line, not through the wrapping
// logic used elsewhere). Collapse any whitespace run, newlines included,
// into a single space before ever saving it.
function sanitizeTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

async function uniqueSlugFor(title: string, excludeFormId?: string) {
  const base = slugify(title);
  let slug = base;
  let n = 1;
  while (true) {
    const clash = await prisma.form.findUnique({ where: { slug } });
    if (!clash || clash.id === excludeFormId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

// Whether saving this form (on a local-storage publish/update) would grow
// it past what the admin's storage can take. Only real growth counts: the
// builder re-sends every image on each autosave of a live form, and those
// replace the form's existing files rather than adding to them — so an
// edit that adds no new image (fixing a typo) is never blocked.
async function formGrowthBeyondCapacity(
  adminId: string,
  existing: { storageBytes: number } | null,
  input: { fields: FormField[]; theme: FormTheme },
): Promise<boolean> {
  const after = estimateStoredFormBytes(JSON.stringify(input.fields), JSON.stringify(input.theme));
  const growth = after - (existing?.storageBytes ?? 0);
  if (growth <= 0) return false;
  const capacity = await checkStorageCapacity(adminId, growth);
  return !capacity.ok;
}

export type CreateDraftResult =
  | { ok: true; formId: string; title: string }
  | { ok: false; error: "not-signed-in" | "draft-limit" };

export async function createDraft(): Promise<CreateDraftResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const admin = await prisma.admin.findUnique({ where: { id: session.user.id } });
  if (!admin) return { ok: false, error: "not-signed-in" };

  const draftCount = await prisma.form.count({
    where: { adminId: session.user.id, status: "draft" },
  });
  if (draftCount >= effectiveDraftLimit(admin)) {
    return { ok: false, error: "draft-limit" };
  }

  const title = await generateUniqueTitle(session.user.id, "Untitled");
  const slug = await uniqueSlugFor(title);

  const form = await prisma.form.create({
    data: {
      adminId: session.user.id,
      slug,
      title,
      status: "draft",
      schema: JSON.stringify([]),
      theme: JSON.stringify(DEFAULT_THEME),
    },
  });
  await refreshFormStorageBytes(form.id);

  return { ok: true, formId: form.id, title: form.title };
}

export type UpdateDraftResult =
  | { ok: true; title: string }
  | { ok: false; error: "not-signed-in" | "not-found" };

export async function updateDraft(
  formId: string,
  input: {
    title: string;
    fields: FormField[];
    theme: FormTheme;
    closing: FormClosing;
    compressPhotos?: boolean;
  },
): Promise<UpdateDraftResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const existing = await prisma.form.findUnique({ where: { id: formId } });
  if (!existing || existing.adminId !== session.user.id) {
    return { ok: false, error: "not-found" };
  }

  const rawTitle = sanitizeTitle(input.title) || "Untitled";
  const title = await generateUniqueTitle(session.user.id, rawTitle, formId);

  await prisma.form.update({
    where: { id: formId },
    data: {
      title,
      schema: JSON.stringify(input.fields),
      theme: JSON.stringify(input.theme),
      ...closingToDbFields(input.closing),
      ...(input.compressPhotos !== undefined ? { compressPhotos: input.compressPhotos } : {}),
    },
  });
  // A draft keeps its images embedded as base64 in the schema/theme, so
  // its size changes with every image added or removed in the builder.
  await refreshFormStorageBytes(formId);

  return { ok: true, title };
}

export type TitleAvailability =
  | { taken: false }
  | { taken: true; status: string };

// Real-time check used by the Design step so the admin sees a warning the
// moment they type a name that collides with one of their own forms —
// separate from (and purely informational alongside) the actual
// auto-suffixing that happens for real when the form is saved/published.
export async function checkTitleAvailability(
  title: string,
  excludeFormId?: string,
): Promise<TitleAvailability> {
  const session = await auth();
  if (!session?.user?.id) return { taken: false };

  const trimmed = title.trim();
  if (!trimmed) return { taken: false };

  const forms = await prisma.form.findMany({
    where: {
      adminId: session.user.id,
      ...(excludeFormId ? { id: { not: excludeFormId } } : {}),
    },
    select: { title: true, status: true },
  });

  const match = forms.find(
    (f) => f.title.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ? { taken: true, status: match.status } : { taken: false };
}

export type UpdateLiveFormResult =
  | { ok: true; title: string }
  | { ok: false; error: "not-signed-in" | "not-found" | "storage-full" };

// Edits an already-published (or under-maintenance) form. The live public
// page reflects the change immediately. On the Google Sheet side this only
// ever ADDS columns for new fields — it never renames, reorders, or removes
// a column, so data already collected under the old field list is untouched.
export async function updateLiveForm(
  formId: string,
  input: {
    title: string;
    fields: FormField[];
    theme: FormTheme;
    closing: FormClosing;
    compressPhotos?: boolean;
  },
): Promise<UpdateLiveFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const existing = await prisma.form.findUnique({ where: { id: formId } });
  if (
    !existing ||
    existing.adminId !== session.user.id ||
    existing.status === "draft" ||
    (existing.storageProvider === "google" && !existing.googleSheetId)
  ) {
    return { ok: false, error: "not-found" };
  }

  if (existing.storageProvider === "local") {
    const growth = await formGrowthBeyondCapacity(session.user.id, existing, input);
    if (growth) return { ok: false, error: "storage-full" };
  }

  const rawTitle = sanitizeTitle(input.title) || "Untitled";
  const title = await generateUniqueTitle(session.user.id, rawTitle, formId);

  // Only the Sheet has a shared header to keep in sync as fields change —
  // locally-stored submissions are each a self-contained JSON row, so
  // there's nothing equivalent to sync there.
  let fields = input.fields;
  let theme = input.theme;
  if (existing.storageProvider === "google" && existing.googleSheetId) {
    const admin = await prisma.admin.findUnique({
      where: { id: session.user.id },
    });
    if (!admin?.googleRefreshToken) {
      return { ok: false, error: "not-found" };
    }
    try {
      await syncSheetColumns({
        refreshToken: admin.googleRefreshToken,
        spreadsheetId: existing.googleSheetId,
        fields: input.fields,
      });
    } catch (err) {
      // Don't block saving the form definition itself just because a
      // transient Google API error kept the sheet from syncing — the
      // admin's edits (and what visitors see) should still save.
      console.error("Sheet column sync failed:", err);
    }
    if (existing.googleDriveFolderId) {
      // uploadFormImagesToDrive already logs and degrades independently
      // per side (schema vs theme) rather than blocking the save.
      ({ fields, theme } = await uploadFormImagesToDrive({
        refreshToken: admin.googleRefreshToken,
        formFolderId: existing.googleDriveFolderId,
        fields: input.fields,
        theme: input.theme,
      }));
    }
  } else if (existing.storageProvider === "local") {
    ({ fields, theme } = await saveFormImagesLocally(formId, input.fields, input.theme));
  }

  await prisma.form.update({
    where: { id: formId },
    data: {
      title,
      schema: JSON.stringify(fields),
      theme: JSON.stringify(theme),
      ...closingToDbFields(input.closing),
      ...(input.compressPhotos !== undefined ? { compressPhotos: input.compressPhotos } : {}),
    },
  });
  // Only now that the new schema/theme is saved — an image replaced in
  // this edit (e.g. a new logo) leaves its old file unreferenced.
  if (existing.storageProvider === "local") await removeUnusedFormAssets(formId);
  await refreshFormStorageBytes(formId);

  return { ok: true, title };
}

export async function setMaintenanceMode(
  formId: string,
  underMaintenance: boolean,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };

  const existing = await prisma.form.findUnique({ where: { id: formId } });
  if (
    !existing ||
    existing.adminId !== session.user.id ||
    (existing.status !== "published" && existing.status !== "maintenance")
  ) {
    return { ok: false };
  }

  await prisma.form.update({
    where: { id: formId },
    data: { status: underMaintenance ? "maintenance" : "published" },
  });
  return { ok: true };
}

export type ArchiveFormResult =
  | { ok: true }
  | { ok: false; error: "not-signed-in" | "not-found" };

// Retires a published (or under-maintenance) form without deleting it —
// it stops being publicly reachable and no longer counts toward
// MAX_PUBLISHED_PER_ADMIN, but its schema/theme/submissions are untouched
// and it can be brought back with unarchiveForm. Unlike drafts and
// published forms, archived forms have no cap.
export async function archiveForm(formId: string): Promise<ArchiveFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (
    !form ||
    form.adminId !== session.user.id ||
    (form.status !== "published" && form.status !== "maintenance")
  ) {
    return { ok: false, error: "not-found" };
  }

  await prisma.form.update({ where: { id: formId }, data: { status: "archived" } });
  return { ok: true };
}

export type UnarchiveFormResult =
  | { ok: true }
  | { ok: false; error: "not-signed-in" | "not-found" | "publish-limit" };

// Brings an archived form directly back to published — same slug, same
// Google Sheet/Drive folder or local storage it already had, no need to
// re-publish from scratch. Still subject to the normal published-forms cap.
export async function unarchiveForm(formId: string): Promise<UnarchiveFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id || form.status !== "archived") {
    return { ok: false, error: "not-found" };
  }

  const admin = await prisma.admin.findUnique({ where: { id: session.user.id } });
  if (!admin) return { ok: false, error: "not-found" };

  const publishedCount = await prisma.form.count({
    where: { adminId: session.user.id, status: { in: ["published", "maintenance"] } },
  });
  if (publishedCount >= effectivePublishedLimit(admin)) {
    return { ok: false, error: "publish-limit" };
  }

  await prisma.form.update({ where: { id: formId }, data: { status: "published" } });
  return { ok: true };
}

export interface AccessCodeSummary {
  id: string;
  username: string;
  maxLogins: number | null;
  loginCount: number;
}

export type LoadFormResult =
  | {
      ok: true;
      title: string;
      fields: FormField[];
      theme: FormTheme;
      status: string;
      closing: FormClosing;
      requireAccessCode: boolean;
      compressPhotos: boolean;
      accessUsernames: string[];
      accessCodes: AccessCodeSummary[];
      // Whether THIS admin's account has been granted the per-code login
      // limit feature from the super-admin control panel — governs
      // whether AccessCodeSettings shows the limit/usage/reset controls.
      loginLimitFeatureEnabled: boolean;
    }
  | { ok: false; error: "not-signed-in" | "not-found" };

export async function loadForm(formId: string): Promise<LoadFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const [form, admin] = await Promise.all([
    prisma.form.findUnique({
      where: { id: formId },
      include: {
        accessCodes: {
          select: { id: true, username: true, maxLogins: true, loginCount: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.admin.findUnique({ where: { id: session.user.id } }),
  ]);
  // A form in the Bin has to be restored before it can be edited.
  if (!form || form.adminId !== session.user.id || form.status === "binned") {
    return { ok: false, error: "not-found" };
  }

  return {
    ok: true,
    title: form.title,
    fields: JSON.parse(form.schema) as FormField[],
    theme: JSON.parse(form.theme) as FormTheme,
    status: form.status,
    closing: dbFieldsToClosing(form),
    requireAccessCode: form.requireAccessCode,
    compressPhotos: form.compressPhotos,
    accessUsernames: form.accessCodes.map((c) => c.username),
    accessCodes: form.accessCodes,
    loginLimitFeatureEnabled: admin?.loginLimitFeatureEnabled ?? false,
  };
}

export type SaveAccessCodesResult =
  | { ok: true }
  | { ok: false; error: "not-signed-in" | "not-found" | "missing-password" | "duplicate-username" };

// Kept separate from the main autosave (title/fields/theme/closing) since
// this involves hashing new passwords — no reason to redo that work on
// every unrelated keystroke, and a password field shouldn't silently
// resubmit itself on a debounce timer the way a text label safely can.
export async function saveAccessCodes(
  formId: string,
  requireAccessCode: boolean,
  codes: { username: string; password?: string; maxLogins?: number | null }[],
): Promise<SaveAccessCodesResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id) {
    return { ok: false, error: "not-found" };
  }

  const trimmed = codes
    .map((c) => ({
      username: c.username.trim(),
      password: c.password?.trim() || undefined,
      maxLogins: c.maxLogins ?? null,
    }))
    .filter((c) => c.username);

  const seen = new Set<string>();
  for (const c of trimmed) {
    const key = c.username.toLowerCase();
    if (seen.has(key)) return { ok: false, error: "duplicate-username" };
    seen.add(key);
  }

  const existing = await prisma.formAccessCode.findMany({ where: { formId } });
  const existingByUsername = new Map(existing.map((c) => [c.username, c]));

  for (const c of trimmed) {
    if (!existingByUsername.has(c.username) && !c.password) {
      return { ok: false, error: "missing-password" };
    }
  }

  // An entry with no new password AND an unchanged maxLogins is an
  // existing, already-validated row with nothing to write — left out
  // rather than issued as a no-op update.
  const codesToWrite = trimmed.filter((c) => {
    if (c.password) return true;
    const existingRow = existingByUsername.get(c.username);
    return (existingRow?.maxLogins ?? null) !== c.maxLogins;
  });

  await prisma.$transaction([
    prisma.formAccessCode.deleteMany({
      where: { formId, username: { notIn: trimmed.map((c) => c.username) } },
    }),
    ...codesToWrite.map((c) =>
      prisma.formAccessCode.upsert({
        where: { formId_username: { formId, username: c.username } },
        create: {
          formId,
          username: c.username,
          passwordHash: hashPassword(c.password!),
          maxLogins: c.maxLogins,
        },
        update: {
          ...(c.password ? { passwordHash: hashPassword(c.password) } : {}),
          maxLogins: c.maxLogins,
        },
      }),
    ),
    prisma.form.update({ where: { id: formId }, data: { requireAccessCode } }),
  ]);

  return { ok: true };
}

export type ResetAccessCodeLoginsResult =
  | { ok: true }
  | { ok: false; error: "not-signed-in" | "not-found" };

// Separate from saveAccessCodes since it's a standalone, immediate action
// (not part of the batch edit-and-save flow) — zeroes out how many times
// this one credential has been used, without touching its password or
// maxLogins setting.
export async function resetAccessCodeLogins(
  formAccessCodeId: string,
): Promise<ResetAccessCodeLoginsResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const code = await prisma.formAccessCode.findUnique({
    where: { id: formAccessCodeId },
    include: { form: true },
  });
  if (!code || code.form.adminId !== session.user.id) {
    return { ok: false, error: "not-found" };
  }

  await prisma.formAccessCode.update({
    where: { id: formAccessCodeId },
    data: { loginCount: 0 },
  });
  return { ok: true };
}

// The form's Settings page toggle — the same setting the builder's
// Design step and publish dialog change.
export async function setFormCompressPhotos(
  formId: string,
  compressPhotos: boolean,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id) return { ok: false };
  await prisma.form.update({ where: { id: formId }, data: { compressPhotos } });
  return { ok: true };
}

export type DeleteFormResult =
  | { ok: true }
  | { ok: false; error: "not-signed-in" | "not-found" | "bin-full" };

// "Delete" on Manage forms: moves the form to the admin's Bin rather than
// deleting it outright. It goes offline at once, can be restored for
// BIN_RETENTION_DAYS, and is deleted for good after that (see
// purgeExpiredBinnedForms) — its responses and files still count toward
// storage until then. The Bin holds at most BIN_LIMIT forms.
export async function deleteForm(formId: string): Promise<DeleteFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id || form.status === "binned") {
    return { ok: false, error: "not-found" };
  }

  const binCount = await prisma.form.count({
    where: { adminId: session.user.id, status: "binned" },
  });
  if (binCount >= BIN_LIMIT) return { ok: false, error: "bin-full" };

  await prisma.form.update({
    where: { id: formId },
    data: { status: "binned", binnedAt: new Date(), binnedFromStatus: form.status },
  });
  return { ok: true };
}

export type RestoreFormResult =
  | { ok: true; status: string }
  | { ok: false; error: "not-signed-in" | "not-found" | "draft-limit" };

// Takes a form back out of the Bin. A draft comes back as a draft (if
// there's room under the draft limit); anything that had been published
// comes back as archived — never straight back online, so restoring can't
// silently break the published-forms limit. Unarchive it to go live again.
export async function restoreFormFromBin(formId: string): Promise<RestoreFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id || form.status !== "binned") {
    return { ok: false, error: "not-found" };
  }

  const status = form.binnedFromStatus === "draft" ? "draft" : "archived";
  if (status === "draft") {
    const admin = await prisma.admin.findUnique({ where: { id: session.user.id } });
    const draftCount = await prisma.form.count({
      where: { adminId: session.user.id, status: "draft" },
    });
    if (!admin || draftCount >= effectiveDraftLimit(admin)) {
      return { ok: false, error: "draft-limit" };
    }
  }

  await prisma.form.update({
    where: { id: formId },
    data: { status, binnedAt: null, binnedFromStatus: null },
  });
  return { ok: true, status };
}

// "Delete permanently" in the Bin — the form, its responses and its files,
// right away instead of after BIN_RETENTION_DAYS.
export async function deleteFormPermanently(formId: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form || form.adminId !== session.user.id || form.status !== "binned") {
    return { ok: false };
  }

  await deleteFormForGood(formId);
  return { ok: true };
}

export type DuplicateFormResult =
  | { ok: true; formId: string }
  | { ok: false; error: "not-signed-in" | "not-found" | "draft-limit" };

// Copies a form's schema/theme/closing settings into a brand-new draft —
// works from any status (draft, published, maintenance, or archived), so
// a recurring event can start next season from last season's form instead
// of rebuilding it. Deliberately NOT copied: the slug (needs its own),
// publish state and Google Sheet/Drive IDs (a new form needs its own,
// decided the normal way at publish time), and access codes (so last
// season's usernames/passwords don't silently work on the new form too —
// the admin sets fresh ones if they want gating again).
export async function duplicateForm(formId: string): Promise<DuplicateFormResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "not-signed-in" };

  const admin = await prisma.admin.findUnique({ where: { id: session.user.id } });
  if (!admin) return { ok: false, error: "not-signed-in" };

  const source = await prisma.form.findUnique({ where: { id: formId } });
  if (!source || source.adminId !== session.user.id) {
    return { ok: false, error: "not-found" };
  }

  const draftCount = await prisma.form.count({
    where: { adminId: session.user.id, status: "draft" },
  });
  if (draftCount >= effectiveDraftLimit(admin)) {
    return { ok: false, error: "draft-limit" };
  }

  const title = await generateUniqueTitle(session.user.id, `${source.title} (copy)`);
  const slug = await uniqueSlugFor(title);

  const form = await prisma.form.create({
    data: {
      adminId: session.user.id,
      slug,
      title,
      status: "draft",
      // The copy gets its own embedded images rather than pointing at the
      // source form's saved files, which are deleted along with it.
      schema: await inlineForeignAssets(source.schema, null),
      theme: await inlineForeignAssets(source.theme, null),
      closeMode: source.closeMode,
      closesAt: source.closesAt,
      closeTimezoneLabel: source.closeTimezoneLabel,
      compressPhotos: source.compressPhotos,
    },
  });
  await refreshFormStorageBytes(form.id);

  return { ok: true, formId: form.id };
}

export type PublishResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      error:
        | "not-signed-in"
        | "no-google-access"
        | "google-error"
        | "empty-title"
        | "publish-limit"
        | "storage-full";
    };

export async function publishForm(input: {
  formId?: string;
  title: string;
  fields: FormField[];
  theme: FormTheme;
  storage: StorageChoice;
  closing: FormClosing;
  compressPhotos?: boolean;
}): Promise<PublishResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "not-signed-in" };
  }

  const title = sanitizeTitle(input.title);
  if (!title) {
    return { ok: false, error: "empty-title" };
  }

  const admin = await prisma.admin.findUnique({
    where: { id: session.user.id },
  });
  if (!admin) {
    return { ok: false, error: "not-signed-in" };
  }
  if (input.storage === "google" && !admin.googleRefreshToken) {
    return { ok: false, error: "no-google-access" };
  }

  // If we're publishing an existing draft, make sure it's actually this
  // admin's and isn't already published (so we don't double-count it).
  let existing = null;
  if (input.formId) {
    existing = await prisma.form.findUnique({ where: { id: input.formId } });
    if (!existing || existing.adminId !== admin.id) {
      existing = null;
    }
  }

  const alreadyLive =
    existing && (existing.status === "published" || existing.status === "maintenance");
  if (!alreadyLive) {
    const publishedCount = await prisma.form.count({
      where: { adminId: admin.id, status: { in: ["published", "maintenance"] } },
    });
    if (publishedCount >= effectivePublishedLimit(admin)) {
      return { ok: false, error: "publish-limit" };
    }
  }

  if (input.storage === "local") {
    const growth = await formGrowthBeyondCapacity(admin.id, existing, input);
    if (growth) return { ok: false, error: "storage-full" };
  }

  const finalTitle = await generateUniqueTitle(admin.id, title, input.formId);
  const slug = await uniqueSlugFor(finalTitle, input.formId);

  const data: Record<string, unknown> = {
    adminId: admin.id,
    slug,
    title: finalTitle,
    status: "published",
    schema: JSON.stringify(input.fields),
    theme: JSON.stringify(input.theme),
    publishedAt: new Date(),
    ...closingToDbFields(input.closing),
    ...(input.compressPhotos !== undefined ? { compressPhotos: input.compressPhotos } : {}),
  };

  if (input.storage === "google") {
    let googleResult;
    try {
      googleResult = await publishFormToGoogle({
        refreshToken: admin.googleRefreshToken!,
        title: finalTitle,
        fields: input.fields,
      });
    } catch (err) {
      console.error("Publish to Google failed:", err);
      return { ok: false, error: "google-error" };
    }
    data.storageProvider = "google";
    data.googleSheetId = googleResult.spreadsheetId;
    data.googleDriveFolderId = googleResult.formFolderId;

    // Keeps the base64-embedded schema/theme rather than failing the whole
    // publish over an image upload hiccup — uploadFormImagesToDrive logs
    // and degrades independently per side already.
    const uploaded = await uploadFormImagesToDrive({
      refreshToken: admin.googleRefreshToken!,
      formFolderId: googleResult.formFolderId,
      fields: input.fields,
      theme: input.theme,
    });
    data.schema = JSON.stringify(uploaded.fields);
    data.theme = JSON.stringify(uploaded.theme);
  } else {
    data.storageProvider = "local";
  }

  let formId: string;
  if (input.formId) {
    await prisma.form.update({ where: { id: input.formId }, data });
    formId = input.formId;
  } else {
    const created = await prisma.form.create({ data: data as never });
    formId = created.id;
  }

  // Only knowable once the row exists — a brand-new form has no id (and so
  // nowhere to save files under) until the create above runs, so this is a
  // follow-up pass rather than something foldable into `data` up front.
  if (input.storage === "local") {
    const { fields, theme } = await saveFormImagesLocally(formId, input.fields, input.theme);
    await prisma.form.update({
      where: { id: formId },
      data: { schema: JSON.stringify(fields), theme: JSON.stringify(theme) },
    });
    await removeUnusedFormAssets(formId);
  }
  await refreshFormStorageBytes(formId);

  return { ok: true, slug };
}
