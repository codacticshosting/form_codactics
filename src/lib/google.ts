import { Readable } from "node:stream";
import { google } from "googleapis";
import type { drive_v3, sheets_v4 } from "googleapis";
import {
  type ButtonField,
  type FormField,
  type PlayerListColumn,
  type PlayerListField,
} from "@/types/form-builder";
import { formatComputedResult, resolveComputedValues } from "@/lib/computed";
import { formatBerlinDate, formatBerlinTime } from "@/lib/timezones";
import { isDataField, codeLanguageLabel } from "@/lib/field-types";
import {
  sanitizeName,
  sanitizeFileName,
  dataUrlToBuffer,
  fieldsHaveEmbeddedImage,
  themeHasEmbeddedImage,
  replaceEmbeddedFieldImages,
  replaceEmbeddedThemeImages,
} from "@/lib/media-utils";
import type { FormTheme } from "@/types/theme";

export function getGoogleClients(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  return { drive, sheets };
}

function timestampSuffix(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string,
): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'");
  const q = [
    `name = '${escapedName}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    fields: "files(id, name)",
    spaces: "drive",
  });
  const found = existing.data.files?.[0];
  if (found?.id) return found.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Failed to create Drive folder");
  return created.data.id;
}

function isPlayerListField(field: FormField): field is PlayerListField {
  return field.type === "player-list";
}

function isButtonField(field: FormField): field is ButtonField {
  return field.type === "button";
}

// Button sub-answers aren't repeating, so they're flattened as extra
// columns directly on the "Submissions" tab rather than getting their own
// tab (unlike a Repeating list's columns, which get one row per entry).
function buttonColumnHeader(field: ButtonField, column: PlayerListColumn): string {
  return `${field.label || "Untitled"} — ${column.label || "Untitled"}`;
}

export async function publishFormToGoogle({
  refreshToken,
  title,
  fields,
}: {
  refreshToken: string;
  title: string;
  fields: FormField[];
}) {
  const { drive, sheets } = getGoogleClients(refreshToken);

  const codacticsFolderId = await findOrCreateFolder(drive, "codactics");
  const formsFolderId = await findOrCreateFolder(drive, "form", codacticsFolderId);

  const sanitizedTitle = sanitizeName(title, "form");
  const folderName = `${sanitizedTitle}_${timestampSuffix()}`;

  const formFolder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [formsFolderId],
    },
    fields: "id",
  });
  const formFolderId = formFolder.data.id;
  if (!formFolderId) throw new Error("Failed to create form folder");

  await drive.files.create({
    requestBody: {
      name: "Files",
      mimeType: "application/vnd.google-apps.folder",
      parents: [formFolderId],
    },
    fields: "id",
  });

  const playerListFields = fields.filter(isPlayerListField);
  const buttonFields = fields.filter(isButtonField);
  const dataFields = fields.filter((f) => isDataField(f.type));

  const sheetTabs: sheets_v4.Schema$Sheet[] = [
    { properties: { title: "Submissions" } },
    ...playerListFields.map((f) => ({
      properties: { title: sanitizeName(f.label || "Entries").slice(0, 90) },
    })),
  ];

  const createdSheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: sanitizedTitle },
      sheets: sheetTabs,
    },
  });
  const spreadsheetId = createdSheet.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet");

  // Sheets API always creates the file in "My Drive" root — move it into
  // the form folder we just built.
  const fileMeta = await drive.files.get({
    fileId: spreadsheetId,
    fields: "parents",
  });
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: formFolderId,
    removeParents: (fileMeta.data.parents ?? []).join(","),
    fields: "id, parents",
  });

  const submissionsHeader = [
    "Submission ID",
    "Submitted Date (Germany)",
    "Submitted Time (Germany)",
    "Username",
    ...dataFields.map((f) => f.label || "Untitled"),
    ...buttonFields.flatMap((f) => f.fields.map((c) => buttonColumnHeader(f, c))),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Submissions!A1",
    valueInputOption: "RAW",
    requestBody: { values: [submissionsHeader] },
  });

  for (const playerListField of playerListFields) {
    const tabTitle = sanitizeName(playerListField.label || "Entries").slice(0, 90);
    const header = [
      "Submission ID",
      "Entry #",
      ...playerListField.columns.map((c) => c.label || "Untitled"),
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabTitle}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }

  return { spreadsheetId, formFolderId };
}

// Appends any header columns the current field list needs but the sheet
// doesn't have yet. Never renames, reorders, or removes existing columns —
// once a submission has been written under a column, that column is
// permanent, even if the field is later removed from the form.
async function syncTabHeader(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabTitle: string,
  desiredHeader: string[],
) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabTitle}!1:1`,
  });
  const currentHeader = (existing.data.values?.[0] ?? []) as string[];
  const newColumns = desiredHeader.filter((h) => !currentHeader.includes(h));
  if (newColumns.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabTitle}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...currentHeader, ...newColumns]] },
  });
}

export async function syncSheetColumns({
  refreshToken,
  spreadsheetId,
  fields,
}: {
  refreshToken: string;
  spreadsheetId: string;
  fields: FormField[];
}) {
  const { sheets } = getGoogleClients(refreshToken);

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const existingTabs = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
  );

  const playerListFields = fields.filter(isPlayerListField);
  const buttonFields = fields.filter(isButtonField);
  const dataFields = fields.filter((f) => isDataField(f.type));

  await syncTabHeader(sheets, spreadsheetId, "Submissions", [
    "Submission ID",
    "Submitted Date (Germany)",
    "Submitted Time (Germany)",
    "Username",
    ...dataFields.map((f) => f.label || "Untitled"),
    ...buttonFields.flatMap((f) => f.fields.map((c) => buttonColumnHeader(f, c))),
  ]);

  for (const playerListField of playerListFields) {
    const tabTitle = sanitizeName(playerListField.label || "Entries").slice(0, 90);
    const header = [
      "Submission ID",
      "Entry #",
      ...playerListField.columns.map((c) => c.label || "Untitled"),
    ];

    if (!existingTabs.has(tabTitle)) {
      // A brand-new repeating-list field added after publish — give it its
      // own tab, same as at initial publish time.
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabTitle } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabTitle}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [header] },
      });
    } else {
      await syncTabHeader(sheets, spreadsheetId, tabTitle, header);
    }
  }
}

async function uploadFileToFolder(
  drive: drive_v3.Drive,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });
  return (
    res.data.webViewLink ??
    (res.data.id ? `https://drive.google.com/file/d/${res.data.id}/view` : "")
  );
}

// webViewLink opens Drive's HTML viewer page, not the raw image — no good
// as an <img src>. This is the direct-content hotlink pattern that actually
// renders, so the file also has to be shared "anyone with the link" for it
// to load for anonymous visitors on the public form.
function driveImageUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

async function uploadPublicImage(
  drive: drive_v3.Drive,
  folderId: string,
  fileName: string,
  dataUrl: string,
): Promise<string> {
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed) return dataUrl;
  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: parsed.mimeType, body: Readable.from(parsed.buffer) },
    fields: "id",
  });
  const fileId = created.data.id;
  if (!fileId) return dataUrl;
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });
  return driveImageUrl(fileId);
}

// Dropdown option thumbnails, Button images, Message/Image field pictures,
// and the theme's own logo/background/canvas images are all saved as
// base64 data URLs in the builder (so editing works before the admin is
// ever signed in with Drive access) — this moves any of those over to the
// form's own Drive folder at publish/update time, replacing the data URL
// with a hotlink. Fields/images that already reference an uploaded image
// (from a previous publish) are left alone, so nothing re-uploads on every
// edit. Schema and theme uploads run concurrently since they're
// independent; the folder is resolved once up front specifically so that
// concurrency can't race two callers into creating two "images" folders.
// Each half degrades independently — a failure uploading fields doesn't
// lose a theme upload that already succeeded, or vice versa.
export async function uploadFormImagesToDrive({
  refreshToken,
  formFolderId,
  fields,
  theme,
}: {
  refreshToken: string;
  formFolderId: string;
  fields: FormField[];
  theme: FormTheme;
}): Promise<{ fields: FormField[]; theme: FormTheme }> {
  const needsFields = fieldsHaveEmbeddedImage(fields);
  const needsTheme = themeHasEmbeddedImage(theme);
  if (!needsFields && !needsTheme) return { fields, theme };

  const { drive } = getGoogleClients(refreshToken);
  const imagesFolderId = await findOrCreateFolder(drive, "images", formFolderId);
  const uploadOne = (dataUrl: string, hint: string) =>
    uploadPublicImage(drive, imagesFolderId, `${sanitizeName(hint)}_${timestampSuffix()}`, dataUrl);

  const [fieldsResult, themeResult] = await Promise.allSettled([
    needsFields ? replaceEmbeddedFieldImages(fields, uploadOne) : Promise.resolve(fields),
    needsTheme ? replaceEmbeddedThemeImages(theme, uploadOne) : Promise.resolve(theme),
  ]);

  if (fieldsResult.status === "rejected") {
    console.error("Schema image upload failed:", fieldsResult.reason);
  }
  if (themeResult.status === "rejected") {
    console.error("Theme image upload failed:", themeResult.reason);
  }

  return {
    fields: fieldsResult.status === "fulfilled" ? fieldsResult.value : fields,
    theme: themeResult.status === "fulfilled" ? themeResult.value : theme,
  };
}

async function fetchTabHeader(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabTitle: string,
): Promise<string[]> {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabTitle}!1:1`,
  });
  return (existing.data.values?.[0] ?? []) as string[];
}

async function appendRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabTitle: string,
  header: string[],
  valuesByHeader: Record<string, string>,
) {
  const row = header.map((h) => valuesByHeader[h] ?? "");
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabTitle}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

// Convenience for the common one-row-per-tab case (the "Submissions" tab)
// — a Repeating list can append several rows to the SAME tab in one
// submission, where fetching the header once up front (see the player-list
// loop below) rather than per row is worth the extra step.
async function appendRowMatchingHeader(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabTitle: string,
  valuesByHeader: Record<string, string>,
) {
  const header = await fetchTabHeader(sheets, spreadsheetId, tabTitle);
  await appendRow(sheets, spreadsheetId, tabTitle, header, valuesByHeader);
}

async function extractTopLevelValue(
  field: FormField,
  formData: FormData,
  drive: drive_v3.Drive,
  filesFolderId: string,
  fileNamePrefix: string,
): Promise<string> {
  switch (field.type) {
    case "photo":
    case "document": {
      const file = formData.get(field.id);
      if (!(file instanceof File) || file.size === 0) return "";
      const buffer = Buffer.from(await file.arrayBuffer());
      return uploadFileToFolder(
        drive,
        filesFolderId,
        `${fileNamePrefix}_${sanitizeFileName(file.name)}`,
        buffer,
        file.type || "application/octet-stream",
      );
    }
    case "signature": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      const parsed = dataUrl ? dataUrlToBuffer(dataUrl) : null;
      if (!parsed) return "";
      return uploadFileToFolder(
        drive,
        filesFolderId,
        `${fileNamePrefix}_signature.png`,
        parsed.buffer,
        parsed.mimeType,
      );
    }
    case "drawing": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      const parsed = dataUrl ? dataUrlToBuffer(dataUrl) : null;
      if (!parsed) return "";
      return uploadFileToFolder(
        drive,
        filesFolderId,
        `${fileNamePrefix}_drawing.png`,
        parsed.buffer,
        parsed.mimeType,
      );
    }
    case "design-board": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      const parsed = dataUrl ? dataUrlToBuffer(dataUrl) : null;
      if (!parsed) return "";
      return uploadFileToFolder(
        drive,
        filesFolderId,
        `${fileNamePrefix}_design.png`,
        parsed.buffer,
        parsed.mimeType,
      );
    }
    case "dropdown": {
      const otherText = String(formData.get(`${field.id}__other`) ?? "").trim();
      if (field.allowMultiple) {
        return formData
          .getAll(field.id)
          .map(String)
          .map((v) => (v === "__other__" ? otherText : v))
          .filter(Boolean)
          .join(", ");
      }
      const selected = String(formData.get(field.id) ?? "");
      return selected === "__other__" ? otherText : selected;
    }
    case "code": {
      const code = String(formData.get(field.id) ?? "");
      const language = String(formData.get(`${field.id}__language`) ?? "");
      return code && language ? `[${codeLanguageLabel(language)}]\n${code}` : code;
    }
    case "static-text":
    case "section-break":
      return "";
    default: {
      const value = formData.get(field.id);
      return typeof value === "string" ? value : "";
    }
  }
}

async function extractPlayerColumnValue(
  column: PlayerListColumn,
  formData: FormData,
  key: string,
  drive: drive_v3.Drive,
  filesFolderId: string,
  fileNamePrefix: string,
): Promise<string> {
  if (column.type === "photo") {
    const file = formData.get(key);
    if (!(file instanceof File) || file.size === 0) return "";
    const buffer = Buffer.from(await file.arrayBuffer());
    return uploadFileToFolder(
      drive,
      filesFolderId,
      `${fileNamePrefix}_${sanitizeFileName(file.name)}`,
      buffer,
      file.type || "application/octet-stream",
    );
  }
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function recordSubmission({
  refreshToken,
  spreadsheetId,
  formFolderId,
  fields,
  formData,
  accessUsername,
}: {
  refreshToken: string;
  spreadsheetId: string;
  formFolderId: string;
  fields: FormField[];
  formData: FormData;
  accessUsername?: string;
}): Promise<{ submissionId: string }> {
  const { drive, sheets } = getGoogleClients(refreshToken);
  const filesFolderId = await findOrCreateFolder(drive, "Files", formFolderId);

  const submissionId = crypto.randomUUID();
  const submittedAt = new Date();

  const playerListFields = fields.filter(isPlayerListField);
  const buttonFields = fields.filter(isButtonField);
  const dataFields = fields.filter((f) => isDataField(f.type));

  // Computed fields are recalculated from the submitted Number/Rating
  // values here — never trusted from the client's hidden input — so a
  // respondent can't tamper with something like a total price by editing
  // the DOM before submitting.
  const numericValues = new Map<string, number>();
  for (const field of fields) {
    if (field.type === "number" || field.type === "rating") {
      const raw = formData.get(field.id);
      const num = typeof raw === "string" ? parseFloat(raw) : NaN;
      if (Number.isFinite(num)) numericValues.set(field.id, num);
    }
  }
  const computedValues = resolveComputedValues(fields, numericValues);

  const submissionRow: Record<string, string> = {
    "Submission ID": submissionId,
    "Submitted Date (Germany)": formatBerlinDate(submittedAt),
    "Submitted Time (Germany)": formatBerlinTime(submittedAt),
    "Username": accessUsername ?? "",
  };
  for (const field of dataFields) {
    submissionRow[field.label || "Untitled"] =
      field.type === "computed"
        ? formatComputedResult(computedValues.get(field.id) ?? 0)
        : await extractTopLevelValue(
            field,
            formData,
            drive,
            filesFolderId,
            submissionId,
          );
  }
  for (const buttonField of buttonFields) {
    for (const column of buttonField.fields) {
      const key = `${buttonField.id}__${column.id}`;
      submissionRow[buttonColumnHeader(buttonField, column)] =
        await extractPlayerColumnValue(
          column,
          formData,
          key,
          drive,
          filesFolderId,
          `${submissionId}_${buttonField.id}`,
        );
    }
  }
  await appendRowMatchingHeader(
    sheets,
    spreadsheetId,
    "Submissions",
    submissionRow,
  );

  for (const playerListField of playerListFields) {
    const tabTitle = sanitizeName(playerListField.label || "Entries").slice(
      0,
      90,
    );
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < playerListField.playerCount; i++) {
      const row: Record<string, string> = {};
      let hasValue = false;
      for (const column of playerListField.columns) {
        const key = `player-${i}-${column.id}`;
        const value = await extractPlayerColumnValue(
          column,
          formData,
          key,
          drive,
          filesFolderId,
          `${submissionId}_p${i + 1}`,
        );
        if (value) hasValue = true;
        row[column.label || "Untitled"] = value;
      }
      // Skip fully-blank player rows (e.g. a squad of 7 in an 11-slot form).
      if (!hasValue) continue;
      rows.push({ "Submission ID": submissionId, "Entry #": String(i + 1), ...row });
    }
    // The header can't change between rows of the same submission — fetch
    // it once per tab rather than once per row.
    if (rows.length === 0) continue;
    const header = await fetchTabHeader(sheets, spreadsheetId, tabTitle);
    for (const row of rows) {
      await appendRow(sheets, spreadsheetId, tabTitle, header, row);
    }
  }

  return { submissionId };
}
