"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { recordSubmission } from "@/lib/google";
import { recordSubmissionToLocal } from "@/lib/local-storage";
import { verifyAccessToken, accessCookieName } from "@/lib/access-code";
import { CLOSED_MESSAGE, isFormClosed } from "@/types/closing";
import type { FormField } from "@/types/form-builder";
import type { SubmitState } from "@/types/submission";
import { checkRateLimit, formatRetryAfter, getClientIp } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  STORAGE_FILE_TOO_BIG_MESSAGE,
  STORAGE_FULL_SUBMIT_MESSAGE,
} from "@/lib/storage-limits";
import { checkStorageCapacity } from "@/lib/storage-quota";

// A submission this fast essentially can't be a human who actually read
// and filled the form.
const MIN_FILL_TIME_MS = 2000;
const SUBMIT_RATE_LIMIT = 5;
const SUBMIT_RATE_WINDOW_MS = 10 * 60 * 1000;

// The gate's unlock is only meant to last for one submission — clearing
// the cookie here means a resubmission attempt (or any later visit) is
// forced through AccessGate again, not just relying on the page never
// trusting the cookie in the first place.
async function clearAccessCookie(formId: string) {
  const cookieStore = await cookies();
  cookieStore.delete(accessCookieName(formId));
}

// Roughly what a response will take up once stored: uploaded files at
// their real size, drawn images (signature/drawing/design board, sent as
// base64 data URLs) at their decoded size, and everything else as text.
function incomingSubmissionBytes(formData: FormData): { files: number; total: number } {
  let files = 0;
  let text = 0;
  for (const value of formData.values()) {
    if (value instanceof File) {
      files += value.size;
    } else if (value.startsWith("data:")) {
      files += Math.floor(((value.length - value.indexOf(",") - 1) * 3) / 4);
    } else {
      text += Buffer.byteLength(value, "utf8");
    }
  }
  return { files, total: files + text };
}

export async function submitFormAction(
  slug: string,
  _prevState: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const form = await prisma.form.findUnique({
    where: { slug },
    include: { admin: { select: { deletionRequestedAt: true } } },
  });
  if (!form || form.status !== "published" || form.admin.deletionRequestedAt) {
    return {
      status: "error",
      message: "This form isn't accepting responses right now.",
    };
  }

  // Re-checked here (not just on the page render) since a visitor could
  // have had the form open before a deadline passed, or before the admin
  // manually closed it, and still try to submit afterward.
  if (isFormClosed(form)) {
    return {
      status: "error",
      message: CLOSED_MESSAGE,
    };
  }

  // Bot signals — both silently treated as a successful submission rather
  // than an error, so a bot gets no feedback telling it what tripped the
  // check and nothing to tune against. A real visitor never hits either:
  // the honeypot field is never visible to fill, and no human reads and
  // fills a form in under two seconds.
  if (String(formData.get("website") ?? "").trim()) {
    return { status: "success" };
  }
  const renderedAt = Number(formData.get("formRenderedAt") ?? 0);
  if (renderedAt && Date.now() - renderedAt < MIN_FILL_TIME_MS) {
    return { status: "success" };
  }

  // The browser already refuses oversized files when they're picked; this
  // is the real check, for anything sent without going through that.
  // Before the rate limit, so a visitor fixing their file doesn't use up
  // one of their attempts.
  for (const value of formData.values()) {
    if (value instanceof File && value.size > MAX_UPLOAD_BYTES) {
      return {
        status: "error",
        message: `Your response was not submitted: "${value.name}" is larger than ${MAX_UPLOAD_LABEL}. Please choose a smaller file.`,
      };
    }
  }

  // Unlike the bot signals above, this is a real possibility for genuine
  // visitors (retrying after an error, a shared office/campus IP) — worth
  // an honest message rather than a silent drop.
  const ip = await getClientIp();
  const rateLimit = await checkRateLimit(
    "form-submit",
    `${form.id}:${ip}`,
    SUBMIT_RATE_LIMIT,
    SUBMIT_RATE_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: `Too many submissions from this connection. Please try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
    };
  }

  // Defense in depth: the public page already gates behind AccessGate, but
  // a request could be sent directly to this action without ever passing
  // through it.
  let accessUsername: string | undefined;
  if (form.requireAccessCode) {
    const cookieStore = await cookies();
    const token = cookieStore.get(accessCookieName(form.id))?.value;
    const verified = token ? verifyAccessToken(token, form.id) : null;
    if (!verified) {
      return {
        status: "error",
        message: "Please sign in to this form before submitting.",
      };
    }
    accessUsername = verified.username;
  }

  const fields = JSON.parse(form.schema) as FormField[];

  if (form.storageProvider === "local") {
    const incoming = incomingSubmissionBytes(formData);
    const capacity = await checkStorageCapacity(form.adminId, incoming.total, incoming.files);
    if (!capacity.ok) {
      return {
        status: "error",
        message:
          capacity.reason === "admin-full" || incoming.files === 0
            ? STORAGE_FULL_SUBMIT_MESSAGE
            : STORAGE_FILE_TOO_BIG_MESSAGE,
      };
    }
    try {
      await recordSubmissionToLocal({ formId: form.id, fields, formData, accessUsername });
    } catch (err) {
      console.error("Local submission failed:", err);
      return {
        status: "error",
        message: "Something went wrong submitting your response. Please try again.",
      };
    }
    if (form.requireAccessCode) await clearAccessCookie(form.id);
    return { status: "success" };
  }

  const notSetUp: SubmitState = {
    status: "error",
    message: "This form isn't fully set up yet. Please contact the organizer.",
  };

  if (!form.googleSheetId || !form.googleDriveFolderId) return notSetUp;

  const admin = await prisma.admin.findUnique({ where: { id: form.adminId } });
  if (!admin?.googleRefreshToken) return notSetUp;

  try {
    await recordSubmission({
      refreshToken: admin.googleRefreshToken,
      spreadsheetId: form.googleSheetId,
      formFolderId: form.googleDriveFolderId,
      fields,
      formData,
      accessUsername,
    });
  } catch (err) {
    console.error("Submission failed:", err);
    return {
      status: "error",
      message: "Something went wrong submitting your response. Please try again.",
    };
  }

  if (form.requireAccessCode) await clearAccessCookie(form.id);
  return { status: "success" };
}

// Asked by the form page the moment a respondent picks a file, so they
// learn straight away that it won't fit rather than after filling in the
// whole form. Answers only yes/no — never the owner's actual numbers. The
// real check still happens on submit.
export async function checkUploadFits(slug: string, bytes: number): Promise<boolean> {
  if (!Number.isFinite(bytes) || bytes < 0) return true;
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { adminId: true, status: true, storageProvider: true },
  });
  if (!form || form.status !== "published" || form.storageProvider !== "local") return true;
  const result = await checkStorageCapacity(form.adminId, Math.min(bytes, MAX_UPLOAD_BYTES));
  return result.ok;
}
