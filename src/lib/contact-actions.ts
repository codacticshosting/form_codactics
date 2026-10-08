"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { checkRateLimit, formatRetryAfter, getClientIp } from "@/lib/rate-limit";
import {
  CONTACT_RATE_LIMIT,
  CONTACT_RATE_WINDOW_MS,
  validateContactInput,
  type ContactInputError,
  type ContactMessageSource,
} from "@/lib/contact-messages";

export type SubmitContactMessageResult =
  | { ok: true }
  | { ok: false; error: ContactInputError }
  | { ok: false; error: "rate-limited"; retryAfter: string };

export async function submitContactMessage(input: {
  name?: string;
  email?: string;
  message?: string;
  source?: string;
  // Honeypot — a field hidden from real visitors, so anything in it came
  // from a bot filling in every input it finds. Reported back as success
  // (so the bot has no signal to adapt to) but never saved.
  website?: string;
}): Promise<SubmitContactMessageResult> {
  if (input.website) return { ok: true };

  const validated = validateContactInput(input);
  if (!validated.ok) return validated;

  // Checked after validation so a typo'd email doesn't use up one of the
  // visitor's attempts.
  const rateLimit = await checkRateLimit(
    "contact",
    await getClientIp(),
    CONTACT_RATE_LIMIT,
    CONTACT_RATE_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return { ok: false, error: "rate-limited", retryAfter: formatRetryAfter(rateLimit.retryAfterMs) };
  }

  const session = await auth();
  const source: ContactMessageSource =
    input.source === "feature-request" ? "feature-request" : "widget";

  await prisma.contactMessage.create({
    data: {
      ...validated.value,
      source,
      adminId: session?.user?.id ?? null,
    },
  });
  return { ok: true };
}

// Lets the widget pre-fill the email field for a signed-in admin without
// the root layout having to read the session (which would make every page
// dynamic just for this).
export async function getContactPrefillEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

export type ContactMessageAction =
  | "read"
  | "unread"
  | "archive"
  | "delete"
  | "restore"
  | "purge";

export type UpdateContactMessageResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not-found" | "not-allowed" };

// Every inbox action is one status transition, except "purge", which
// removes the row for good. Restoring (from Archived or Trash) brings a
// message back as "read" with a fresh readAt, so it isn't purged straight
// away by an old timestamp.
export async function updateContactMessage(
  messageId: string,
  action: ContactMessageAction,
): Promise<UpdateContactMessageResult> {
  // Re-checked on every call, never trusted from the caller — same as the
  // actions in super-admin-actions.ts.
  const session = await auth();
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { ok: false, error: "forbidden" };
  }

  const existing = await prisma.contactMessage.findUnique({ where: { id: messageId } });
  if (!existing) return { ok: false, error: "not-found" };

  // Permanent deletion only from Archived or Trash — a message still in
  // the inbox has to be archived or deleted first, so one stray click
  // can't destroy it.
  if (action === "purge") {
    if (existing.status !== "archived" && existing.status !== "deleted") {
      return { ok: false, error: "not-allowed" };
    }
    await prisma.contactMessage.delete({ where: { id: messageId } });
    return { ok: true };
  }

  const now = new Date();
  const data = {
    read: { status: "read", readAt: now },
    unread: { status: "new", readAt: null },
    archive: { status: "archived", archivedAt: now },
    delete: { status: "deleted", deletedAt: now },
    restore: { status: "read", readAt: now, archivedAt: null, deletedAt: null },
  }[action];
  if (!data) return { ok: false, error: "not-found" };

  await prisma.contactMessage.update({ where: { id: messageId }, data });
  return { ok: true };
}
