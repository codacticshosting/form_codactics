import type { FormField } from "@/types/form-builder";
import type { FormTheme } from "@/types/theme";
import type { FormClosing } from "@/types/closing";

const DRAFT_KEY = "codactics:draft";

export interface FormDraft {
  formTitle: string;
  fields: FormField[];
  theme: FormTheme;
  flowStep: "design" | "build";
  closing: FormClosing;
}

// Used to carry an in-progress form across the redirect to Google sign-in
// (triggered only when the admin actually tries to publish), so they don't
// lose their work just because auth wasn't needed until that point.
export function saveDraft(draft: FormDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage errors (private browsing, quota, etc.) — worst case
    // the admin has to rebuild the form.
  }
}

export function loadDraft(): FormDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FormDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore
  }
}
