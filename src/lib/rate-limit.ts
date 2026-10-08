import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// Best-effort client IP from the proxy's forwarded-for header — "unknown"
// in local dev (no proxy) or anywhere else it's absent, which just means
// every direct/unproxied visitor shares one rate-limit bucket. Fine for
// what this is used for (slowing down abuse, not identifying anyone).
//
// Taking the FIRST x-forwarded-for entry is only safe because Railway's
// edge discards any x-forwarded-for / x-real-ip a client sends and writes
// its own "<client>, <railway edge>" (verified on the live app, Oct 2026)
// — so the first entry can't be spoofed, and the last one is Railway's
// proxy, not the visitor. Re-check this if the app moves to another host
// or proxy: one that appends to a client-supplied header instead would
// make the first entry attacker-controlled.
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headersList.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  // Only meaningful when allowed is false.
  retryAfterMs: number;
}

// A plain fixed-window counter (not sliding-window) — simple, and good
// enough for slowing down abuse rather than being a precise limiter. Each
// (kind, key) pair gets its own bucket that resets itself once windowMs
// has passed since it started, so there's no separate cleanup job needed.
export async function checkRateLimit(
  kind: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const bucket = await prisma.rateLimitBucket.findUnique({
    where: { kind_key: { kind, key } },
  });

  if (!bucket || now.getTime() - bucket.windowStart.getTime() > windowMs) {
    await prisma.rateLimitBucket.upsert({
      where: { kind_key: { kind, key } },
      create: { kind, key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfterMs = windowMs - (now.getTime() - bucket.windowStart.getTime());
    return { allowed: false, retryAfterMs };
  }

  await prisma.rateLimitBucket.update({
    where: { kind_key: { kind, key } },
    data: { count: { increment: 1 } },
  });
  return { allowed: true, retryAfterMs: 0 };
}

export function formatRetryAfter(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
