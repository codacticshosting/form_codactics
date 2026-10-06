export type FieldType =
  | "short-text"
  | "long-text"
  | "number"
  | "photo"
  | "dropdown"
  | "checkbox"
  | "player-list"
  | "static-text"
  | "email"
  | "phone"
  | "link"
  | "date"
  | "multiple-choice"
  | "document"
  | "signature"
  | "section-break"
  | "rating"
  | "computed"
  | "button"
  | "image-display"
  | "checklist"
  | "ranking"
  | "drawing"
  | "design-board"
  | "code";

export interface FieldPopup {
  enabled: boolean;
  title: string;
  content: string; // markdown
  // false (default): shown once per form-fill session. true: shown every
  // time the trigger fires (every focus, or every Next into the section).
  repeat?: boolean;
}

interface FieldBase {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  // For most field types: fires on focus. For "section-break": fires when
  // the respondent advances into this section via Next. See FieldPopup's
  // "repeat" for whether that's once per session or every time.
  popup?: FieldPopup;
  // Keeps the field in the form's definition (position, settings, any
  // prior recorded answers) while removing it from what respondents see —
  // for pausing collection on a question without losing its configuration
  // the way deleting it would. Admin-only; never rendered on the public form.
  hidden?: boolean;
}

export interface ShortTextField extends FieldBase {
  type: "short-text";
}

export interface LongTextField extends FieldBase {
  type: "long-text";
}

export interface NumberField extends FieldBase {
  type: "number";
  min?: number;
  max?: number;
}

export interface PhotoField extends FieldBase {
  type: "photo";
}

export interface DropdownOption {
  label: string;
  imageDataUrl?: string; // optional thumbnail — never required
}

// Forms saved before per-option images existed stored options as plain
// strings — normalize either shape to the same object form wherever
// options are read, rather than migrating old data.
export function normalizeDropdownOption(
  raw: string | DropdownOption,
): DropdownOption {
  return typeof raw === "string" ? { label: raw } : raw;
}

export interface DropdownField extends FieldBase {
  type: "dropdown";
  options: DropdownOption[];
  allowMultiple: boolean;
  allowOther: boolean;
  // Both only meaningful when allowMultiple is true. undefined/0 = no limit
  // (for max) or no minimum (for min).
  maxSelections?: number;
  minSelections?: number;
}

export interface CheckboxField extends FieldBase {
  type: "checkbox";
  yesLabel: string;
  noLabel: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  // Independent per statement — e.g. "I agree to the Terms" can be
  // mandatory while "Send me updates" stays optional, in the same list.
  required: boolean;
}

// A list of independent statements the respondent ticks one by one — e.g.
// a Terms & Conditions checklist — as opposed to Dropdown's multi-select
// (picking some options from one list) or Checkbox's single yes/no.
export interface ChecklistField extends FieldBase {
  type: "checklist";
  items: ChecklistItem[];
}

export type PlayerListColumnType =
  | "short-text"
  | "number"
  | "dropdown"
  | "checkbox"
  | "photo";

export interface PlayerListColumn {
  id: string;
  type: PlayerListColumnType;
  label: string;
  required: boolean;
  options?: string[];
}

export interface PlayerListField extends FieldBase {
  type: "player-list";
  layout: "row" | "stacked";
  playerCount: number;
  columns: PlayerListColumn[];
}

export interface StaticTextField extends FieldBase {
  type: "static-text";
  content: string;
  color?: string;
  imageDataUrl?: string;
}

// A pure image block for the public form — banners, flyers, sponsor logos —
// with no text editing (that's what Message is for) and nothing for the
// respondent to fill in.
export interface ImageDisplayField extends FieldBase {
  type: "image-display";
  imageDataUrl?: string;
  caption?: string;
}

export interface EmailField extends FieldBase {
  type: "email";
}

export interface PhoneField extends FieldBase {
  type: "phone";
}

export interface LinkField extends FieldBase {
  type: "link";
}

export interface DateField extends FieldBase {
  type: "date";
  min?: string;
  max?: string;
}

export interface MultipleChoiceField extends FieldBase {
  type: "multiple-choice";
  options: string[];
}

export interface DocumentField extends FieldBase {
  type: "document";
}

// A monospace code box. `languages` holds ids from CODE_LANGUAGES
// (lib/field-types.ts): one entry locks the field to that language with no
// picker shown; several lets the respondent pick which one they're
// submitting in; empty means no restriction at all.
export interface CodeField extends FieldBase {
  type: "code";
  languages: string[];
}

export interface SignatureField extends FieldBase {
  type: "signature";
}

// A larger freeform canvas for sketching an idea/diagram — same
// draw-and-record-as-PNG mechanism as Signature, just not constrained to a
// single signature line.
export interface DrawingField extends FieldBase {
  type: "drawing";
}

// A template image the respondent designs on top of — drags up to 5 of
// their own uploaded photos into place and can draw over the composite
// with a pen. Submitted as one flattened PNG, same mechanism as Signature
// and Drawing — the uploaded photos' positions aren't kept as separate
// structured data, only baked into that final image.
export interface DesignBoardField extends FieldBase {
  type: "design-board";
  baseImageDataUrl?: string;
}

export interface SectionBreakField extends FieldBase {
  type: "section-break";
  description: string;
  color?: string;
  // undefined/empty = shown to everyone. Otherwise this section (and every
  // field in it) only shows for a respondent who logged in through the
  // form's access-code gate as one of these usernames — meaningless (and
  // ignored) on a form that doesn't require access codes at all.
  visibleToUsernames?: string[];
}

export interface RatingField extends FieldBase {
  type: "rating";
  min: number;
  max: number;
  style: "stars" | "slider";
}

export type ComputedOperation = "sum" | "average" | "multiply" | "min" | "max";

export type ComputedTerm =
  | { type: "field"; fieldId: string }
  | { type: "constant"; value: number };

export interface ComputedField extends FieldBase {
  type: "computed";
  operation: ComputedOperation;
  terms: ComputedTerm[];
  // When false, this field isn't shown to the person filling the form — it
  // exists purely as an intermediate step for other Computed fields to
  // reference (e.g. building up a multi-step formula), but is still
  // calculated and still recorded.
  showOnForm: boolean;
}

// A button the respondent clicks to open a small popup form (built from the
// same column types as a Repeating list's columns) — used for things like
// an optional "Add emergency contact" detail that most people can skip.
export interface ButtonField extends FieldBase {
  type: "button";
  buttonStyle: "text" | "image";
  buttonText: string;
  buttonImageDataUrl?: string;
  fields: PlayerListColumn[];
}

// An item the respondent reorders in a Ranking field — image, text, or
// both, same optional-image shape as a Dropdown option, but with a stable
// id so drag-and-drop can track it across reorders (an array index can't,
// since the index itself changes every time an item moves).
export interface RankingItem {
  id: string;
  label: string;
  imageDataUrl?: string;
}

export interface RankingField extends FieldBase {
  type: "ranking";
  items: RankingItem[];
  // How the drag-to-reorder list is presented to respondents — stacked
  // top-to-bottom, or laid out side-by-side.
  layout: "vertical" | "horizontal";
}

export type FormField =
  | ShortTextField
  | LongTextField
  | NumberField
  | PhotoField
  | DropdownField
  | CheckboxField
  | PlayerListField
  | StaticTextField
  | EmailField
  | PhoneField
  | LinkField
  | DateField
  | MultipleChoiceField
  | DocumentField
  | SignatureField
  | SectionBreakField
  | RatingField
  | ComputedField
  | ButtonField
  | ImageDisplayField
  | ChecklistField
  | RankingField
  | DrawingField
  | DesignBoardField
  | CodeField;
