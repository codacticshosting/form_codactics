"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createAccessToken, accessCookieName } from "@/lib/access-code";
import { checkRateLimit, formatRetryAfter, getClientIp } from "@/lib/rate-limit";
import type { GateState } from "./gate-state";

// Brute-force protection — always on, independent of the per-admin
// loginLimitFeatureEnabled gate below (which caps *successful* logins,
// not guessing attempts). After this many wrong passwords in a row for
// one username, it locks out for LOCKOUT_MS regardless of maxLogins.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
// Separate per-IP throttle on the whole gate — catches someone cycling
// through many different usernames from one IP, which the per-username
// lockout above wouldn't by itself.
const IP_RATE_LIMIT = 5;
const IP_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function submitAccessCode(
  slug: string,
  _prevState: GateState,
  formData: FormData,
): Promise<GateState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { status: "error", message: "Enter both a username and password." };
  }

  const form = await prisma.form.findUnique({
    where: { slug },
    include: { admin: true },
  });
  if (!form) {
    return { status: "error", message: "Form not found." };
  }

  const ip = await getClientIp();
  const ipLimit = await checkRateLimit(
    "access-login",
    `${form.id}:${ip}`,
    IP_RATE_LIMIT,
    IP_RATE_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return {
      status: "error",
      message: `Too many attempts from this connection. Please try again in ${formatRetryAfter(ipLimit.retryAfterMs)}.`,
    };
  }

  const code = await prisma.formAccessCode.findUnique({
    where: { formId_username: { formId: form.id, username } },
  });
  if (!code) {
    return { status: "error", message: "Incorrect username or password." };
  }

  // Locked from a prior run of wrong guesses — block before even checking
  // this attempt's password, so a correct guess during lockout still
  // doesn't get through.
  if (code.lockedUntil && code.lockedUntil.getTime() > Date.now()) {
    return {
      status: "error",
      message: `Too many attempts. Please try again in ${formatRetryAfter(code.lockedUntil.getTime() - Date.now())}.`,
    };
  }

  if (!verifyPassword(password, code.passwordHash)) {
    const failedAttempts = code.failedAttempts + 1;
    const lockedOut = failedAttempts >= MAX_FAILED_ATTEMPTS;
    await prisma.formAccessCode.update({
      where: { id: code.id },
      data: {
        failedAttempts,
        lockedUntil: lockedOut ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    return {
      status: "error",
      message: lockedOut
        ? `Too many attempts. Please try again in ${formatRetryAfter(LOCKOUT_MS)}.`
        : "Incorrect username or password.",
    };
  }

  // Only enforced for admins the super-admin has specifically granted
  // this feature to — everyone else's access codes stay unlimited, same
  // as before this existed. Counts every successful password check (not
  // once per browser session), so a respondent refreshing mid-fill does
  // use up another attempt — the admin can reset or raise it any time.
  if (
    form.admin.loginLimitFeatureEnabled &&
    code.maxLogins !== null &&
    code.loginCount >= code.maxLogins
  ) {
    return {
      status: "error",
      message: "This username has reached its login limit. Contact the organizer.",
    };
  }

  await prisma.formAccessCode.update({
    where: { id: code.id },
    data: { loginCount: { increment: 1 }, failedAttempts: 0, lockedUntil: null },
  });

  // Only proves the visitor passed the gate for the submit action's
  // defense-in-depth check below — the page itself never trusts this
  // cookie to skip the gate, so a fresh page load/refresh always asks for
  // credentials again, and the unlock only lasts for the current in-memory
  // client session (see AccessGate).
  const token = createAccessToken(form.id, username);
  const cookieStore = await cookies();
  cookieStore.set(accessCookieName(form.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return { status: "success", username };
}
