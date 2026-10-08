// Runs once when a server instance starts, before it handles requests
// (see the Next.js instrumentation docs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { encryptStoredGoogleTokens } = await import("@/lib/token-migration");
    const count = await encryptStoredGoogleTokens();
    if (count > 0) console.log(`Encrypted ${count} stored Google token(s).`);
  } catch (err) {
    // Never block startup over this — the tokens still work unencrypted,
    // and the next start tries again.
    console.error("Encrypting stored Google tokens failed:", err);
  }
}
