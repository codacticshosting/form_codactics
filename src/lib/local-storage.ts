import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import {
  type ButtonField,
  type FormField,
  type PlayerListColumn,
  type PlayerListField,
} from "@/types/form-builder";
import { formatComputedResult, resolveComputedValues } from "@/lib/computed";
import { isDataField, codeLanguageLabel } from "@/lib/field-types";
import {
  sanitizeFileName,
  dataUrlToBuffer,
  fieldsHaveEmbeddedImage,
  themeHasEmbeddedImage,
  replaceEmbeddedFieldImages,
  replaceEmbeddedThemeImages,
  IMAGE_MIME_TO_EXT,
} from "@/lib/media-utils";
import type { FormTheme } from "@/types/theme";

function isPlayerListField(field: FormField): field is PlayerListField {
  return field.type === "player-list";
}

function isButtonField(field: FormField): field is ButtonField {
  return field.type === "button";
}

// Everything under this directory is gitignored and lives on whatever
// persistent disk the server itself has — never served statically, only
// through the authenticated download route (src/app/api/uploads). Exported
// so that route (and the schema-assets one below) share the same root
// rather than each re-declaring their own copy of the path.
export const UPLOADS_ROOT = path.join(LOCAL_STORAGE_ROOT, "data", "uploads");

// Separate root for form-DEFINITION images (dropdown option thumbnails,
// Button images) — kept apart from UPLOADS_ROOT (private submission
// answers) since these are served back out publicly, unauthenticated, for
// anyone viewing the live form. Exported for the same reason as above.
export const SCHEMA_ASSETS_ROOT = path.join(LOCAL_STORAGE_ROOT, "data", "schema-assets");

// Dropdown option thumbnails, Button images, Message/Image field pictures,
// and the theme's own logo/background/canvas images are all saved as
// base64 data URLs in the builder (so editing works before the form is
// ever published) — this moves any of those to a local file at
// publish/update time, replacing the data URL with a URL served by the
// schema-assets route. Fields/images that already reference a saved file
// (from a previous publish) are left alone. Schema and theme images save
// concurrently since they're independent writes to the same directory
// (created once up front, not per file); each half degrades independently
// on failure rather than losing whichever side already succeeded.
export async function saveFormImagesLocally(
  formId: string,
  fields: FormField[],
  theme: FormTheme,
): Promise<{ fields: FormField[]; theme: FormTheme }> {
  const needsFields = fieldsHaveEmbeddedImage(fields);
  const needsTheme = themeHasEmbeddedImage(theme);
  if (!needsFields && !needsTheme) return { fields, theme };

  const dir = path.join(SCHEMA_ASSETS_ROOT, formId);
  await mkdir(dir, { recursive: true });
  const uploadOne = async (dataUrl: string): Promise<string> => {
    const parsed = dataUrlToBuffer(dataUrl);
    if (!parsed) return dataUrl;
    const ext = IMAGE_MIME_TO_EXT[parsed.mimeType] ?? "bin";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    await writeFile(path.join(dir, fileName), new Uint8Array(parsed.buffer));
    return `/api/forms/${formId}/schema-assets/${fileName}`;
  };

  const [fieldsResult, themeResult] = await Promise.allSettled([
    needsFields ? replaceEmbeddedFieldImages(fields, uploadOne) : Promise.resolve(fields),
    needsTheme ? replaceEmbeddedThemeImages(theme, uploadOne) : Promise.resolve(theme),
  ]);

  if (fieldsResult.status === "rejected") {
    console.error("Schema image local-save failed:", fieldsResult.reason);
  }
  if (themeResult.status === "rejected") {
    console.error("Theme image local-save failed:", themeResult.reason);
  }

  return {
    fields: fieldsResult.status === "fulfilled" ? fieldsResult.value : fields,
    theme: themeResult.status === "fulfilled" ? themeResult.value : theme,
  };
}

export type LocalAnswerValue =
  | { kind: "text"; text: string }
  | { kind: "file"; storedPath: string; originalName: string };

export interface LocalSubmissionData {
  // Keyed by field id (always unique), not label — multiple fields can
  // share the same label (every new field starts out as "Untitled
  // question"), which would silently overwrite entries if keyed by label.
  answers: Record<string, { label: string; value: LocalAnswerValue }>;
  playerListEntries?: Record<
    string,
    {
      listLabel: string;
      entries: { label: string; value: LocalAnswerValue }[][];
    }
  >;
  buttonAnswers?: Record<
    string,
    {
      groupLabel: string;
      entries: { label: string; value: LocalAnswerValue }[];
    }
  >;
  // Which access-code username the respondent signed in with, when the form
  // requires one — undefined for forms that don't gate access at all.
  accessUsername?: string;
}

// Submissions recorded before answers were keyed by field id (rather than
// label) stored a different shape: `{ [label]: LocalAnswerValue }` instead
// of `{ [fieldId]: { label, value } }`. Normalizing here means older
// records still work instead of crashing, rather than needing a data
// migration.
export function normalizeAnswer(
  key: string,
  raw: unknown,
): { label: string; value: LocalAnswerValue } {
  if (raw && typeof raw === "object" && "value" in raw && "label" in raw) {
    return raw as { label: string; value: LocalAnswerValue };
  }
  return { label: key, value: raw as LocalAnswerValue };
}

export function normalizePlayerList(
  key: string,
  raw: unknown,
): { listLabel: string; entries: { label: string; value: LocalAnswerValue }[][] } {
  if (raw && typeof raw === "object" && "entries" in raw && "listLabel" in raw) {
    return raw as {
      listLabel: string;
      entries: { label: string; value: LocalAnswerValue }[][];
    };
  }
  return {
    listLabel: key,
    entries: raw as { label: string; value: LocalAnswerValue }[][],
  };
}

export function normalizeButtonAnswer(
  key: string,
  raw: unknown,
): { groupLabel: string; entries: { label: string; value: LocalAnswerValue }[] } {
  if (raw && typeof raw === "object" && "entries" in raw && "groupLabel" in raw) {
    return raw as {
      groupLabel: string;
      entries: { label: string; value: LocalAnswerValue }[];
    };
  }
  return {
    groupLabel: key,
    entries: raw as { label: string; value: LocalAnswerValue }[],
  };
}

async function saveFileLocally(
  formId: string,
  submissionId: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_ROOT, formId, submissionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), new Uint8Array(buffer));
  // Stored as a relative, URL-safe path — never an absolute filesystem path.
  return `${formId}/${submissionId}/${fileName}`;
}

// Shared by top-level Photo/Document fields and Repeating-list/Button
// photo columns — same "read the uploaded File, save it, describe it"
// logic regardless of which kind of field the key belongs to.
async function extractFileAnswer(
  formData: FormData,
  key: string,
  formId: string,
  submissionId: string,
): Promise<LocalAnswerValue> {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) return { kind: "text", text: "" };
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = sanitizeFileName(file.name);
  const storedPath = await saveFileLocally(formId, submissionId, fileName, buffer);
  return { kind: "file", storedPath, originalName: file.name };
}

async function extractTopLevelValue(
  field: FormField,
  formData: FormData,
  formId: string,
  submissionId: string,
): Promise<LocalAnswerValue> {
  switch (field.type) {
    case "photo":
    case "document":
      return extractFileAnswer(formData, field.id, formId, submissionId);
    case "signature": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      const parsed = dataUrl ? dataUrlToBuffer(dataUrl) : null;
      if (!parsed) return { kind: "text", text: "" };
      const storedPath = await saveFileLocally(
        formId,
        submissionId,
        "signature.png",
        parsed.buffer,
      );
      return { kind: "file", storedPath, originalName: "signature.png" };
    }
    case "drawing": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      const parsed = dataUrl ? dataUrlToBuffer(dataUrl) : null;
      if (!parsed) return { kind: "text", text: "" };
      const storedPath = await saveFileLocally(
        formId,
        submissionId,
        "drawing.png",
        parsed.buffer,
      );
      return { kind: "file", storedPath, originalName: "drawing.png" };
    }
    case "design-board": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      const parsed = dataUrl ? dataUrlToBuffer(dataUrl) : null;
      if (!parsed) return { kind: "text", text: "" };
      const storedPath = await saveFileLocally(
        formId,
        submissionId,
        "design.png",
        parsed.buffer,
      );
      return { kind: "file", storedPath, originalName: "design.png" };
    }
    case "dropdown": {
      const otherText = String(formData.get(`${field.id}__other`) ?? "").trim();
      if (field.allowMultiple) {
        const resolved = formData
          .getAll(field.id)
          .map(String)
          .map((v) => (v === "__other__" ? otherText : v))
          .filter(Boolean)
          .join(", ");
        return { kind: "text", text: resolved };
      }
      const selected = String(formData.get(field.id) ?? "");
      return { kind: "text", text: selected === "__other__" ? otherText : selected };
    }
    case "code": {
      const code = String(formData.get(field.id) ?? "");
      const language = String(formData.get(`${field.id}__language`) ?? "");
      return {
        kind: "text",
        text: code && language ? `[${codeLanguageLabel(language)}]\n${code}` : code,
      };
    }
    case "static-text":
    case "section-break":
      return { kind: "text", text: "" };
    default: {
      const value = formData.get(field.id);
      return { kind: "text", text: typeof value === "string" ? value : "" };
    }
  }
}

async function extractPlayerColumnValue(
  column: PlayerListColumn,
  formData: FormData,
  key: string,
  formId: string,
  submissionId: string,
): Promise<LocalAnswerValue> {
  if (column.type === "photo") {
    return extractFileAnswer(formData, key, formId, submissionId);
  }
  const value = formData.get(key);
  return { kind: "text", text: typeof value === "string" ? value : "" };
}

function isBlank(value: LocalAnswerValue): boolean {
  return value.kind === "text" && value.text === "";
}

export async function recordSubmissionToLocal({
  formId,
  fields,
  formData,
  accessUsername,
}: {
  formId: string;
  fields: FormField[];
  formData: FormData;
  accessUsername?: string;
}): Promise<{ submissionId: string }> {
  const submissionId = crypto.randomUUID();

  const playerListFields = fields.filter(isPlayerListField);
  const buttonFields = fields.filter(isButtonField);
  const dataFields = fields.filter((f) => isDataField(f.type));

  // Same integrity rule as the Google path: Computed values are always
  // recalculated server-side from the submitted Number/Rating values,
  // never trusted from the client's hidden input.
  const numericValues = new Map<string, number>();
  for (const field of fields) {
    if (field.type === "number" || field.type === "rating") {
      const raw = formData.get(field.id);
      const num = typeof raw === "string" ? parseFloat(raw) : NaN;
      if (Number.isFinite(num)) numericValues.set(field.id, num);
    }
  }
  const computedValues = resolveComputedValues(fields, numericValues);

  const answers: LocalSubmissionData["answers"] = {};
  for (const field of dataFields) {
    const label = field.label || "Untitled";
    const value =
      field.type === "computed"
        ? { kind: "text" as const, text: formatComputedResult(computedValues.get(field.id) ?? 0) }
        : await extractTopLevelValue(field, formData, formId, submissionId);
    answers[field.id] = { label, value };
  }

  const playerListEntries: LocalSubmissionData["playerListEntries"] = {};
  for (const playerListField of playerListFields) {
    const rows: { label: string; value: LocalAnswerValue }[][] = [];
    for (let i = 0; i < playerListField.playerCount; i++) {
      const row: { label: string; value: LocalAnswerValue }[] = [];
      let hasValue = false;
      for (const column of playerListField.columns) {
        const key = `player-${i}-${column.id}`;
        const value = await extractPlayerColumnValue(
          column,
          formData,
          key,
          formId,
          submissionId,
        );
        if (!isBlank(value)) hasValue = true;
        row.push({ label: column.label || "Untitled", value });
      }
      // Skip fully-blank player rows, same as the Google path.
      if (hasValue) rows.push(row);
    }
    if (rows.length > 0) {
      playerListEntries![playerListField.id] = {
        listLabel: playerListField.label || "Untitled",
        entries: rows,
      };
    }
  }

  const buttonAnswers: LocalSubmissionData["buttonAnswers"] = {};
  for (const buttonField of buttonFields) {
    const entries: { label: string; value: LocalAnswerValue }[] = [];
    let hasValue = false;
    for (const column of buttonField.fields) {
      const key = `${buttonField.id}__${column.id}`;
      const value = await extractPlayerColumnValue(
        column,
        formData,
        key,
        formId,
        submissionId,
      );
      if (!isBlank(value)) hasValue = true;
      entries.push({ label: column.label || "Untitled", value });
    }
    if (hasValue) {
      buttonAnswers![buttonField.id] = {
        groupLabel: buttonField.label || "Untitled",
        entries,
      };
    }
  }

  const data: LocalSubmissionData = {
    answers,
    ...(Object.keys(playerListEntries!).length > 0 ? { playerListEntries } : {}),
    ...(Object.keys(buttonAnswers!).length > 0 ? { buttonAnswers } : {}),
    ...(accessUsername ? { accessUsername } : {}),
  };

  await prisma.submission.create({
    data: {
      id: submissionId,
      formId,
      dataJson: JSON.stringify(data),
    },
  });

  return { submissionId };
}
