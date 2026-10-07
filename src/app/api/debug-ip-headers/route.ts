import { NextResponse } from "next/server";

// TEMPORARY — echoes back only the IP-related headers this request arrived
// with, to see which one Railway's proxy sets (and whether a client-sent
// value survives). Remove once getClientIp() in src/lib/rate-limit.ts is
// fixed.
const IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "x-envoy-external-address",
  "x-envoy-original-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
];

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result: Record<string, string | null> = {};
  for (const name of IP_HEADERS) result[name] = request.headers.get(name);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
