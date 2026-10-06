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

export async function submitFormAction(
  slug: string,
  _prevState: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form || form.status !== "published") {
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
