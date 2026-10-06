const RESERVED_SLUGS = new Set([
  "admin",
  "login",
  "logout",
  "api",
  "static",
  "assets",
  "favicon.ico",
]);

export function slugify(title: string): string {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "form";
  return RESERVED_SLUGS.has(base) ? `${base}-form` : base;
}
