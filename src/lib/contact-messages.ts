// Shared (client- and server-safe) rules for contact-widget messages —
// validation limits and the per-status retention schedule. The server
// actions that use them live in contact-actions.ts.

export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_MESSAGE_MAX = 5000;

// Per IP, per hour.
export const CONTACT_RATE_LIMIT = 5;
export const CONTACT_RATE_WINDOW_MS = 60 * 60 * 1000;

export type ContactMessageStatus = "new" | "read" | "archived" | "deleted";
export type ContactMessageSource = "widget" | "feature-request";

// How long a message is kept in each status before it's purged for good.
// Each clock starts from that status's own timestamp — "new" from when
// the message arrived, "read" from when it was marked read, "archived"
// from when it was archived, "deleted" from when it was moved to Trash.
export const CONTACT_RETENTION_DAYS: Record<ContactMessageStatus, number> = {
  new: 365,
  read: 120,
  archived: 60,
  deleted: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(status: ContactMessageStatus, now = new Date()): Date {
  return new Date(now.getTime() - CONTACT_RETENTION_DAYS[status] * DAY_MS);
}

// Deliberately loose — just enough to catch typos like a missing "@" or
// domain. The real check is whether a reply ever arrives.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactInputError = "invalid-email" | "invalid-name" | "invalid-message";

export interface CleanContactInput {
  name: string | null;
  email: string;
  message: string;
}

export function validateContactInput(input: {
  name?: string;
  email?: string;
  message?: string;
}): { ok: true; value: CleanContactInput } | { ok: false; error: ContactInputError } {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const message = (input.message ?? "").trim();

  if (!email || email.length > CONTACT_EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "invalid-email" };
  }
  if (name.length > CONTACT_NAME_MAX) return { ok: false, error: "invalid-name" };
  if (!message || message.length > CONTACT_MESSAGE_MAX) {
    return { ok: false, error: "invalid-message" };
  }
  return { ok: true, value: { name: name || null, email, message } };
}
