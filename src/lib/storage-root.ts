import path from "node:path";

// Base directory for everything this server writes to its own local
// disk — uploaded submission files, form-definition images (when
// storageProvider = "local"), and super-admins.txt. Defaults to the app's
// own working directory (the previous hardcoded behavior), but on a host
// where that directory isn't the persistent disk (e.g. a Railway volume
// mounted somewhere else, or any container where the app root itself is
// ephemeral), set LOCAL_STORAGE_ROOT to wherever the persistent volume is
// mounted — nothing else needs to change, on Railway or anywhere else.
export const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT
  ? path.resolve(process.env.LOCAL_STORAGE_ROOT)
  : process.cwd();
