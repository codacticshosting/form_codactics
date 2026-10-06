import {
  Type,
  AlignLeft,
  Hash,
  Image,
  ChevronDownSquare,
  CheckSquare,
  Rows3,
  StickyNote,
  Mail,
  Phone,
  Link,
  Calendar,
  CircleDot,
  FileText,
  PenTool,
  SeparatorHorizontal,
  Star,
  Calculator,
  MousePointerClick,
  ImagePlus,
  ListChecks,
  ArrowDownUp,
  Paintbrush,
  Layers,
  Code2,
  type LucideIcon,
} from "lucide-react";
import type {
  FieldType,
  FormField,
  PlayerListColumn,
  PlayerListColumnType,
} from "@/types/form-builder";

// Preset list for the Code field — a curated set rather than free text, so
// the language shown to respondents and recorded in exports stays
// consistent regardless of who typed it.
export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "bash", label: "Bash / Shell" },
  { id: "sql", label: "SQL" },
  { id: "other", label: "Other" },
];

export function codeLanguageLabel(id: string): string {
  return CODE_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

function createId() {
  return crypto.randomUUID();
}

export interface FieldTypeDef {
  type: FieldType;
  label: string;
  description: string;
  icon: LucideIcon;
  create: () => FormField;
  // false for types that never carry a plain per-submission answer (a
  // section marker, a static message, or a type with its own dedicated
  // export shape like Repeating list/Button) — omit (defaults to true) for
  // anything that gets a normal answer column/cell. Read via isDataField().
  producesDataColumn?: boolean;
}

export const FIELD_TYPE_DEFS: FieldTypeDef[] = [
  {
    type: "short-text",
    label: "Short answer",
    description: "Single-line text, e.g. team name",
    icon: Type,
    create: () => ({
      id: createId(),
      type: "short-text",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "long-text",
    label: "Paragraph",
    description: "Multi-line text",
    icon: AlignLeft,
    create: () => ({
      id: createId(),
      type: "long-text",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "number",
    label: "Number",
    description: "Numeric input, e.g. number of players",
    icon: Hash,
    create: () => ({
      id: createId(),
      type: "number",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "email",
    label: "Email",
    description: "Email address with format validation",
    icon: Mail,
    create: () => ({
      id: createId(),
      type: "email",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "phone",
    label: "Phone number",
    description: "Contact phone number",
    icon: Phone,
    create: () => ({
      id: createId(),
      type: "phone",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "link",
    label: "Link",
    description: "A URL, e.g. Facebook, Instagram, or LinkedIn profile",
    icon: Link,
    create: () => ({
      id: createId(),
      type: "link",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "date",
    label: "Date",
    description: "Event date, deadline, or date of birth",
    icon: Calendar,
    create: () => ({
      id: createId(),
      type: "date",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "photo",
    label: "Photo upload",
    description: "Single image, e.g. team or player photo",
    icon: Image,
    create: () => ({
      id: createId(),
      type: "photo",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "document",
    label: "Document upload",
    description: "PDF or document, e.g. ID proof or signed waiver",
    icon: FileText,
    create: () => ({
      id: createId(),
      type: "document",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "code",
    label: "Code",
    description: "A monospace code box, optionally restricted to specific languages",
    icon: Code2,
    create: () => ({
      id: createId(),
      type: "code",
      label: "Untitled question",
      required: false,
      languages: ["python"],
    }),
  },
  {
    type: "dropdown",
    label: "Dropdown",
    description: "Choose one option from a list",
    icon: ChevronDownSquare,
    create: () => ({
      id: createId(),
      type: "dropdown",
      label: "Untitled question",
      required: false,
      options: [{ label: "Option 1" }, { label: "Option 2" }],
      allowMultiple: false,
      allowOther: false,
    }),
  },
  {
    type: "multiple-choice",
    label: "Multiple choice",
    description: "Visible radio-button options, pick one",
    icon: CircleDot,
    create: () => ({
      id: createId(),
      type: "multiple-choice",
      label: "Untitled question",
      required: false,
      options: ["Option 1", "Option 2"],
    }),
  },
  {
    type: "checkbox",
    label: "Yes / No",
    description: "A single checkbox, e.g. agree to rules",
    icon: CheckSquare,
    create: () => ({
      id: createId(),
      type: "checkbox",
      label: "Untitled question",
      required: false,
      yesLabel: "Yes",
      noLabel: "No",
    }),
  },
  {
    type: "signature",
    label: "E-signature",
    description: "Draw a signature, e.g. agreeing to contract terms",
    icon: PenTool,
    create: () => ({
      id: createId(),
      type: "signature",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "drawing",
    label: "Drawing board",
    description: "A blank canvas to sketch an idea or diagram by hand",
    icon: Paintbrush,
    create: () => ({
      id: createId(),
      type: "drawing",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "design-board",
    label: "Design board",
    description: "Respondents drag up to 5 of their own photos onto your template and can draw on it",
    icon: Layers,
    create: () => ({
      id: createId(),
      type: "design-board",
      label: "Untitled question",
      required: false,
    }),
  },
  {
    type: "static-text",
    label: "Message",
    description: "Write a static note or instructions for the form",
    icon: StickyNote,
    producesDataColumn: false,
    create: () => ({
      id: createId(),
      type: "static-text",
      label: "",
      required: false,
      content: "Write your message here.",
    }),
  },
  {
    type: "section-break",
    label: "Section break",
    description: "Splits the form into multiple steps/pages",
    icon: SeparatorHorizontal,
    producesDataColumn: false,
    create: () => ({
      id: createId(),
      type: "section-break",
      label: "New section",
      required: false,
      description: "",
    }),
  },
  {
    type: "rating",
    label: "Rating",
    description: "Star rating or slider scale, e.g. skill rating 1–10",
    icon: Star,
    create: () => ({
      id: createId(),
      type: "rating",
      label: "Untitled question",
      required: false,
      min: 1,
      max: 5,
      style: "stars",
    }),
  },
  {
    type: "computed",
    label: "Computed",
    description: "Auto-calculate a value from other fields, e.g. total = quantity × price",
    icon: Calculator,
    create: () => ({
      id: createId(),
      type: "computed",
      label: "Untitled question",
      required: false,
      operation: "sum",
      terms: [],
      showOnForm: true,
    }),
  },
  {
    type: "player-list",
    label: "Repeating list",
    description: "A repeating group of entries you define, e.g. players, guests, or items",
    icon: Rows3,
    producesDataColumn: false,
    create: () => ({
      id: createId(),
      type: "player-list",
      label: "List",
      required: true,
      layout: "row",
      playerCount: 5,
      columns: [],
    }),
  },
  {
    type: "button",
    label: "Button",
    description: "A button that opens a small popup form when clicked, e.g. optional extra details",
    icon: MousePointerClick,
    producesDataColumn: false,
    create: () => ({
      id: createId(),
      type: "button",
      label: "Untitled question",
      required: false,
      buttonStyle: "text",
      buttonText: "Click to answer",
      fields: [],
    }),
  },
  {
    type: "image-display",
    label: "Image",
    description: "Show an image to respondents, e.g. a banner, flyer, or sponsor logo",
    icon: ImagePlus,
    producesDataColumn: false,
    create: () => ({
      id: createId(),
      type: "image-display",
      label: "",
      required: false,
      caption: "",
    }),
  },
  {
    type: "checklist",
    label: "Checklist",
    description: "A list of statements ticked individually, e.g. terms and conditions",
    icon: ListChecks,
    create: () => ({
      id: createId(),
      type: "checklist",
      label: "Untitled question",
      required: false,
      items: [{ id: createId(), label: "I agree to the terms", required: true }],
    }),
  },
  {
    type: "ranking",
    label: "Ranking",
    description: "Drag items into order, e.g. rank preferences 1st to last",
    icon: ArrowDownUp,
    create: () => ({
      id: createId(),
      type: "ranking",
      label: "Untitled question",
      required: false,
      layout: "vertical",
      items: [
        { id: createId(), label: "Item 1" },
        { id: createId(), label: "Item 2" },
        { id: createId(), label: "Item 3" },
      ],
    }),
  },
];

export function getFieldTypeDef(type: FieldType): FieldTypeDef {
  const def = FIELD_TYPE_DEFS.find((d) => d.type === type);
  if (!def) throw new Error(`Unknown field type: ${type}`);
  return def;
}

export function createField(type: FieldType): FormField {
  return getFieldTypeDef(type).create();
}

// Whether a field of this type gets a normal per-submission answer
// column/cell in exports (Google Sheets, local CSV/JSON) — false for
// section markers, static messages, and types with their own dedicated
// export shape (Repeating list's own tab, Button's flattened sub-columns).
export function isDataField(type: FieldType): boolean {
  return getFieldTypeDef(type).producesDataColumn !== false;
}

export interface PlayerListColumnTypeDef {
  type: PlayerListColumnType;
  label: string;
  icon: LucideIcon;
  create: () => PlayerListColumn;
}

export const PLAYER_LIST_COLUMN_DEFS: PlayerListColumnTypeDef[] = [
  {
    type: "short-text",
    label: "Short answer",
    icon: Type,
    create: () => ({
      id: createId(),
      type: "short-text",
      label: "New field",
      required: false,
    }),
  },
  {
    type: "number",
    label: "Number",
    icon: Hash,
    create: () => ({
      id: createId(),
      type: "number",
      label: "New field",
      required: false,
    }),
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: ChevronDownSquare,
    create: () => ({
      id: createId(),
      type: "dropdown",
      label: "New field",
      required: false,
      options: ["Option 1", "Option 2"],
    }),
  },
  {
    type: "checkbox",
    label: "Yes / No",
    icon: CheckSquare,
    create: () => ({
      id: createId(),
      type: "checkbox",
      label: "New field",
      required: false,
    }),
  },
];

export const PHOTO_COLUMN_DEF: PlayerListColumnTypeDef = {
  type: "photo",
  label: "Photo",
  icon: Image,
  create: () => ({
    id: createId(),
    type: "photo",
    label: "Photo",
    required: false,
  }),
};
