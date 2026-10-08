// Server-only — never imported from a "use client" file. Encrypts secrets
// before they're stored in the database (today: admins' Google refresh
// tokens), so a copy of the database alone — a leaked backup, say — gives
// no access to anyone's Google Drive.
//
// AES-256-GCM. The key comes from TOKEN_ENCRYPTION_KEY if set (32 bytes,
// base64), otherwise it's derived from AUTH_SECRET — which already lives
// only in the server's environment, never in the database. Changing
// whichever one is in use makes existing tokens unreadable; admins then
// simply sign in again (sign-in always issues a fresh token).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.TOKEN_ENCRYPTION_KEY;
  if (explicit) {
    const decoded = Buffer.from(explicit, "base64");
    if (decoded.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
    }
    cachedKey = decoded;
  } else {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is not set — can't encrypt stored tokens.");
    cachedKey = Buffer.from(
      hkdfSync("sha256", secret, "codactics-form", "google-refresh-token-encryption", 32),
    );
  }
  return cachedKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

// Values stored before encryption existed are plain text and come back
// unchanged (and get encrypted at the next server start — see
// encryptStoredGoogleTokens). Throws if an encrypted value can't be
// decrypted, e.g. because the key changed.
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
