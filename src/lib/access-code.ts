import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

// --- Password hashing (one-way — never store or recover the plaintext) ---

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const candidate = scryptSync(password, salt, 64);
  const actual = Buffer.from(derivedHex, "hex");
  if (candidate.length !== actual.length) return false;
  return timingSafeEqual(candidate, actual);
}

// --- Signed access-gate cookie ---
// A stateless, tamper-proof token proving "this visitor already entered a
// valid username/password for this specific form" — avoids needing a
// server-side session table just for this.

const SESSION_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createAccessToken(formId: string, username: string): string {
  const expires = Date.now() + SESSION_MS;
  const payload = `${formId}.${username}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAccessToken(
  token: string,
  formId: string,
): { username: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [tokenFormId, username, expiresStr, signature] = parts;
  const payload = `${tokenFormId}.${username}.${expiresStr}`;
  const expected = sign(payload);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (tokenFormId !== formId) return null;
  if (Date.now() > Number(expiresStr)) return null;
  return { username };
}

export function accessCookieName(formId: string): string {
  return `form_access_${formId}`;
}
