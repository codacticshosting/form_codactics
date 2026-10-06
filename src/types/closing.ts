// Response-collection lifecycle for a published form — separate from
// "draft/published/maintenance" status, since a form can be fully live and
// still be done collecting responses (a deadline passed, or the admin
// stopped it manually). Re-selecting "open" is how it gets reopened.
export interface FormClosing {
  mode: "open" | "deadline" | "manual";
  dateStr: string; // "YYYY-MM-DD" — only meaningful when mode === "deadline"
  timeStr: string; // "HH:MM"
  timezoneId: string;
}

export const DEFAULT_CLOSING: FormClosing = {
  mode: "open",
  dateStr: "",
  timeStr: "",
  timezoneId: "UTC",
};

export const CLOSED_MESSAGE =
  "Form is not taking any more data right now. Contact the organizer.";

// Shared by the public page (to decide what to render) and the submit
// action (to re-check server-side, since a visitor could have had the form
// open before a deadline passed) — kept in one place so the two can't
// silently drift on what "closed" means.
export function isFormClosed(form: {
  closeMode: string | null;
  closesAt: Date | null;
}): boolean {
  return (
    form.closeMode === "manual" ||
    (form.closeMode === "deadline" && !!form.closesAt && new Date() > form.closesAt)
  );
}
