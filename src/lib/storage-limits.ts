// Shared (client- and server-safe) storage constants and helpers — the
// server-only disk work lives in storage-usage.ts.

// Per uploaded file, checked in the browser when a file is picked and
// again on the server when the form is submitted.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "10 MB";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export const MB = 1024 * 1024;

// Quick choices offered to super-admins for an admin's quota, in MB —
// alongside "default", a custom value and "unlimited".
export const QUOTA_PRESETS_MB = [200, 500, 1024, 2048];

// Usage bar turns amber/red from these fractions of the quota on.
export const STORAGE_WARN_RATIO = 0.8;
export const STORAGE_CRITICAL_RATIO = 0.95;

export function formatMB(mb: number): string {
  return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`;
}

// Rough per-response sizes for the "How far does my free space go?"
// estimates — deliberately ranges, and always shown as approximate.
// Photo-compression numbers will join these once that's built.
export const RESPONSE_SIZE_PROFILES: { label: string; minBytes: number; maxBytes: number }[] = [
  { label: "Text only (registration, survey)", minBytes: 2 * 1024, maxBytes: 5 * 1024 },
  { label: "With a signature or drawing", minBytes: 30 * 1024, maxBytes: 100 * 1024 },
  { label: "With a PDF document", minBytes: 200 * 1024, maxBytes: 2 * MB },
  { label: "With phone photos (original size)", minBytes: 3 * MB, maxBytes: 5 * MB },
];

// "~1,500 – 5,000" — how many responses of a given size range fit into
// `freeBytes`. The larger size gives the smaller count and vice versa.
export function estimateResponseCount(freeBytes: number, minBytes: number, maxBytes: number): string {
  const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
  const low = freeBytes / maxBytes;
  const high = freeBytes / minBytes;
  if (high < 1) return "none";
  if (Math.floor(low) === Math.floor(high)) return `~${fmt(low)}`;
  return `~${fmt(low)} – ${fmt(high)}`;
}

// What a respondent is told when the form owner's storage can't take
// their response — never the actual numbers, only that it didn't go
// through and who to tell.
export const STORAGE_FULL_PAGE_TITLE = "This form is temporarily not accepting responses.";
export const STORAGE_FULL_PAGE_MESSAGE =
  "No data can be submitted right now. Please contact the person who shared this form with you.";
export const STORAGE_FULL_SUBMIT_MESSAGE =
  "Your response was not submitted. This form can't accept responses right now because there isn't enough storage. Please contact the person who shared this form with you.";
export const STORAGE_FILE_TOO_BIG_MESSAGE =
  "Your response was not submitted. There isn't enough storage left on this form for your uploaded file(s). Please choose smaller files, or contact the person who shared this form with you.";
export const STORAGE_FILE_WONT_FIT_HINT =
  "This file is too large for the space left on this form. Your response can't be submitted with it. Please choose a smaller file or contact the person who shared this form with you.";
