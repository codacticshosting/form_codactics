export const MAX_DRAFTS_PER_ADMIN = 3;
export const MAX_PUBLISHED_PER_ADMIN = 3;

// An admin's individual override (set from the super-admin control panel)
// always wins over the default — null/undefined means "no override, use
// the normal cap."
export function effectiveDraftLimit(admin: { maxDrafts: number | null }): number {
  return admin.maxDrafts ?? MAX_DRAFTS_PER_ADMIN;
}

export function effectivePublishedLimit(admin: { maxPublished: number | null }): number {
  return admin.maxPublished ?? MAX_PUBLISHED_PER_ADMIN;
}
